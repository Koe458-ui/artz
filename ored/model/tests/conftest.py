from __future__ import annotations

import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from ored.config import load_config
from ored.data.corpus import generate_corpus
from ored.data.generate import generate_dataset

CONFIGS = Path(__file__).resolve().parent.parent / "configs"
CONFIG_PATH = CONFIGS / "bit_adder_mlp.yaml"
LM_CONFIG_PATH = CONFIGS / "char_transformer.yaml"


@pytest.fixture()
def tiny_cfg(tmp_path):
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


@pytest.fixture()
def tiny_lm_cfg(tmp_path):
    cfg = load_config(
        LM_CONFIG_PATH,
        overrides=[
            "training.epochs=2",
            "training.log_every=100",
            "training.early_stopping_patience=0",
            "training.device=cpu",
            "data.block_size=32",
            "data.stride=16",
            "data.batch_size=8",
            "data.corpus.sentence_lines=300",
            "data.corpus.max_operand=9",
            "data.corpus.arithmetic_repeats=3",
            "model.d_model=32",
            "model.n_layer=2",
            "model.n_head=2",
            "model.d_ff=64",
            "model.dropout=0.0",
        ],
    )
    cfg.data.corpus.dir = str(tmp_path / "corpus")
    cfg.paths.checkpoint_dir = str(tmp_path / "checkpoints")
    cfg.run_name = "pytest_lm"
    return cfg


@pytest.fixture()
def tiny_corpus(tiny_lm_cfg):
    generate_corpus(tiny_lm_cfg)
    return tiny_lm_cfg
