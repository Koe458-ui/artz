from __future__ import annotations

import math


def cosine_with_warmup(
    step: int,
    total_steps: int,
    warmup_steps: int,
    min_ratio: float = 0.1,
) -> float:
    if total_steps <= 0:
        return 1.0

    if warmup_steps > 0 and step < warmup_steps:
        return (step + 1) / warmup_steps

    progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
    progress = min(max(progress, 0.0), 1.0)
    cosine = 0.5 * (1.0 + math.cos(math.pi * progress))
    return min_ratio + (1.0 - min_ratio) * cosine


def constant(step: int, total_steps: int, warmup_steps: int, min_ratio: float = 0.1) -> float:
    return 1.0


SCHEDULES = {
    "none": constant,
    "cosine": cosine_with_warmup,
}


def build_schedule(name: str):
    key = name.lower()
    if key not in SCHEDULES:
        raise ValueError(f"unknown scheduler {name!r}; available: {sorted(SCHEDULES)}")
    return SCHEDULES[key]
