"""The training loop: does it actually learn, and does it save what it learned?"""

from __future__ import annotations

import json

import torch

from ored.training.trainer import Trainer, build_criterion, build_optimizer
from ored.utils.checkpoint import load_checkpoint
from ored.utils.weight_stats import snapshot_parameters, summarise_weight_change


def test_loss_decreases(tiny_dataset):
    """The single most important test in the project."""
    cfg = tiny_dataset
    cfg.training.epochs = 30
    trainer = Trainer(cfg)
    result = trainer.fit()

    first = result["history"][0]["train_loss"]
    last = result["history"][-1]["train_loss"]
    assert last < first, f"training loss did not fall: {first} -> {last}"


def test_weights_actually_change(tiny_dataset):
    """Learning means the parameter tensors moved. Prove it numerically."""
    trainer = Trainer(tiny_dataset)
    before = snapshot_parameters(trainer.model)
    trainer.fit()

    rows = summarise_weight_change(before, trainer.model)
    assert rows, "no parameters found"
    for row in rows:
        assert row["delta_norm"] > 0, f"{row['name']} never changed"


def test_one_step_lowers_the_loss_for_that_batch(tiny_dataset):
    """Zoom all the way in: forward, loss, backward, step -- and check."""
    trainer = Trainer(tiny_dataset)
    inputs, targets = next(iter(trainer.loaders["train"]))

    trainer.model.train()
    loss_before = trainer.criterion(trainer.model(inputs), targets)

    trainer.optimizer.zero_grad(set_to_none=True)
    loss_before.backward()
    trainer.optimizer.step()

    with torch.no_grad():
        loss_after = trainer.criterion(trainer.model(inputs), targets)

    assert loss_after.item() < loss_before.item()


def test_checkpoints_are_written_and_reloadable(tiny_dataset):
    trainer = Trainer(tiny_dataset)
    trainer.fit()

    for name in ("best.pt", "last.pt"):
        path = tiny_dataset.checkpoint_dir / name
        assert path.exists(), f"{name} was not written"

        payload = load_checkpoint(path)        # uses weights_only=True
        assert "model_state" in payload
        assert payload["config"]["data"]["n_bits"] == tiny_dataset.data.n_bits

        # The saved weights must match the live model exactly.
        if name == "last.pt":
            for key, tensor in trainer.model.state_dict().items():
                assert torch.allclose(payload["model_state"][key], tensor)


def test_history_json_is_written(tiny_dataset):
    trainer = Trainer(tiny_dataset)
    trainer.fit()
    path = tiny_dataset.checkpoint_dir / "history.json"
    data = json.loads(path.read_text())
    assert len(data["history"]) == len(trainer.history)
    assert "train_loss" in data["history"][0]


def test_same_seed_gives_identical_results(tiny_dataset):
    """Reproducibility is a feature, and this is how we keep it honest."""
    first = Trainer(tiny_dataset).fit()["history"]
    second = Trainer(tiny_dataset).fit()["history"]
    assert [round(r["train_loss"], 10) for r in first] == \
           [round(r["train_loss"], 10) for r in second]


def test_different_seeds_give_different_results(tiny_dataset):
    first = Trainer(tiny_dataset).fit()["history"]
    tiny_dataset.seed += 1
    second = Trainer(tiny_dataset).fit()["history"]
    assert first[-1]["train_loss"] != second[-1]["train_loss"]


def test_validation_does_not_change_weights(tiny_dataset):
    trainer = Trainer(tiny_dataset)
    before = snapshot_parameters(trainer.model)
    trainer.evaluate("val")
    for name, param in trainer.model.named_parameters():
        assert torch.equal(before[name], param.detach())


def test_builders_reject_unknown_names(tiny_dataset):
    import pytest
    with pytest.raises(ValueError):
        build_criterion("not_a_loss")
    with pytest.raises(ValueError):
        build_optimizer("not_an_optimizer", torch.nn.Linear(2, 2), 0.1, 0.0)
