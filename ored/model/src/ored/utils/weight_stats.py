from __future__ import annotations

import math
from typing import Any, Dict, List

import torch


@torch.no_grad()
def layer_stats(model: torch.nn.Module) -> Dict[str, Dict[str, float]]:
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
    return {name: param.detach().clone() for name, param in model.named_parameters()}


@torch.no_grad()
def summarise_weight_change(
    before: Dict[str, torch.Tensor],
    model: torch.nn.Module,
) -> List[Dict[str, Any]]:
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


def _group_key(name: str) -> str:
    parts = name.split(".")
    if parts[0] == "blocks" and len(parts) > 1:
        return f"blocks.{parts[1]}"
    if parts[0] == "net" and len(parts) > 1:
        return name.rsplit(".", 1)[0] if len(parts) > 2 else name
    return parts[0]


def group_weight_change(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    groups: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = _group_key(r["name"])
        g = groups.setdefault(key, {
            "name": key, "shape": "-", "count": 0,
            "sq_before": 0.0, "sq_after": 0.0, "sq_delta": 0.0,
            "max_abs_delta": 0.0, "tensors": 0,
        })
        g["count"] += r["count"]
        g["tensors"] += 1
        g["sq_before"] += r["norm_before"] ** 2
        g["sq_after"] += r["norm_after"] ** 2
        g["sq_delta"] += r["delta_norm"] ** 2
        g["max_abs_delta"] = max(g["max_abs_delta"], r["max_abs_delta"])

    out: List[Dict[str, Any]] = []
    for g in groups.values():
        norm_before = math.sqrt(g["sq_before"])
        delta_norm = math.sqrt(g["sq_delta"])
        out.append({
            "name": g["name"],
            "shape": f"{g['tensors']} tensors",
            "count": g["count"],
            "norm_before": norm_before,
            "norm_after": math.sqrt(g["sq_after"]),
            "delta_norm": delta_norm,
            "rel_change": delta_norm / norm_before if norm_before > 0 else float("nan"),
            "max_abs_delta": g["max_abs_delta"],
        })
    return out


def format_weight_change(rows: List[Dict[str, Any]], max_rows: int = 14) -> str:
    grouped = len(rows) > max_rows
    if grouped:
        rows = group_weight_change(rows)

    header = (
        f"{'parameter':<26}{'shape':>14}{'#':>9}"
        f"{'|w| before':>12}{'|w| after':>12}{'moved':>10}{'rel':>9}"
    )
    lines = [header, "-" * len(header)]
    for r in rows:
        rel = "     n/a" if r["norm_before"] == 0 else f"{r['rel_change']:>8.1%}"
        lines.append(
            f"{r['name']:<26}{str(r['shape']):>14}{r['count']:>9,}"
            f"{r['norm_before']:>12.4f}{r['norm_after']:>12.4f}"
            f"{r['delta_norm']:>10.4f}{rel}"
        )
    if grouped:
        lines.append(f"(grouped by module: {len(rows)} rows for "
                     f"{sum(r['count'] for r in rows):,} parameters)")
    return "\n".join(lines)
