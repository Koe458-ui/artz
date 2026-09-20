from __future__ import annotations

from typing import Iterable, List, Sequence, Tuple

import numpy as np
import torch


def int_to_bits(value: int, n_bits: int) -> List[int]:
    if value < 0:
        raise ValueError(f"int_to_bits expects a non-negative integer, got {value}")
    if value >= 2**n_bits:
        raise ValueError(f"{value} does not fit in {n_bits} bits (max {2**n_bits - 1})")
    return [(value >> shift) & 1 for shift in reversed(range(n_bits))]


def bits_to_int(bits: Sequence[int] | Iterable[int]) -> int:
    value = 0
    for bit in bits:
        bit = int(bit)
        if bit not in (0, 1):
            raise ValueError(f"expected only 0s and 1s, found {bit}")
        value = (value << 1) | bit
    return value


def bits_to_string(bits: Sequence[int]) -> str:
    return "".join(str(int(b)) for b in bits)


def encode_pair(a: int, b: int, n_bits: int) -> np.ndarray:
    bits = int_to_bits(a, n_bits) + int_to_bits(b, n_bits)
    return np.asarray(bits, dtype=np.float32)


def encode_target(total: int, n_bits: int) -> np.ndarray:
    return np.asarray(int_to_bits(total, n_bits + 1), dtype=np.float32)


def logits_to_bits(logits: torch.Tensor) -> torch.Tensor:
    return (logits > 0).to(torch.int64)


def decode_prediction(logits: torch.Tensor, n_bits: int) -> Tuple[int, List[int], List[float]]:
    if logits.dim() != 1:
        raise ValueError(f"decode_prediction expects a 1-D tensor, got shape {tuple(logits.shape)}")
    expected = n_bits + 1
    if logits.numel() != expected:
        raise ValueError(f"expected {expected} logits for n_bits={n_bits}, got {logits.numel()}")

    probabilities = torch.sigmoid(logits).tolist()
    bits = logits_to_bits(logits).tolist()
    return bits_to_int(bits), bits, probabilities
