from __future__ import annotations

import pytest
import torch

from ored.evaluation.evaluator import evaluate_checkpoint
from ored.inference.predictor import LanguageModelPredictor, Predictor, load_predictor
from ored.inference.predictor import main as predictor_main
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


@pytest.fixture()
def trained_lm_checkpoint(tiny_corpus):
    Trainer(tiny_corpus).fit()
    return tiny_corpus.checkpoint_dir / "best.pt"


def test_language_model_checkpoint_loads_with_its_tokenizer(trained_lm_checkpoint):
    predictor = load_predictor(trained_lm_checkpoint, device="cpu")

    assert isinstance(predictor, LanguageModelPredictor)
    assert predictor.task == "language_model"
    assert predictor.vocab_size == predictor.tokenizer.vocab_size
    # the head is as wide as the vocabulary the tokenizer carries
    assert predictor.model.describe()["vocab_size"] == predictor.tokenizer.vocab_size
    assert predictor.model.training is False


def test_language_model_predicts_from_text(trained_lm_checkpoint):
    predictor = load_predictor(trained_lm_checkpoint, device="cpu")
    prediction = predictor.predict("3 + 4 = ")

    assert prediction.prompt == "3 + 4 = "
    assert isinstance(prediction.completion, str)
    assert prediction.text.startswith("3 + 4 = ")
    assert "\n" not in prediction.completion


def test_language_model_text_predictions_are_deterministic(trained_lm_checkpoint):
    predictor = load_predictor(trained_lm_checkpoint, device="cpu")
    assert predictor.predict("2 + 3 = ").completion == predictor.predict("2 + 3 = ").completion


def test_language_model_generates_text(trained_lm_checkpoint):
    predictor = load_predictor(trained_lm_checkpoint, device="cpu")
    text = predictor.generate("the ", max_new_tokens=20, greedy=True)

    assert text.startswith("the ")
    assert len(text) > len("the ")


def test_language_model_predict_sum_scores_against_the_right_answer(trained_lm_checkpoint):
    predictor = load_predictor(trained_lm_checkpoint, device="cpu")
    prediction = predictor.predict_sum(3, 4)

    assert prediction.prompt == "3 + 4 = "
    assert prediction.expected == "7"
    assert prediction.correct in (True, False)


def test_language_model_weights_match_the_checkpoint(trained_lm_checkpoint):
    from ored.utils.checkpoint import load_checkpoint

    predictor = load_predictor(trained_lm_checkpoint, device="cpu")
    payload = load_checkpoint(trained_lm_checkpoint)
    state = predictor.model.state_dict()

    assert set(state) == set(payload["model_state"])
    for key, tensor in state.items():
        assert torch.allclose(payload["model_state"][key], tensor)


def test_predictor_class_dispatches_on_the_checkpoint_task(trained_lm_checkpoint):
    # asking for the bit-addition predictor still yields a working language model
    predictor = Predictor.from_checkpoint(trained_lm_checkpoint, device="cpu")
    assert isinstance(predictor, LanguageModelPredictor)


def test_language_model_checkpoint_without_a_tokenizer_is_rejected(
    trained_lm_checkpoint, tmp_path
):
    payload = torch.load(trained_lm_checkpoint, map_location="cpu", weights_only=True)
    payload["extra"].pop("tokenizer")
    stripped = tmp_path / "no_tokenizer.pt"
    torch.save(payload, stripped)

    with pytest.raises(ValueError, match="no tokenizer"):
        load_predictor(stripped, device="cpu")


def test_language_model_cli_completes_text(trained_lm_checkpoint):
    # the "ored" logger writes to its own stdout handler, so listen on it directly
    import io
    import logging

    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    ored_logger = logging.getLogger("ored")
    ored_logger.addHandler(handler)
    try:
        exit_code = predictor_main([
            "--checkpoint", str(trained_lm_checkpoint),
            "--device", "cpu",
            "--text", "5 + 6 = ",
            "--quiet",
        ])
    finally:
        ored_logger.removeHandler(handler)

    assert exit_code == 0
    assert "5 + 6 = " in stream.getvalue()


def test_default_checkpoint_falls_back_to_the_language_model(tmp_path, monkeypatch):
    from ored.inference.predictor import (
        DEFAULT_CHECKPOINT,
        LM_CHECKPOINT,
        resolve_checkpoint,
    )

    monkeypatch.chdir(tmp_path)
    (tmp_path / "checkpoints" / "char_transformer").mkdir(parents=True)
    (tmp_path / LM_CHECKPOINT).touch()

    assert resolve_checkpoint() == LM_CHECKPOINT
    assert resolve_checkpoint("somewhere/else.pt") == "somewhere/else.pt"

    (tmp_path / "checkpoints" / "bit_adder_mlp").mkdir(parents=True)
    (tmp_path / DEFAULT_CHECKPOINT).touch()
    assert resolve_checkpoint() == DEFAULT_CHECKPOINT
