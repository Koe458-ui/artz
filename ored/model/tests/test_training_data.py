from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import torch

from ored.config import load_config
from ored.data.snapshot import (
    SnapshotError,
    build_snapshot,
    download_snapshot,
    iter_records,
    load_snapshot,
    prepare_dataset,
    split_overlap,
    upload_snapshot,
)
from ored.data.text_dataset import build_text_datasets
from ored.data.training_data import (
    CATEGORIES,
    TYPES,
    Selection,
    check_record,
    fingerprint,
    fingerprint_of,
    format_record,
    normalise_fields,
)
from ored.learning import InMemoryStore
from ored.learning.records import CheckpointKind, SessionStatus, TrainingData, VersionStatus
from ored.learning.store import DuplicateTrainingDataError, StoreError
from ored.learning.training_data_cli import main as data_cli
from ored.training import dataset_run
from ored.training.trainer import main as train_main, train
from ored.utils.checkpoint import load_checkpoint
from test_checkpoint_store import FakeBucket
from test_inference import trained_lm_checkpoint

MIGRATION = (Path(__file__).resolve().parents[2] / "supabase" / "migrations"
             / "20260926120000_ored_training_data.sql")
CONFIG = Path(__file__).resolve().parent.parent / "configs" / "char_transformer.yaml"


def row(type, category, input, output, subject=None, topic=None, **extra):
    return TrainingData(type=type, category=category, subject=subject, topic=topic,
                        input=input, output=output, verified=extra.pop("verified", True), **extra)


def synthetic_rows():
    rows = []
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXY"
    for i, letter in enumerate(letters[:12]):
        rows.append(row("fact", "language_foundation", f"What letter comes after {letter}?",
                        f"The letter after {letter} is {letters[i + 1]}.", "alphabet"))
    for word, meaning in [("apple", "A round fruit."), ("river", "A large stream of water."),
                          ("book", "Pages bound together to be read."), ("chair", "A seat for one person."),
                          ("cloud", "Water drops floating in the sky."), ("bread", "A food baked from flour."),
                          ("clock", "A machine that shows the time."), ("bridge", "A way across a river.")]:
        rows.append(row("vocabulary", "language_foundation", word, meaning, "vocabulary"))
    for start, end in [("The cat", "sleeps on the mat."), ("The sun", "rises in the east."),
                       ("Birds", "fly in the sky."), ("Water", "boils at one hundred degrees."),
                       ("My friend", "reads a book every night."), ("The train", "leaves at nine.")]:
        rows.append(row("sentence", "sentences", f"Complete: {start}", f"{start} {end}", "sentence_completion"))
    for q, a in [("What is water?", "Water is H2O."), ("What is the capital of France?", "Paris."),
                 ("How many days are in a week?", "Seven."), ("What colour is the sky?", "Blue."),
                 ("What do bees make?", "Honey."), ("Which ocean is the largest?", "The Pacific Ocean.")]:
        rows.append(row("fact", "general_knowledge", q, a, "everyday_facts"))
    for q, a, topic in [("What is force?", "Force is a push or pull that can change the motion of an object.", "mechanics"),
                        ("What is velocity?", "Velocity is speed in a given direction.", "kinematics"),
                        ("What is energy?", "Energy is the ability to do work.", "energy"),
                        ("What is mass?", "Mass is the amount of matter in an object.", "mechanics"),
                        ("What is a wave?", "A wave carries energy from place to place.", "waves")]:
        rows.append(row("qna", "science", q, a, "physics", topic, difficulty="beginner"))
    for a in range(4):
        for b in range(3):
            rows.append(row("math", "mathematics", f"{a} + {b} = ?", f"{a + b}", "addition",
                            metadata={"group": f"add:{min(a, b)}+{max(a, b)}"}))
    for said, reply in [("Hello.", "Hello! How are you?"), ("Thank you.", "You are welcome."),
                        ("Good morning.", "Good morning to you too."), ("Who are you?", "I am Ored."),
                        ("Sorry, I am late.", "That is all right.")]:
        rows.append(row("conversation", "conversation", said, reply, "greetings"))
    return rows


@pytest.fixture()
def store():
    s = InMemoryStore()
    s.add_training_data(synthetic_rows())
    return s


@pytest.fixture()
def cfg(tmp_path):
    cfg = load_config(CONFIG, overrides=[
        "training.epochs=2", "training.log_every=100", "training.early_stopping_patience=0",
        "training.device=cpu", "data.block_size=32", "data.stride=16", "data.batch_size=8",
        "model.d_model=32", "model.n_layer=2", "model.n_head=2", "model.d_ff=64", "model.dropout=0.0",
        "data.source=supabase", "data.supabase.dataset_tag=all",
    ])
    cfg.data.supabase.snapshot_dir = str(tmp_path / "snapshots")
    cfg.paths.checkpoint_dir = str(tmp_path / "checkpoints")
    cfg.run_name = "pytest_manual"
    return cfg


def test_python_and_sql_fingerprints_agree():
    assert fingerprint_of("qna", "science", "physics", "mechanics", "What is force?",
                          "Force is a push or pull that can change the motion of an object.", "en") == \
        "b12318e879961de0c32c3af54784d09237d72a0ea817299433720c765bedb13b"
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "b12318e879961de0c32c3af54784d09237d72a0ea817299433720c765bedb13b" in \
        (MIGRATION.parents[1] / "tests" / "training_data_invariants.sql").read_text(encoding="utf-8")
    types = re.search(r"ored_training_data_type_check check \(type in \((.*?)\)\)", sql, re.S).group(1)
    categories = re.search(r"ored_training_data_category_check check \(category in \((.*?)\)\)", sql, re.S).group(1)
    assert re.findall(r"'([a-z_]+)'", types) == list(TYPES)
    assert re.findall(r"'([a-z_]+)'", categories) == list(CATEGORIES)


def test_slugs_match_the_sql_function():
    from ored.data.training_data import slug

    assert slug(" Vocabulary\x0b") == "vocabulary"
    assert slug("Acids / Bases") == "acids_bases"
    assert slug("Active-Passive  Voice") == "active_passive_voice"
    assert slug("   ") is None
    sql = (MIGRATION.parents[1] / "tests" / "training_data_invariants.sql").read_text(encoding="utf-8")
    assert "ored_training_data_slug('Acids / Bases') <> 'acids_bases'" in sql


def test_fingerprint_ignores_whitespace_and_case_of_keys_only():
    base = normalise_fields(row("qna", "science", "What is force?", "A push.", "physics"))
    spaced = normalise_fields(row(" QnA ", "Science", "  What   is\nforce? ", "A push.", "Physics"))
    other_case = normalise_fields(row("qna", "science", "what is force?", "A push.", "physics"))
    assert spaced.type == "qna" and spaced.category == "science" and spaced.subject == "physics"
    assert base.fingerprint == spaced.fingerprint
    assert base.fingerprint != other_case.fingerprint


def test_validator_rejects_bad_rows():
    good = normalise_fields(row("qna", "science", "What is force?", "A push."))
    assert check_record(good).ok
    cases = {
        "input is empty": row("qna", "science", "   ", "x"),
        "type 'poem'": row("poem", "science", "a", "b"),
        "category 'astrology'": row("qna", "astrology", "a", "b"),
        "control character": row("qna", "science", "a\x01", "b"),
        "U+FFFD": row("qna", "science", "caf�", "b"),
        "language": row("qna", "science", "a", "b", language="English"),
        "limit is": row("qna", "science", "a" * 10001, "b"),
    }
    for fragment, record in cases.items():
        normalise_fields(record)
        check = check_record(record)
        assert not check.ok and any(fragment in e for e in check.errors), (fragment, check.errors)
    tampered = normalise_fields(row("qna", "science", "What is force?", "A push."))
    tampered.output = "A pull."
    assert any("does not match" in e for e in check_record(tampered).errors)


def test_text_formats_are_central_and_stable():
    assert format_record(row("vocabulary", "language_foundation", "apple", "A fruit.")) == \
        "Word: apple\nMeaning: A fruit."
    assert format_record(row("fact", "general_knowledge", "What is water?", "Water is H2O.")) == \
        "Question: What is water?\nAnswer: Water is H2O."
    assert format_record(row("conversation", "conversation", "Hello.", "Hello! How are you?")) == \
        "User: Hello.\nAssistant: Hello! How are you?"
    assert format_record(row("qna", "science", "a\r\n\r\n\r\n\r\nb  ", "c")) == "Question: a\n\nb\nAnswer: c"


def test_duplicates_are_refused_not_merged(store):
    before = store.count_training_data()
    with pytest.raises(DuplicateTrainingDataError) as err:
        store.add_training_data([row("qna", "science", "What   is force?",
                                     "Force is a push or pull that can change the motion of an object.",
                                     "physics", "mechanics")])
    assert "already exist" in str(err.value) and err.value.existing
    assert store.count_training_data() == before
    record = store.training_data(Selection(subjects=["physics"], mode="everything"))[0]
    other = store.training_data(Selection(subjects=["physics"], mode="everything"))[1]
    with pytest.raises(DuplicateTrainingDataError):
        store.update_training_data(other.id, input=record.input, output=record.output, topic=record.topic)


def test_selection_excludes_disabled_and_unverified(store):
    total = store.count_training_data(Selection(mode="everything"))
    [waiting] = store.add_training_data([row("qna", "science", "What is heat?", "Energy that moves.",
                                             "physics", verified=False)])
    [off] = store.add_training_data([row("qna", "science", "What is light?", "A wave.", "physics",
                                         enabled=False)])
    default = {r.id for r in store.training_data(Selection())}
    assert waiting.id not in default and off.id not in default and len(default) == total
    wider = {r.id for r in store.training_data(Selection(mode="unverified_too"))}
    assert waiting.id in wider and off.id not in wider
    assert Selection().describe() == "enabled = true AND verified = true AND any dataset_tag"


def test_snapshot_is_deterministic_and_leak_free(store, cfg, tmp_path):
    first = build_snapshot(store, cfg, page_size=7)
    cfg.data.supabase.snapshot_dir = str(tmp_path / "again")
    second = build_snapshot(store, cfg, page_size=1000)
    assert first.sha256 == second.sha256
    for name in ("train.txt", "val.txt", "test.txt", "records.jsonl"):
        assert (first.directory / name).read_bytes() == (second.directory / name).read_bytes()
    counts = first.split_counts
    assert sum(counts.values()) == first.record_count == len(synthetic_rows())
    assert all(counts[s] > 0 for s in ("train", "val", "test"))
    assert all(v == 0 for v in split_overlap(first).values())
    by_group = {}
    for r in iter_records(first):
        by_group.setdefault(r["group"], set()).add(r["split"])
    assert all(len(splits) == 1 for splits in by_group.values())
    train = (first.directory / "train.txt").read_text(encoding="utf-8")
    for r in iter_records(first):
        if r["split"] != "train":
            assert f"{r['input']}\n" not in train


def test_new_rows_do_not_move_old_rows_between_splits(store, cfg):
    before = {r["id"]: r["split"] for r in iter_records(build_snapshot(store, cfg))}
    store.add_training_data([row("qna", "science", f"Question {i}?", f"Answer {i}.") for i in range(20)])
    after_snapshot = build_snapshot(store, cfg)
    after = {r["id"]: r["split"] for r in iter_records(after_snapshot)}
    assert after_snapshot.record_count == len(before) + 20
    assert all(after[i] == split for i, split in before.items())


def test_bad_rows_stop_the_snapshot_unless_skipped(store, cfg):
    record = store.training_data(Selection())[0]
    store._training_data[record.id].output = "changed behind the fingerprint's back"
    with pytest.raises(SnapshotError, match="invalid"):
        build_snapshot(store, cfg)
    cfg.data.supabase.on_invalid = "skip"
    snapshot = build_snapshot(store, cfg)
    assert [s["id"] for s in snapshot.manifest["skipped"]] == [record.id]
    assert snapshot.record_count == len(synthetic_rows()) - 1


def test_empty_selection_and_empty_split_explain_themselves(cfg):
    store = InMemoryStore()
    store.add_training_data([row("qna", "science", "What is heat?", "Energy.", verified=False)])
    with pytest.raises(SnapshotError, match="enabled but not verified"):
        build_snapshot(store, cfg)
    store.update_training_data(store.training_data()[0].id, verified=True)
    with pytest.raises(SnapshotError, match="split got no records"):
        build_snapshot(store, cfg)


def test_snapshot_tampering_is_detected(store, cfg):
    snapshot = build_snapshot(store, cfg)
    cfg.data.supabase.snapshot = snapshot.sha256
    load_snapshot(cfg)
    (snapshot.directory / "val.txt").write_text("tampered", encoding="utf-8")
    with pytest.raises(SnapshotError, match="damaged"):
        load_snapshot(cfg)


def test_snapshot_round_trips_through_storage(store, cfg, tmp_path):
    bucket = FakeBucket("ored-datasets")
    snapshot = build_snapshot(store, cfg)
    prefix = upload_snapshot(bucket, snapshot, workdir=tmp_path / "up")
    assert prefix == f"all/{snapshot.sha256}" and f"{prefix}/manifest.json" in bucket.objects
    landed = download_snapshot(bucket, "all", snapshot.sha256, tmp_path / "elsewhere")
    assert landed.sha256 == snapshot.sha256
    assert (landed.directory / "train.txt").read_bytes() == (snapshot.directory / "train.txt").read_bytes()


def test_character_model_loads_the_snapshot(store, cfg):
    prepared = prepare_dataset(cfg, store)
    assert cfg.data.supabase.snapshot == prepared.snapshot.sha256
    datasets, tokenizer = build_text_datasets(cfg)
    assert tokenizer.name == "char"
    assert len(tokenizer.itos) == prepared.snapshot.manifest["tokenizer"]["vocab_size"]
    train_text = (prepared.snapshot.directory / "train.txt").read_text(encoding="utf-8")
    assert set(tokenizer.itos[1:]) == set(train_text)
    assert all(len(datasets[s]) > 0 for s in ("train", "val", "test"))
    again = prepare_dataset(cfg, store)
    assert again.dataset.id == prepared.dataset.id and again.dataset.version == 1


def test_register_versions_by_content(store, cfg):
    first = prepare_dataset(cfg, store).dataset
    cfg.data.supabase.snapshot = ""
    store.add_training_data([row("qna", "science", "What is heat?", "Energy that moves.")])
    second = prepare_dataset(cfg, store).dataset
    assert (first.name, first.version, second.version) == ("all", 1, 2)
    assert first.sha256 != second.sha256 and second.record_count == first.record_count + 1
    assert second.selection["rule"].startswith("enabled = true AND verified = true")


@pytest.fixture()
def remote(store, monkeypatch):
    checkpoints, datasets = FakeBucket(), FakeBucket("ored-datasets")
    monkeypatch.setattr(dataset_run, "supabase_from_env", lambda required: (store, datasets))
    monkeypatch.setattr("ored.training.checkpoints.CheckpointManager.for_training",
                        classmethod(lambda cls, cfg: cls(cfg, remote=(store, checkpoints) if cfg.checkpoint.upload else None)))
    return store, checkpoints, datasets


def test_training_end_to_end_records_the_dataset(remote, cfg):
    store, checkpoints, datasets = remote
    cfg.checkpoint.upload = True
    result = train(cfg)

    [session] = store.sessions()
    assert session.status is SessionStatus.EVALUATED and session.id == result["session_id"]
    [dataset] = store.datasets("all")
    assert session.dataset_id == dataset.id and session.example_count == dataset.record_count
    assert session.config["dataset"]["snapshot_sha256"] == dataset.sha256
    assert session.config["data"]["supabase"]["snapshot"] == dataset.sha256
    assert dataset.storage_path == f"all/{dataset.sha256}"
    assert any(p.startswith(dataset.storage_path) for p in datasets.objects)

    rows = store.checkpoints(run_name=cfg.run_name)
    kinds = {c.kind for c in rows}
    assert {CheckpointKind.BASE, CheckpointKind.BEST, CheckpointKind.LIVE} <= kinds
    assert all(c.session_id == session.id for c in rows)
    assert store.current_checkpoint(cfg.run_name, CheckpointKind.BEST) is not None

    for name in ("best.pt", "live.pt"):
        payload = load_checkpoint(Path(cfg.checkpoint_dir) / name)
        link = payload["extra"]["dataset"]
        assert link["snapshot_sha256"] == dataset.sha256 and link["dataset_id"] == dataset.id
        assert link["session_id"] == session.id and link["records"] == dataset.record_count
        assert link["selection"]["verified_only"] is True
        assert payload["config"]["data"]["source"] == "supabase"

    [version] = store.versions()
    assert version.status is VersionStatus.CANDIDATE and version.session_id == session.id
    assert result["model_version"] == version.version


def test_resume_live_stays_on_the_same_snapshot(remote, cfg):
    store, _, _ = remote
    train(cfg)
    first = cfg.data.supabase.snapshot
    store.add_training_data([row("qna", "science", "What is heat?", "Energy that moves.")])
    resumed = load_config(CONFIG, overrides=["training.resume=live", "training.epochs=3",
                                             "training.device=cpu", "data.block_size=32", "data.stride=16",
                                             "data.batch_size=8", "model.d_model=32", "model.n_layer=2",
                                             "model.n_head=2", "model.d_ff=64", "model.dropout=0.0",
                                             "data.source=supabase", "data.supabase.dataset_tag=all"])
    resumed.data.supabase.snapshot_dir = cfg.data.supabase.snapshot_dir
    resumed.paths.checkpoint_dir = cfg.paths.checkpoint_dir
    resumed.run_name = cfg.run_name
    result = train(resumed)
    assert resumed.data.supabase.snapshot == first
    assert [r["epoch"] for r in result["history"]] == [1, 2, 3]
    assert result["dataset"]["records"] == len(synthetic_rows())
    assert [s.status for s in store.sessions()] == [SessionStatus.EVALUATED, SessionStatus.EVALUATED]


def test_a_failed_run_marks_its_session_failed(remote, cfg, monkeypatch):
    store, _, _ = remote

    def explode(self):
        raise RuntimeError("the GPU caught fire")

    monkeypatch.setattr("ored.training.trainer.Trainer.fit", explode)
    with pytest.raises(RuntimeError):
        train(cfg)
    [session] = store.sessions()
    assert session.status is SessionStatus.FAILED and "GPU caught fire" in session.error


def test_train_command_line_selects_supabase(remote, cfg, monkeypatch, tmp_path):
    seen = {}
    monkeypatch.setattr("ored.training.trainer.train", lambda c: seen.setdefault("cfg", c))
    train_main(["--config", str(CONFIG), "--supabase-dataset", "physics_v1", "--subject", "physics",
                "--include-unverified", "--split-seed", "7", "--epochs", "3", "--batch-size", "4"])
    c = seen["cfg"]
    assert c.data.source == "supabase" and c.data.supabase.dataset_tag == "physics_v1"
    assert c.data.supabase.subjects == ["physics"] and c.data.supabase.include_unverified
    assert c.data.supabase.split_seed == 7 and c.training.epochs == 3 and c.data.batch_size == 4
    assert c.run_name == "char_transformer-physics_v1"
    seen.clear()
    train_main(["--config", str(CONFIG)])
    assert seen["cfg"].data.source == "generated" and seen["cfg"].run_name == "char_transformer"
    seen.clear()
    train_main(["--config", str(CONFIG), "--supabase-dataset"])
    assert seen["cfg"].data.supabase.dataset_tag == "all"


def test_training_data_commands(remote, cfg, tmp_path, caplog):
    store, _, _ = remote
    caplog.set_level("INFO")
    assert data_cli(["add", "--type", "qna", "--category", "science", "--subject", "physics",
                     "--topic", "optics", "--input", "What is a lens?", "--output", "Curved glass."],
                    store=store) == 0
    assert data_cli(["add", "--type", "qna", "--category", "science", "--subject", "physics",
                     "--topic", "optics", "--input", "What  is a lens?", "--output", "Curved glass."],
                    store=store) == 2
    assert "DUPLICATE" in caplog.text
    lines = tmp_path / "rows.jsonl"
    lines.write_text("\n".join(json.dumps(r) for r in [
        {"type": "definition", "category": "science", "subject": "chemistry", "input": "atom",
         "output": "The smallest unit of an element.", "verified": True},
        {"type": "qna", "category": "science", "subject": "physics", "topic": "optics",
         "input": "What is a lens?", "output": "Curved glass."},
    ]), encoding="utf-8")
    assert data_cli(["import", str(lines)], store=store) == 2
    assert data_cli(["import", str(lines), "--skip-duplicates"], store=store) == 0
    assert data_cli(["stats"], store=store) == 0 and "trainable" in caplog.text
    assert data_cli(["validate"], store=store) == 0
    assert data_cli(["snapshot", "--dataset-tag", "all", "--config", str(CONFIG),
                     "--set", f"data.supabase.snapshot_dir={cfg.data.supabase.snapshot_dir}"], store=store) == 0
    assert "leakage       : none" in caplog.text


def test_lineage_answers_which_data_produced_a_checkpoint(remote, cfg, caplog):
    store, _, _ = remote
    cfg.checkpoint.upload = True
    train(cfg)
    caplog.set_level("INFO")
    caplog.clear()
    assert data_cli(["lineage", str(Path(cfg.checkpoint_dir) / "best.pt")], store=store) == 0
    [dataset] = store.datasets("all")
    assert dataset.sha256 in caplog.text and "v1" in caplog.text and "verified = true" in caplog.text


def test_generated_corpus_is_unchanged(tiny_corpus, caplog):
    assert tiny_corpus.data.source == "generated"
    caplog.set_level("INFO")
    result = train(tiny_corpus)
    payload = load_checkpoint(Path(tiny_corpus.checkpoint_dir) / "best.pt")
    assert "dataset" not in (payload.get("extra") or {})
    assert result["history"] and "corpus     : generated" in caplog.text
    assert dataset_run.lineage_of_payload(payload)["source"] == "generated"


def test_distributed_needs_a_pinned_snapshot(cfg):
    from ored.distributed.cli import ensure_data
    from ored.distributed.env import DistributedError

    class Env:
        local_rank = 0
        is_coordinator = True

        def barrier(self):
            pass

    with pytest.raises(DistributedError, match="pinned snapshot"):
        ensure_data(cfg, Env())


def test_supabase_source_needs_a_tag_and_the_language_model():
    with pytest.raises(ValueError, match="dataset_tag"):
        load_config(CONFIG, overrides=["data.source=supabase"])
    with pytest.raises(ValueError, match="language_model"):
        load_config(CONFIG.parent / "bit_adder_mlp.yaml",
                    overrides=["data.source=supabase", "data.supabase.dataset_tag=all"])
    with pytest.raises(StoreError):
        InMemoryStore().update_training_data("nope", verified=True)


def test_payload_dataset_survives_a_torch_round_trip(tmp_path):
    from ored.utils.checkpoint import save_checkpoint

    path = save_checkpoint(tmp_path / "x.pt", torch.nn.Linear(2, 2), {"run_name": "r"}, epoch=1,
                           extra={"dataset": {"snapshot_sha256": "ab" * 32, "records": 3}})
    assert load_checkpoint(path)["extra"]["dataset"]["records"] == 3


def test_ask_uses_the_same_text_form_as_training(trained_lm_checkpoint, caplog):
    from ored.data.training_data import prompt_for
    from ored.inference.predictor import main as infer_main

    record = row("qna", "science", "What is force?", "A push or a pull.")
    assert format_record(record) == prompt_for("What is force?") + "A push or a pull."
    assert prompt_for("apple", "vocabulary") == "Word: apple\nMeaning: "
    caplog.set_level("INFO")
    assert infer_main(["--checkpoint", str(trained_lm_checkpoint), "--ask", "What is force?",
                       "--ask", "What is mass?", "--quiet"]) == 0
    assert "Question: What is force?\nAnswer: " in caplog.text and "Question: What is mass?" in caplog.text
