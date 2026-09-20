"""The network itself: shapes, parameter counts, and that gradients flow."""

from __future__ import annotations

import pytest
import torch

from ored.models import MLP, build_model


def test_forward_shape(tiny_cfg):
    model = build_model(tiny_cfg)
    x = torch.zeros(4, tiny_cfg.data.input_size)
    assert model(x).shape == (4, tiny_cfg.data.output_size)


def test_parameter_count_matches_the_arithmetic():
    """8->32->32->5 = (8*32+32) + (32*32+32) + (32*5+5) = 1509."""
    model = MLP(input_size=8, output_size=5, hidden_sizes=[32, 32])
    expected = (8 * 32 + 32) + (32 * 32 + 32) + (32 * 5 + 5)
    assert model.num_parameters() == expected == 1509


def test_biases_start_at_zero_and_weights_do_not():
    model = MLP(input_size=8, output_size=5, hidden_sizes=[16])
    for name, param in model.named_parameters():
        if name.endswith("bias"):
            assert torch.all(param == 0)
        else:
            # Random init: neurons must not all be identical, or they would
            # receive identical gradients forever.
            assert param.std().item() > 0


def test_gradients_reach_every_parameter():
    """If any parameter has no gradient, part of the network cannot learn."""
    model = MLP(input_size=8, output_size=5, hidden_sizes=[16, 16])
    x = torch.rand(8, 8)
    loss = torch.nn.BCEWithLogitsLoss()(model(x), torch.rand(8, 5).round())
    loss.backward()

    for name, param in model.named_parameters():
        assert param.grad is not None, f"{name} received no gradient"
        assert torch.isfinite(param.grad).all(), f"{name} has non-finite gradients"
        assert param.grad.abs().sum() > 0, f"{name} has an all-zero gradient"


def test_wrong_input_shape_is_rejected():
    model = MLP(input_size=8, output_size=5, hidden_sizes=[8])
    with pytest.raises(ValueError):
        model(torch.zeros(4, 7))     # 7 features, not 8


def test_unknown_activation_is_rejected():
    with pytest.raises(ValueError, match="unknown activation"):
        MLP(input_size=8, output_size=5, hidden_sizes=[8], activation="banana")


def test_registry_rejects_unknown_model(tiny_cfg):
    tiny_cfg.model.name = "does_not_exist"
    with pytest.raises(ValueError, match="unknown model"):
        build_model(tiny_cfg)


def test_train_and_eval_modes_differ_with_dropout():
    model = MLP(input_size=8, output_size=5, hidden_sizes=[64], dropout=0.5)
    x = torch.rand(32, 8)

    model.train()
    torch.manual_seed(0)
    a = model(x)
    torch.manual_seed(1)
    b = model(x)
    assert not torch.allclose(a, b), "dropout should randomise training output"

    model.eval()
    assert torch.allclose(model(x), model(x)), "eval output must be deterministic"
