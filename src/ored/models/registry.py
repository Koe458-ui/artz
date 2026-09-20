"""Model registry: map a config string to a class.

``model.name: mlp`` in the YAML must become an actual Python class. A registry
keeps that mapping in one place, so adding an architecture in Step 2 is a
decorator and nothing else -- no `if name == ...` chains scattered around the
trainer.
"""

from __future__ import annotations

from typing import Callable, Dict, Type

import torch.nn as nn

from ored.config import Config

MODEL_REGISTRY: Dict[str, Type[nn.Module]] = {}


def register_model(name: str) -> Callable[[Type[nn.Module]], Type[nn.Module]]:
    """Class decorator that records a model under ``name``."""

    def decorator(cls: Type[nn.Module]) -> Type[nn.Module]:
        key = name.lower()
        if key in MODEL_REGISTRY:
            raise ValueError(f"model name {name!r} is already registered")
        MODEL_REGISTRY[key] = cls
        return cls

    return decorator


def build_model(cfg: Config) -> nn.Module:
    """Construct the model described by the config.

    Input and output sizes are *derived from the data config*, never configured
    separately -- that way the network can never be built with a shape the
    dataset cannot feed.
    """
    # Importing here (rather than at module top) avoids a circular import:
    # mlp.py imports register_model from this module.
    from ored.models import mlp as _mlp  # noqa: F401  (import registers the model)

    key = cfg.model.name.lower()
    if key not in MODEL_REGISTRY:
        raise ValueError(
            f"unknown model {cfg.model.name!r}. Registered models: {sorted(MODEL_REGISTRY)}"
        )

    model_cls = MODEL_REGISTRY[key]
    return model_cls(
        input_size=cfg.data.input_size,
        output_size=cfg.data.output_size,
        hidden_sizes=cfg.model.hidden_sizes,
        activation=cfg.model.activation,
        dropout=cfg.model.dropout,
    )
