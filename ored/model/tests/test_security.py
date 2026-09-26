from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest
import torch

from ored.config import load_config
from ored.data.snapshot import SnapshotError, build_snapshot, download_snapshot, load_snapshot
from ored.data.training_data import Selection
from ored.distributed.checkpoint import safe_file_name
from ored.learning import InMemoryStore
from ored.learning.candidates import redact
from ored.learning.online import OnlineLearner, OnlinePolicy, OnlineResult
from ored.learning.supabase_store import SupabaseStore
from ored.serving.server import InsecureServerError, OredHandler, check_exposure
from ored.training.trainer import main as train_main
from test_checkpoint_store import FakeBucket
from test_online import learner
from test_training_data import CONFIG, cfg, row, store, synthetic_rows

KEY = "unit-test-key-not-a-real-secret"


class EchoLearner:

    version = "test"

    class stats:
        @staticmethod
        def as_dict():
            return {"seen": 0}

    def respond(self, message):
        return "echo", OnlineResult(False, "learning is off")


@pytest.fixture()
def server():
    OredHandler.learner = EchoLearner()
    OredHandler.api_key = KEY
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), OredHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()
    OredHandler.learner = None
    OredHandler.api_key = ""


def request(url, body=b'{"message": "hello"}', token=None, method="POST", headers=None):
    req = urllib.request.Request(url, data=body if method == "POST" else None, method=method,
                                 headers={"content-type": "application/json", **(headers or {})})
    if token is not None:
        req.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.status, json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or b"{}")


def test_model_server_requires_the_key(server):
    assert request(server)[0] == 401
    assert request(server, token="wrong")[0] == 401
    assert request(server, token=KEY[:-1])[0] == 401
    assert request(server, token=KEY + "x")[0] == 401
    status, body = request(server, token=KEY)
    assert status == 200 and body["reply"] == "echo"


def test_model_server_rejects_bad_bodies(server):
    assert request(server, body=b"{not json", token=KEY)[0] == 400
    assert request(server, body=b'{"message": ""}', token=KEY)[0] == 400
    assert request(server, body=b"x" * (64 * 1024 + 1), token=KEY)[0] == 400
    status, body = request(server + "/health", method="GET")
    assert status == 200 and set(body) == {"ok", "online"}
    assert request(server + "/../../etc/passwd", method="GET")[0] == 404


def test_model_server_refuses_to_run_open_to_the_network():
    with pytest.raises(InsecureServerError):
        check_exposure("0.0.0.0", "", allow_no_key=False)
    with pytest.raises(InsecureServerError):
        check_exposure("192.168.1.10", "", allow_no_key=False)
    check_exposure("0.0.0.0", KEY, allow_no_key=False)
    check_exposure("127.0.0.1", "", allow_no_key=False)
    check_exposure("localhost", "", allow_no_key=False)
    check_exposure("0.0.0.0", "", allow_no_key=True)


def test_online_learning_never_sees_credentials(learner, monkeypatch):
    seen = []
    monkeypatch.setattr(learner, "_step", lambda ids: seen.append(learner.tokenizer.decode(ids)) or 1.0)
    secret = "sb_secret_" + "A" * 30
    learner.policy.min_known_ratio = 0.0
    learner.learn(f"the cat sees {secret} and mail bob@example.com please")
    assert seen and all(secret not in s and "bob@example.com" not in s for s in seen)
    assert redact(secret)[1]


def test_no_learning_really_means_no_learning(learner):
    learner.policy.enabled = False
    before = [p.detach().clone() for p in learner.model.parameters()]
    result = learner.learn("the small cat sees the red dog .")
    assert not result.learned and result.reason == "learning is off"
    assert all(torch.equal(b, a) for b, a in zip(before, learner.model.parameters()))


def test_serve_no_learning_flag_turns_learning_off(monkeypatch):
    from ored.serving import server as serving

    captured = {}

    def fake_build_server(**kwargs):
        captured.update(kwargs)
        raise SystemExit(0)

    monkeypatch.setattr(serving, "build_server", fake_build_server)
    monkeypatch.setenv("ORED_API_KEY", KEY)
    with pytest.raises(SystemExit):
        serving.main(["--no-learning"])
    assert captured["policy"].enabled is False
    monkeypatch.delenv("ORED_API_KEY")
    assert serving.main(["--host", "0.0.0.0"]) == 2


def test_downloaded_snapshot_cannot_name_files_outside_its_folder(store, cfg, tmp_path):
    snapshot = build_snapshot(store, cfg)
    bucket = FakeBucket("ored-datasets")
    manifest = dict(snapshot.manifest)
    manifest["files"] = {**manifest["files"], "../../escaped.txt": {"sha256": "0" * 64, "bytes": 1}}
    prefix = f"all/{snapshot.sha256}"
    bucket.objects[f"{prefix}/manifest.json"] = json.dumps(manifest).encode()
    bucket.objects[f"{prefix}/../../escaped.txt"] = b"x"
    with pytest.raises(SnapshotError, match="lists files"):
        download_snapshot(bucket, "all", snapshot.sha256, tmp_path / "landing")
    assert not (tmp_path / "escaped.txt").exists() and not (tmp_path.parent / "escaped.txt").exists()


@pytest.mark.parametrize("name", ["../x", "..", ".", "/etc/passwd", "C:\\x", "a\\b", "a/b", "", None, "x\x00y"])
def test_shard_names_must_be_plain(name):
    assert not safe_file_name(name)


@pytest.mark.parametrize("name", ["rank-00000.pt", ".metadata", "__0_0.distcp", "%2e%2e%2f"])
def test_plain_shard_names_are_accepted(name):
    assert safe_file_name(name)


@pytest.mark.parametrize("tag", ["../etc", "..", "/abs", "C:\\abs", "%2e%2e%2f", "a b", "all;rm -rf /", "$(id)"])
def test_hostile_dataset_tags_are_refused_before_any_query(tag):
    with pytest.raises(ValueError):
        Selection(dataset_tag=tag).validate()


@pytest.mark.parametrize("value", ["../etc", "x&verified=is.false", "physics),verified.is.false,(", "a;b"])
def test_hostile_filters_are_refused(value):
    for field in ("types", "categories", "subjects"):
        with pytest.raises(ValueError):
            Selection(**{field: [value]}).validate()


def test_postgrest_filters_are_encoded():
    selection = Selection(dataset_tag="tag.v1", subjects=["physics"], as_of="2026-09-26T06:00:00+00:00").validate()
    filters = SupabaseStore._selection_filters(selection)
    assert "enabled=is.true" in filters and "verified=is.true" in filters
    assert "updated_at=lte.2026-09-26T06%3A00%3A00%2B00%3A00" in filters
    assert all("&" not in f for f in filters)


def test_hostile_run_names_and_snapshot_refs(tmp_path, monkeypatch):
    seen = {}
    monkeypatch.setattr("ored.training.trainer.train", lambda c: seen.setdefault("cfg", c))
    train_main(["--config", str(CONFIG), "--supabase-dataset", "../../outside"])
    assert seen["cfg"].run_name == "char_transformer-..-..-outside"
    with pytest.raises(ValueError):
        train_main(["--config", str(CONFIG), "--supabase-dataset", "x", "--snapshot", "../../../etc"])


def test_snapshot_folder_stays_inside_snapshot_dir(store, cfg, tmp_path):
    cfg.data.supabase.dataset_tag = "all"
    snapshot = build_snapshot(store, cfg)
    assert Path(cfg.data.supabase.snapshot_dir).resolve() in snapshot.directory.resolve().parents
    cfg.data.supabase.snapshot = snapshot.sha256
    cfg.data.supabase.dataset_tag = "../all"
    with pytest.raises(SnapshotError):
        load_snapshot(cfg)


def test_unapproved_rows_never_reach_a_snapshot(cfg):
    s = InMemoryStore()
    good = synthetic_rows()
    s.add_training_data(good)
    s.add_training_data([row("qna", "science", "POISON unverified?", "bad", verified=False),
                         row("qna", "science", "POISON disabled?", "bad", enabled=False),
                         row("qna", "science", "POISON both?", "bad", enabled=False, verified=False)])
    snapshot = build_snapshot(s, cfg)
    text = "".join((snapshot.directory / f).read_text(encoding="utf-8") for f in ("train.txt", "val.txt", "test.txt"))
    assert "POISON" not in text and snapshot.record_count == len(good)
    cfg.data.supabase.include_unverified = True
    wider = build_snapshot(s, cfg)
    wider_text = "".join((wider.directory / f).read_text(encoding="utf-8") for f in ("train.txt", "val.txt", "test.txt"))
    assert "POISON unverified" in wider_text and "POISON disabled" not in wider_text and "POISON both" not in wider_text


def test_oversized_and_malformed_rows_are_refused(cfg):
    from ored.learning.training_data_cli import _insert

    s = InMemoryStore()
    s.add_training_data(synthetic_rows())
    before = s.count_training_data()
    for bad in (row("qna", "science", "big?", "x" * 10001), row("qna", "science", "ctl?", "a\x07b"),
                row("qna", "science", "   ", "x"), row("poem", "science", "a?", "b"),
                row("qna", "science", "bom?", "caf\ufffd")):
        assert _insert(s, [bad], skip_duplicates=False) == 1
    assert s.count_training_data() == before
    s._training_data["forged"] = row("qna", "science", "forged?", "x" * 10001, id="forged", fingerprint="0" * 64)
    with pytest.raises(SnapshotError, match="invalid"):
        build_snapshot(s, cfg)


def test_launcher_passes_hostile_values_as_single_arguments():
    import argparse

    from ored.distributed.cli import torchrun_command

    cfg = load_config(CONFIG)
    hostile = "run1; rm -rf / $(id) `id` && echo pwned"
    args = argparse.Namespace(nnodes="2", nproc_per_node=1, master_addr="10.0.0.1 ; id", master_port=29500,
                              session=hostile, rendezvous="c10d", node_rank=None, command="train",
                              config=str(CONFIG), overrides=["run_name=x;id"], extra=[])
    command = torchrun_command(args, cfg)
    assert isinstance(command, list) and hostile in command and "run_name=x;id" in command
    assert f"--rdzv-id={hostile}" in command
