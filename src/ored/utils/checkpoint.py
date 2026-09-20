"""Saving and loading a trained model.

What actually *is* a trained model?
-----------------------------------
Nothing but numbers. A network's knowledge lives entirely in its **weights**
and **biases** -- the tensors that `forward()` multiplies and adds. A
checkpoint is a file holding:

* ``model_state`` -- every weight and bias tensor, by name.
* ``optimizer_state`` -- the optimizer's own memory (Adam keeps running
  averages of past gradients), so training can resume exactly where it stopped.
* ``config`` -- the full experiment description, so we can rebuild the same
  architecture before loading the weights into it. Loading weights into a
  differently-shaped network is an error, and this is what prevents it.
* ``metrics`` / ``epoch`` -- provenance: how good was this, and when.

Nothing here is executable. A checkpoint is a snapshot of numbers.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict, Optional

import torch

from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)

# Bumped if the checkpoint layout ever changes, so old files fail loudly
# instead of loading wrongly.
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
    """Write a checkpoint to disk (creating parent directories as needed)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    payload: Dict[str, Any] = {
        "format_version": CHECKPOINT_FORMAT_VERSION,
        # .state_dict() returns an ordered mapping {parameter name -> tensor}.
        "model_state": model.state_dict(),
        "optimizer_state": optimizer.state_dict() if optimizer is not None else None,
        "config": config,
        "epoch": epoch,
        "metrics": metrics or {},
        # str(): torch.__version__ is a TorchVersion object, and a checkpoint
        # must contain plain data only so it can be loaded with
        # weights_only=True (which refuses to unpickle custom classes).
        "torch_version": str(torch.__version__),
        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    if extra:
        payload["extra"] = extra

    # Write to a temporary file first, then rename. A crash mid-write then
    # cannot corrupt a good checkpoint.
    tmp = path.with_suffix(path.suffix + ".tmp")
    torch.save(payload, tmp)
    tmp.replace(path)
    return path


def load_checkpoint(path: str | Path, map_location: str | torch.device = "cpu") -> Dict[str, Any]:
    """Read a checkpoint back into memory.

    ``weights_only=True`` tells torch to deserialise plain tensors and
    containers only -- it will refuse to execute arbitrary pickled objects.
    It is the safe default when loading a file you did not just write.
    """
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
