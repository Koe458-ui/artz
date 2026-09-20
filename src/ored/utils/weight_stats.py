"""Inspecting the weights themselves.

Training changes exactly one thing: the numbers inside the model's parameter
tensors. These helpers snapshot those numbers so we can *prove* they moved,
and show by how much per layer. This is the difference between "the loss went
down" and understanding *why*.

Vocabulary
----------
* **parameter**: a tensor the optimizer is allowed to change.
* **weight**: the multiplicative parameters of a layer, shape (out, in).
  ``layer.weight[i][j]`` is how strongly input j influences output i.
* **bias**: the additive parameters, shape (out,). A per-neuron offset that
  lets a neuron activate even when all its inputs are zero.
* **norm**: the length of a tensor viewed as one long vector,
  ``sqrt(sum of squares)``. A single number summarising "how big" it is.
"""

from __future__ import annotations

from typing import Any, Dict, List

import torch


@torch.no_grad()  # we are only measuring, never training -> no gradients needed
def layer_stats(model: torch.nn.Module) -> Dict[str, Dict[str, float]]:
    """Return per-parameter summary statistics {name -> {mean, std, norm, ...}}."""
    stats: Dict[str, Dict[str, float]] = {}
    for name, param in model.named_parameters():
        p = param.detach().float()
        stats[name] = {
            "mean": p.mean().item(),
            "std": p.std().item() if p.numel() > 1 else 0.0,
            "min": p.min().item(),
            "max": p.max().item(),
            "norm": p.norm().item(),
            "count": float(p.numel()),
        }
    return stats


@torch.no_grad()
def snapshot_parameters(model: torch.nn.Module) -> Dict[str, torch.Tensor]:
    """A detached copy of every parameter, for later before/after comparison."""
    return {name: param.detach().clone() for name, param in model.named_parameters()}


@torch.no_grad()
def summarise_weight_change(
    before: Dict[str, torch.Tensor],
    model: torch.nn.Module,
) -> List[Dict[str, Any]]:
    """Compare a saved snapshot against the model's current parameters.

    Returns one row per parameter tensor with:

    * ``norm_before`` / ``norm_after`` -- size of the tensor before and after.
    * ``delta_norm``  -- the length of (after - before): the total distance the
      parameters travelled through weight space.
    * ``rel_change``  -- delta_norm / norm_before, i.e. how much they moved
      relative to where they started. This is the number that shows learning:
      a layer that did not learn stays near 0.
    * ``max_abs_delta`` -- the single biggest change to any one number.
    """
    rows: List[Dict[str, Any]] = []
    for name, param in model.named_parameters():
        after = param.detach().float()
        start = before[name].float()
        delta = after - start
        norm_before = start.norm().item()
        rows.append(
            {
                "name": name,
                "shape": tuple(param.shape),
                "count": param.numel(),
                "norm_before": norm_before,
                "norm_after": after.norm().item(),
                "delta_norm": delta.norm().item(),
                "rel_change": delta.norm().item() / norm_before if norm_before > 0 else float("nan"),
                "max_abs_delta": delta.abs().max().item(),
            }
        )
    return rows


def format_weight_change(rows: List[Dict[str, Any]]) -> str:
    """Render summarise_weight_change() output as a readable table."""
    header = (
        f"{'parameter':<22}{'shape':>12}{'#':>8}"
        f"{'|w| before':>12}{'|w| after':>12}{'moved':>10}{'rel':>9}"
    )
    lines = [header, "-" * len(header)]
    for r in rows:
        # Biases start at exactly zero, so "change relative to the start" is a
        # division by zero and carries no information. Show n/a rather than nan.
        rel = "     n/a" if r["norm_before"] == 0 else f"{r['rel_change']:>8.1%}"
        lines.append(
            f"{r['name']:<22}{str(r['shape']):>12}{r['count']:>8}"
            f"{r['norm_before']:>12.4f}{r['norm_after']:>12.4f}"
            f"{r['delta_norm']:>10.4f}{rel}"
        )
    return "\n".join(lines)
