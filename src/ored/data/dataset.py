"""Dataset and batching.

Two PyTorch concepts do the work here.

``Dataset``
    Knows two things only: how many examples exist (``__len__``) and how to
    produce example *i* as tensors (``__getitem__``). It does not care about
    batching, shuffling or training.

``DataLoader``
    Wraps a Dataset and produces **batches**: it picks indices (shuffled or
    not), fetches those examples, and stacks them into one tensor whose first
    dimension is the batch.

Why batches?
------------
We could compute the gradient using all 179 training examples at once (slow,
very smooth) or one example at a time (fast, very noisy). A batch of 16 is the
practical middle: each weight update is informed by 16 examples, so the
gradient is a reasonable estimate, and we still get ~12 updates per epoch
instead of 1.

Tensor shapes in this project
-----------------------------
    inputs  : (batch_size, 8)   float32, values 0.0 / 1.0
    targets : (batch_size, 5)   float32, values 0.0 / 1.0
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import torch
from torch.utils.data import DataLoader, Dataset

from ored.config import Config
from ored.data.preprocessing import encode_pair, encode_target

SPLIT_NAMES = ("train", "val", "test")


def load_rows(path: str | Path) -> List[Dict[str, str]]:
    """Read the generated CSV into a list of dictionaries."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"dataset not found: {path}\n"
            f"Generate it first:  python scripts/generate_dataset.py"
        )
    with path.open("r", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise ValueError(f"dataset file is empty: {path}")
    return rows


class BitAdditionDataset(Dataset):
    """One split (train / val / test) of the binary-addition dataset.

    Every example is pre-encoded into tensors at construction time. The dataset
    is tiny, so doing the work once up front is both simpler and faster than
    re-encoding on every access.
    """

    def __init__(self, rows: List[Dict[str, str]], split: str, n_bits: int) -> None:
        if split not in SPLIT_NAMES:
            raise ValueError(f"split must be one of {SPLIT_NAMES}, got {split!r}")

        self.split = split
        self.n_bits = n_bits
        self.pairs: List[Tuple[int, int, int]] = []

        inputs: List[np.ndarray] = []
        targets: List[np.ndarray] = []
        for row in rows:
            if row["split"] != split:
                continue
            a, b, total = int(row["a"]), int(row["b"]), int(row["sum"])
            inputs.append(encode_pair(a, b, n_bits))
            targets.append(encode_target(total, n_bits))
            self.pairs.append((a, b, total))

        if not inputs:
            raise ValueError(f"no rows found for split {split!r}")

        # Stack the per-example vectors into one matrix each.
        # torch.from_numpy shares memory with the numpy array -- no copy.
        self.inputs = torch.from_numpy(np.stack(inputs))    # (N, 2 * n_bits)
        self.targets = torch.from_numpy(np.stack(targets))  # (N, n_bits + 1)

    def __len__(self) -> int:
        return self.inputs.shape[0]

    def __getitem__(self, index: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return self.inputs[index], self.targets[index]

    def describe(self) -> str:
        return (
            f"{self.split:<5} split: {len(self):>3} examples | "
            f"inputs {tuple(self.inputs.shape)} | targets {tuple(self.targets.shape)}"
        )


def build_datasets(cfg: Config) -> Dict[str, BitAdditionDataset]:
    """Build all three splits from the single CSV file."""
    rows = load_rows(cfg.data.raw_path)
    return {name: BitAdditionDataset(rows, name, cfg.data.n_bits) for name in SPLIT_NAMES}


def build_dataloaders(
    cfg: Config,
    generator: torch.Generator | None = None,
) -> Tuple[Dict[str, DataLoader], Dict[str, BitAdditionDataset]]:
    """Wrap each split in a DataLoader.

    Only the training loader shuffles. Validation and test are evaluated in a
    fixed order so their numbers are directly comparable between runs, and we
    use one large batch there because no gradients are involved.

    ``generator`` seeds the shuffling, keeping the batch order reproducible.
    """
    datasets = build_datasets(cfg)
    loaders = {
        "train": DataLoader(
            datasets["train"],
            batch_size=cfg.data.batch_size,
            shuffle=cfg.data.shuffle_train,
            generator=generator,
            drop_last=False,
        ),
        "val": DataLoader(datasets["val"], batch_size=len(datasets["val"]), shuffle=False),
        "test": DataLoader(datasets["test"], batch_size=len(datasets["test"]), shuffle=False),
    }
    return loaders, datasets
