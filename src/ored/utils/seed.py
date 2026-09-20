"""Reproducibility: making a random process repeatable.

Two things in training are random:

1. **Weight initialisation.** A fresh network's weights are drawn from a random
   distribution. (They must be random: if every weight started at the same
   value, every neuron in a layer would compute the same thing and receive the
   same gradient forever -- the network could never differentiate its neurons.)
2. **Data order.** The training set is reshuffled every epoch.

Both are driven by a pseudo-random number generator. Seeding that generator
with a fixed number makes the whole run deterministic: same config in, same
loss curve out.
"""

from __future__ import annotations

import os
import random

import numpy as np
import torch


def set_seed(seed: int, deterministic: bool = True) -> None:
    """Fix every random number generator this project can touch."""
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)             # Python's own RNG
    np.random.seed(seed)          # NumPy (used during dataset generation)
    torch.manual_seed(seed)       # PyTorch CPU RNG (weight init, shuffling)
    torch.cuda.manual_seed_all(seed)  # no-op when there is no GPU

    if deterministic:
        # Ask cuDNN for reproducible algorithms instead of the fastest ones.
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def resolve_device(requested: str = "auto") -> torch.device:
    """Turn the configured device string into a real torch.device.

    A *device* is simply where tensors live and where the arithmetic happens.
    Step 1 is tiny on purpose, so the CPU is more than enough.
    """
    if requested == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if requested == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("device 'cuda' requested but no CUDA GPU is available")
    return torch.device(requested)
