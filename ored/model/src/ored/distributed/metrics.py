from __future__ import annotations

import math
from typing import Dict

from ored.distributed.env import DistEnv
from ored.training.metrics import MetricAccumulator

LM_TASK = "language_model"


def reduce_metrics(env: DistEnv, accumulator: MetricAccumulator, task: str, tokens: int = 0) -> Dict[str, float]:
    keys = sorted(set().union(*env.all_gather_object(sorted(accumulator.sums))))
    local = [float(accumulator.total_examples), float(tokens)] + [accumulator.sums.get(k, 0.0) for k in keys]
    total = env.all_reduce_sum(local)
    examples, token_count, sums = total[0], total[1], total[2:]
    if examples == 0:
        return {}
    metrics = {key: value / examples for key, value in zip(keys, sums)}
    if task == LM_TASK and "loss" in metrics:
        metrics["bpc"] = metrics["loss"] / math.log(2)
        metrics["ppl"] = math.exp(min(metrics["loss"], 20.0))
    metrics["examples"] = examples
    if token_count:
        metrics["tokens"] = token_count
    return metrics
