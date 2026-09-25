from __future__ import annotations

import copy
import shutil

import pytest
import torch

from ored.inference.predictor import load_predictor
from ored.training.checkpoints import CheckpointManager, NoResumableCheckpoint
from ored.training.trainer import Trainer
from ored.utils.checkpoint import (
    CHECKPOINT_FORMAT_VERSION,
    CheckpointError,
    PromotionRule,
    is_better,
    load_checkpoint,
)


class Crash(Exception):
    pass


def crash_at(monkeypatch, step):
    original = Trainer._apply_learning_rate

    def dying(self):
        if self.global_step + 1 == step:
            raise Crash(f"power cut at step {step}")
        return original(self)

    monkeypatch.setattr(Trainer, "_apply_learning_rate", dying)


def fresh(cfg, directory):
    cfg = copy.deepcopy(cfg)
    cfg.paths.checkpoint_dir = str(directory)
    return cfg


def params(model):
    return {k: v.detach().clone() for k, v in model.state_dict().items()}


def assert_same_weights(a, b):
    assert a.keys() == b.keys()
    for key in a:
        assert torch.equal(a[key], b[key]), f"{key} differs"


def test_one_rule_decides_better():
    rule = PromotionRule()
    assert rule.is_better(0.40, None)
    assert rule.is_better(0.40, 0.41)
    assert not rule.is_better(0.41, 0.40)
    assert not rule.is_better(0.40, 0.40), "a tie is not an improvement"
    assert not rule.is_better(float("nan"), 0.5)
    assert not rule.is_better(None, 0.5)
    assert PromotionRule(mode="max").is_better(0.9, 0.8)
    assert is_better(0.1, 0.2)


def test_the_rule_reads_format_1_metric_names():
    assert PromotionRule().value({"loss": 0.4}) == 0.4
    assert PromotionRule("val_bpc").value({"bpc": 0.58}) == 0.58
    assert PromotionRule().value({"val_loss": 0.3, "loss": 0.4}) == 0.3


def test_bad_checkpoint_settings_are_rejected(tiny_cfg):
    tiny_cfg.checkpoint.best_mode = "lower"
    with pytest.raises(ValueError, match="best_mode"):
        tiny_cfg.validate()
    tiny_cfg.checkpoint.best_mode = "min"
    tiny_cfg.checkpoint.keep_history = True
    tiny_cfg.checkpoint.save_history_every_epochs = 0
    with pytest.raises(ValueError, match="keep_history"):
        tiny_cfg.validate()


def test_each_role_has_the_state_it_needs(tiny_dataset):
    tiny_dataset.checkpoint.keep_history = True
    tiny_dataset.checkpoint.export_on_finish = True
    trainer = Trainer(tiny_dataset)
    trainer.fit()
    d = tiny_dataset.checkpoint_dir

    base = load_checkpoint(d / "base.pt")
    assert base["checkpoint_kind"] == "base" and base["epoch"] == 0 and base["global_step"] == 0
    assert base["optimizer_state_dict"] is None

    live = load_checkpoint(d / "live.pt")
    assert live["checkpoint_kind"] == "live"
    assert live["global_step"] == trainer.global_step
    for key in ("optimizer_state_dict", "scheduler_state_dict", "rng_state", "trainer_state"):
        assert live[key] is not None, key
    assert live["metrics"]["val_loss"] == trainer.history[-1]["val_loss"]

    best = load_checkpoint(d / "best.pt")
    assert best["checkpoint_kind"] == "best" and best["optimizer_state_dict"] is not None

    export = load_checkpoint(d / "export.pt")
    assert export["checkpoint_kind"] == "export"
    for key in ("optimizer_state_dict", "rng_state", "trainer_state"):
        assert export[key] is None, key
    assert export["epoch"] == best["epoch"]

    for payload in (base, live, best, export):
        assert payload["format_version"] == CHECKPOINT_FORMAT_VERSION
        assert payload["architecture"]["type"] == "MLP"
        assert payload["torch_version"] and payload["created_at"]


def test_best_is_the_epoch_with_the_lowest_validation_loss(tiny_dataset):
    tiny_dataset.training.epochs = 12
    trainer = Trainer(tiny_dataset)
    trainer.fit()

    losses = [r["val_loss"] for r in trainer.history]
    best_epoch = losses.index(min(losses)) + 1
    best = load_checkpoint(tiny_dataset.checkpoint_dir / "best.pt")
    assert best["epoch"] == best_epoch == trainer.best_epoch
    assert best["promotion"] == {"metric": "val_loss", "mode": "min",
                                 "value": min(losses), "epoch": best_epoch}


def test_best_can_follow_a_higher_is_better_metric(tiny_dataset):
    tiny_dataset.training.epochs = 12
    tiny_dataset.checkpoint.best_metric = "val_exact_acc"
    tiny_dataset.checkpoint.best_mode = "max"
    trainer = Trainer(tiny_dataset)
    trainer.fit()

    accs = [r["val_exact_acc"] for r in trainer.history]
    best = load_checkpoint(tiny_dataset.checkpoint_dir / "best.pt")
    assert best["metrics"]["val_exact_acc"] == max(accs)
    assert best["epoch"] == accs.index(max(accs)) + 1


def test_worse_epochs_do_not_overwrite_best(tiny_dataset, monkeypatch):
    manager_writes = []
    original = CheckpointManager._write

    def recording(self, kind, path, snapshot):
        manager_writes.append((kind, snapshot["metrics"].get("val_loss")))
        return original(self, kind, path, snapshot)

    monkeypatch.setattr(CheckpointManager, "_write", recording)
    tiny_dataset.training.epochs = 12
    Trainer(tiny_dataset).fit()

    bests = [loss for kind, loss in manager_writes if kind == "best"]
    assert bests == sorted(bests, reverse=True), "each promoted best must beat the previous one"
    assert len(set(bests)) == len(bests)


def test_history_is_saved_at_the_chosen_interval(tiny_dataset):
    tiny_dataset.training.epochs = 5
    tiny_dataset.checkpoint.keep_history = True
    tiny_dataset.checkpoint.save_history_every_epochs = 2
    trainer = Trainer(tiny_dataset)
    trainer.fit()

    files = trainer.checkpoints.history_files()
    assert [load_checkpoint(f)["epoch"] for f in files] == [2, 4]
    for f in files:
        payload = load_checkpoint(f)
        assert payload["checkpoint_kind"] == "history"
        assert f.name == f"epoch_{payload['epoch']:04d}_step_{payload['global_step']:08d}.pt"


def test_history_can_follow_steps(tiny_dataset):
    tiny_dataset.training.epochs = 2
    tiny_dataset.checkpoint.keep_history = True
    tiny_dataset.checkpoint.save_history_every_epochs = 0
    tiny_dataset.checkpoint.save_history_every_steps = 4
    trainer = Trainer(tiny_dataset)
    trainer.fit()
    steps = [load_checkpoint(f)["global_step"] for f in trainer.checkpoints.history_files()]
    assert steps == list(range(4, trainer.global_step + 1, 4))


def test_no_history_unless_asked(tiny_dataset):
    trainer = Trainer(tiny_dataset)
    trainer.fit()
    assert trainer.checkpoints.history_files() == []


def test_resume_from_live_at_an_epoch_boundary_matches_one_run(tiny_dataset, tmp_path, monkeypatch):
    tiny_dataset.model.dropout = 0.2
    straight = Trainer(fresh(tiny_dataset, tmp_path / "straight"))
    straight.fit()

    cfg = fresh(tiny_dataset, tmp_path / "interrupted")
    first = Trainer(cfg)
    steps_per_epoch = first.steps_per_epoch
    crash_at(monkeypatch, 2 * steps_per_epoch + 1)
    with pytest.raises(Crash):
        first.fit()
    monkeypatch.undo()

    assert load_checkpoint(cfg.checkpoint_dir / "live.pt")["epoch"] == 2
    cfg.training.resume = "live"
    resumed = Trainer(cfg)
    assert resumed.start_epoch == 3
    resumed.fit()

    assert resumed.global_step == straight.global_step
    assert [r["train_loss"] for r in resumed.history] == [r["train_loss"] for r in straight.history]
    assert resumed.best_epoch == straight.best_epoch
    assert_same_weights(params(resumed.model), params(straight.model))


def test_resume_from_a_mid_epoch_live_matches_one_run(tiny_dataset, tmp_path, monkeypatch):
    tiny_dataset.model.dropout = 0.2
    tiny_dataset.checkpoint.save_live_every_epochs = 0
    tiny_dataset.checkpoint.save_live_every_steps = 4
    straight = Trainer(fresh(tiny_dataset, tmp_path / "straight"))
    straight.fit()

    cfg = fresh(tiny_dataset, tmp_path / "interrupted")
    first = Trainer(cfg)
    crash_step = first.steps_per_epoch + 3
    crash_at(monkeypatch, crash_step)
    with pytest.raises(Crash):
        first.fit()
    monkeypatch.undo()

    live = load_checkpoint(cfg.checkpoint_dir / "live.pt")
    assert live["global_step"] == ((crash_step - 1) // 4) * 4
    assert live["trainer_state"]["epoch_complete"] is False

    cfg.training.resume = "live"
    resumed = Trainer(cfg)
    resumed.fit()

    assert resumed.global_step == straight.global_step
    assert [r["train_loss"] for r in resumed.history] == [r["train_loss"] for r in straight.history]
    assert_same_weights(params(resumed.model), params(straight.model))


def test_resume_from_a_live_saved_on_the_last_batch_of_an_epoch(tiny_dataset, tmp_path, monkeypatch):
    tiny_dataset.model.dropout = 0.2
    probe = Trainer(fresh(tiny_dataset, tmp_path / "probe"))
    tiny_dataset.checkpoint.save_live_every_epochs = 0
    tiny_dataset.checkpoint.save_live_every_steps = probe.steps_per_epoch
    straight = Trainer(fresh(tiny_dataset, tmp_path / "straight"))
    straight.fit()

    cfg = fresh(tiny_dataset, tmp_path / "interrupted")
    first = Trainer(cfg)
    original = Trainer.evaluate

    def dying(self, split):
        if split == "val" and self.global_step == 2 * self.steps_per_epoch:
            raise Crash("power cut before validation")
        return original(self, split)

    monkeypatch.setattr(Trainer, "evaluate", dying)
    with pytest.raises(Crash):
        first.fit()
    monkeypatch.undo()

    live = load_checkpoint(cfg.checkpoint_dir / "live.pt")
    assert live["trainer_state"]["batch_in_epoch"] == first.steps_per_epoch
    assert live["trainer_state"]["epoch_complete"] is False

    cfg.training.resume = "live"
    resumed = Trainer(cfg)
    resumed.fit()
    assert [r["train_loss"] for r in resumed.history] == [r["train_loss"] for r in straight.history]
    assert_same_weights(params(resumed.model), params(straight.model))


def test_resume_without_live_explains_itself(tiny_dataset):
    tiny_dataset.training.resume = "live"
    with pytest.raises(NoResumableCheckpoint, match="There is no live checkpoint"):
        Trainer(tiny_dataset)


def test_resume_live_never_falls_back_to_best(tiny_dataset):
    Trainer(tiny_dataset).fit()
    (tiny_dataset.checkpoint_dir / "live.pt").unlink()
    assert (tiny_dataset.checkpoint_dir / "best.pt").exists()

    tiny_dataset.training.resume = "live"
    with pytest.raises(NoResumableCheckpoint):
        Trainer(tiny_dataset)


def test_a_best_file_in_the_live_slot_is_refused(tiny_dataset):
    Trainer(tiny_dataset).fit()
    d = tiny_dataset.checkpoint_dir
    shutil.copy(d / "best.pt", d / "live.pt")

    tiny_dataset.training.resume = "live"
    with pytest.raises(CheckpointError, match="is a best checkpoint, not live"):
        Trainer(tiny_dataset)


def test_resuming_a_finished_run_trains_nothing(tiny_dataset):
    trainer = Trainer(tiny_dataset)
    trainer.fit()
    tiny_dataset.training.resume = "live"
    again = Trainer(tiny_dataset)
    again.fit()
    assert again.global_step == trainer.global_step
    assert_same_weights(params(again.model), params(trainer.model))


def test_resume_can_extend_a_run(tiny_dataset):
    trainer = Trainer(tiny_dataset)
    trainer.fit()
    tiny_dataset.training.resume = "live"
    tiny_dataset.training.epochs += 2
    longer = Trainer(tiny_dataset)
    longer.fit()
    assert len(longer.history) == len(trainer.history) + 2
    assert longer.global_step == trainer.global_step + 2 * trainer.steps_per_epoch


def test_an_unknown_format_is_named(tiny_dataset, tmp_path):
    Trainer(tiny_dataset).fit()
    raw = torch.load(tiny_dataset.checkpoint_dir / "best.pt", weights_only=True)
    raw["format_version"] = 99
    torch.save(raw, tmp_path / "future.pt")

    with pytest.raises(CheckpointError) as err:
        load_checkpoint(tmp_path / "future.pt")
    assert "Checkpoint format: 99" in str(err.value)
    assert f"Expected format: {CHECKPOINT_FORMAT_VERSION}" in str(err.value)


def test_an_architecture_mismatch_is_named_before_pytorch_complains(tiny_dataset):
    Trainer(tiny_dataset).fit()
    other = copy.deepcopy(tiny_dataset)
    other.model.hidden_sizes = [16]
    other.run_name = "other"
    other.training.resume = str(tiny_dataset.checkpoint_dir / "best.pt")

    with pytest.raises(CheckpointError) as err:
        Trainer(other)
    assert "Model architecture mismatch" in str(err.value)
    assert "Checkpoint format: 2" in str(err.value)


def test_a_truncated_file_is_a_clear_error(tiny_dataset, tmp_path):
    Trainer(tiny_dataset).fit()
    data = (tiny_dataset.checkpoint_dir / "best.pt").read_bytes()
    (tmp_path / "cut.pt").write_bytes(data[: len(data) // 3])
    with pytest.raises(CheckpointError, match="not a readable checkpoint"):
        load_checkpoint(tmp_path / "cut.pt")


def test_a_positional_tuple_is_not_a_checkpoint(tmp_path):
    torch.save((torch.zeros(1), 3), tmp_path / "tuple.pt")
    with pytest.raises(CheckpointError, match="named keys"):
        load_checkpoint(tmp_path / "tuple.pt")


def test_format_1_checkpoints_still_load(tiny_dataset, tmp_path):
    trainer = Trainer(tiny_dataset)
    trainer.fit()
    v2 = torch.load(tiny_dataset.checkpoint_dir / "best.pt", weights_only=True)
    v1 = {
        "format_version": 1,
        "model_state": v2["model_state_dict"],
        "optimizer_state": v2["optimizer_state_dict"],
        "config": v2["config"],
        "epoch": v2["epoch"],
        "metrics": {"loss": 0.4, "bit_acc": 0.9},
        "torch_version": "2.11.0+cu128",
        "saved_at": "2026-09-22 15:58:30",
        "extra": {"model_description": {**v2["architecture"], "parameters": 1}},
    }
    torch.save(v1, tmp_path / "old.pt")

    payload = load_checkpoint(tmp_path / "old.pt")
    assert payload["format_version"] == 1 and payload["checkpoint_kind"] is None
    assert payload["model_state_dict"] is v1["model_state"] or payload["model_state_dict"].keys() == v1["model_state"].keys()
    assert payload["created_at"] == "2026-09-22 15:58:30"
    assert PromotionRule().value(payload["metrics"]) == 0.4

    predictor = load_predictor(tmp_path / "old.pt", device="cpu")
    assert predictor.predict(1, 2).expected == 3


def test_a_format_1_file_cannot_be_resumed_exactly(tiny_dataset, tmp_path):
    Trainer(tiny_dataset).fit()
    d = tiny_dataset.checkpoint_dir
    v2 = torch.load(d / "live.pt", weights_only=True)
    torch.save({"format_version": 1, "model_state": v2["model_state_dict"], "config": v2["config"],
                "epoch": 5, "metrics": {}}, d / "live.pt")
    tiny_dataset.training.resume = "live"
    with pytest.raises(NoResumableCheckpoint, match="warm-start"):
        Trainer(tiny_dataset)


def test_export_loads_for_inference(tiny_dataset):
    trainer = Trainer(tiny_dataset)
    trainer.fit()
    path = trainer.checkpoints.export_model()
    predictor = load_predictor(path, device="cpu")
    assert predictor.predict(2, 3).expected == 5
    assert path.stat().st_size < (tiny_dataset.checkpoint_dir / "best.pt").stat().st_size


def test_language_model_checkpoints_carry_the_tokenizer(tiny_corpus):
    tiny_corpus.training.epochs = 1
    trainer = Trainer(tiny_corpus)
    trainer.fit()
    for name in ("base.pt", "live.pt", "best.pt"):
        payload = load_checkpoint(tiny_corpus.checkpoint_dir / name)
        assert payload["tokenizer"]["itos"] == trainer.task.tokenizer.itos
        assert payload["task"] == "language_model"
        assert "val_bpc" in payload["metrics"] or name == "base.pt"


def test_train_flags_become_checkpoint_settings():
    from ored.training.trainer import checkpoint_overrides, main
    import argparse

    args = argparse.Namespace(resume_live=False, init_from="checkpoints/ored_v2/best.pt",
                              history_every=10, history_every_steps=None,
                              live_every_steps=500, upload=True)
    assert checkpoint_overrides(args) == [
        "training.resume=checkpoints/ored_v2/best.pt",
        "checkpoint.keep_history=true", "checkpoint.save_history_every_epochs=10",
        "checkpoint.save_live_every_steps=500", "checkpoint.upload=true",
    ]
    with pytest.raises(SystemExit):
        main(["--resume-live", "--init-from", "x.pt"])


def test_init_from_starts_a_new_run_from_another_checkpoint(tiny_dataset, tmp_path):
    donor = Trainer(fresh(tiny_dataset, tmp_path / "donor"))
    donor.fit()
    cfg = fresh(tiny_dataset, tmp_path / "new")
    cfg.training.resume = str(donor.checkpoints.path("best"))
    started = Trainer(cfg)
    assert_same_weights(params(started.model), load_checkpoint(donor.checkpoints.path("best"))["model_state_dict"])
    started.fit()
    base = load_checkpoint(cfg.checkpoint_dir / "base.pt")
    assert_same_weights(base["model_state_dict"], load_checkpoint(donor.checkpoints.path("best"))["model_state_dict"])
    assert started.history[0]["epoch"] == 1


def test_save_a_better_file_as_best_keeps_the_old_best_in_history(tiny_dataset, tmp_path):
    from ored.training.checkpoints import evaluate_file, place_checkpoint

    short = fresh(tiny_dataset, tmp_path / "short")
    short.training.epochs = 1
    Trainer(short).fit()
    long = fresh(tiny_dataset, tmp_path / "long")
    long.training.epochs = 20
    Trainer(long).fit()
    old_best = load_checkpoint(short.checkpoint_dir / "best.pt")

    path, message = place_checkpoint(short, long.checkpoint_dir / "best.pt", "best", device="cpu")

    assert path == short.checkpoint_dir / "best.pt" and "promoted" in message
    best = load_checkpoint(path)
    assert best["checkpoint_kind"] == "best"
    assert best["epoch"] == load_checkpoint(long.checkpoint_dir / "best.pt")["epoch"]
    assert best["metrics"]["val_loss"] == pytest.approx(evaluate_file(path, short, "cpu")["val_loss"])
    archived = list((short.checkpoint_dir / "history").glob("*.pt"))
    assert len(archived) == 1
    assert load_checkpoint(archived[0])["checkpoint_kind"] == "history"
    assert_same_weights(load_checkpoint(archived[0])["model_state_dict"], old_best["model_state_dict"])


def test_save_a_worse_file_as_best_changes_nothing(tiny_dataset, tmp_path):
    from ored.training.checkpoints import place_checkpoint

    tiny_dataset.training.epochs = 20
    Trainer(tiny_dataset).fit()
    before = (tiny_dataset.checkpoint_dir / "best.pt").read_bytes()

    path, message = place_checkpoint(tiny_dataset, tiny_dataset.checkpoint_dir / "base.pt", "best", device="cpu")

    assert path is None and "not promoted" in message
    assert (tiny_dataset.checkpoint_dir / "best.pt").read_bytes() == before
    assert not (tiny_dataset.checkpoint_dir / "history").exists()

    path, _ = place_checkpoint(tiny_dataset, tiny_dataset.checkpoint_dir / "base.pt", "best",
                               force=True, device="cpu")
    assert load_checkpoint(path)["epoch"] == 0


def test_save_as_history_and_live(tiny_dataset):
    from ored.training.checkpoints import place_checkpoint

    Trainer(tiny_dataset).fit()
    d = tiny_dataset.checkpoint_dir
    first, _ = place_checkpoint(tiny_dataset, d / "best.pt", "history")
    second, _ = place_checkpoint(tiny_dataset, d / "best.pt", "history")
    assert first != second and second.stem.endswith("-2")
    assert load_checkpoint(second)["checkpoint_kind"] == "history"

    live, message = place_checkpoint(tiny_dataset, d / "best.pt", "live")
    assert load_checkpoint(live)["checkpoint_kind"] == "live" and "previous live kept" in message

    with pytest.raises(CheckpointError, match="--init-from"):
        place_checkpoint(tiny_dataset, d / "base.pt", "live")


def test_merge_live_from_an_online_session(tiny_corpus, tmp_path, capsys):
    from ored.learning.checkpoint_cli import main as cli_main
    from ored.learning.online import OnlineLearner, OnlinePolicy

    tiny_corpus.training.epochs = 1
    Trainer(tiny_corpus).fit()
    best = tiny_corpus.checkpoint_dir / "best.pt"
    learner = OnlineLearner.from_checkpoint(best, device="cpu", live_dir=tmp_path / "live",
                                            policy=OnlinePolicy(learning_rate=1e-3, save_every=0))
    for _ in range(3):
        learner.learn("the small cat sees the red dog .")
    live = learner.save()

    import yaml
    config = tmp_path / "run.yaml"
    config.write_text(yaml.safe_dump(tiny_corpus.to_dict()))

    code = cli_main(["merge-live", "--config", str(config), "--live", str(live), "--device", "cpu"])
    out = capsys.readouterr().out
    assert ("promoted to best" in out) == (code == 0)
    assert "not promoted" in out or "BEST" in out
