"""The contract every Ored.ai model must satisfy.

Keeping this interface small is what lets Step 2 drop in a completely
different architecture without touching the trainer, the evaluator or the
inference code. They all talk to ``OredModel``, never to ``MLP`` directly.
"""

from __future__ import annotations

from typing import Any, Dict

import torch
import torch.nn as nn


class OredModel(nn.Module):
    """Base class for every model in this project.

    ``nn.Module`` is PyTorch's building block. Two things it gives us for free:

    * **Parameter tracking.** Any ``nn.Parameter`` (or sub-module) assigned to
      ``self`` is registered automatically, so ``model.parameters()`` returns
      every weight and bias -- this is exactly the list handed to the optimizer.
    * **Train/eval mode.** ``model.train()`` and ``model.eval()`` flip a flag
      that layers like Dropout read. Forgetting this is a classic bug: dropout
      left active during evaluation makes a good model look bad.
    """

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # pragma: no cover - interface
        raise NotImplementedError

    def num_parameters(self, trainable_only: bool = True) -> int:
        """Count the individual numbers the optimizer is free to change."""
        return sum(
            p.numel() for p in self.parameters() if p.requires_grad or not trainable_only
        )

    def describe(self) -> Dict[str, Any]:  # pragma: no cover - interface
        """A short, printable description of this architecture."""
        return {"type": type(self).__name__, "parameters": self.num_parameters()}
