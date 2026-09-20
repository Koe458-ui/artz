from __future__ import annotations

from typing import Any, Dict

import torch
import torch.nn as nn


class OredModel(nn.Module):

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        raise NotImplementedError

    def num_parameters(self, trainable_only: bool = True) -> int:
        return sum(
            p.numel() for p in self.parameters() if p.requires_grad or not trainable_only
        )

    def describe(self) -> Dict[str, Any]:
        return {"type": type(self).__name__, "parameters": self.num_parameters()}
