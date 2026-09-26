from __future__ import annotations

import argparse
import os
import platform
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch
import torch.distributed as dist

from ored.config import Config, load_config
from ored.distributed.env import DistEnv, DistributedError
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

SRC = Path(__file__).resolve().parents[2]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

EPILOG = """\
Every PC runs the same launch command with its own NODE_RANK (static) or
none at all (c10d). Values come from flags, then environment variables
(NNODES, NODE_RANK, MASTER_ADDR, MASTER_PORT, NPROC_PER_NODE, ORED_SESSION),
then the config's distributed: section.

  launch test  ...   check that every PC can reach every other PC
  launch train ...   train one model on all PCs together
  verify ID|DIR      check a distributed checkpoint (VERIFIED / FAILED)
  consolidate DIR    turn a distributed checkpoint into one .pt for inference

See docs/distributed-training.md.
"""


def _env(name: str, fallback: Any) -> str:
    value = os.environ.get(name, "")
    return value if value else str(fallback)


def torchrun_command(args: argparse.Namespace, cfg: Config) -> List[str]:
    settings = cfg.distributed
    nnodes = args.nnodes or _env("NNODES", settings.nnodes)
    nproc = args.nproc_per_node or _env("NPROC_PER_NODE", settings.nproc_per_node)
    master_addr = args.master_addr or _env("MASTER_ADDR", "")
    master_port = args.master_port or _env("MASTER_PORT", settings.master_port)
    session = args.session or _env("ORED_SESSION", "")
    rendezvous = args.rendezvous or settings.rendezvous_backend
    if not session:
        raise DistributedError("give every PC the same --session (or ORED_SESSION), e.g. --session ored_v3-run1")
    if not master_addr:
        raise DistributedError("set --master-addr (or MASTER_ADDR) to the address of the PC running rank 0")
    command = [sys.executable, "-m", "torch.distributed.run",
               f"--nnodes={nnodes}", f"--nproc-per-node={nproc}", f"--max-restarts={settings.max_restarts}"]
    if rendezvous == "static":
        if ":" in str(nnodes):
            raise DistributedError("a MIN:MAX node count needs the c10d rendezvous")
        node_rank = args.node_rank if args.node_rank is not None else _env("NODE_RANK", "")
        if node_rank == "":
            raise DistributedError("static rendezvous needs --node-rank (or NODE_RANK): 0 on the master PC, 1, 2, ... on the others")
        command += [f"--node-rank={node_rank}", f"--master-addr={master_addr}", f"--master-port={master_port}",
                    f"--rdzv-id={session}"]
    else:
        command += ["--rdzv-backend=c10d", f"--rdzv-endpoint={master_addr}:{master_port}",
                    f"--rdzv-id={session}", f"--rdzv-conf=join_timeout={settings.timeout_seconds}"]
    command += ["-m", "ored.distributed", args.command, "--config", args.config, "--session", session]
    for override in args.overrides:
        command += ["--set", override]
    return command + list(args.extra)


def cmd_launch(args: argparse.Namespace) -> int:
    cfg = load_config(args.config, args.overrides)
    command = torchrun_command(args, cfg)
    env = dict(os.environ)
    env["PYTHONPATH"] = os.pathsep.join(p for p in (str(SRC), env.get("PYTHONPATH", "")) if p)
    env["ORED_SESSION"] = command[command.index("--session") + 1]
    if platform.system() == "Windows":
        env.setdefault("USE_LIBUV", "0")
    print("torchrun command:\n  " + " ".join(command), flush=True)
    if args.dry_run:
        return 0
    return subprocess.call(command, env=env)


def session_config(cfg: Config, env: DistEnv, batch_size: int) -> Dict[str, Any]:
    config = cfg.to_dict()
    config["distributed"].update({
        "enabled": True,
        "world_size": env.world_size,
        "expected_nodes": env.nnodes,
        "nproc_per_node": env.local_world_size,
        "master": f"{env.master_addr}:{env.master_port}",
        "batch_per_worker": batch_size,
        "global_batch": batch_size * env.world_size,
    })
    return config


def ensure_snapshot(cfg: Config, env: DistEnv) -> Any:
    from ored.data.snapshot import find_local, prepare_dataset
    from ored.training.dataset_run import supabase_from_env

    settings = cfg.data.supabase
    if not settings.snapshot:
        raise DistributedError(
            "a distributed run trains every PC on the same data, so it needs a pinned snapshot: take one with\n"
            f"  python scripts/training_data.py snapshot --dataset-tag {settings.dataset_tag} --upload\n"
            "and pass --set data.supabase.snapshot=<the hash it prints> on every PC")
    prepared = None
    if env.local_rank == 0:
        needs_download = find_local(settings.snapshot_dir, settings.dataset_tag, settings.snapshot) is None
        store, files = supabase_from_env(required=needs_download)
        prepared = prepare_dataset(cfg, store if env.is_coordinator else None, files)
    env.barrier()
    return prepared


def ensure_data(cfg: Config, env: DistEnv) -> Any:
    if cfg.data.source == "supabase":
        return ensure_snapshot(cfg, env)
    if env.local_rank == 0:
        if cfg.task == "bit_addition" and not Path(cfg.data.raw_path).exists():
            from ored.data.generate import generate_dataset
            generate_dataset(cfg)
        elif cfg.task == "language_model" and not (Path(cfg.data.corpus.dir) / "train.txt").exists():
            from ored.data.corpus import generate_corpus
            generate_corpus(cfg)
    env.barrier()


def remote_from_env(cfg: Config) -> Any:
    if not cfg.checkpoint.upload:
        return None
    from ored.learning.checkpoints import CheckpointStore
    from ored.learning.supabase_store import SupabaseStore
    return SupabaseStore.from_env(), CheckpointStore.from_env()


def control_from_env(cfg: Config, env: DistEnv) -> Any:
    from ored.distributed.control import ControlPlane, SupabaseControlPlane
    if not cfg.distributed.report_to_supabase:
        return ControlPlane()
    from ored.learning.supabase_store import SupabaseStore
    return SupabaseControlPlane(SupabaseStore.from_env(), env, cfg.distributed.heartbeat_seconds)


def run_training(cfg: Config, env: DistEnv, remote: Any = None, control: Any = None) -> Any:
    from ored.distributed.control import ControlPlane
    from ored.distributed.trainer import DistributedTrainer, per_worker_batch_size, quiet_other_ranks
    from ored.training.checkpoints import NoResumableCheckpoint

    quiet_other_ranks(env)
    control = control or ControlPlane()
    automatic = cfg.training.resume == "auto"
    if automatic:
        cfg.training.resume = "live" if env.restart_count > 0 else ""
    try:
        prepared = ensure_data(cfg, env)
        dataset_tag = f"{cfg.task}:{cfg.data.corpus.dir if cfg.task == 'language_model' else cfg.data.raw_path}"
        if cfg.data.source == "supabase":
            dataset_tag = cfg.data.supabase.dataset_tag
        control.start(cfg.run_name, dataset_tag, session_config(cfg, env, per_worker_batch_size(cfg, env.world_size)))
        if prepared is not None and prepared.dataset is not None:
            control.link_dataset(prepared.dataset.id, prepared.snapshot.record_count)
        try:
            trainer = DistributedTrainer(cfg, env, control, remote)
        except NoResumableCheckpoint:
            if not automatic:
                raise
            cfg.training.resume = ""
            trainer = DistributedTrainer(cfg, env, control, remote)
        result = trainer.fit()
        last = result["history"][-1] if result["history"] else {}
        control.finish("completed", metrics={
            "world_size": env.world_size,
            "epochs": len(result["history"]),
            "global_step": trainer.global_step,
            "best_metric": result["best_metric"],
            "best_value": result["best_value"],
            "best_epoch": result["best_epoch"],
            **{k: v for k, v in last.items() if isinstance(v, (int, float))},
        })
        trainer.result = result
        return trainer
    except KeyboardInterrupt:
        control.finish("cancelled", error="stopped by hand")
        raise
    except BaseException as exc:
        control.finish("failed", error=f"{type(exc).__name__}: {exc}")
        raise


def cmd_train(args: argparse.Namespace) -> int:
    from ored.training.trainer import checkpoint_overrides

    overrides = list(args.overrides) + checkpoint_overrides(args)
    if args.report:
        overrides.append("distributed.report_to_supabase=true")
    resume_auto = not (args.resume_live or args.init_from)
    cfg = load_config(args.config, overrides)
    cfg.distributed.enabled = True
    if resume_auto and not cfg.training.resume:
        cfg.training.resume = "auto"
    env = DistEnv.from_environ(cfg.distributed, args.session)
    if not env.session_key:
        if env.world_size > 1:
            raise DistributedError("every worker needs the same --session (or ORED_SESSION)")
        env.session_key = f"{cfg.run_name}-single"
    env.init()
    try:
        run_training(cfg, env, remote_from_env(cfg), control_from_env(cfg, env))
    finally:
        env.close()
    return 0


def cmd_test(args: argparse.Namespace) -> int:
    cfg = load_config(args.config, args.overrides) if args.config else Config()
    env = DistEnv.from_environ(cfg.distributed, args.session or "connectivity-test")
    env.init()
    try:
        env.select_device(cfg.training.device)
        info = env.describe()
        print(f"[rank {env.rank}/{env.world_size}] host {info['hostname']} node {env.node_rank} "
              f"device {info['device']} {info['gpu']} cuda {info['cuda'] or '-'} torch {info['torch']} "
              f"master {info['master']} backend {env.backend}", flush=True)
        everyone = env.all_gather_object(info)
        total = env.all_reduce_sum([float(env.rank + 1)])[0]
        size = 4 * 1024 * 1024
        payload = torch.ones(size, dtype=torch.float32, device=env.comm_device)
        started = time.time()
        for _ in range(3):
            dist.all_reduce(payload)
        seconds = (time.time() - started) / 3
        env.barrier()
        if env.is_coordinator:
            expected = env.world_size * (env.world_size + 1) / 2
            ranks = sorted(p["rank"] for p in everyone)
            print(section("ORED -- DISTRIBUTED CONNECTIVITY TEST"))
            print(f"{'rank':>4}  {'node':>4}  {'host':<20} {'device':<8} {'gpu':<24} {'torch':<14} os")
            for p in sorted(everyone, key=lambda p: p["rank"]):
                print(f"{p['rank']:>4}  {p['node_rank']:>4}  {p['hostname'][:20]:<20} {p['device']:<8} "
                      f"{(p['gpu'] or '-')[:24]:<24} {p['torch']:<14} {p['os']}")
            checks = [
                ("all ranks discovered", ranks == list(range(env.world_size)), f"{len(ranks)} of {env.world_size}"),
                ("all ranks connected (all-gather)", len(everyone) == env.world_size, ""),
                ("all-reduce", abs(total - expected) < 1e-9, f"sum {total:.0f}, expected {expected:.0f}"),
                ("barrier", True, ""),
            ]
            for name, ok, detail in checks:
                print(f"  {'OK  ' if ok else 'FAIL'} {name} {detail}")
            print(f"  all-reduce of 16 MB took {seconds * 1000:.0f} ms "
                  f"({2 * 16 * (env.world_size - 1) / env.world_size / max(seconds, 1e-9):.0f} MB/s per worker)")
            ok = all(c[1] for c in checks)
            print("VERIFIED: every worker can train together" if ok else "FAILED")
            return 0 if ok else 1
        return 0
    finally:
        env.close()


def cmd_verify(args: argparse.Namespace) -> int:
    from ored.distributed.checkpoint import verify_group_dir, verify_group_remote

    cfg = load_config(args.config, args.overrides) if args.config else None
    target = args.checkpoint
    if Path(target).is_dir():
        manifest, problems = verify_group_dir(target, cfg)
    elif UUID.match(target):
        from ored.learning.checkpoints import CheckpointStore
        from ored.learning.supabase_store import SupabaseStore
        manifest, problems = verify_group_remote(SupabaseStore.from_env(), CheckpointStore.from_env(), target, cfg)
    else:
        problems, manifest = [f"{target} is neither a checkpoint folder nor a checkpoint_group_id"], None
    print(report(manifest, problems, target, model_checked=cfg is not None))
    return 0 if not problems else 1


def report(manifest: Optional[Dict[str, Any]], problems: List[str], target: str, model_checked: bool) -> str:
    lines = ["Ored Distributed Checkpoint", ""]
    if manifest:
        ranks = sorted({s["rank"] for s in manifest["shards"]})
        size = sum(s["size_bytes"] for s in manifest["shards"])
        metrics = manifest.get("metrics") or {}
        lines += [
            f"Role:            {manifest['kind'].upper()}",
            f"Run:             {manifest['run_name']}",
            f"Session:         {manifest.get('session_key') or '-'}",
            f"Group:           {manifest['checkpoint_group_id']}",
            f"Epoch:           {manifest['epoch']}",
            f"Global step:     {manifest['global_step']:,}",
            f"World size:      {manifest['world_size']} (ranks with shards: {ranks})",
            f"Files:           {len(manifest['shards'])}, {size / 1e6:.2f} MB",
            f"Validation loss: {metrics.get('val_loss', '-')}",
            f"Format:          {manifest['format_version']} (distributed), PyTorch {manifest.get('torch_version')}",
            f"Model config:    {'checked' if model_checked else 'not checked (pass --config)'}",
            "",
        ]
    else:
        lines += [f"Checkpoint:      {target}", ""]
    if problems:
        lines.append("FAILED")
        lines += [f"  - {p}" for p in problems]
    else:
        lines.append("VERIFIED")
    return "\n".join(lines)


def cmd_consolidate(args: argparse.Namespace) -> int:
    from ored.distributed.checkpoint import consolidate

    out = consolidate(args.checkpoint, args.out)
    print(f"wrote {out}: one .pt with the model weights, loadable by infer.py, evaluate.py and serve.py")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m ored.distributed",
        description="Train one Ored model on many PCs at once.",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="action", required=True)

    def config_args(p: argparse.ArgumentParser, required: bool = True) -> None:
        p.add_argument("--config", required=required)
        p.add_argument("--set", dest="overrides", action="append", default=[], metavar="KEY=VALUE")

    p = sub.add_parser("launch", help="build and run the torchrun command for this PC")
    p.add_argument("command", choices=["train", "test"])
    config_args(p)
    p.add_argument("--session", default="")
    p.add_argument("--nnodes", default="")
    p.add_argument("--nproc-per-node", default="")
    p.add_argument("--node-rank", default=None)
    p.add_argument("--master-addr", default="")
    p.add_argument("--master-port", default="")
    p.add_argument("--rendezvous", choices=["c10d", "static"], default="")
    p.add_argument("--dry-run", action="store_true", help="print the command without running it")
    p.set_defaults(func=cmd_launch, extra=[])

    p = sub.add_parser("train", help="(run by torchrun) train on every worker")
    config_args(p)
    p.add_argument("--session", default="")
    start = p.add_mutually_exclusive_group()
    start.add_argument("--resume-live", action="store_true")
    start.add_argument("--init-from", metavar="PATH")
    p.add_argument("--history-every", type=int)
    p.add_argument("--history-every-steps", type=int)
    p.add_argument("--live-every-steps", type=int)
    p.add_argument("--upload", action="store_true", help="upload checkpoint shards to Supabase")
    p.add_argument("--report", action="store_true", help="record the session and workers in Supabase")
    p.set_defaults(func=cmd_train)

    p = sub.add_parser("test", help="(run by torchrun) connectivity test")
    config_args(p, required=False)
    p.add_argument("--session", default="")
    p.set_defaults(func=cmd_test)

    p = sub.add_parser("verify", help="check a distributed checkpoint")
    p.add_argument("checkpoint", help="a checkpoint folder or a checkpoint_group_id")
    config_args(p, required=False)
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("consolidate", help="one .pt from a distributed checkpoint")
    p.add_argument("checkpoint")
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_consolidate)
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    extra: List[str] = []
    if "--" in argv:
        extra = argv[argv.index("--") + 1:]
        argv = argv[:argv.index("--")]
    args = build_parser().parse_args(argv)
    args.extra = extra
    try:
        return args.func(args)
    except DistributedError as exc:
        logger.error(str(exc))
        return 2
