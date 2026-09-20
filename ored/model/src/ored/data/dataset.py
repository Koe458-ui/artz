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

        self.inputs = torch.from_numpy(np.stack(inputs))
        self.targets = torch.from_numpy(np.stack(targets))

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
    rows = load_rows(cfg.data.raw_path)
    return {name: BitAdditionDataset(rows, name, cfg.data.n_bits) for name in SPLIT_NAMES}


def build_dataloaders(
    cfg: Config,
    generator: torch.Generator | None = None,
) -> Tuple[Dict[str, DataLoader], Dict[str, BitAdditionDataset]]:
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
