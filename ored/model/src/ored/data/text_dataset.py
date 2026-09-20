from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

import torch
from torch.utils.data import DataLoader, Dataset

from ored.config import Config
from ored.data.corpus import SPLITS, read_corpus
from ored.data.tokenizer import Tokenizer, build_tokenizer


class TextDataset(Dataset):

    def __init__(self, token_ids: torch.Tensor, block_size: int, stride: int) -> None:
        if token_ids.dim() != 1:
            raise ValueError(f"expected a 1-D tensor of ids, got {tuple(token_ids.shape)}")
        if token_ids.numel() < block_size + 1:
            raise ValueError(
                f"corpus has only {token_ids.numel()} tokens, which is fewer than "
                f"block_size + 1 = {block_size + 1}. Use a smaller block_size or "
                f"a larger corpus."
            )

        self.token_ids = token_ids
        self.block_size = block_size
        self.stride = stride

        last_start = token_ids.numel() - block_size - 1
        self.starts: List[int] = list(range(0, last_start + 1, stride))

    def __len__(self) -> int:
        return len(self.starts)

    def __getitem__(self, index: int) -> Tuple[torch.Tensor, torch.Tensor]:
        start = self.starts[index]
        end = start + self.block_size
        x = self.token_ids[start:end]
        y = self.token_ids[start + 1:end + 1]
        return x, y

    @property
    def n_tokens(self) -> int:
        return int(self.token_ids.numel())

    def describe(self) -> str:
        return (
            f"{len(self):>6} windows | {self.n_tokens:>9,} tokens | "
            f"block_size {self.block_size} | stride {self.stride}"
        )


def build_text_datasets(cfg: Config) -> Tuple[Dict[str, TextDataset], Tokenizer]:
    directory = Path(cfg.data.corpus.dir)
    texts = {split: read_corpus(directory, split) for split in SPLITS}

    tokenizer = build_tokenizer(cfg.data.tokenizer, texts["train"])

    datasets: Dict[str, TextDataset] = {}
    for split in SPLITS:
        ids = torch.tensor(tokenizer.encode(texts[split]), dtype=torch.long)
        stride = cfg.data.stride if split == "train" else cfg.data.block_size
        datasets[split] = TextDataset(ids, cfg.data.block_size, stride)

    return datasets, tokenizer


def build_text_dataloaders(
    cfg: Config,
    generator: torch.Generator | None = None,
) -> Tuple[Dict[str, DataLoader], Dict[str, TextDataset], Tokenizer]:
    datasets, tokenizer = build_text_datasets(cfg)

    loaders = {
        "train": DataLoader(
            datasets["train"],
            batch_size=cfg.data.batch_size,
            shuffle=cfg.data.shuffle_train,
            generator=generator,
            drop_last=False,
        ),
    }
    for split in ("val", "test"):
        loaders[split] = DataLoader(
            datasets[split],
            batch_size=cfg.data.batch_size,
            shuffle=False,
        )
    return loaders, datasets, tokenizer
