from __future__ import annotations

import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, Optional

import torch

from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)

CHECKPOINT_FORMAT_VERSION = 2
SUPPORTED_FORMAT_VERSIONS = (1, 2)

KINDS = ("base", "live", "best", "history", "export")

TRAINING_STATE_KEYS = (
    "optimizer_state_dict",
    "scheduler_state_dict",
    "scaler_state_dict",
    "rng_state",
    "trainer_state",
)
KIND_KEEPS_TRAINING_STATE = {
    "base": False,
    "live": True,
    "best": True,
    "history": True,
    "export": False,
}


class CheckpointError(ValueError):
    pass


LEGACY_METRIC_NAMES = {"val_loss": "loss", "val_bpc": "bpc", "val_ppl": "ppl"}


@dataclass(frozen=True)
class PromotionRule:

    metric: str = "val_loss"
    mode: str = "min"
    min_delta: float = 1e-6

    def __post_init__(self) -> None:
        if self.mode not in ("min", "max"):
            raise ValueError(f"promotion mode must be 'min' or 'max', got {self.mode!r}")
        if self.min_delta < 0:
            raise ValueError("promotion min_delta must be >= 0")

    def value(self, metrics: Optional[Mapping[str, Any]]) -> Optional[float]:
        metrics = metrics or {}
        for key in (self.metric, LEGACY_METRIC_NAMES.get(self.metric)):
            if key and isinstance(metrics.get(key), (int, float)):
                value = float(metrics[key])
                return value if math.isfinite(value) else None
        return None

    def is_better(self, new: Optional[float], current: Optional[float]) -> bool:
        if new is None or not math.isfinite(new):
            return False
        if current is None:
            return True
        if self.mode == "min":
            return new < current - self.min_delta
        return new > current + self.min_delta

    def describe(self) -> str:
        return f"{self.metric} ({'lower' if self.mode == 'min' else 'higher'} is better)"


def is_better(new: Optional[float], current: Optional[float],
              rule: PromotionRule = PromotionRule()) -> bool:
    return rule.is_better(new, current)


def architecture_of(model: torch.nn.Module) -> Dict[str, Any]:
    describe = getattr(model, "describe", None)
    description = dict(describe()) if callable(describe) else {"type": type(model).__name__}
    description.pop("parameters", None)
    return description


def clean_metrics(metrics: Optional[Mapping[str, Any]]) -> Dict[str, float]:
    cleaned: Dict[str, float] = {}
    for key, value in (metrics or {}).items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        if math.isfinite(float(value)):
            cleaned[str(key)] = float(value)
    return cleaned


def build_payload(
    *,
    kind: str,
    model: torch.nn.Module,
    config: Dict[str, Any],
    epoch: int,
    global_step: int = 0,
    metrics: Optional[Mapping[str, Any]] = None,
    optimizer: Optional[torch.optim.Optimizer] = None,
    scheduler_state: Optional[Dict[str, Any]] = None,
    scaler: Any = None,
    rng_state: Optional[Dict[str, Any]] = None,
    trainer_state: Optional[Dict[str, Any]] = None,
    tokenizer: Optional[Dict[str, Any]] = None,
    promotion: Optional[Dict[str, Any]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if kind not in KINDS:
        raise CheckpointError(f"unknown checkpoint kind {kind!r}; expected one of {KINDS}")

    extra = dict(extra or {})
    extra.pop("model_description", None)
    if tokenizer is None:
        tokenizer = extra.pop("tokenizer", None)
    else:
        extra.pop("tokenizer", None)

    describe = getattr(model, "describe", None)
    parameters = describe().get("parameters") if callable(describe) else None

    payload: Dict[str, Any] = {
        "format_version": CHECKPOINT_FORMAT_VERSION,
        "checkpoint_kind": kind,
        "run_name": str(config.get("run_name", "")),
        "task": str(config.get("task", "")),
        "architecture": architecture_of(model),
        "parameters": parameters,
        "config": config,
        "tokenizer": tokenizer,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict() if optimizer is not None else None,
        "scheduler_state_dict": scheduler_state,
        "scaler_state_dict": scaler.state_dict() if scaler is not None else None,
        "epoch": int(epoch),
        "global_step": int(global_step),
        "metrics": clean_metrics(metrics),
        "promotion": promotion,
        "rng_state": rng_state,
        "trainer_state": trainer_state,
        "torch_version": str(torch.__version__),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "extra": extra,
    }
    if not KIND_KEEPS_TRAINING_STATE[kind]:
        for key in TRAINING_STATE_KEYS:
            payload[key] = None
    return payload


def write_payload(path: str | Path, payload: Dict[str, Any]) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    torch.save(payload, tmp)
    tmp.replace(path)
    return path


def save_checkpoint(
    path: str | Path,
    model: torch.nn.Module,
    config: Dict[str, Any],
    epoch: int,
    metrics: Optional[Dict[str, float]] = None,
    optimizer: Optional[torch.optim.Optimizer] = None,
    extra: Optional[Dict[str, Any]] = None,
    *,
    kind: str = "live",
    global_step: int = 0,
    **state: Any,
) -> Path:
    payload = build_payload(
        kind=kind,
        model=model,
        config=config,
        epoch=epoch,
        global_step=global_step,
        metrics=metrics,
        optimizer=optimizer,
        extra=extra,
        **state,
    )
    return write_payload(path, payload)


def as_kind(payload: Dict[str, Any], kind: str) -> Dict[str, Any]:
    if kind not in KINDS:
        raise CheckpointError(f"unknown checkpoint kind {kind!r}; expected one of {KINDS}")
    copy = dict(payload)
    copy["checkpoint_kind"] = kind
    copy["format_version"] = CHECKPOINT_FORMAT_VERSION
    if not KIND_KEEPS_TRAINING_STATE[kind]:
        for key in TRAINING_STATE_KEYS:
            copy[key] = None
    return copy


def _upgrade_v1(payload: Dict[str, Any]) -> Dict[str, Any]:
    extra = dict(payload.get("extra") or {})
    tokenizer = extra.pop("tokenizer", None) or payload.get("tokenizer")
    description = extra.pop("model_description", None) or {}
    description = dict(description)
    parameters = description.pop("parameters", None)
    config = payload.get("config") or {}
    return {
        "format_version": 1,
        "checkpoint_kind": None,
        "run_name": str(config.get("run_name", "")),
        "task": str(config.get("task", "")),
        "architecture": description or None,
        "parameters": parameters,
        "config": config,
        "tokenizer": tokenizer,
        "model_state_dict": payload.get("model_state"),
        "optimizer_state_dict": payload.get("optimizer_state"),
        "scheduler_state_dict": None,
        "scaler_state_dict": None,
        "epoch": int(payload.get("epoch") or 0),
        "global_step": 0,
        "metrics": dict(payload.get("metrics") or {}),
        "promotion": None,
        "rng_state": None,
        "trainer_state": None,
        "torch_version": str(payload.get("torch_version") or ""),
        "created_at": payload.get("saved_at"),
        "extra": extra,
    }


def normalise(payload: Any, path: str | Path = "<checkpoint>") -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise CheckpointError(
            f"{path} is not an Ored checkpoint: expected a dict with named keys, "
            f"found {type(payload).__name__}"
        )
    version = payload.get("format_version")
    if version not in SUPPORTED_FORMAT_VERSIONS:
        raise CheckpointError(
            f"{path} cannot be read by this code.\n"
            f"Checkpoint format: {version}\n"
            f"Expected format: {CHECKPOINT_FORMAT_VERSION} "
            f"(readable: {', '.join(str(v) for v in SUPPORTED_FORMAT_VERSIONS)})"
        )
    if version == 1:
        payload = _upgrade_v1(payload)
    elif not payload.get("tokenizer") and (payload.get("extra") or {}).get("tokenizer"):
        payload = dict(payload, tokenizer=payload["extra"]["tokenizer"])

    missing = [k for k in ("model_state_dict", "config") if not payload.get(k)]
    if missing:
        raise CheckpointError(f"{path} is incomplete: it has no {', '.join(missing)}")
    kind = payload.get("checkpoint_kind")
    if kind is not None and kind not in KINDS:
        raise CheckpointError(f"{path} has unknown checkpoint_kind {kind!r}")
    return payload


def load_checkpoint(path: str | Path, map_location: str | torch.device = "cpu") -> Dict[str, Any]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"checkpoint not found: {path}\n"
            f"Train a model first:  python scripts/train.py"
        )
    try:
        raw = torch.load(path, map_location=map_location, weights_only=True)
    except Exception as exc:
        raise CheckpointError(f"{path} is not a readable checkpoint ({exc.__class__.__name__}: {exc})") from exc
    return normalise(raw, path)


def _fmt(description: Mapping[str, Any]) -> str:
    kind = description.get("type", "?")
    fields = ", ".join(f"{k}={v}" for k, v in description.items() if k != "type")
    return f"{kind}({fields})"


def check_compatible(
    payload: Dict[str, Any],
    model: Optional[torch.nn.Module] = None,
    *,
    path: str | Path = "<checkpoint>",
    expected_kind: Optional[str] = None,
    tokenizer: Optional[Dict[str, Any]] = None,
) -> None:
    problems = []
    kind = payload.get("checkpoint_kind")
    if expected_kind is not None and kind not in (None, expected_kind):
        problems.append(f"Checkpoint role: {kind}, expected: {expected_kind}")

    if model is not None:
        expected = architecture_of(model)
        recorded = payload.get("architecture")
        if recorded and recorded != expected:
            problems.append(
                f"Model architecture mismatch: {payload.get('run_name') or 'checkpoint'} is "
                f"{_fmt(recorded)}, this config builds {_fmt(expected)}"
            )

    recorded_tokenizer = payload.get("tokenizer")
    if tokenizer is not None and recorded_tokenizer is not None and recorded_tokenizer != tokenizer:
        problems.append(
            "Tokenizer mismatch: the checkpoint was trained with a different vocabulary "
            f"({len(recorded_tokenizer.get('itos', []))} tokens vs {len(tokenizer.get('itos', []))})"
        )

    if problems:
        raise CheckpointError(
            f"{path} is not compatible with this model.\n"
            f"Checkpoint format: {payload.get('format_version')}\n"
            f"Expected format: {CHECKPOINT_FORMAT_VERSION}\n" + "\n".join(problems)
        )


def load_model_state(model: torch.nn.Module, state: Mapping[str, torch.Tensor],
                     path: str | Path = "<checkpoint>") -> None:
    own = model.state_dict()
    missing = [k for k in own if k not in state]
    unexpected = [k for k in state if k not in own]
    wrong = [
        f"{k}: checkpoint {tuple(state[k].shape)} vs model {tuple(own[k].shape)}"
        for k in own
        if k in state and hasattr(state[k], "shape") and tuple(state[k].shape) != tuple(own[k].shape)
    ]
    if missing or unexpected or wrong:
        lines = [f"{path} does not fit this model."]
        if missing:
            lines.append(f"missing from the checkpoint: {_short(missing)}")
        if unexpected:
            lines.append(f"not in the model: {_short(unexpected)}")
        if wrong:
            lines.append(f"shape mismatch: {_short(wrong)}")
        raise CheckpointError("\n".join(lines))
    model.load_state_dict(state, strict=True)


def _short(items: Iterable[str], limit: int = 4) -> str:
    items = list(items)
    text = ", ".join(items[:limit])
    return text + (f" (+{len(items) - limit} more)" if len(items) > limit else "")
