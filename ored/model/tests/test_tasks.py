from __future__ import annotations

import pytest
import torch

from ored.training.tasks import TASK_REGISTRY, BitAdditionTask, LanguageModelTask, build_task
from ored.training.trainer import Trainer
from ored.utils.checkpoint import load_checkpoint
from ored.utils.weight_stats import snapshot_parameters, summarise_weight_change


def test_both_tasks_are_registered():
    assert "bit_addition" in TASK_REGISTRY
    assert "language_model" in TASK_REGISTRY


def test_unknown_task_is_rejected(tiny_cfg):
    tiny_cfg.task = "telepathy"
    with pytest.raises(ValueError, match="unknown task"):
        build_task(tiny_cfg)


def test_the_right_task_is_built(tiny_cfg, tiny_lm_cfg):
    assert isinstance(build_task(tiny_cfg), BitAdditionTask)
    assert isinstance(build_task(tiny_lm_cfg), LanguageModelTask)


def test_language_model_loss_decreases(tiny_corpus):
    tiny_corpus.training.epochs = 3
    trainer = Trainer(tiny_corpus)
    result = trainer.fit()

    first = result["history"][0]["train_loss"]
    last = result["history"][-1]["train_loss"]
    assert last < first, f"language-model loss did not fall: {first} -> {last}"


def test_language_model_beats_random_guessing(tiny_corpus):
    import math

    tiny_corpus.training.epochs = 3
    trainer = Trainer(tiny_corpus)
    trainer.fit()

    vocab_size = trainer.task.tokenizer.vocab_size
    uninformed_bpc = math.log2(vocab_size)
    final_bpc = trainer.history[-1]["val_bpc"]
    assert final_bpc < uninformed_bpc, \
        f"bpc {final_bpc:.2f} is no better than guessing ({uninformed_bpc:.2f})"


def test_language_model_weights_change(tiny_corpus):
    trainer = Trainer(tiny_corpus)
    before = snapshot_parameters(trainer.model)
    trainer.fit()
    for row in summarise_weight_change(before, trainer.model):
        assert row["delta_norm"] > 0, f"{row['name']} never changed"


def test_checkpoint_carries_the_tokenizer(tiny_corpus):
    trainer = Trainer(tiny_corpus)
    trainer.fit()

    payload = load_checkpoint(tiny_corpus.checkpoint_dir / "best.pt")
    assert payload["tokenizer"]["itos"] == trainer.task.tokenizer.itos


def test_trained_language_model_reloads_and_generates(tiny_corpus):
    from ored.evaluation.lm_evaluator import load_language_model
    from ored.inference.generator import generate_text

    Trainer(tiny_corpus).fit()
    path = tiny_corpus.checkpoint_dir / "best.pt"

    model, tokenizer, cfg, info = load_language_model(path, device="cpu")
    text = generate_text(model, tokenizer, "the ", max_new_tokens=20,
                         block_size=cfg.data.block_size, device=info["device"])
    assert text.startswith("the ")
    assert len(text) > 4


def test_reloaded_weights_match(tiny_corpus):
    from ored.evaluation.lm_evaluator import load_language_model

    trainer = Trainer(tiny_corpus)
    trainer.fit()
    model, _, _, _ = load_language_model(tiny_corpus.checkpoint_dir / "live.pt", device="cpu")

    for key, tensor in trainer.model.state_dict().items():
        assert torch.allclose(model.state_dict()[key], tensor)


def test_resume_restores_weights_and_optimizer(tiny_corpus):
    first = Trainer(tiny_corpus)
    first.fit()
    checkpoint = str(tiny_corpus.checkpoint_dir / "live.pt")

    tiny_corpus.training.resume = checkpoint
    second = Trainer(tiny_corpus)

    assert second.resumed_from
    for key, tensor in first.model.state_dict().items():
        assert torch.allclose(second.model.state_dict()[key], tensor)


def test_scheduler_changes_the_learning_rate(tiny_corpus):
    tiny_corpus.training.scheduler = "cosine"
    tiny_corpus.training.warmup_steps = 5
    tiny_corpus.training.epochs = 2

    trainer = Trainer(tiny_corpus)
    trainer.fit()

    rates = [record["lr"] for record in trainer.history]
    assert any(r != tiny_corpus.training.learning_rate for r in rates), \
        "the learning rate never moved despite a cosine schedule"


def test_bigram_baseline_trains_too(tiny_corpus):
    tiny_corpus.model.name = "bigram"
    trainer = Trainer(tiny_corpus)
    result = trainer.fit()
    assert result["history"][-1]["train_loss"] < result["history"][0]["train_loss"]
