from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

import torch


@torch.no_grad()
def bit_accuracy(logits: torch.Tensor, targets: torch.Tensor) -> float:
    predicted = (logits > 0).float()
    return (predicted == targets).float().mean().item()


@torch.no_grad()
def exact_match_accuracy(logits: torch.Tensor, targets: torch.Tensor) -> float:
    predicted = (logits > 0).float()
    correct_rows = (predicted == targets).all(dim=1)
    return correct_rows.float().mean().item()


@dataclass
class MetricAccumulator:

    total_examples: int = 0
    sums: Dict[str, float] = field(default_factory=dict)

    def update(self, batch_size: int, **values: float) -> None:
        self.total_examples += batch_size
        for key, value in values.items():
            self.sums[key] = self.sums.get(key, 0.0) + value * batch_size

    def compute(self) -> Dict[str, float]:
        if self.total_examples == 0:
            return {}
        return {key: total / self.total_examples for key, total in self.sums.items()}

    def reset(self) -> None:
        self.total_examples = 0
        self.sums.clear()
