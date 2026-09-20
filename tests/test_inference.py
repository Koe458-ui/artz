"""Inference must work from a checkpoint alone, with no trainer in sight."""

from __future__ import annotations

import pytest
import torch

from ored.evaluation.evaluator import evaluate_checkpoint
from ored.inference.predictor import Predictor
from ored.training.trainer import Trainer


@pytest.fixture()
def trained_checkpoint(tiny_dataset):
    tiny_dataset.training.epochs = 40
    Trainer(tiny_dataset).fit()
    return tiny_dataset.checkpoint_dir / "best.pt"


def test_predictor_loads_and_predicts(trained_checkpoint, tiny_dataset):
    predictor = Predictor.from_checkpoint(trained_checkpoint, device="cpu")
    prediction = predictor.predict(1, 2)

    assert isinstance(prediction.predicted, int)
    assert len(prediction.predicted_bits) == tiny_dataset.data.output_size
    assert 0.0 <= prediction.confidence <= 1.0
    assert prediction.expected == 3


def test_predictor_is_in_eval_mode(trained_checkpoint):
    predictor = Predictor.from_checkpoint(trained_checkpoint, device="cpu")
    assert predictor.model.training is False, "model must be in eval mode for inference"


def test_predictions_are_deterministic(trained_checkpoint):
    predictor = Predictor.from_checkpoint(trained_checkpoint, device="cpu")
    assert predictor.predict(2, 3).predicted == predictor.predict(2, 3).predicted


def test_loaded_weights_match_the_checkpoint(trained_checkpoint):
    from ored.utils.checkpoint import load_checkpoint

    predictor = Predictor.from_checkpoint(trained_checkpoint, device="cpu")
    payload = load_checkpoint(trained_checkpoint)
    for key, tensor in predictor.model.state_dict().items():
        assert torch.allclose(payload["model_state"][key], tensor)


def test_out_of_range_input_is_rejected(trained_checkpoint, tiny_dataset):
    predictor = Predictor.from_checkpoint(trained_checkpoint, device="cpu")
    too_big = 2**tiny_dataset.data.n_bits
    with pytest.raises(ValueError, match="out of range"):
        predictor.predict(too_big, 0)
    with pytest.raises(ValueError):
        predictor.predict(-1, 0)


def test_missing_checkpoint_gives_a_helpful_error(tmp_path):
    with pytest.raises(FileNotFoundError, match="Train a model first"):
        Predictor.from_checkpoint(tmp_path / "nope.pt")


def test_evaluate_checkpoint_reports_all_splits(trained_checkpoint):
    results = evaluate_checkpoint(trained_checkpoint, device="cpu", show_errors=0)
    for split in ("train", "val", "test"):
        assert 0.0 <= results[split]["exact_acc"] <= 1.0
        assert results[split]["examples"] > 0
