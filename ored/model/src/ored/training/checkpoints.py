from __future__ import annotations

import copy
import random
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import torch

from ored.config import Config
from ored.utils.checkpoint import (
    CheckpointError,
    PromotionRule,
    as_kind,
    build_payload,
    check_compatible,
    load_checkpoint,
    load_model_state,
    write_payload,
)
from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)

Snapshot = Dict[str, Any]


class NoResumableCheckpoint(CheckpointError):
    pass


def promotion_rule(cfg: Config) -> PromotionRule:
    return PromotionRule(metric=cfg.checkpoint.best_metric, mode=cfg.checkpoint.best_mode)


def history_filename(epoch: int, global_step: int) -> str:
    return f"epoch_{int(epoch):04d}_step_{int(global_step):08d}.pt"


def capture_rng(generator: Optional[torch.Generator] = None) -> Dict[str, Any]:
    np_state = np.random.get_state()
    state: Dict[str, Any] = {
        "torch": torch.get_rng_state(),
        "python": random.getstate(),
        "numpy": {
            "name": str(np_state[0]),
            "keys": [int(k) for k in np_state[1]],
            "pos": int(np_state[2]),
            "has_gauss": int(np_state[3]),
            "cached_gaussian": float(np_state[4]),
        },
        "cuda": torch.cuda.get_rng_state_all() if torch.cuda.is_available() else None,
    }
    if generator is not None:
        state["data_generator"] = generator.get_state()
    return state


def restore_rng(state: Optional[Dict[str, Any]], generator: Optional[torch.Generator] = None) -> None:
    if not state:
        return
    torch.set_rng_state(state["torch"])
    python = state.get("python")
    if python is not None:
        random.setstate((python[0], tuple(python[1]), python[2]))
    numpy_state = state.get("numpy")
    if numpy_state:
        np.random.set_state((
            numpy_state["name"],
            np.array(numpy_state["keys"], dtype=np.uint32),
            numpy_state["pos"],
            numpy_state["has_gauss"],
            numpy_state["cached_gaussian"],
        ))
    if state.get("cuda") is not None and torch.cuda.is_available():
        torch.cuda.set_rng_state_all(state["cuda"])
    if generator is not None and state.get("data_generator") is not None:
        generator.set_state(state["data_generator"])


class CheckpointManager:

    def __init__(self, cfg: Config, directory: Optional[str | Path] = None,
                 remote: Any = None) -> None:
        self.cfg = cfg
        self.settings = cfg.checkpoint
        self.rule = promotion_rule(cfg)
        self.directory = Path(directory) if directory else cfg.checkpoint_dir
        self.directory.mkdir(parents=True, exist_ok=True)
        self.remote = remote
        self.upload_errors: List[str] = []

        self.best_value: Optional[float] = None
        self.best_epoch = 0
        self.last_live_step: Optional[int] = None

    @classmethod
    def for_training(cls, cfg: Config) -> "CheckpointManager":
        remote = None
        if cfg.checkpoint.upload:
            from ored.learning.checkpoints import CheckpointStore
            from ored.learning.supabase_store import SupabaseStore

            remote = (SupabaseStore.from_env(), CheckpointStore.from_env())
        return cls(cfg, remote=remote)


    @property
    def run_name(self) -> str:
        return self.cfg.run_name

    def path(self, kind: str) -> Path:
        if kind not in ("base", "live", "best", "export"):
            raise ValueError(f"no single file for {kind!r}; history is a folder")
        return self.directory / f"{kind}.pt"

    @property
    def history_dir(self) -> Path:
        return self.directory / "history"

    def history_files(self) -> List[Path]:
        return sorted(self.history_dir.glob("epoch_*.pt"))


    def live_due(self, epoch: int = 0, step: int = 0) -> bool:
        s = self.settings
        if step:
            return bool(s.save_live_every_steps) and step % s.save_live_every_steps == 0
        return bool(s.save_live_every_epochs) and epoch % s.save_live_every_epochs == 0

    def history_due(self, epoch: int = 0, step: int = 0) -> bool:
        s = self.settings
        if not s.keep_history:
            return False
        if step:
            return bool(s.save_history_every_steps) and step % s.save_history_every_steps == 0
        return bool(s.save_history_every_epochs) and epoch % s.save_history_every_epochs == 0


    def _write(self, kind: str, path: Path, snapshot: Snapshot) -> Path:
        return write_payload(path, build_payload(kind=kind, **snapshot))

    def save_base_checkpoint(self, snapshot: Snapshot) -> Optional[Path]:
        if not self.settings.save_base:
            return None
        path = self._write("base", self.path("base"), snapshot)
        self._publish("base", path)
        return path

    def save_live_checkpoint(self, snapshot: Snapshot) -> Path:
        path = self._write("live", self.path("live"), snapshot)
        self.last_live_step = int(snapshot["global_step"])
        self._publish("live", path)
        return path

    def save_history_checkpoint(self, snapshot: Snapshot) -> Path:
        path = self.history_dir / history_filename(snapshot["epoch"], snapshot["global_step"])
        path = self._write("history", path, snapshot)
        self._publish("history", path)
        return path

    def evaluate_and_promote_best(
        self, metrics: Dict[str, Any], epoch: int, make_snapshot: Callable[[], Snapshot]
    ) -> bool:
        value = self.rule.value(metrics)
        if not self.rule.is_better(value, self.best_value):
            return False
        self.best_value = value
        self.best_epoch = epoch
        path = self._write("best", self.path("best"), make_snapshot())
        self._publish("best", path)
        return True

    def promotion(self) -> Dict[str, Any]:
        return {
            "metric": self.rule.metric,
            "mode": self.rule.mode,
            "value": self.best_value,
            "epoch": self.best_epoch,
        }

    def export_model(self, source: str = "best") -> Path:
        payload = load_checkpoint(self.path(source))
        path = write_payload(self.path("export"), as_kind(payload, "export"))
        self._publish("export", path)
        return path


    def _load_role(self, kind: str, map_location: Any = "cpu") -> Dict[str, Any]:
        path = self.path(kind)
        if not path.exists() and self.remote is not None:
            self._pull(kind, path)
        if not path.exists():
            where = f"{path} does not exist"
            if self.remote is not None:
                where += f" and Supabase has no current {kind} checkpoint for run {self.run_name!r}"
            hint = ("Leave training.resume empty to start a fresh run."
                    if kind == "live" else "Train until validation improves at least once.")
            raise NoResumableCheckpoint(
                f"There is no {kind} checkpoint for run {self.run_name!r}: {where}.\n{hint}"
            )
        payload = load_checkpoint(path, map_location=map_location)
        kind_in_file = payload.get("checkpoint_kind")
        if kind_in_file not in (None, kind):
            raise CheckpointError(f"{path} is a {kind_in_file} checkpoint, not {kind}")
        payload["_path"] = str(path)
        return payload

    def load_live_checkpoint(self, map_location: Any = "cpu") -> Dict[str, Any]:
        payload = self._load_role("live", map_location)
        missing = [k for k in ("optimizer_state_dict", "trainer_state") if not payload.get(k)]
        if missing:
            raise NoResumableCheckpoint(
                f"{payload['_path']} cannot be resumed from: it has no {', '.join(missing)}. "
                f"(Format {payload['format_version']} files predate resumable checkpoints; "
                f"use training.resume: {payload['_path']} to warm-start from its weights.)"
            )
        return payload

    def load_best_checkpoint(self, map_location: Any = "cpu") -> Dict[str, Any]:
        return self._load_role("best", map_location)


    def _publish(self, kind: str, path: Path) -> None:
        if self.remote is None:
            return
        from ored.learning.checkpoints import NotBetterError, publish
        from ored.learning.records import CheckpointKind
        from ored.learning.store import StoreError

        store, files = self.remote
        try:
            record = publish(
                store, files, path, CheckpointKind(kind), self.run_name,
                rule=self.rule,
                prune_superseded=not self.settings.keep_superseded_live,
                workdir=self.directory / ".upload",
            )
            logger.info(f"  uploaded {kind:<7} -> {record.bucket_id}/{record.object_path}")
        except NotBetterError as exc:
            logger.info(f"  Supabase kept its best: {exc}")
        except (StoreError, CheckpointError) as exc:
            message = f"{kind} {path.name}: {exc}"
            self.upload_errors.append(message)
            logger.error(f"  upload failed (the local file is safe): {message}")

    def _pull(self, kind: str, path: Path) -> None:
        from ored.learning.checkpoints import fetch_record
        from ored.learning.records import CheckpointKind

        store, files = self.remote
        record = store.current_checkpoint(self.run_name, CheckpointKind(kind))
        if record is not None:
            fetch_record(files, record, path)
            logger.info(f"pulled the current {kind} checkpoint from {record.bucket_id}/{record.object_path}")


PLACEABLE = ("live", "best", "history")


def free_path(path: Path) -> Path:
    candidate, n = path, 1
    while candidate.exists():
        n += 1
        candidate = path.with_name(f"{path.stem}-{n}{path.suffix}")
    return candidate


def evaluate_file(path: str | Path, cfg: Config, device: str = "auto") -> Dict[str, float]:
    from ored.training.trainer import Trainer

    cfg = copy.deepcopy(cfg)
    cfg.training.resume = ""
    cfg.training.device = device
    cfg.checkpoint.upload = False
    trainer = Trainer(cfg)
    payload = load_checkpoint(path, map_location=trainer.device)
    check_compatible(payload, trainer.model, path=path, tokenizer=trainer._tokenizer())
    load_model_state(trainer.model, payload["model_state_dict"], path)
    return {f"val_{k}": v for k, v in trainer.evaluate("val").items()}


def archive_to_history(manager: CheckpointManager, path: Path) -> Path:
    payload = load_checkpoint(path)
    target = free_path(manager.history_dir / history_filename(payload["epoch"], payload["global_step"]))
    return write_payload(target, as_kind(payload, "history"))


def place_checkpoint(
    cfg: Config,
    source: str | Path,
    kind: str,
    force: bool = False,
    device: str = "auto",
    manager: Optional[CheckpointManager] = None,
) -> Tuple[Optional[Path], str]:
    if kind not in PLACEABLE:
        raise ValueError(f"a checkpoint can be saved as {', '.join(PLACEABLE)}, not {kind!r}")
    manager = manager or CheckpointManager(cfg)
    source = Path(source)
    payload = load_checkpoint(source)

    if kind == "history":
        target = free_path(manager.history_dir / history_filename(payload["epoch"], payload["global_step"]))
        write_payload(target, as_kind(payload, "history"))
        manager._publish("history", target)
        return target, f"saved as history: {target}"

    if kind == "live":
        if not (payload.get("optimizer_state_dict") and payload.get("trainer_state")):
            raise CheckpointError(
                f"{source} cannot be the live checkpoint: it has no optimizer or loop state, so "
                f"training could not resume from it. Start a new run from it with --init-from {source}"
            )
        live = manager.path("live")
        archived = archive_to_history(manager, live) if live.exists() and live.resolve() != source.resolve() else None
        write_payload(live, as_kind(payload, "live"))
        manager._publish("live", live)
        note = f" (previous live kept as {archived})" if archived else ""
        return live, f"saved as live: {live}{note}"

    rule = manager.rule
    best = manager.path("best")
    new_metrics = evaluate_file(source, cfg, device)
    new_value = rule.value(new_metrics)
    old_value = rule.value(evaluate_file(best, cfg, device)) if best.exists() else None
    compared = (f"{rule.metric} {new_value:.5f} vs current best "
                f"{'none' if old_value is None else f'{old_value:.5f}'}")
    if not force and not rule.is_better(new_value, old_value):
        return None, f"not promoted: {compared}; {rule.describe()}. best.pt is unchanged."

    archived = archive_to_history(manager, best) if best.exists() else None
    promoted = as_kind(payload, "best")
    promoted["metrics"] = {**(payload.get("metrics") or {}), **new_metrics}
    promoted["promotion"] = {"metric": rule.metric, "mode": rule.mode,
                             "value": new_value, "epoch": payload.get("epoch")}
    write_payload(best, promoted)
    manager._publish("best", best)
    note = f"; previous best kept as {archived}" if archived else ""
    return best, f"promoted to best: {compared}{note}"

