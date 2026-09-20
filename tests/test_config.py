"""The config system must fail loudly on bad input."""

from __future__ import annotations

from pathlib import Path

import pytest

from ored.config import Config, config_from_dict, load_config

CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "bit_adder_mlp.yaml"


def test_loads_the_real_config():
    cfg = load_config(CONFIG_PATH)
    assert isinstance(cfg, Config)
    # Nested sections must become dataclasses, not plain dicts.
    assert cfg.data.split.train > 0
    assert cfg.data.input_size == 2 * cfg.data.n_bits
    assert cfg.data.output_size == cfg.data.n_bits + 1


def test_overrides_are_typed():
    cfg = load_config(CONFIG_PATH, ["training.epochs=3", "model.hidden_sizes=[8,4]",
                                    "deterministic=false", "model.activation=relu"])
    assert cfg.training.epochs == 3 and isinstance(cfg.training.epochs, int)
    assert cfg.model.hidden_sizes == [8, 4]
    assert cfg.deterministic is False
    assert cfg.model.activation == "relu"


def test_typo_in_override_is_rejected():
    with pytest.raises(ValueError, match="unknown config key"):
        load_config(CONFIG_PATH, ["training.lerning_rate=0.1"])


def test_invalid_values_are_rejected():
    with pytest.raises(ValueError):
        load_config(CONFIG_PATH, ["training.epochs=0"])
    with pytest.raises(ValueError):
        load_config(CONFIG_PATH, ["data.split.train=0.9"])   # no longer sums to 1
    with pytest.raises(ValueError):
        load_config(CONFIG_PATH, ["model.hidden_sizes=[]"])  # no hidden layer


def test_round_trip_through_dict():
    """A checkpoint stores config as a dict; it must rebuild identically."""
    cfg = load_config(CONFIG_PATH)
    rebuilt = config_from_dict(cfg.to_dict())
    assert rebuilt.to_dict() == cfg.to_dict()
