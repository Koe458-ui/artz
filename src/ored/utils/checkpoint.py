from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, Optional

import torch

from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)

CHECKPOINT_FORMAT_VERSION = 1


def save_checkpoint(
    path: str | Path,
    model: torch.nn.Module,
    config: Dict[str, Any],
    epoch: int,
    metrics: Optional[Dict[str, float]] = None,
    optimizer: Optional[torch.optim.Optimizer] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    payload: Dict[str, Any] = {
        "format_version": CHECKPOINT_FORMAT_VERSION,
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict() if optimizer is not None else None,
        "config": config,
        "epoch": epoch,
        "metrics": metrics or {},
        "torch_version": str(torch.__version__),
        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    if extra:
        payload["extra"] = extra

    tmp = path.with_suffix(path.suffix + ".tmp")
    torch.save(payload, tmp)
    tmp.replace(path)
    return path


def load_checkpoint(path: str | Path, map_location: str | torch.device = "cpu") -> Dict[str, Any]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"checkpoint not found: {path}\n"
            f"Train a model first:  python scripts/train.py"
        )

    payload = torch.load(path, map_location=map_location, weights_only=True)

    version = payload.get("format_version")
    if version != CHECKPOINT_FORMAT_VERSION:
        raise ValueError(
            f"checkpoint {path} has format version {version}, "
            f"this code expects {CHECKPOINT_FORMAT_VERSION}. Retrain the model."
        )
    return payload
