from __future__ import annotations

import pytest
import torch

from ored.learning import CheckpointKind, InMemoryStore, StaleCheckpointError, StoreError
from ored.learning.checkpoint_cli import card, main as cli_main
from ored.learning.checkpoints import (
    CheckpointStore,
    NotBetterError,
    ObjectExistsError,
    delete_checkpoint,
    describe,
    digest,
    export_checkpoint,
    fetch,
    find_duplicates,
    object_path_for,
    orphans,
    promote_best,
    promote_existing_best,
    prune_history,
    publish,
    remove_duplicates,
    verify_checkpoint,
)
from ored.learning.records import Checkpoint
from ored.utils.checkpoint import CheckpointError, PromotionRule, load_checkpoint, save_checkpoint

LIVE, BEST, HISTORY, BASE, EXPORT = (
    CheckpointKind.LIVE, CheckpointKind.BEST, CheckpointKind.HISTORY,
    CheckpointKind.BASE, CheckpointKind.EXPORT,
)


class FakeBucket(CheckpointStore):

    def __init__(self, bucket="ored-checkpoints"):
        self.bucket = bucket
        self.objects = {}
        self.removed = []
        self.damage = None

    def upload(self, path, object_path, upsert=False):
        if object_path in self.objects and not upsert:
            raise ObjectExistsError(f"{object_path} exists")
        data = open(path, "rb").read()
        if self.damage == "corrupt":
            data = data[:-1] + bytes([data[-1] ^ 0xFF])
        elif self.damage == "truncate":
            data = data[: len(data) // 2]
        self.objects[object_path] = data
        return {"object_path": object_path, "size_bytes": len(data), "sha256": digest(path)}

    def download(self, object_path, path):
        if object_path not in self.objects:
            raise StoreError(f"GET {object_path} -> 404 not found")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(self.objects[object_path])
        return path

    def remove(self, object_path):
        self.removed.append(object_path)
        self.objects.pop(object_path, None)

    def stat(self, object_path):
        data = self.objects.get(object_path)
        return None if data is None else len(data)

    def list_objects(self, prefix=""):
        return {p: len(d) for p, d in self.objects.items() if p.startswith(prefix)}


def a_checkpoint(tmp_path, name="ckpt.pt", epoch=3, step=30, val_loss=0.25, kind="live", run="unit"):
    torch.manual_seed(epoch * 1000 + step)
    return save_checkpoint(
        path=tmp_path / name,
        model=torch.nn.Linear(4, 2),
        config={"run_name": run, "task": "unit"},
        epoch=epoch,
        metrics={"val_loss": val_loss, "train_loss": val_loss + 0.1},
        optimizer=None,
        kind=kind,
        global_step=step,
    )


@pytest.fixture()
def env():
    return InMemoryStore(), FakeBucket()


def test_needs_a_url_and_a_key():
    with pytest.raises(StoreError):
        CheckpointStore("", "")
    with pytest.raises(StoreError):
        CheckpointStore("https://example.supabase.co", "")


def test_object_paths_are_deterministic_and_readable():
    assert object_path_for(BASE, "ored_v2") == "ored_v2/base/base.pt"
    assert object_path_for(LIVE, "ored_v2", 30, 73710) == "ored_v2/live/epoch_0030_step_00073710.pt"
    assert object_path_for(BEST, "ored_v2", 20, 49140) == "ored_v2/best/epoch_0020_step_00049140.pt"
    assert object_path_for(HISTORY, "ored_v2", 10, 24570) == "ored_v2/history/epoch_0010_step_00024570.pt"
    assert object_path_for(EXPORT, "ored_v2", 20, 49140) == "ored_v2/export/epoch_0020_step_00049140.pt"


def test_object_path_is_safe():
    path = object_path_for(LIVE, "run name/../etc", 1, 2)
    assert ".." not in path
    assert path.count("/") == 2


def test_describe_reads_the_payload(tmp_path):
    meta = describe(a_checkpoint(tmp_path, epoch=7, step=70))
    assert meta["format_version"] == 2
    assert meta["kind"] == "live"
    assert meta["epoch"] == 7
    assert meta["global_step"] == 70
    assert meta["metrics"]["val_loss"] == pytest.approx(0.25)
    assert meta["torch_version"]


def test_publish_records_size_digest_and_verification(tmp_path, env):
    store, files = env
    path = a_checkpoint(tmp_path)

    record = publish(store, files, path, kind=LIVE, run_name="unit")

    assert record.object_path == "unit/live/epoch_0003_step_00000030.pt"
    assert record.object_path in files.objects
    assert record.size_bytes == path.stat().st_size
    assert record.sha256 == digest(path)
    assert record.global_step == 30
    assert record.is_current
    assert record.verified_at
    assert store.current_checkpoint("unit", LIVE) is record


def test_publishing_the_same_file_twice_is_a_no_op(tmp_path, env):
    store, files = env
    path = a_checkpoint(tmp_path)
    first = publish(store, files, path, kind=LIVE)
    second = publish(store, files, path, kind=LIVE)
    assert first is second
    assert len(store.checkpoints()) == 1


def test_a_checkpoint_must_name_its_object():
    with pytest.raises(StoreError):
        InMemoryStore().add_checkpoint(Checkpoint())


@pytest.mark.parametrize("damage", ["corrupt", "truncate"])
def test_a_damaged_upload_is_never_recorded(tmp_path, env, damage):
    store, files = env
    files.damage = damage

    with pytest.raises(StoreError, match="sha256|bytes"):
        publish(store, files, a_checkpoint(tmp_path), kind=LIVE)

    assert store.checkpoints() == []
    assert files.objects == {}, "the bad object must be taken back"


def test_a_damaged_best_does_not_replace_the_good_one(tmp_path, env):
    store, files = env
    good = publish(store, files, a_checkpoint(tmp_path, "a.pt", val_loss=0.5, kind="best"), kind=BEST)
    files.damage = "corrupt"
    with pytest.raises(StoreError):
        publish(store, files, a_checkpoint(tmp_path, "b.pt", epoch=4, val_loss=0.1, kind="best"), kind=BEST)
    assert store.current_checkpoint("unit", BEST) is good


def test_a_file_whose_role_differs_is_refused(tmp_path, env):
    store, files = env
    with pytest.raises(CheckpointError, match="is a live checkpoint, not best"):
        publish(store, files, a_checkpoint(tmp_path, kind="live"), kind=BEST)


def test_fetch_round_trips_the_bytes(tmp_path, env):
    store, files = env
    path = a_checkpoint(tmp_path)
    publish(store, files, path, kind=LIVE, run_name="unit")

    landed = tmp_path / "pulled" / "live.pt"
    record = fetch(store, files, landed, kind=LIVE, run_name="unit")

    assert record is not None
    assert digest(landed) == digest(path)
    assert load_checkpoint(landed)["epoch"] == 3


def test_fetch_is_none_when_nothing_is_stored(tmp_path):
    assert fetch(InMemoryStore(), FakeBucket(), tmp_path / "x.pt") is None


def test_fetch_refuses_a_corrupted_object(tmp_path, env):
    store, files = env
    record = publish(store, files, a_checkpoint(tmp_path), kind=LIVE)
    files.objects[record.object_path] = b"not the checkpoint you saved"

    with pytest.raises(StoreError, match="sha256"):
        fetch(store, files, tmp_path / "pulled.pt", kind=LIVE)
    assert not (tmp_path / "pulled.pt").exists()


def test_a_missing_storage_object_is_reported_clearly(tmp_path, env):
    store, files = env
    record = publish(store, files, a_checkpoint(tmp_path), kind=LIVE)
    del files.objects[record.object_path]

    with pytest.raises(StoreError, match="object could not be read"):
        fetch(store, files, tmp_path / "pulled.pt", kind=LIVE)

    report = verify_checkpoint(store, files, record)
    assert not report.ok and not report.exists
    assert "missing" in report.problems[0]


def test_verify_checks_size_hash_and_format(tmp_path, env):
    store, files = env
    record = publish(store, files, a_checkpoint(tmp_path), kind=LIVE, rehash=False)
    assert record.verified_at is None

    report = verify_checkpoint(store, files, record)
    assert report.ok
    assert store.checkpoint(record.id).verified_at

    data = files.objects[record.object_path]
    files.objects[record.object_path] = data[:-1] + bytes([data[-1] ^ 0xFF])
    report = verify_checkpoint(store, files, record)
    assert not report.ok and not report.sha_ok


def test_publishing_live_replaces_the_previous_one(tmp_path, env):
    store, files = env

    first = publish(store, files, a_checkpoint(tmp_path, "a.pt", step=10), kind=LIVE)
    second = publish(store, files, a_checkpoint(tmp_path, "b.pt", step=20), kind=LIVE)

    assert store.checkpoints(LIVE) == [second]
    assert first.object_path in files.removed
    assert first.object_path not in files.objects


def test_superseded_live_can_be_kept(tmp_path, env):
    store, files = env
    first = publish(store, files, a_checkpoint(tmp_path, "a.pt", step=10), kind=LIVE)
    second = publish(store, files, a_checkpoint(tmp_path, "b.pt", step=20), kind=LIVE,
                     prune_superseded=False)
    assert [c.is_current for c in store.checkpoints(LIVE)] == [False, True]
    assert store.current_checkpoint("unit", LIVE) is second
    assert first.object_path in files.objects


def test_each_run_has_its_own_live(tmp_path, env):
    store, files = env
    a = publish(store, files, a_checkpoint(tmp_path, "a.pt", run="run_a"), kind=LIVE)
    b = publish(store, files, a_checkpoint(tmp_path, "b.pt", run="run_b"), kind=LIVE)
    assert store.current_checkpoint("run_a", LIVE) is a
    assert store.current_checkpoint("run_b", LIVE) is b


def test_a_resaved_live_at_the_same_step_gets_its_own_name(tmp_path, env):
    store, files = env
    publish(store, files, a_checkpoint(tmp_path, "a.pt", step=10), kind=LIVE, prune_superseded=False)
    again = save_checkpoint(tmp_path / "b.pt", torch.nn.Linear(4, 2), {"run_name": "unit"}, 3,
                            {"val_loss": 0.3}, kind="live", global_step=10)
    record = publish(store, files, again, kind=LIVE, prune_superseded=False)
    assert record.object_path == "unit/live/epoch_0003_step_00000010-2.pt"


def test_runs_whose_names_share_a_folder_never_overwrite_each_other(tmp_path, env):
    store, files = env
    a = publish(store, files, a_checkpoint(tmp_path, "a.pt", run="a b"), kind=LIVE)
    b = publish(store, files, a_checkpoint(tmp_path, "b.pt", run="a-b"), kind=LIVE)
    assert a.object_path != b.object_path
    assert files.objects[a.object_path] == (tmp_path / "a.pt").read_bytes()


def test_best_is_promoted_only_when_better(tmp_path, env):
    store, files = env
    first = publish(store, files, a_checkpoint(tmp_path, "a.pt", 10, 100, 0.50, "best"), kind=BEST)
    assert first.is_current and first.promotion_metric == "val_loss" and first.promotion_mode == "min"

    with pytest.raises(NotBetterError, match="does not beat"):
        publish(store, files, a_checkpoint(tmp_path, "b.pt", 20, 200, 0.60, "best"), kind=BEST)
    assert store.current_checkpoint("unit", BEST) is first

    better = publish(store, files, a_checkpoint(tmp_path, "c.pt", 30, 300, 0.40, "best"), kind=BEST)
    assert store.current_checkpoint("unit", BEST) is better
    assert not store.checkpoint(first.id).is_current, "the old best is kept, but no longer current"


def test_force_promotes_a_worse_best(tmp_path, env):
    store, files = env
    publish(store, files, a_checkpoint(tmp_path, "a.pt", 10, 100, 0.50, "best"), kind=BEST)
    worse = publish(store, files, a_checkpoint(tmp_path, "b.pt", 20, 200, 0.60, "best"), kind=BEST, force=True)
    assert store.current_checkpoint("unit", BEST) is worse


def test_max_mode_prefers_higher(tmp_path, env):
    store, files = env
    rule = PromotionRule("val_loss", "max")
    publish(store, files, a_checkpoint(tmp_path, "a.pt", 10, 100, 0.50, "best"), kind=BEST, rule=rule)
    higher = publish(store, files, a_checkpoint(tmp_path, "b.pt", 20, 200, 0.60, "best"), kind=BEST, rule=rule)
    assert store.current_checkpoint("unit", BEST) is higher
    assert higher.promotion_mode == "max"


def test_promote_best_relabels_a_live_file(tmp_path, env):
    store, files = env
    record, message = promote_best(store, files, a_checkpoint(tmp_path, val_loss=0.3), "unit")
    assert record is not None and record.kind is BEST and "promoted" in message
    assert load_checkpoint(tmp_path / "ckpt.pt")["checkpoint_kind"] == "live", "the source file is untouched"

    worse, message = promote_best(store, files, a_checkpoint(tmp_path, "w.pt", 9, 90, 0.9), "unit")
    assert worse is None and "does not beat" in message


def test_promote_existing_history_row_to_best(tmp_path, env):
    store, files = env
    snap = publish(store, files, a_checkpoint(tmp_path, epoch=20, step=200, val_loss=0.2, kind="history"), kind=HISTORY)
    record, _ = promote_existing_best(store, files, snap.id)
    assert record.is_current and record.kind is BEST
    assert record.parent_checkpoint_id == snap.id
    assert record.epoch == 20 and record.global_step == 200


def test_rolling_back_to_an_older_best_needs_force(tmp_path, env):
    store, files = env
    old = publish(store, files, a_checkpoint(tmp_path, "a.pt", 10, 100, 0.50, "best"), kind=BEST)
    publish(store, files, a_checkpoint(tmp_path, "b.pt", 20, 200, 0.40, "best"), kind=BEST)

    record, message = promote_existing_best(store, files, old.id)
    assert record is None and "--force" in message

    record, _ = promote_existing_best(store, files, old.id, force=True)
    assert store.current_checkpoint("unit", BEST).id == old.id


def test_a_stale_comparison_cannot_promote(tmp_path, env):
    store, files = env
    publish(store, files, a_checkpoint(tmp_path, "a.pt", 10, 100, 0.5, "best"), kind=BEST)
    candidate = Checkpoint(kind=BEST, run_name="unit", object_path="unit/best/x.pt", sha256="a" * 64,
                           promotion_metric="val_loss", promotion_mode="min")
    with pytest.raises(StaleCheckpointError, match="it changed"):
        store.register_checkpoint(candidate, make_current=True, replaces=None)


def test_a_best_must_record_its_metric():
    with pytest.raises(StoreError, match="metric"):
        InMemoryStore().register_checkpoint(
            Checkpoint(kind=BEST, run_name="u", object_path="u/best/x.pt", sha256="a" * 64)
        )


def test_history_accumulates_and_is_never_current(tmp_path, env):
    store, files = env
    for epoch in (10, 20, 30):
        publish(store, files, a_checkpoint(tmp_path, f"h{epoch}.pt", epoch, epoch * 10, kind="history"), kind=HISTORY)
    history = store.checkpoints(HISTORY, run_name="unit")
    assert [h.epoch for h in history] == [10, 20, 30]
    assert not any(h.is_current for h in history)
    with pytest.raises(StoreError, match="cannot be promoted"):
        store.make_current(history[0].id)


def test_base_is_immutable(tmp_path, env):
    store, files = env
    publish(store, files, a_checkpoint(tmp_path, "a.pt", 0, 0, kind="base"), kind=BASE)
    with pytest.raises(StoreError, match="base is immutable"):
        publish(store, files, a_checkpoint(tmp_path, "b.pt", 0, 1, kind="base"), kind=BASE)


def test_export_is_derived_from_best_without_training_state(tmp_path, env):
    store, files = env
    best = publish(store, files, a_checkpoint(tmp_path, val_loss=0.2, kind="best"), kind=BEST)

    record = export_checkpoint(store, files, "unit", local_copy=tmp_path / "export.pt")

    assert record.kind is EXPORT and record.is_current
    assert record.parent_checkpoint_id == best.id
    payload = load_checkpoint(tmp_path / "export.pt")
    assert payload["checkpoint_kind"] == "export"
    assert payload["optimizer_state_dict"] is None and payload["rng_state"] is None


def _row(store, path, sha, kind=BEST, run="dup", created="2026-09-22T18:53:00Z", current=False):
    record = Checkpoint(kind=kind, run_name=run, object_path=path, sha256=sha, size_bytes=100,
                        created_at=created, promotion_metric="val_loss", promotion_mode="min")
    return store.register_checkpoint(record, make_current=current,
                                     replaces=None if not current else None)


def test_duplicates_are_reported_not_deleted(env):
    store, files = env
    sha = "1c" * 32
    first = _row(store, "best/cap50/a.pt", sha, created="2026-09-22T18:52:57Z", current=True)
    second = _row(store, "best/cap50/b.pt", sha, created="2026-09-22T18:55:27Z")
    files.objects.update({"best/cap50/a.pt": b"x" * 100, "best/cap50/b.pt": b"x" * 100})

    groups = find_duplicates(store)
    assert len(groups) == 1
    assert groups[0].canonical is first and groups[0].extras == [second]
    assert groups[0].reclaimable_bytes == 100

    planned = remove_duplicates(store, files)
    assert planned == [second]
    assert len(store.checkpoints()) == 2, "a dry run changes nothing"

    remove_duplicates(store, files, apply=True)
    assert store.checkpoints() == [first]
    assert "best/cap50/a.pt" in files.objects and "best/cap50/b.pt" not in files.objects


def test_the_earliest_copy_is_canonical_when_none_is_current(env):
    store, _ = env
    sha = "bc" * 32
    later = _row(store, "p/2.pt", sha, created="2026-09-22T18:55:35Z")
    earlier = _row(store, "p/1.pt", sha, created="2026-09-22T18:53:05Z")
    assert find_duplicates(store)[0].canonical is earlier
    assert find_duplicates(store)[0].extras == [later]


def test_a_current_checkpoint_needs_an_explicit_delete(tmp_path, env):
    store, files = env
    record = publish(store, files, a_checkpoint(tmp_path), kind=LIVE)
    with pytest.raises(StoreError, match="allow_current"):
        delete_checkpoint(store, files, record.id)
    delete_checkpoint(store, files, record.id, allow_current=True)
    assert store.checkpoints() == [] and files.objects == {}


def test_prune_history_keeps_the_newest_and_nothing_else_is_touched(tmp_path, env):
    store, files = env
    for epoch in (10, 20, 30, 40):
        publish(store, files, a_checkpoint(tmp_path, f"h{epoch}.pt", epoch, epoch, kind="history"), kind=HISTORY)
    best = publish(store, files, a_checkpoint(tmp_path, "b.pt", 20, 20, 0.1, "best"), kind=BEST)

    planned = prune_history(store, files, "unit", keep_last=2)
    assert [r.epoch for r in planned] == [10, 20]
    assert len(store.checkpoints(HISTORY)) == 4

    prune_history(store, files, "unit", keep_last=2, apply=True)
    assert [r.epoch for r in store.checkpoints(HISTORY)] == [30, 40]
    assert store.current_checkpoint("unit", BEST) is best


def test_orphans_lists_unrecorded_objects(tmp_path, env):
    store, files = env
    publish(store, files, a_checkpoint(tmp_path), kind=LIVE)
    files.objects["live/live/2dfc1480.pt"] = b"left over"
    assert orphans(store, files) == {"live/live/2dfc1480.pt": 9}


def test_dropping_an_unknown_checkpoint_is_an_error():
    with pytest.raises(StoreError):
        InMemoryStore().drop_checkpoint("nope")


def test_snapshot_carries_checkpoints(tmp_path, env):
    store, files = env
    publish(store, files, a_checkpoint(tmp_path), kind=LIVE)
    assert len(store.snapshot()["checkpoints"]) == 1


def test_the_card_answers_the_everyday_questions(tmp_path, env):
    store, files = env
    record = publish(store, files, a_checkpoint(tmp_path, epoch=50, step=123456, val_loss=0.40767, kind="best"), kind=BEST)
    text = card(record)
    for expected in ("Role:            BEST (current)", "Epoch:           50",
                     "Global step:     123,456", "Validation loss: 0.40767",
                     "Promoted by:     val_loss (lower is better)", f"SHA-256:         {record.sha256}",
                     "Format:          2", f"Storage path:    ored-checkpoints/{record.object_path}",
                     "Verified:        YES"):
        assert expected in text, expected


def test_cli_show_best_and_duplicates(tmp_path, env, monkeypatch, capsys):
    store, files = env
    monkeypatch.setattr("ored.learning.checkpoint_cli._connect", lambda: (store, files))
    publish(store, files, a_checkpoint(tmp_path, val_loss=0.3, kind="best"), kind=BEST)

    assert cli_main(["show-best", "--run", "unit"]) == 0
    assert "BEST (current)" in capsys.readouterr().out

    assert cli_main(["show-live", "--run", "unit"]) == 1
    assert "nothing to resume" in capsys.readouterr().out

    assert cli_main(["duplicates"]) == 0
    assert "No duplicate" in capsys.readouterr().out


def test_cli_verify_reads_a_local_file(tmp_path, capsys):
    path = a_checkpoint(tmp_path)
    assert cli_main(["verify", str(path)]) == 0
    out = capsys.readouterr().out
    assert "Role:            LIVE" in out and digest(path) in out and "Loads:           YES" in out
