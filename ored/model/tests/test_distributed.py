from __future__ import annotations

import copy
import json
import math
import shutil
from pathlib import Path

import pytest
import torch
import torch.multiprocessing as mp

from dist_helpers import DirectoryBucket, SharedStore, run_workers
from ored.distributed.checkpoint import (
    MANIFEST,
    consolidate,
    read_manifest,
    rank_file,
    verify_group_dir,
    verify_group_remote,
)
from ored.distributed.cli import build_parser, torchrun_command
from ored.distributed.env import DistributedError
from ored.learning.records import CheckpointKind, CheckpointPart, WorkerStatus
from ored.training.trainer import Trainer


def dist_cfg(cfg, directory, epochs=4, **checkpoint):
    cfg = copy.deepcopy(cfg)
    cfg.paths.checkpoint_dir = str(directory)
    cfg.training.epochs = epochs
    cfg.distributed.timeout_seconds = 60
    for key, value in checkpoint.items():
        setattr(cfg.checkpoint, key, value)
    return cfg


def train_worker(rank, world, cfg, out, opts):
    from ored.distributed.cli import run_training
    from ored.distributed.control import SupabaseControlPlane
    from ored.distributed.env import DistEnv

    if opts.get("crash_step"):
        original = Trainer._apply_learning_rate
        crash_ranks = opts.get("crash_ranks")

        def dying(self):
            if self.global_step + 1 == opts["crash_step"] and (crash_ranks is None or rank in crash_ranks):
                raise RuntimeError(f"rank {rank}: simulated power cut at step {opts['crash_step']}")
            return original(self)

        Trainer._apply_learning_rate = dying

    env = DistEnv.from_environ(cfg.distributed, "pytest-session")
    env.init()
    remote = control = None
    if opts.get("shared"):
        shared = Path(opts["shared"])
        store = SharedStore(shared / "store.pkl")
        remote = (store, DirectoryBucket(shared / "bucket"))
        control = SupabaseControlPlane(store, env, heartbeat_seconds=opts.get("heartbeat", 30))
    try:
        trainer = run_training(cfg, env, remote, control)
        torch.save({
            "params": {k: v.detach().clone() for k, v in trainer.model.state_dict().items()},
            "history": trainer.history,
            "global_step": trainer.global_step,
            "best_epoch": trainer.best_epoch,
            "resumed_from": trainer.resumed_from,
            "sampler": list(iter(trainer.sampler)),
            "val_indices": list(trainer.loaders["val"].dataset.indices),
        }, Path(out) / f"rank{rank}.pt")
    finally:
        env.close()


def results(out, world):
    return [torch.load(Path(out) / f"rank{r}.pt", weights_only=False) for r in range(world)]


def same_weights(a, b):
    return a.keys() == b.keys() and all(torch.equal(a[k], b[k]) for k in a)


@pytest.fixture()
def cfg(tiny_dataset, tmp_path):
    tiny_dataset.model.dropout = 0.2
    return tiny_dataset


def test_three_workers_train_one_model(cfg, tmp_path):
    run_workers(train_worker, 3, dist_cfg(cfg, tmp_path / "ck"), tmp_path, {})
    ranks = results(tmp_path, 3)
    for other in ranks[1:]:
        assert same_weights(ranks[0]["params"], other["params"]), "workers ended with different models"
        assert other["history"] == ranks[0]["history"], "workers disagree on the global metrics"
    assert ranks[0]["global_step"] == 4 * math.ceil(math.ceil(len_train(cfg) / 3) / cfg.data.batch_size)


def len_train(cfg):
    from ored.data.dataset import build_datasets
    return len(build_datasets(cfg)["train"])


def test_every_worker_gets_its_own_share_of_the_data(cfg, tmp_path):
    run_workers(train_worker, 3, dist_cfg(cfg, tmp_path / "ck", epochs=1), tmp_path, {})
    ranks = results(tmp_path, 3)
    train = [set(r["sampler"]) for r in ranks]
    assert all(len(train[i] & train[j]) <= 1 for i in range(3) for j in range(i + 1, 3)), \
        "shards overlap beyond DistributedSampler's padding"
    assert set().union(*train) == set(range(len_train(cfg)))
    val = [r["val_indices"] for r in ranks]
    assert sorted(sum(val, [])) == list(range(sum(len(v) for v in val))), "validation must be split exactly"
    assert not set(val[0]) & set(val[1])


def test_global_validation_matches_one_machine(cfg, tmp_path):
    run_workers(train_worker, 3, dist_cfg(cfg, tmp_path / "ck", epochs=1), tmp_path, {})
    ranks = results(tmp_path, 3)
    single = copy.deepcopy(cfg)
    single.paths.checkpoint_dir = str(tmp_path / "single")
    trainer = Trainer(single)
    trainer.model.load_state_dict(ranks[0]["params"])
    whole = trainer.evaluate("val")
    record = ranks[0]["history"][0]
    assert record["val_loss"] == pytest.approx(whole["loss"], rel=1e-6)
    assert record["val_exact_acc"] == pytest.approx(whole["exact_acc"], rel=1e-6)
    assert record["val_examples"] == len(trainer.datasets["val"])


def reduce_worker(rank, world, out):
    from ored.distributed.env import DistEnv
    from ored.distributed.metrics import reduce_metrics
    from ored.config import DistributedConfig
    from ored.training.metrics import MetricAccumulator

    env = DistEnv.from_environ(DistributedConfig(), "pytest-session")
    env.init()
    accumulator = MetricAccumulator()
    if rank == 0:
        accumulator.update(batch_size=2, loss=1.0)
    else:
        accumulator.update(batch_size=6, loss=3.0)
    metrics = reduce_metrics(env, accumulator, "language_model", tokens=10 * accumulator.total_examples)
    Path(out, f"m{rank}.json").write_text(json.dumps(metrics))
    env.close()


def test_metric_reduction_weights_by_examples_not_by_worker(tmp_path):
    run_workers(reduce_worker, 2, tmp_path)
    for rank in range(2):
        metrics = json.loads(Path(tmp_path, f"m{rank}.json").read_text())
        assert metrics["loss"] == pytest.approx(2.5), "(2*1 + 6*3) / 8, not (1 + 3) / 2"
        assert metrics["examples"] == 8 and metrics["tokens"] == 80
        assert metrics["bpc"] == pytest.approx(2.5 / math.log(2))
        assert metrics["ppl"] == pytest.approx(math.exp(2.5))


def grad_worker(rank, world, out):
    from torch.nn.parallel import DistributedDataParallel
    from ored.config import DistributedConfig
    from ored.distributed.env import DistEnv

    env = DistEnv.from_environ(DistributedConfig(), "pytest-session")
    env.init()
    torch.manual_seed(0)
    model = torch.nn.Sequential(torch.nn.Linear(6, 8), torch.nn.Tanh(), torch.nn.Linear(8, 2))
    ddp = DistributedDataParallel(model)
    optimizer = torch.optim.SGD(model.parameters(), lr=0.1)
    x = torch.randn(12, 6, generator=torch.Generator().manual_seed(1))
    y = torch.randn(12, 2, generator=torch.Generator().manual_seed(2))
    part = slice(rank * 4, rank * 4 + 4)
    torch.nn.functional.mse_loss(ddp(x[part]), y[part]).backward()
    optimizer.step()
    torch.save(model.state_dict(), Path(out) / f"g{rank}.pt")
    env.close()


def test_gradients_are_synchronised_into_one_step(tmp_path):
    run_workers(grad_worker, 3, tmp_path)
    torch.manual_seed(0)
    model = torch.nn.Sequential(torch.nn.Linear(6, 8), torch.nn.Tanh(), torch.nn.Linear(8, 2))
    optimizer = torch.optim.SGD(model.parameters(), lr=0.1)
    x = torch.randn(12, 6, generator=torch.Generator().manual_seed(1))
    y = torch.randn(12, 2, generator=torch.Generator().manual_seed(2))
    torch.nn.functional.mse_loss(model(x), y).backward()
    optimizer.step()
    for rank in range(3):
        state = torch.load(Path(tmp_path) / f"g{rank}.pt")
        for key, value in model.state_dict().items():
            assert torch.allclose(state[key], value, atol=1e-6), f"rank {rank} {key}"


def test_a_distributed_checkpoint_is_one_manifest_and_a_shard_per_rank(cfg, tmp_path):
    ck = tmp_path / "ck"
    run_workers(train_worker, 3, dist_cfg(cfg, ck, epochs=4, keep_history=True, save_history_every_epochs=2),
                tmp_path, {})
    run = ck / cfg.run_name
    pointer = json.loads((run / "live.json").read_text())
    live = run / "live" / pointer["label"]
    manifest = read_manifest(live)
    assert manifest["complete"] and manifest["world_size"] == 3 and manifest["kind"] == "live"
    assert manifest["epoch"] == 4 and manifest["contents"] == ["model", "optimizer"]
    assert {s["rank"] for s in manifest["shards"]} == {0, 1, 2}
    for rank in range(3):
        assert (live / rank_file(rank)).is_file()
        assert list(live.glob(f"__{rank}_*.distcp"))
    assert verify_group_dir(live, cfg) == (manifest, [])
    assert len(list((run / "live").iterdir())) == 1, "superseded live groups are removed"
    history = sorted(p.name for p in (run / "history").iterdir())
    assert [read_manifest(run / "history" / h)["epoch"] for h in history] == [2, 4]
    base = read_manifest(run / "base" / json.loads((run / "base.json").read_text())["label"])
    assert base["contents"] == ["model"] and base["global_step"] == 0


def test_best_follows_the_global_validation_loss(cfg, tmp_path):
    ck = tmp_path / "ck"
    run_workers(train_worker, 3, dist_cfg(cfg, ck, epochs=8), tmp_path, {})
    history = results(tmp_path, 3)[0]["history"]
    losses = [r["val_loss"] for r in history]
    best_epoch = losses.index(min(losses)) + 1
    run = ck / cfg.run_name
    pointer = json.loads((run / "best.json").read_text())
    assert pointer["epoch"] == best_epoch
    assert read_manifest(run / "best" / pointer["label"])["metrics"]["val_loss"] == min(losses)
    assert len(list((run / "best").iterdir())) == 1
    from ored.utils.checkpoint import load_checkpoint
    assert load_checkpoint(run / "best.pt")["epoch"] == best_epoch


def test_stop_everything_then_resume_matches_an_uninterrupted_run(cfg, tmp_path):
    settings = {"save_live_every_epochs": 0, "save_live_every_steps": 3}
    run_workers(train_worker, 3, dist_cfg(cfg, tmp_path / "a", epochs=5, **settings), tmp_path / "a", {})
    straight = results(tmp_path / "a", 3)

    b = tmp_path / "b"
    b.mkdir()
    with pytest.raises(mp.ProcessRaisedException):
        run_workers(train_worker, 3, dist_cfg(cfg, b / "ck", epochs=5, **settings), b, {"crash_step": 8})
    pointer = json.loads((b / "ck" / cfg.run_name / "live.json").read_text())
    assert pointer["global_step"] == 6
    assert json.loads((b / "ck" / cfg.run_name / "live" / pointer["label"] / MANIFEST).read_text())[
        "trainer_state"]["epoch_complete"] is False, "this live was taken mid-epoch"

    resumed_cfg = dist_cfg(cfg, b / "ck", epochs=5, **settings)
    resumed_cfg.training.resume = "live"
    run_workers(train_worker, 3, resumed_cfg, b, {})
    resumed = results(b, 3)
    assert "step 6" in resumed[0]["resumed_from"]
    assert resumed[0]["history"][:3] == straight[0]["history"][:3], "data order and RNG are restored exactly"
    for r in range(3):
        for key, value in straight[r]["params"].items():
            assert torch.allclose(resumed[r]["params"][key], value, rtol=1e-5, atol=1e-6), key
    for a, b_ in zip(straight[0]["history"], resumed[0]["history"]):
        assert b_["train_loss"] == pytest.approx(a["train_loss"], rel=1e-5)
        assert b_["val_loss"] == pytest.approx(a["val_loss"], rel=1e-5)


def test_live_restores_the_exact_saved_state(cfg, tmp_path):
    ck = tmp_path / "ck"
    run_workers(train_worker, 3, dist_cfg(cfg, ck, epochs=2), tmp_path, {})
    saved = results(tmp_path, 3)
    again = dist_cfg(cfg, ck, epochs=2)
    again.training.resume = "live"
    (tmp_path / "again").mkdir()
    run_workers(train_worker, 3, again, tmp_path / "again", {})
    loaded = results(tmp_path / "again", 3)
    for r in range(3):
        assert same_weights(loaded[r]["params"], saved[r]["params"])
        assert loaded[r]["global_step"] == saved[r]["global_step"]
        assert loaded[r]["history"] == saved[r]["history"]


def test_resume_on_fewer_workers_reshards_at_an_epoch_boundary(cfg, tmp_path):
    ck = tmp_path / "ck"
    run_workers(train_worker, 3, dist_cfg(cfg, ck, epochs=2), tmp_path, {})
    saved = results(tmp_path, 3)[0]
    more = dist_cfg(cfg, ck, epochs=3)
    more.training.resume = "live"
    (tmp_path / "two").mkdir()
    run_workers(train_worker, 2, more, tmp_path / "two", {})
    resumed = results(tmp_path / "two", 2)
    assert "saved by 3 workers" in resumed[0]["resumed_from"]
    assert len(resumed[0]["history"]) == 3
    assert resumed[0]["history"][:2] == saved["history"]
    assert same_weights(resumed[0]["params"], resumed[1]["params"])


def test_a_mid_epoch_live_refuses_a_different_worker_count(cfg, tmp_path):
    ck = tmp_path / "ck"
    settings = {"save_live_every_epochs": 0, "save_live_every_steps": 3}
    with pytest.raises(mp.ProcessRaisedException):
        run_workers(train_worker, 3, dist_cfg(cfg, ck, epochs=5, **settings), tmp_path, {"crash_step": 5})
    again = dist_cfg(cfg, ck, epochs=5, **settings)
    again.training.resume = "live"
    with pytest.raises(mp.ProcessRaisedException, match="can only resume with 3 workers"):
        run_workers(train_worker, 2, again, tmp_path, {})


def test_a_torchrun_restart_resumes_from_live_on_its_own(cfg, tmp_path):
    ck = tmp_path / "ck"
    run_workers(train_worker, 2, dist_cfg(cfg, ck, epochs=2), tmp_path, {})
    again = dist_cfg(cfg, ck, epochs=3)
    again.training.resume = "auto"
    (tmp_path / "restart").mkdir()
    run_workers(train_worker, 2, again, tmp_path / "restart", {}, env={"TORCHELASTIC_RESTART_COUNT": "1"})
    assert "end of epoch 2" in results(tmp_path / "restart", 2)[0]["resumed_from"]

    fresh = dist_cfg(cfg, tmp_path / "nothing-yet", epochs=1)
    fresh.training.resume = "auto"
    (tmp_path / "first").mkdir()
    run_workers(train_worker, 2, fresh, tmp_path / "first", {}, env={"TORCHELASTIC_RESTART_COUNT": "1"})
    assert results(tmp_path / "first", 2)[0]["resumed_from"] == ""


def test_resume_without_live_explains_itself(cfg, tmp_path):
    fresh = dist_cfg(cfg, tmp_path / "empty")
    fresh.training.resume = "live"
    with pytest.raises(mp.ProcessRaisedException, match="There is no live checkpoint"):
        run_workers(train_worker, 2, fresh, tmp_path, {})


def trained_group(cfg, tmp_path, world=3):
    ck = tmp_path / "ck"
    run_workers(train_worker, world, dist_cfg(cfg, ck, epochs=2), tmp_path, {})
    run = ck / cfg.run_name
    return run / "live" / json.loads((run / "live.json").read_text())["label"]


def test_corrupt_and_missing_shards_are_detected(cfg, tmp_path):
    live = trained_group(cfg, tmp_path)
    manifest, problems = verify_group_dir(live)
    assert problems == []

    shard = live / "__1_0.distcp"
    data = shard.read_bytes()
    shard.write_bytes(data[:-1] + bytes([data[-1] ^ 0xFF]))
    _, problems = verify_group_dir(live)
    assert problems == ["rank 1: __1_0.distcp fails its sha256 check"]

    shard.unlink()
    _, problems = verify_group_dir(live)
    assert problems == ["rank 1: __1_0.distcp is missing"]

    again = dist_cfg(cfg, tmp_path / "ck", epochs=3)
    again.training.resume = "live"
    with pytest.raises(mp.ProcessRaisedException, match="__1_0.distcp"):
        run_workers(train_worker, 3, again, tmp_path, {})


def test_a_model_config_mismatch_fails_verification(cfg, tmp_path):
    live = trained_group(cfg, tmp_path)
    other = copy.deepcopy(cfg)
    other.model.hidden_sizes = [8]
    _, problems = verify_group_dir(live, other)
    assert problems and "Model architecture mismatch" in problems[0]


def test_consolidate_gives_one_file_for_inference(cfg, tmp_path):
    from ored.inference.predictor import load_predictor

    live = trained_group(cfg, tmp_path)
    out = consolidate(live, tmp_path / "model.pt")
    predictor = load_predictor(out, device="cpu")
    trained = results(tmp_path, 3)[0]["params"]
    assert same_weights(predictor.model.state_dict(), trained)


def test_shards_upload_concurrently_and_promote_only_when_complete(cfg, tmp_path):
    shared = tmp_path / "shared"
    shared.mkdir()
    run_workers(train_worker, 3, dist_cfg(cfg, tmp_path / "ck", epochs=3, upload=True), tmp_path,
                {"shared": str(shared)})
    store = SharedStore(shared / "store.pkl")
    files = DirectoryBucket(shared / "bucket")
    live = store.current_checkpoint(cfg.run_name, CheckpointKind.LIVE)
    best = store.current_checkpoint(cfg.run_name, CheckpointKind.BEST)
    assert live.part is CheckpointPart.MANIFEST and live.is_complete and live.world_size == 3
    shards = [r for r in store.group(live.checkpoint_group_id) if r.part is CheckpointPart.SHARD]
    assert sorted({s.rank for s in shards}) == [0, 1, 2]
    assert all(s.upload_status == "verified" and s.is_complete and not s.is_current for s in shards)
    assert best.is_current and best.promotion_metric == "val_loss"
    manifests = store.checkpoints(CheckpointKind.LIVE, run_name=cfg.run_name, logical=True)
    assert manifests == [live], "the superseded live group is removed from Supabase"
    manifest, problems = verify_group_remote(store, files, live.checkpoint_group_id, cfg, workdir=tmp_path)
    assert problems == [] and manifest["epoch"] == 3
    session = store.sessions()[0]
    assert session.session_key == "pytest-session" and session.status.value == "evaluated"
    assert session.config["distributed"]["world_size"] == 3
    assert session.metrics["best_epoch"] >= 1
    workers = store.workers(session.id)
    assert sorted(w.rank for w in workers) == [0, 1, 2]
    assert all(w.status is WorkerStatus.COMPLETED and w.finished_at for w in workers)
    orphaned = set(files.list_objects()) - {r.object_path for r in store.checkpoints()}
    assert orphaned == set()


def test_checkpoints_cli_verifies_a_group_by_id(cfg, tmp_path, monkeypatch, capsys):
    from ored.learning.checkpoint_cli import main as checkpoints_main

    shared = tmp_path / "shared"
    shared.mkdir()
    run_workers(train_worker, 2, dist_cfg(cfg, tmp_path / "ck", epochs=1, upload=True), tmp_path,
                {"shared": str(shared)})
    store = SharedStore(shared / "store.pkl")
    files = DirectoryBucket(shared / "bucket")
    monkeypatch.setattr("ored.learning.checkpoint_cli._connect", lambda: (store, files))
    group = store.current_checkpoint(cfg.run_name, CheckpointKind.LIVE).checkpoint_group_id

    assert checkpoints_main(["verify", group]) == 0
    assert capsys.readouterr().out.rstrip().endswith("VERIFIED")

    shard = next(r for r in store.group(group) if r.part is CheckpointPart.SHARD and r.rank == 1)
    files.remove(shard.object_path)
    assert checkpoints_main(["verify", group]) == 1
    out = capsys.readouterr().out
    assert "FAILED" in out and f"object {shard.object_path} is missing" in out


def test_a_failed_shard_upload_never_becomes_live(cfg, tmp_path):
    shared = tmp_path / "shared"
    shared.mkdir()
    run_workers(train_worker, 3, dist_cfg(cfg, tmp_path / "ck", epochs=2, upload=True), tmp_path,
                {"shared": str(shared)})
    store = SharedStore(shared / "store.pkl")
    before = store.current_checkpoint(cfg.run_name, CheckpointKind.LIVE)

    again = dist_cfg(cfg, tmp_path / "ck", epochs=3, upload=True)
    again.training.resume = "live"
    run_workers(train_worker, 3, again, tmp_path, {"shared": str(shared)},
                env={"ORED_TEST_DAMAGE_RANK_1": "corrupt"})

    after = store.current_checkpoint(cfg.run_name, CheckpointKind.LIVE)
    assert after.id == before.id, "live must stay on the last complete checkpoint"
    failed = [r for r in store.checkpoints() if r.upload_status == "failed"]
    assert failed and all(r.rank == 1 and not r.is_complete for r in failed)
    run = tmp_path / "ck" / cfg.run_name
    assert json.loads((run / "live.json").read_text())["group_id"] == before.checkpoint_group_id
    assert list(run.glob("live/*/INCOMPLETE.json"))


def test_resume_on_a_pc_without_the_files_downloads_them(cfg, tmp_path):
    shared = tmp_path / "shared"
    shared.mkdir()
    run_workers(train_worker, 3, dist_cfg(cfg, tmp_path / "ck", epochs=2, upload=True), tmp_path,
                {"shared": str(shared)})
    trained = results(tmp_path, 3)[0]
    shutil.rmtree(tmp_path / "ck")
    again = dist_cfg(cfg, tmp_path / "ck", epochs=3, upload=True)
    again.training.resume = "live"
    (tmp_path / "second").mkdir()
    run_workers(train_worker, 3, again, tmp_path / "second", {"shared": str(shared)})
    resumed = results(tmp_path / "second", 3)[0]
    assert "end of epoch 2" in resumed["resumed_from"]
    assert resumed["history"][:2] == trained["history"]


def test_heartbeats_and_worker_status(cfg, tmp_path):
    import time
    from ored.config import DistributedConfig
    from ored.distributed.control import SupabaseControlPlane
    from ored.distributed.env import DistEnv
    from ored.learning.store import InMemoryStore

    store = InMemoryStore()
    env = DistEnv(rank=0, local_rank=0, world_size=1, local_world_size=1, node_rank=0, nnodes=1,
                  master_addr="127.0.0.1", master_port=1, session_key="hb", worker_id="pc1-0",
                  hostname="pc1", backend="gloo", timeout_seconds=60)
    env.broadcast_object = lambda value=None: value
    control = SupabaseControlPlane(store, env, heartbeat_seconds=0.05)
    session_id = control.start("run", "tag", {"distributed": {"heartbeat_seconds": 30}})
    worker = store.workers(session_id)[0]
    first = worker.last_heartbeat
    assert worker.status is WorkerStatus.READY and worker.rank == 0 and worker.hostname == "pc1"
    control.set_status("checkpointing")
    assert store.workers(session_id)[0].status is WorkerStatus.CHECKPOINTING
    time.sleep(1.2)
    assert store.workers(session_id)[0].last_heartbeat > first
    control.finish("failed", error="GPU fell off the bus")
    worker = store.workers(session_id)[0]
    assert worker.status is WorkerStatus.FAILED and "GPU" in worker.error and worker.finished_at
    assert store.sessions()[0].status.value == "failed"
    assert DistributedConfig().heartbeat_seconds == 30


def test_workers_from_another_session_are_refused(cfg, tmp_path):
    with pytest.raises(mp.ProcessRaisedException, match="do not belong to one training run"):
        run_workers(mismatch_worker, 2, dist_cfg(cfg, tmp_path / "ck"))


def mismatch_worker(rank, world, cfg):
    from ored.distributed.cli import run_training
    from ored.distributed.env import DistEnv

    env = DistEnv.from_environ(cfg.distributed, f"session-{rank}")
    env.init()
    try:
        run_training(cfg, env)
    finally:
        env.close()


def launch_args(*extra):
    return build_parser().parse_args(["launch", "train", "--config", "configs/char_transformer.yaml", *extra])


def test_launch_builds_a_c10d_torchrun_command(monkeypatch):
    from ored.config import load_config

    monkeypatch.setenv("NNODES", "10")
    monkeypatch.setenv("MASTER_ADDR", "100.64.0.1")
    monkeypatch.setenv("MASTER_PORT", "29600")
    monkeypatch.setenv("NPROC_PER_NODE", "1")
    args = launch_args("--session", "ored_v3-run1")
    command = torchrun_command(args, load_config(args.config))
    assert "--nnodes=10" in command and "--nproc-per-node=1" in command
    assert "--rdzv-backend=c10d" in command and "--rdzv-endpoint=100.64.0.1:29600" in command
    assert "--rdzv-id=ored_v3-run1" in command
    assert command[-6:] == ["ored.distributed", "train", "--config", "configs/char_transformer.yaml",
                            "--session", "ored_v3-run1"]


def test_launch_builds_a_static_torchrun_command(monkeypatch):
    from ored.config import load_config

    for name in ("NNODES", "NODE_RANK", "MASTER_ADDR", "MASTER_PORT", "NPROC_PER_NODE", "ORED_SESSION"):
        monkeypatch.delenv(name, raising=False)
    args = launch_args("--session", "s", "--nnodes", "3", "--node-rank", "2", "--master-addr", "10.0.0.5",
                       "--rendezvous", "static")
    command = torchrun_command(args, load_config(args.config))
    assert {"--nnodes=3", "--node-rank=2", "--master-addr=10.0.0.5", "--master-port=29500"} <= set(command)
    with pytest.raises(DistributedError, match="node-rank"):
        torchrun_command(launch_args("--session", "s", "--master-addr", "a", "--rendezvous", "static"),
                         load_config(args.config))
    with pytest.raises(DistributedError, match="session"):
        torchrun_command(launch_args("--master-addr", "a"), load_config(args.config))
    with pytest.raises(DistributedError, match="master-addr"):
        torchrun_command(launch_args("--session", "s"), load_config(args.config))


def test_bad_distributed_settings_are_rejected(tiny_cfg):
    for key, value, message in (("backend", "mpi", "backend"), ("nnodes", "5:2", "MIN <= MAX"),
                                ("nnodes", "three", "nnodes"), ("batch_size_mode", "huge", "batch_size_mode")):
        bad = copy.deepcopy(tiny_cfg)
        setattr(bad.distributed, key, value)
        with pytest.raises(ValueError, match=message):
            bad.validate()


def test_global_batch_mode_needs_an_even_split(tiny_cfg):
    from ored.distributed.trainer import per_worker_batch_size

    tiny_cfg.data.batch_size = 32
    assert per_worker_batch_size(tiny_cfg, 3) == 32
    tiny_cfg.distributed.batch_size_mode = "global"
    assert per_worker_batch_size(tiny_cfg, 4) == 8
    with pytest.raises(DistributedError, match="Worker counts that fit"):
        per_worker_batch_size(tiny_cfg, 3)


def test_the_language_model_trains_distributed(tiny_corpus, tmp_path):
    run_workers(train_worker, 2, dist_cfg(tiny_corpus, tmp_path / "ck", epochs=1), tmp_path, {})
    ranks = results(tmp_path, 2)
    record = ranks[0]["history"][0]
    assert record["val_bpc"] == pytest.approx(record["val_loss"] / math.log(2))
    assert record["val_ppl"] == pytest.approx(math.exp(record["val_loss"]))
    assert record["val_tokens"] == record["val_examples"] * tiny_corpus.data.block_size
    assert same_weights(ranks[0]["params"], ranks[1]["params"])
