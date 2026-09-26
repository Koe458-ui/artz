from __future__ import annotations

import math
from typing import Any, Callable, Dict, List, Tuple, Type

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from ored.config import Config
from ored.models.registry import build_model

TASK_REGISTRY: Dict[str, Type["Task"]] = {}


def register_task(name: str) -> Callable[[Type["Task"]], Type["Task"]]:
    def decorator(cls: Type["Task"]) -> Type["Task"]:
        key = name.lower()
        if key in TASK_REGISTRY:
            raise ValueError(f"task {name!r} is already registered")
        TASK_REGISTRY[key] = cls
        cls.name = key
        return cls

    return decorator


class Task:

    name: str = "base"

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.criterion: nn.Module = nn.Identity()

    def build_data(self, generator: torch.Generator | None = None
                   ) -> Tuple[Dict[str, DataLoader], Dict[str, Any]]:
        raise NotImplementedError

    def build_model(self) -> nn.Module:
        raise NotImplementedError

    def compute_loss(
        self, model: nn.Module, batch: Tuple[torch.Tensor, ...], device: torch.device
    ) -> Tuple[torch.Tensor, Dict[str, float], int]:
        raise NotImplementedError

    @property
    def metric_names(self) -> List[str]:
        return []

    def describe_data(self, datasets: Dict[str, Any]) -> List[str]:
        return []

    def checkpoint_extra(self) -> Dict[str, Any]:
        return {}

    def next_steps(self) -> List[str]:
        return []


@register_task("bit_addition")
class BitAdditionTask(Task):

    def __init__(self, cfg: Config) -> None:
        super().__init__(cfg)
        from ored.training.trainer import build_criterion
        self.criterion = build_criterion(cfg.training.loss)

    def build_data(self, generator=None):
        from ored.data.dataset import build_dataloaders
        loaders, datasets = build_dataloaders(self.cfg, generator=generator)
        return loaders, datasets

    def build_model(self) -> nn.Module:
        return build_model(self.cfg)

    def compute_loss(self, model, batch, device):
        from ored.training.metrics import bit_accuracy, exact_match_accuracy

        inputs, targets = batch
        inputs = inputs.to(device)
        targets = targets.to(device)

        logits = model(inputs)
        loss = self.criterion(logits, targets)

        metrics = {
            "bit_acc": bit_accuracy(logits, targets),
            "exact_acc": exact_match_accuracy(logits, targets),
        }
        return loss, metrics, inputs.size(0)

    @property
    def metric_names(self) -> List[str]:
        return ["bit_acc", "exact_acc"]

    def describe_data(self, datasets):
        return [datasets[name].describe() for name in ("train", "val", "test")]

    def next_steps(self):
        return [
            f"python scripts/evaluate.py --checkpoint {self.cfg.checkpoint_dir}/best.pt",
            "python scripts/infer.py --a 9 --b 6",
        ]


@register_task("language_model")
class LanguageModelTask(Task):

    def __init__(self, cfg: Config) -> None:
        super().__init__(cfg)
        self.criterion = nn.CrossEntropyLoss()
        self.tokenizer = None
        self.dataset: Dict[str, Any] = {}

    def build_data(self, generator=None):
        from ored.data.text_dataset import build_text_dataloaders

        loaders, datasets, tokenizer = build_text_dataloaders(self.cfg, generator=generator)
        self.tokenizer = tokenizer
        if self.cfg.data.source == "supabase":
            self.dataset = self._snapshot_summary(tokenizer)
        return loaders, datasets

    def _snapshot_summary(self, tokenizer) -> Dict[str, Any]:
        from ored.data.snapshot import SnapshotError, load_snapshot, tokenizer_digest

        snapshot = load_snapshot(self.cfg, verify=False)
        built = tokenizer_digest(tokenizer.to_dict())
        if built != snapshot.manifest["tokenizer"]["sha256"]:
            raise SnapshotError(
                f"the tokenizer built from snapshot {snapshot.sha256[:16]} ({built[:16]}) differs from the "
                f"one its manifest records ({snapshot.manifest['tokenizer']['sha256'][:16]})")
        return snapshot.summary()

    def build_model(self) -> nn.Module:
        if self.tokenizer is None:
            raise RuntimeError("build_data() must run before build_model(): the model's "
                               "output width is the tokenizer's vocabulary size")
        return build_model(self.cfg, vocab_size=self.tokenizer.vocab_size)

    def compute_loss(self, model, batch, device):
        ids, targets = batch
        ids = ids.to(device)
        targets = targets.to(device)

        logits = model(ids)
        B, T, V = logits.shape

        loss = self.criterion(logits.reshape(B * T, V), targets.reshape(B * T))

        loss_value = loss.item()
        metrics = {
            "bpc": loss_value / math.log(2),
            "ppl": math.exp(min(loss_value, 20.0)),
        }
        return loss, metrics, B

    @property
    def metric_names(self) -> List[str]:
        return ["bpc"]

    def describe_data(self, datasets):
        lines = [f"{name:<5} split: {datasets[name].describe()}"
                 for name in ("train", "val", "test")]
        if self.tokenizer is not None:
            lines.append(f"tokenizer  : {self.tokenizer.describe()}")
        if self.dataset:
            lines.append(f"corpus     : Supabase snapshot {self.dataset['snapshot_sha256'][:16]} of "
                         f"{self.dataset['dataset_tag']!r}, {self.dataset['records']:,} records")
        else:
            lines.append(f"corpus     : generated, {self.cfg.data.corpus.dir}")
        return lines

    def checkpoint_extra(self) -> Dict[str, Any]:
        extra: Dict[str, Any] = {"tokenizer": self.tokenizer.to_dict()} if self.tokenizer else {}
        if self.dataset:
            extra["dataset"] = dict(self.dataset)
        return extra

    def next_steps(self):
        return [
            f"python scripts/evaluate.py --checkpoint {self.cfg.checkpoint_dir}/best.pt",
            'python scripts/generate.py --prompt "the "',
            'python scripts/generate.py --arithmetic',
        ]


def build_task(cfg: Config) -> Task:
    key = cfg.task.lower()
    if key not in TASK_REGISTRY:
        raise ValueError(f"unknown task {cfg.task!r}. Registered tasks: {sorted(TASK_REGISTRY)}")
    return TASK_REGISTRY[key](cfg)
