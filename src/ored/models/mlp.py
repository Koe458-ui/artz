"""The first Ored.ai neural network: a small multi-layer perceptron (MLP).

What the network is
-------------------
A stack of **linear layers** with a **non-linear activation** between them::

    input (8 numbers)
       |
       |  Linear:  h = x @ W1.T + b1        W1: (32, 8),  b1: (32,)
       |  ReLU:    h = max(h, 0)
       v
    hidden (32 numbers)
       |
       |  Linear + ReLU                     W2: (32, 32), b2: (32,)
       v
    hidden (32 numbers)
       |
       |  Linear (no activation)            W3: (5, 32),  b3: (5,)
       v
    output (5 logits)

Every arrow is just multiply-and-add. The knowledge of the whole model is the
content of W1, b1, W2, b2, W3, b3 -- 1,509 numbers in the default config.

What a weight and a bias mean
-----------------------------
For one output neuron ``i``::

    out_i = ( sum over j of  W[i][j] * in_j )  +  b[i]

* ``W[i][j]`` is how strongly input ``j`` pushes neuron ``i`` up or down.
  A weight near zero means "this input is irrelevant to me".
* ``b[i]`` shifts the neuron's output regardless of the inputs -- it sets how
  easily the neuron fires. Without a bias, a neuron fed all zeros could only
  ever output zero.

Why the activation function is not optional
-------------------------------------------
Two stacked linear layers are mathematically equivalent to one linear layer:
``(xA)B = x(AB)``. Depth would buy nothing. ``ReLU(x) = max(0, x)`` breaks that
collapse: it is a cheap non-linearity that lets the network approximate the
carry logic of binary addition, which no linear function can express.

Why the output has no activation
--------------------------------
The last layer emits raw scores called **logits**. The loss function
(``BCEWithLogitsLoss``) applies the sigmoid itself, in a numerically stable
way. Applying sigmoid twice would be wrong; applying it here and then using a
plain BCE loss risks overflow. Rule of thumb: models output logits, losses
handle the squashing, and only inference converts logits to probabilities.
"""

from __future__ import annotations

from typing import Any, Dict, List, Sequence

import torch
import torch.nn as nn

from ored.models.base import OredModel
from ored.models.registry import register_model

# Activation functions available from the config file.
ACTIVATIONS = {
    "relu": nn.ReLU,
    "tanh": nn.Tanh,
    "sigmoid": nn.Sigmoid,
    "gelu": nn.GELU,
}


@register_model("mlp")
class MLP(OredModel):
    """A fully-connected feed-forward network.

    Parameters
    ----------
    input_size:
        How many numbers arrive per example (8 = two 4-bit numbers).
    output_size:
        How many numbers leave per example (5 = the bits of the sum).
    hidden_sizes:
        Width of each hidden layer, e.g. ``[32, 32]``.
    activation:
        Name of the non-linearity between hidden layers.
    dropout:
        Fraction of hidden activations randomly zeroed *during training only*.
    """

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

        # Build the stack layer by layer. `sizes` walks 8 -> 32 -> 32.
        layers: List[nn.Module] = []
        sizes = [input_size, *hidden_sizes]
        for in_features, out_features in zip(sizes[:-1], sizes[1:]):
            # nn.Linear creates weight (out, in) and bias (out,) tensors and
            # registers them as parameters -- the things training will change.
            layers.append(nn.Linear(in_features, out_features))
            layers.append(activation_cls())
            if dropout > 0:
                layers.append(nn.Dropout(dropout))

        # The output ("head") layer. No activation: it produces logits.
        layers.append(nn.Linear(sizes[-1], output_size))

        # nn.Sequential runs the modules in order during forward().
        self.net = nn.Sequential(*layers)

        self._initialise_weights()

    def _initialise_weights(self) -> None:
        """Choose the starting values of every weight and bias.

        Initialisation is not a detail. If weights start too large the signal
        explodes as it passes through layers; too small and it vanishes, so no
        gradient reaches the early layers and they never learn.

        Kaiming ("He") initialisation scales the random weights by the number
        of inputs to each neuron, which keeps the size of the signal roughly
        constant through a ReLU network. Biases start at exactly zero: there is
        no symmetry problem to break for them, since the random weights already
        make every neuron different.
        """
        for module in self.net:
            if isinstance(module, nn.Linear):
                nn.init.kaiming_uniform_(module.weight, nonlinearity="relu")
                nn.init.zeros_(module.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward propagation: input tensor in, logits out.

        This is the "prediction" half of the pipeline. Note what it does *not*
        do: it never mentions the target, the loss or gradients. The model's
        only job is to map inputs to outputs.

        Shapes
        ------
        x       : (batch_size, input_size)
        returns : (batch_size, output_size)
        """
        if x.dim() != 2 or x.shape[1] != self.input_size:
            raise ValueError(
                f"expected input of shape (batch, {self.input_size}), "
                f"got {tuple(x.shape)}"
            )
        return self.net(x)

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
