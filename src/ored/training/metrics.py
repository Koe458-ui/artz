"""Metrics: how we judge the model.

The **loss** is what training minimises -- it must be smooth and
differentiable so gradients exist. It is not, however, what a human cares
about. "Binary cross-entropy 0.08" means nothing on its own.

So we also compute two honest, human-readable scores:

``bit_accuracy``
    Of all the individual output bits, what fraction is correct? A model that
    guesses randomly scores ~50%. A model that always predicts 0 scores ~65%
    here, because most sum bits happen to be 0 -- which is exactly why this
    metric alone is not enough.

``exact_match_accuracy``
    What fraction of examples had **all five bits** right, i.e. the model
    produced the correct number? This is the metric that actually answers
    "can it add?". Getting 4 of 5 bits right is still a wrong answer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict

import torch


@torch.no_grad()
def bit_accuracy(logits: torch.Tensor, targets: torch.Tensor) -> float:
    """Fraction of individual bits predicted correctly."""
    predicted = (logits > 0).float()          # logit > 0  <=>  probability > 0.5
    return (predicted == targets).float().mean().item()


@torch.no_grad()
def exact_match_accuracy(logits: torch.Tensor, targets: torch.Tensor) -> float:
    """Fraction of examples where *every* bit is correct."""
    predicted = (logits > 0).float()
    # .all(dim=1) collapses each row to a single True/False.
    correct_rows = (predicted == targets).all(dim=1)
    return correct_rows.float().mean().item()


@dataclass
class MetricAccumulator:
    """Averages metrics correctly across batches of different sizes.

    A subtlety worth knowing: the last batch of an epoch is often smaller than
    the others. Averaging the per-batch averages would over-weight it. We
    therefore accumulate *sums weighted by batch size* and divide at the end.
    """

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
