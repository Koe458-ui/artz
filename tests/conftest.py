"""Shared pytest fixtures.

Every test runs against a *tiny* config (2-bit numbers, a handful of epochs)
so the whole suite finishes in seconds. The point of these tests is that the
pipeline is wired correctly, not that the model is good -- accuracy is the
job of scripts/evaluate.py.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ored.config import load_config  # noqa: E402
from ored.data.generate import generate_dataset  # noqa: E402

CONFIG_PATH = Path(__file__).resolve().parent.parent / "configs" / "bit_adder_mlp.yaml"


@pytest.fixture()
def tiny_cfg(tmp_path):
    """A fast configuration writing all its artefacts into a temp directory."""
    cfg = load_config(
        CONFIG_PATH,
        overrides=[
            "data.n_bits=3",
            "training.epochs=5",
            "training.log_every=100",
            "training.early_stopping_patience=0",
            "data.batch_size=8",
            "training.device=cpu",
        ],
    )
    cfg.data.raw_path = str(tmp_path / "data" / "bit_addition.csv")
    cfg.paths.checkpoint_dir = str(tmp_path / "checkpoints")
    cfg.run_name = "pytest_run"
    return cfg


@pytest.fixture()
def tiny_dataset(tiny_cfg):
    generate_dataset(tiny_cfg)
    return tiny_cfg
