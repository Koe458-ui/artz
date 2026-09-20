from __future__ import annotations

from typing import Any, Dict, List, Sequence

import torch
import torch.nn as nn

from ored.models.base import OredModel
from ored.models.registry import register_model

ACTIVATIONS = {
    "relu": nn.ReLU,
    "tanh": nn.Tanh,
    "sigmoid": nn.Sigmoid,
    "gelu": nn.GELU,
}


@register_model("mlp")
class MLP(OredModel):

    def __init__(
        self,
        input_size: int,
        output_size: int,
        hidden_sizes: Sequence[int] = (32, 32),
        activation: str = "relu",
        dropout: float = 0.0,
    ) -> None:
        super().__init__()

        if activation not in ACTIVATIONS:
            raise ValueError(
                f"unknown activation {activation!r}; available: {sorted(ACTIVATIONS)}"
            )

        self.input_size = input_size
        self.output_size = output_size
        self.hidden_sizes = list(hidden_sizes)
        self.activation_name = activation
        self.dropout_p = dropout

        activation_cls = ACTIVATIONS[activation]

        layers: List[nn.Module] = []
        sizes = [input_size, *hidden_sizes]
        for in_features, out_features in zip(sizes[:-1], sizes[1:]):
            layers.append(nn.Linear(in_features, out_features))
            layers.append(activation_cls())
            if dropout > 0:
                layers.append(nn.Dropout(dropout))

        layers.append(nn.Linear(sizes[-1], output_size))

        self.net = nn.Sequential(*layers)

        self._initialise_weights()

    def _initialise_weights(self) -> None:
        for module in self.net:
            if isinstance(module, nn.Linear):
                nn.init.kaiming_uniform_(module.weight, nonlinearity="relu")
                nn.init.zeros_(module.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if x.dim() != 2 or x.shape[1] != self.input_size:
            raise ValueError(
                f"expected input of shape (batch, {self.input_size}), "
                f"got {tuple(x.shape)}"
            )
        return self.net(x)

    @classmethod
    def from_config(cls, cfg, **_: Any) -> "MLP":
        return cls(
            input_size=cfg.data.input_size,
            output_size=cfg.data.output_size,
            hidden_sizes=cfg.model.hidden_sizes,
            activation=cfg.model.activation,
            dropout=cfg.model.dropout,
        )

    def describe(self) -> Dict[str, Any]:
        return {
            "type": "MLP",
            "input_size": self.input_size,
            "hidden_sizes": self.hidden_sizes,
            "output_size": self.output_size,
            "activation": self.activation_name,
            "dropout": self.dropout_p,
            "parameters": self.num_parameters(),
        }
