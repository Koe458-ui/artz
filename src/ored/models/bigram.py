from __future__ import annotations

from typing import Any, Dict

import torch
import torch.nn as nn

from ored.models.base import OredModel
from ored.models.registry import register_model


@register_model("bigram")
class BigramLanguageModel(OredModel):

    def __init__(self, vocab_size: int, block_size: int = 128, **_: Any) -> None:
        super().__init__()
        self.vocab_size = vocab_size
        self.block_size = block_size

        self.table = nn.Embedding(vocab_size, vocab_size)
        nn.init.zeros_(self.table.weight)

    def forward(self, ids: torch.Tensor) -> torch.Tensor:
        if ids.dim() != 2:
            raise ValueError(f"expected ids of shape (batch, seq), got {tuple(ids.shape)}")
        return self.table(ids)

    @classmethod
    def from_config(cls, cfg, vocab_size: int | None = None, **_: Any) -> "BigramLanguageModel":
        if vocab_size is None:
            raise ValueError("BigramLanguageModel needs vocab_size from the tokenizer")
        return cls(vocab_size=vocab_size, block_size=cfg.data.block_size)

    def describe(self) -> Dict[str, Any]:
        return {
            "type": "BigramLanguageModel",
            "vocab_size": self.vocab_size,
            "block_size": self.block_size,
            "parameters": self.num_parameters(),
        }
