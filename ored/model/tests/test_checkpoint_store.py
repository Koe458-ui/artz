from __future__ import annotations

import pytest
import torch

from ored.learning import CheckpointKind, InMemoryStore, StoreError
from ored.learning.checkpoints import (
    CheckpointStore,
    describe,
    digest,
    fetch,
    object_path_for,
    publish,
)
from ored.utils.checkpoint import save_checkpoint


class FakeBucket(CheckpointStore):

    def __init__(self, bucket="ored-checkpoints"):
        self.bucket = bucket
        self.objects = {}
        self.removed = []

    def upload(self, path, object_path):
        data = open(path, "rb").read()
        self.objects[object_path] = data
        return {"object_path": object_path, "size_bytes": len(data), "sha256": digest(path)}

    def download(self, object_path, path):
        if object_path not in self.objects:
            raise StoreError(f"no object {object_path}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(self.objects[object_path])
        return path

    def remove(self, object_path):
        self.removed.append(object_path)
        self.objects.pop(object_path, None)


def a_checkpoint(tmp_path, name="best.pt", epoch=3):
    model = torch.nn.Linear(4, 2)
    return save_checkpoint(
        path=tmp_path / name,
        model=model,
        config={"run_name": "unit"},
        epoch=epoch,
        metrics={"val_loss": 0.25},
    )


def test_needs_a_url_and_a_key():
    with pytest.raises(StoreError):
        CheckpointStore("", "")
    with pytest.raises(StoreError):
        CheckpointStore("https://example.supabase.co", "")


def test_object_path_is_namespaced_and_safe():
    path = object_path_for(CheckpointKind.LIVE, "run name/../etc", "abc123")
    assert path.startswith("live/")
    assert path.endswith("/abc123.pt")
    assert ".." not in path
    assert path.count("/") == 2


def test_describe_reads_the_payload(tmp_path):
    meta = describe(a_checkpoint(tmp_path, epoch=7))
    assert meta["format_version"] == 1
    assert meta["epoch"] == 7
    assert meta["metrics"]["val_loss"] == pytest.approx(0.25)
    assert meta["torch_version"]


def test_publish_records_size_and_digest(tmp_path):
    store, files = InMemoryStore(), FakeBucket()
    path = a_checkpoint(tmp_path)

    record = publish(store, files, path, kind=CheckpointKind.BEST, run_name="unit")

    assert record.object_path in files.objects
    assert record.size_bytes == path.stat().st_size
    assert record.sha256 == digest(path)
    assert record.bucket_id == "ored-checkpoints"
    assert store.checkpoints(CheckpointKind.BEST) == [record]


def test_a_checkpoint_must_name_its_object():
    from ored.learning.records import Checkpoint

    with pytest.raises(StoreError):
        InMemoryStore().add_checkpoint(Checkpoint())


def test_fetch_round_trips_the_bytes(tmp_path):
    store, files = InMemoryStore(), FakeBucket()
    path = a_checkpoint(tmp_path)
    publish(store, files, path, kind=CheckpointKind.BEST, run_name="unit")

    landed = tmp_path / "pulled" / "best.pt"
    record = fetch(store, files, landed, kind=CheckpointKind.BEST, run_name="unit")

    assert record is not None
    assert digest(landed) == digest(path)
    assert torch.load(landed, map_location="cpu", weights_only=True)["epoch"] == 3


def test_fetch_is_none_when_nothing_is_stored(tmp_path):
    assert fetch(InMemoryStore(), FakeBucket(), tmp_path / "x.pt") is None


def test_fetch_refuses_a_corrupted_object(tmp_path):
    store, files = InMemoryStore(), FakeBucket()
    record = publish(store, files, a_checkpoint(tmp_path), run_name="unit")
    files.objects[record.object_path] = b"not the checkpoint you saved"

    with pytest.raises(StoreError, match="sha256"):
        fetch(store, files, tmp_path / "pulled.pt", run_name="unit")


def test_publishing_live_replaces_the_previous_one(tmp_path):
    store, files = InMemoryStore(), FakeBucket()

    first = publish(store, files, a_checkpoint(tmp_path, "a.pt"), kind=CheckpointKind.LIVE)
    second = publish(store, files, a_checkpoint(tmp_path, "b.pt"), kind=CheckpointKind.LIVE)

    assert store.checkpoints(CheckpointKind.LIVE) == [second]
    assert first.object_path in files.removed
    assert first.object_path not in files.objects


def test_best_checkpoints_accumulate(tmp_path):
    store, files = InMemoryStore(), FakeBucket()
    publish(store, files, a_checkpoint(tmp_path, "a.pt"), kind=CheckpointKind.BEST)
    publish(store, files, a_checkpoint(tmp_path, "b.pt"), kind=CheckpointKind.BEST)

    assert len(store.checkpoints(CheckpointKind.BEST)) == 2
    assert files.removed == []


def test_dropping_an_unknown_checkpoint_is_an_error():
    with pytest.raises(StoreError):
        InMemoryStore().drop_checkpoint("nope")


def test_snapshot_carries_checkpoints(tmp_path):
    store, files = InMemoryStore(), FakeBucket()
    publish(store, files, a_checkpoint(tmp_path), run_name="unit")
    assert len(store.snapshot()["checkpoints"]) == 1
