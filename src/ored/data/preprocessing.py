"""Preprocessing: turning human data into tensors, and back again.

A neural network cannot see the number 9. It only ever sees a **tensor** -- a
grid of floating-point numbers. So every project needs an agreed translation
in both directions:

    human value  --encode-->  tensor  --model-->  tensor  --decode-->  human value

Here the translation is binary. The number 9 with 4 bits becomes [1, 0, 0, 1].
Two such numbers are concatenated into one 8-element input vector, and the
model must produce the 5 bits of their sum.

Bit order
---------
Bits are stored **most-significant first**, exactly as you would write them:

    int_to_bits(9, n_bits=4) == [1, 0, 0, 1]   # 8 + 0 + 0 + 1 = 9
                                 ^ the 8s place

That means the printed vector matches the printed binary string, which keeps
debugging honest.

Why binary rather than feeding the raw integer?
-----------------------------------------------
Feeding "9" and "6" as two plain numbers would let the model solve addition
with a single weight of 1.0 each -- it would learn nothing interesting, because
addition is *linear* in that representation. In binary, the answer depends on
carries, which are non-linear functions of the inputs. The model is forced to
build internal structure. That is the whole point of the exercise.
"""

from __future__ import annotations

from typing import Iterable, List, Sequence, Tuple

import numpy as np
import torch


def int_to_bits(value: int, n_bits: int) -> List[int]:
    """Convert a non-negative integer into a most-significant-first bit list."""
    if value < 0:
        raise ValueError(f"int_to_bits expects a non-negative integer, got {value}")
    if value >= 2**n_bits:
        raise ValueError(f"{value} does not fit in {n_bits} bits (max {2**n_bits - 1})")
    return [(value >> shift) & 1 for shift in reversed(range(n_bits))]


def bits_to_int(bits: Sequence[int] | Iterable[int]) -> int:
    """Convert a most-significant-first bit sequence back into an integer."""
    value = 0
    for bit in bits:
        bit = int(bit)
        if bit not in (0, 1):
            raise ValueError(f"expected only 0s and 1s, found {bit}")
        value = (value << 1) | bit
    return value


def bits_to_string(bits: Sequence[int]) -> str:
    """[1, 0, 0, 1] -> '1001'  (handy for logging and for the CSV file)."""
    return "".join(str(int(b)) for b in bits)


def encode_pair(a: int, b: int, n_bits: int) -> np.ndarray:
    """Encode the model's INPUT: two integers -> one float32 vector of 2*n_bits.

    float32 (not int) because every arithmetic operation inside the network --
    and every gradient flowing back through it -- is floating point.
    """
    bits = int_to_bits(a, n_bits) + int_to_bits(b, n_bits)
    return np.asarray(bits, dtype=np.float32)


def encode_target(total: int, n_bits: int) -> np.ndarray:
    """Encode the model's TARGET: the true sum -> float32 vector of n_bits + 1.

    One extra bit is needed because 15 + 15 = 30 does not fit in 4 bits.
    The target values are 0.0 and 1.0: the training loss compares the model's
    probability for each bit against these.
    """
    return np.asarray(int_to_bits(total, n_bits + 1), dtype=np.float32)


def logits_to_bits(logits: torch.Tensor) -> torch.Tensor:
    """Turn the model's raw output scores into hard 0/1 bit decisions.

    The model emits a **logit** per bit: an unbounded score where negative
    means "probably 0" and positive means "probably 1". Applying the sigmoid
    maps a logit to a probability in (0, 1); sigmoid(x) > 0.5 is exactly the
    same test as x > 0, so we can threshold the logits directly.
    """
    return (logits > 0).to(torch.int64)


def decode_prediction(logits: torch.Tensor, n_bits: int) -> Tuple[int, List[int], List[float]]:
    """Decode one model output into (integer, bits, per-bit probabilities).

    Accepts a 1-D tensor of n_bits + 1 logits.
    """
    if logits.dim() != 1:
        raise ValueError(f"decode_prediction expects a 1-D tensor, got shape {tuple(logits.shape)}")
    expected = n_bits + 1
    if logits.numel() != expected:
        raise ValueError(f"expected {expected} logits for n_bits={n_bits}, got {logits.numel()}")

    probabilities = torch.sigmoid(logits).tolist()
    bits = logits_to_bits(logits).tolist()
    return bits_to_int(bits), bits, probabilities
