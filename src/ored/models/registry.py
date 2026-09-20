from __future__ import annotations

from typing import Any, Callable, Dict, Type

import torch.nn as nn

from ored.config import Config

MODEL_REGISTRY: Dict[str, Type[nn.Module]] = {}


def register_model(name: str) -> Callable[[Type[nn.Module]], Type[nn.Module]]:

    def decorator(cls: Type[nn.Module]) -> Type[nn.Module]:
        key = name.lower()
        if key in MODEL_REGISTRY:
            raise ValueError(f"model name {name!r} is already registered")
        MODEL_REGISTRY[key] = cls
        return cls

    return decorator


def _import_all_models() -> None:
    from ored.models import bigram as _bigram
    from ored.models import mlp as _mlp
    from ored.models import transformer as _tf


def build_model(cfg: Config, **extra: Any) -> nn.Module:
    _import_all_models()

    key = cfg.model.name.lower()
    if key not in MODEL_REGISTRY:
        raise ValueError(
            f"unknown model {cfg.model.name!r}. Registered models: {sorted(MODEL_REGISTRY)}"
        )

    model_cls = MODEL_REGISTRY[key]
    if not hasattr(model_cls, "from_config"):
        raise TypeError(f"model {key!r} does not implement from_config()")
    return model_cls.from_config(cfg, **extra)
