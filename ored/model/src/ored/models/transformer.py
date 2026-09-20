from __future__ import annotations

import math
from typing import Any, Dict, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from ored.models.base import OredModel
from ored.models.registry import register_model


class CausalSelfAttention(nn.Module):

    def __init__(self, d_model: int, n_head: int, block_size: int, dropout: float = 0.0) -> None:
        super().__init__()
        if d_model % n_head != 0:
            raise ValueError(f"d_model ({d_model}) must be divisible by n_head ({n_head})")

        self.d_model = d_model
        self.n_head = n_head
        self.d_head = d_model // n_head

        self.qkv = nn.Linear(d_model, 3 * d_model)

        self.projection = nn.Linear(d_model, d_model)

        self.attn_dropout = nn.Dropout(dropout)
        self.residual_dropout = nn.Dropout(dropout)

        self.register_buffer(
            "causal_mask",
            torch.tril(torch.ones(block_size, block_size)).view(1, 1, block_size, block_size),
            persistent=False,
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, T, C = x.shape

        q, k, v = self.qkv(x).split(self.d_model, dim=2)

        q = q.view(B, T, self.n_head, self.d_head).transpose(1, 2)
        k = k.view(B, T, self.n_head, self.d_head).transpose(1, 2)
        v = v.view(B, T, self.n_head, self.d_head).transpose(1, 2)

        scores = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_head)

        scores = scores.masked_fill(self.causal_mask[:, :, :T, :T] == 0, float("-inf"))

        weights = F.softmax(scores, dim=-1)
        weights = self.attn_dropout(weights)

        out = weights @ v

        out = out.transpose(1, 2).contiguous().view(B, T, C)

        return self.residual_dropout(self.projection(out))


class FeedForward(nn.Module):

    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.0) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_model, d_ff),
            nn.GELU(),
            nn.Linear(d_ff, d_model),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class TransformerBlock(nn.Module):

    def __init__(self, d_model: int, n_head: int, d_ff: int, block_size: int,
                 dropout: float = 0.0) -> None:
        super().__init__()
        self.ln_1 = nn.LayerNorm(d_model)
        self.attention = CausalSelfAttention(d_model, n_head, block_size, dropout)
        self.ln_2 = nn.LayerNorm(d_model)
        self.feed_forward = FeedForward(d_model, d_ff, dropout)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x + self.attention(self.ln_1(x))
        x = x + self.feed_forward(self.ln_2(x))
        return x


@register_model("transformer")
class Transformer(OredModel):

    def __init__(
        self,
        vocab_size: int,
        block_size: int,
        d_model: int = 128,
        n_layer: int = 4,
        n_head: int = 4,
        d_ff: int = 512,
        dropout: float = 0.1,
        tie_weights: bool = True,
    ) -> None:
        super().__init__()

        self.vocab_size = vocab_size
        self.block_size = block_size
        self.d_model = d_model
        self.n_layer = n_layer
        self.n_head = n_head
        self.d_ff = d_ff

        self.token_embedding = nn.Embedding(vocab_size, d_model)

        self.position_embedding = nn.Embedding(block_size, d_model)

        self.dropout = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, n_head, d_ff, block_size, dropout)
            for _ in range(n_layer)
        ])
        self.ln_final = nn.LayerNorm(d_model)

        self.head = nn.Linear(d_model, vocab_size, bias=False)

        if tie_weights:
            self.head.weight = self.token_embedding.weight

        self.apply(self._init_weights)

    def _init_weights(self, module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
        elif isinstance(module, nn.LayerNorm):
            nn.init.ones_(module.weight)
            nn.init.zeros_(module.bias)

    def forward(self, ids: torch.Tensor) -> torch.Tensor:
        if ids.dim() != 2:
            raise ValueError(f"expected ids of shape (batch, seq), got {tuple(ids.shape)}")
        B, T = ids.shape
        if T > self.block_size:
            raise ValueError(
                f"sequence length {T} exceeds block_size {self.block_size}: the "
                f"position embedding table has no row for position {T - 1}."
            )

        positions = torch.arange(T, device=ids.device)

        x = self.token_embedding(ids) + self.position_embedding(positions)
        x = self.dropout(x)

        for block in self.blocks:
            x = block(x)

        x = self.ln_final(x)
        return self.head(x)

    @classmethod
    def from_config(cls, cfg, vocab_size: Optional[int] = None, **_: Any) -> "Transformer":
        if vocab_size is None:
            raise ValueError("Transformer needs vocab_size, which comes from the tokenizer")
        return cls(
            vocab_size=vocab_size,
            block_size=cfg.data.block_size,
            d_model=cfg.model.d_model,
            n_layer=cfg.model.n_layer,
            n_head=cfg.model.n_head,
            d_ff=cfg.model.d_ff,
            dropout=cfg.model.dropout,
            tie_weights=cfg.model.tie_weights,
        )

    def describe(self) -> Dict[str, Any]:
        return {
            "type": "Transformer",
            "vocab_size": self.vocab_size,
            "block_size": self.block_size,
            "d_model": self.d_model,
            "n_layer": self.n_layer,
            "n_head": self.n_head,
            "d_ff": self.d_ff,
            "parameters": self.num_parameters(),
        }
