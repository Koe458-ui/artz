from __future__ import annotations

import json
import math
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import torch
import torch.distributed.checkpoint as dcp
from torch.distributed.checkpoint.state_dict import get_state_dict, set_state_dict

from ored.config import Config
from ored.distributed.env import DistEnv
from ored.learning.checkpoints import (
    CheckpointStore,
    delete_checkpoint,
    digest,
    publish,
    safe_name,
    upload_verified,
)
from ored.learning.records import Checkpoint, CheckpointKind, CheckpointPart, now
from ored.learning.store import StoreError
from ored.training.checkpoints import CheckpointManager, NoResumableCheckpoint, capture_rng
from ored.utils.checkpoint import (
    CHECKPOINT_FORMAT_VERSION,
    CheckpointError,
    architecture_of,
    as_kind,
    build_payload,
    check_compatible,
    clean_metrics,
    load_checkpoint,
    write_payload,
)
from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)

DISTRIBUTED_FORMAT_VERSION = 3
MANIFEST = "manifest.json"
INCOMPLETE = "INCOMPLETE.json"
METADATA = ".metadata"
CURRENT_ROLES = ("base", "live", "best")


def rank_file(rank: int) -> str:
    return f"rank-{rank:05d}.pt"


def group_label(epoch: int, global_step: int, group_id: str) -> str:
    return f"checkpoint_epoch_{int(epoch):04d}_step_{int(global_step):08d}_{group_id[:8]}"


def object_prefix(run_name: str, kind: str, label: str) -> str:
    return f"{safe_name(run_name)}/{kind}/{label}"


def own_files(directory: Path, rank: int) -> List[Path]:
    found = sorted(directory.glob(f"__{rank}_*.distcp")) + [directory / rank_file(rank)]
    if rank == 0:
        found.append(directory / METADATA)
    return [p for p in found if p.is_file()]


def json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): json_ready(v) for k, v in value.items() if not isinstance(v, torch.Tensor)}
    if isinstance(value, (list, tuple)):
        return [json_ready(v) for v in value if not isinstance(v, torch.Tensor)]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def write_json(path: Path, data: Dict[str, Any], tag: str = "") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{tag or os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, indent=2, sort_keys=False), encoding="utf-8")
    os.replace(tmp, path)
    return path


def read_manifest(directory: Path) -> Dict[str, Any]:
    path = Path(directory) / MANIFEST
    if not path.is_file():
        reason = ""
        if (Path(directory) / INCOMPLETE).is_file():
            reason = " (it never completed: see INCOMPLETE.json)"
        raise CheckpointError(f"{directory} has no {MANIFEST}{reason}")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise CheckpointError(f"{path} is not valid JSON: {exc}") from exc
    if manifest.get("format_version") != DISTRIBUTED_FORMAT_VERSION:
        raise CheckpointError(
            f"{path} cannot be read by this code.\n"
            f"Checkpoint format: {manifest.get('format_version')}\n"
            f"Expected format: {DISTRIBUTED_FORMAT_VERSION} (distributed)"
        )
    if manifest.get("complete") is not True:
        raise CheckpointError(f"{path} does not describe a complete checkpoint")
    return manifest


def manifest_as_payload(manifest: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "format_version": CHECKPOINT_FORMAT_VERSION,
        "checkpoint_kind": manifest.get("kind"),
        "run_name": manifest.get("run_name"),
        "architecture": manifest.get("architecture"),
        "tokenizer": manifest.get("tokenizer"),
    }


def check_files(directory: Path, manifest: Dict[str, Any]) -> List[str]:
    problems = []
    world_size = manifest.get("world_size")
    if not isinstance(world_size, int) or world_size < 1:
        return [f"manifest world_size is {world_size!r}"]
    ranks = {entry.get("rank") for entry in manifest.get("shards", [])}
    missing_ranks = sorted(set(range(world_size)) - ranks)
    if missing_ranks:
        problems.append(f"no shards listed for rank(s) {missing_ranks} of world size {world_size}")
    extra = sorted(r for r in ranks if not isinstance(r, int) or not 0 <= r < world_size)
    if extra:
        problems.append(f"shards listed for rank(s) {extra} outside world size {world_size}")
    names = {entry.get("name") for entry in manifest.get("shards", [])}
    if METADATA not in names:
        problems.append(f"{METADATA} (written by rank 0) is not listed")
    for rank in range(world_size):
        if rank_file(rank) not in names:
            problems.append(f"{rank_file(rank)} is not listed")
    for entry in manifest.get("shards", []):
        path = directory / entry["name"]
        if not path.is_file():
            problems.append(f"rank {entry['rank']}: {entry['name']} is missing")
            continue
        size = path.stat().st_size
        if size != entry["size_bytes"]:
            problems.append(f"rank {entry['rank']}: {entry['name']} is {size} bytes, manifest says {entry['size_bytes']}")
            continue
        if digest(path) != entry["sha256"]:
            problems.append(f"rank {entry['rank']}: {entry['name']} fails its sha256 check")
    return problems


def check_model(manifest: Dict[str, Any], cfg: Config) -> List[str]:
    from ored.models.registry import build_model

    tokenizer = manifest.get("tokenizer")
    vocab = len(tokenizer["itos"]) if tokenizer and "itos" in tokenizer else None
    try:
        model = build_model(cfg, vocab_size=vocab) if vocab else build_model(cfg)
        check_compatible(manifest_as_payload(manifest), model, path=manifest.get("label", "checkpoint"))
    except (CheckpointError, ValueError, TypeError) as exc:
        return [str(exc).replace("\n", "; ")]
    return []


def verify_group_dir(directory: str | Path, cfg: Optional[Config] = None) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    directory = Path(directory)
    try:
        manifest = read_manifest(directory)
    except CheckpointError as exc:
        return None, [str(exc).replace("\n", "; ")]
    problems = check_files(directory, manifest)
    if cfg is not None:
        problems += check_model(manifest, cfg)
    return manifest, problems


def verify_group_remote(store: Any, files: CheckpointStore, group_id: str, cfg: Optional[Config] = None,
                        workdir: Optional[str | Path] = None) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    rows = store.group(group_id)
    if not rows:
        return None, [f"no checkpoint group {group_id} in ored_checkpoints"]
    manifests = [r for r in rows if r.part is CheckpointPart.MANIFEST]
    shards = {r.object_path: r for r in rows if r.part is CheckpointPart.SHARD}
    if not manifests:
        states = ", ".join(sorted({f"rank {r.rank}: {r.upload_status}" for r in shards.values()}))
        return None, [f"group {group_id} was never finalized ({states})"]
    record = manifests[0]
    with tempfile.TemporaryDirectory(dir=workdir) as tmp:
        directory = Path(tmp)
        try:
            files.download(record.object_path, directory / MANIFEST)
        except StoreError as exc:
            return None, [f"manifest object {record.object_path} could not be read: {exc}"]
        if digest(directory / MANIFEST) != record.sha256:
            return None, [f"manifest object {record.object_path} fails its sha256 check"]
        try:
            manifest = read_manifest(directory)
        except CheckpointError as exc:
            return None, [str(exc)]
        problems = []
        if manifest.get("world_size") != record.world_size:
            problems.append(f"manifest world size {manifest.get('world_size')} != row {record.world_size}")
        for entry in manifest.get("shards", []):
            row = shards.get(entry.get("object_path"))
            if row is None:
                problems.append(f"rank {entry['rank']}: {entry['name']} has no ored_checkpoints row")
            elif row.upload_status != "verified" or not row.is_complete or row.sha256 != entry["sha256"]:
                problems.append(f"rank {entry['rank']}: {entry['name']} row is {row.upload_status}, "
                                f"complete={row.is_complete}")
            size = files.stat(entry["object_path"])
            if size is None:
                problems.append(f"rank {entry['rank']}: object {entry['object_path']} is missing")
                continue
            if size != entry["size_bytes"]:
                problems.append(f"rank {entry['rank']}: object {entry['name']} is {size} bytes, manifest says {entry['size_bytes']}")
                continue
            files.download(entry["object_path"], directory / entry["name"])
        problems += check_files(directory, manifest) if not problems else []
        if cfg is not None:
            problems += check_model(manifest, cfg)
        if not problems:
            store.mark_verified(record.id, record.sha256)
    return manifest, problems


def consolidate(directory: str | Path, out: str | Path) -> Path:
    from torch.distributed.checkpoint.format_utils import dcp_to_torch_save

    directory = Path(directory)
    manifest = read_manifest(directory)
    problems = check_files(directory, manifest)
    if problems:
        raise CheckpointError(f"{directory} failed verification: " + "; ".join(problems))
    with tempfile.TemporaryDirectory() as tmp:
        flat = Path(tmp) / "flat.pt"
        dcp_to_torch_save(str(directory), str(flat))
        state = torch.load(flat, map_location="cpu", weights_only=True)
    kind = manifest["kind"] if manifest["kind"] in ("best", "base", "export") else "export"
    payload = {
        "format_version": CHECKPOINT_FORMAT_VERSION,
        "checkpoint_kind": kind,
        "run_name": manifest["run_name"],
        "task": manifest.get("task", ""),
        "architecture": manifest.get("architecture"),
        "parameters": manifest.get("parameters"),
        "config": manifest["config"],
        "tokenizer": manifest.get("tokenizer"),
        "model_state_dict": state["model"],
        "optimizer_state_dict": None,
        "scheduler_state_dict": None,
        "scaler_state_dict": None,
        "epoch": manifest["epoch"],
        "global_step": manifest["global_step"],
        "metrics": manifest.get("metrics") or {},
        "promotion": manifest.get("promotion"),
        "rng_state": None,
        "trainer_state": None,
        "torch_version": manifest.get("torch_version", ""),
        "created_at": manifest.get("created_at"),
        "extra": {"checkpoint_group_id": manifest["checkpoint_group_id"], "consolidated_from": manifest["label"]},
    }
    return write_payload(out, payload)


class DistributedCheckpointManager(CheckpointManager):

    def __init__(self, cfg: Config, env: DistEnv, remote: Any = None, control: Any = None) -> None:
        super().__init__(cfg, remote=remote)
        self.env = env
        self.control = control
        self.session_id: Optional[str] = None
        self.session_key = env.session_key
        self.last_group: Optional[Dict[str, str]] = None

    def pointer(self, kind: str) -> Path:
        return self.directory / f"{kind}.json"

    def current_group(self, kind: str) -> Optional[Dict[str, Any]]:
        path = self.pointer(kind)
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def history_files(self) -> List[Path]:
        return sorted(p.parent for p in (self.directory / "history").glob(f"checkpoint_*/{MANIFEST}"))

    def _status(self, status: str) -> None:
        if self.control is not None:
            self.control.set_status(status)

    def save_base_checkpoint(self, snapshot: Dict[str, Any]) -> Optional[Path]:
        if not self.settings.save_base:
            return None
        return self._save_group("base", snapshot, include_optimizer=False)

    def save_live_checkpoint(self, snapshot: Dict[str, Any]) -> Optional[Path]:
        path = self._save_group("live", snapshot)
        self.last_live_step = int(snapshot["global_step"])
        return path

    def save_history_checkpoint(self, snapshot: Dict[str, Any]) -> Optional[Path]:
        return self._save_group("history", snapshot)

    def evaluate_and_promote_best(self, metrics: Dict[str, Any], epoch: int,
                                  make_snapshot: Callable[[], Dict[str, Any]]) -> bool:
        decision = None
        if self.env.is_coordinator:
            value = self.rule.value(metrics)
            decision = {"better": self.rule.is_better(value, self.best_value), "value": value}
        decision = self.env.broadcast_object(decision)
        if not decision["better"]:
            return False
        self.best_value = decision["value"]
        self.best_epoch = epoch
        snapshot = make_snapshot()
        path = self._save_group("best", snapshot)
        if self.env.is_coordinator and path is not None:
            payload = build_payload(kind="best", **snapshot)
            payload["extra"] = {"checkpoint_group_id": self.last_group["group_id"]}
            write_payload(self.path("best"), payload)
        self.env.barrier()
        return True

    def export_model(self, source: str = "best") -> Optional[Path]:
        path = None
        if self.env.is_coordinator and self.path(source).exists():
            payload = load_checkpoint(self.path(source))
            label = f"checkpoint_epoch_{payload['epoch']:04d}_step_{payload['global_step']:08d}_{uuid.uuid4().hex[:8]}"
            directory = self.directory / "export" / label
            path = write_payload(directory / "model.pt", as_kind(payload, "export"))
            write_json(directory / MANIFEST, {
                "format_version": DISTRIBUTED_FORMAT_VERSION,
                "kind": "export",
                "label": label,
                "run_name": self.run_name,
                "epoch": payload["epoch"],
                "global_step": payload["global_step"],
                "source_group_id": (payload.get("extra") or {}).get("checkpoint_group_id"),
                "files": [{"name": "model.pt", "size_bytes": path.stat().st_size, "sha256": digest(path)}],
                "complete": True,
            })
            if self.remote is not None:
                store, files = self.remote
                try:
                    publish(store, files, path, CheckpointKind.EXPORT, self.run_name,
                            session_id=self.session_id, workdir=self.directory / ".upload",
                            object_path=f"{object_prefix(self.run_name, 'export', label)}/model.pt")
                except (StoreError, CheckpointError) as exc:
                    self.upload_errors.append(f"export: {exc}")
                    logger.error(f"  export upload failed (the local file is safe): {exc}")
        self.env.barrier()
        return path

    def _save_group(self, kind: str, snapshot: Dict[str, Any], include_optimizer: bool = True) -> Optional[Path]:
        env = self.env
        self._status("checkpointing")
        group_id = env.broadcast_object(str(uuid.uuid4()) if env.is_coordinator else None)
        epoch, step = int(snapshot["epoch"]), int(snapshot["global_step"])
        label = group_label(epoch, step, group_id)
        directory = self.directory / kind / label
        directory.mkdir(parents=True, exist_ok=True)

        model_state, optim_state = get_state_dict(snapshot["model"], snapshot["optimizer"])
        state = {"model": model_state}
        if include_optimizer:
            state["optimizer"] = optim_state
        dcp.save(state, checkpoint_id=str(directory))

        trainer_state = snapshot.get("trainer_state") or {}
        torch.save({
            "rank": env.rank,
            "world_size": env.world_size,
            "worker_id": env.worker_id,
            "hostname": env.hostname,
            "rng": capture_rng(),
            "train_sums": trainer_state.get("train_sums"),
            "batch_in_epoch": trainer_state.get("batch_in_epoch", 0),
        }, directory / rank_file(env.rank))

        entries = [{
            "rank": env.rank,
            "name": path.name,
            "object_path": f"{object_prefix(self.run_name, kind, label)}/{path.name}",
            "size_bytes": path.stat().st_size,
            "sha256": digest(path),
        } for path in own_files(directory, env.rank)]

        error = None
        if self.remote is not None:
            try:
                self._upload_shards(kind, group_id, directory, entries, snapshot)
            except (StoreError, OSError) as exc:
                error = f"rank {env.rank} ({env.hostname}): {exc}"
        reports = env.all_gather_object({
            "rank": env.rank, "hostname": env.hostname, "worker_id": env.worker_id,
            "entries": entries, "error": error,
        })

        outcome = None
        if env.is_coordinator:
            outcome = self._complete(kind, group_id, label, directory, snapshot, reports, include_optimizer)
        outcome = env.broadcast_object(outcome)

        if outcome["complete"]:
            self.last_group = {"group_id": group_id, "label": label, "kind": kind}
            if env.local_rank == 0:
                write_json(directory / MANIFEST, outcome["manifest"], tag=f"r{env.rank}")
                if kind in CURRENT_ROLES and outcome["make_current_locally"]:
                    write_json(self.pointer(kind), outcome["pointer"], tag=f"r{env.rank}")
            previous = outcome.get("previous")
            if previous and (kind == "best" or not self.settings.keep_superseded_live):
                self._remove_local_group(kind, previous)
        else:
            self.upload_errors.append(f"{kind} {label}: " + "; ".join(outcome["problems"]))
            if env.is_coordinator:
                logger.error(f"  {kind} checkpoint {label} is NOT complete, the previous one stays in use: "
                             + "; ".join(outcome["problems"]))
        env.barrier()
        self._status("training")
        return directory if outcome["complete"] else None

    def _complete(self, kind: str, group_id: str, label: str, directory: Path, snapshot: Dict[str, Any],
                  reports: List[Dict[str, Any]], include_optimizer: bool) -> Dict[str, Any]:
        env = self.env
        problems = [r["error"] for r in reports if r["error"]]
        entries = [e for r in reports for e in r["entries"]]
        manifest = self._manifest(kind, group_id, label, snapshot, reports, entries, include_optimizer)
        problems += [p for p in check_listing(manifest)]
        if problems:
            write_json(directory / INCOMPLETE, {"checkpoint_group_id": group_id, "kind": kind,
                                                "problems": problems, "at": now()})
            return {"complete": False, "problems": problems}

        make_current = True
        if self.remote is not None:
            write_json(directory / MANIFEST, manifest, tag="coordinator")
            try:
                make_current = self._finalize_remote(kind, group_id, label, directory / MANIFEST, manifest)
            except (StoreError, OSError) as exc:
                (directory / MANIFEST).unlink(missing_ok=True)
                write_json(directory / INCOMPLETE, {"checkpoint_group_id": group_id, "kind": kind,
                                                    "problems": [str(exc)], "at": now()})
                return {"complete": False, "problems": [f"finalize: {exc}"]}

        previous = self.current_group(kind) if kind in ("live", "best") and make_current else None
        pointer = {
            "group_id": group_id,
            "label": label,
            "kind": kind,
            "epoch": manifest["epoch"],
            "global_step": manifest["global_step"],
            "world_size": env.world_size,
            "created_at": manifest["created_at"],
        }
        return {
            "complete": True,
            "manifest": manifest,
            "pointer": pointer,
            "make_current_locally": make_current,
            "previous": previous["label"] if previous and previous["label"] != label else None,
        }

    def _manifest(self, kind: str, group_id: str, label: str, snapshot: Dict[str, Any],
                  reports: List[Dict[str, Any]], entries: List[Dict[str, Any]],
                  include_optimizer: bool) -> Dict[str, Any]:
        model = snapshot["model"]
        describe = getattr(model, "describe", None)
        return {
            "format": "ored-distributed-checkpoint",
            "format_version": DISTRIBUTED_FORMAT_VERSION,
            "checkpoint_group_id": group_id,
            "kind": kind,
            "label": label,
            "session_id": self.session_id,
            "session_key": self.session_key,
            "run_name": self.run_name,
            "model_version": self.run_name,
            "world_size": self.env.world_size,
            "epoch": int(snapshot["epoch"]),
            "global_step": int(snapshot["global_step"]),
            "metrics": clean_metrics(snapshot.get("metrics")),
            "promotion": json_ready(snapshot.get("promotion")),
            "task": str(snapshot["config"].get("task", "")),
            "architecture": architecture_of(model),
            "parameters": describe().get("parameters") if callable(describe) else None,
            "tokenizer": snapshot.get("tokenizer"),
            "config": json_ready(snapshot["config"]),
            "scheduler_state": json_ready(snapshot.get("scheduler_state")),
            "trainer_state": json_ready({k: v for k, v in (snapshot.get("trainer_state") or {}).items()
                                         if k not in ("train_sums", "epoch_generator_state")}),
            "contents": ["model", "optimizer"] if include_optimizer else ["model"],
            "torch_version": str(torch.__version__),
            "created_at": now(),
            "workers": [{"rank": r["rank"], "hostname": r["hostname"], "worker_id": r["worker_id"]}
                        for r in sorted(reports, key=lambda r: r["rank"])],
            "shards": sorted(entries, key=lambda e: (e["rank"], e["name"])),
            "complete": True,
        }

    def _shard_record(self, kind: str, group_id: str, entry: Dict[str, Any], snapshot: Dict[str, Any]) -> Checkpoint:
        store, files = self.remote
        return Checkpoint(
            kind=CheckpointKind(kind),
            run_name=self.run_name,
            session_id=self.session_id,
            bucket_id=files.bucket,
            object_path=entry["object_path"],
            size_bytes=entry["size_bytes"],
            sha256=entry["sha256"],
            format_version=DISTRIBUTED_FORMAT_VERSION,
            torch_version=str(torch.__version__),
            epoch=int(snapshot["epoch"]),
            global_step=int(snapshot["global_step"]),
            part=CheckpointPart.SHARD,
            checkpoint_group_id=group_id,
            rank=self.env.rank,
            world_size=self.env.world_size,
            is_complete=False,
            upload_status="uploading",
            promotion_metric=self.rule.metric if kind == "best" else None,
            promotion_mode=self.rule.mode if kind == "best" else None,
        )

    def _upload_shards(self, kind: str, group_id: str, directory: Path,
                       entries: List[Dict[str, Any]], snapshot: Dict[str, Any]) -> None:
        store, files = self.remote
        for entry in entries:
            record = store.register_checkpoint(self._shard_record(kind, group_id, entry, snapshot))
            try:
                upload_verified(files, directory / entry["name"], entry["object_path"], entry["sha256"],
                                rehash=True, workdir=self.directory / ".upload")
            except StoreError:
                store.set_shard_status(record.id, "failed")
                raise
            store.set_shard_status(record.id, "verified")

    def _finalize_remote(self, kind: str, group_id: str, label: str, manifest_path: Path,
                         manifest: Dict[str, Any]) -> bool:
        store, files = self.remote
        object_path = f"{object_prefix(self.run_name, kind, label)}/{MANIFEST}"
        sha256 = digest(manifest_path)
        upload_verified(files, manifest_path, object_path, sha256, workdir=self.directory / ".upload")
        role = CheckpointKind(kind)
        current = store.current_checkpoint(self.run_name, role) if role is not CheckpointKind.HISTORY else None
        make_current = role is not CheckpointKind.HISTORY
        if role is CheckpointKind.BASE and current is not None:
            make_current = False
            logger.info(f"  run {self.run_name} already has a base in Supabase; this one is kept, not current")
        if role is CheckpointKind.BEST and current is not None and not self.rule.is_better(
                self.rule.value(manifest["metrics"]), self.rule.value(current.metrics)):
            make_current = False
            logger.info("  Supabase already holds a better best; this one is kept, not current")
        record = Checkpoint(
            kind=role,
            run_name=self.run_name,
            session_id=self.session_id,
            bucket_id=files.bucket,
            object_path=object_path,
            size_bytes=manifest_path.stat().st_size,
            sha256=sha256,
            format_version=DISTRIBUTED_FORMAT_VERSION,
            torch_version=str(torch.__version__),
            epoch=manifest["epoch"],
            global_step=manifest["global_step"],
            metrics=manifest["metrics"],
            part=CheckpointPart.MANIFEST,
            checkpoint_group_id=group_id,
            world_size=manifest["world_size"],
            promotion_metric=self.rule.metric if role is CheckpointKind.BEST else None,
            promotion_mode=self.rule.mode if role is CheckpointKind.BEST else None,
            verified_at=now(),
        )
        try:
            store.finalize_group(group_id, record, make_current=make_current,
                                 replaces=current.id if make_current and current else None)
        except StoreError:
            try:
                files.remove(object_path)
            except StoreError:
                pass
            raise
        logger.info(f"  {kind} checkpoint {label}: {manifest['world_size']} ranks verified, "
                    f"{'now current' if make_current else 'recorded'} in Supabase")
        if role is CheckpointKind.LIVE and make_current and current is not None \
                and not self.settings.keep_superseded_live:
            try:
                delete_checkpoint(store, files, current.id)
            except StoreError as exc:
                logger.error(f"  could not remove the superseded live {current.object_path}: {exc}")
        return make_current

    def _remove_local_group(self, kind: str, label: str) -> None:
        directory = self.directory / kind / label
        for path in own_files(directory, self.env.rank):
            path.unlink(missing_ok=True)
        self.env.barrier()
        if self.env.local_rank == 0 and directory.is_dir():
            shutil.rmtree(directory, ignore_errors=True)

    def resume_group(self, model: torch.nn.Module, optimizer: torch.optim.Optimizer,
                     tokenizer: Optional[Dict[str, Any]], kind: str = "live"
                     ) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]], Path]:
        env = self.env
        info = None
        if env.is_coordinator:
            try:
                info = self._locate(kind)
            except (StoreError, CheckpointError) as exc:
                info = {"error": str(exc)}
        info = env.broadcast_object(info)
        if info is None:
            where = "Supabase or " if self.remote is not None else ""
            raise NoResumableCheckpoint(
                f"There is no {kind} checkpoint for run {self.run_name!r} in {where}{self.directory}.\n"
                f"Leave training.resume empty to start a fresh run."
            )
        if "error" in info:
            raise CheckpointError(info["error"])

        directory = self.directory / kind / info["label"]
        problem = None
        try:
            self._ensure_local(info, directory)
            manifest = read_manifest(directory)
            check_compatible(manifest_as_payload(manifest), model, path=str(directory),
                             expected_kind=kind, tokenizer=tokenizer)
            if manifest["world_size"] != env.world_size and not manifest["trainer_state"].get("epoch_complete", True):
                raise CheckpointError(
                    f"{info['label']} was saved by {manifest['world_size']} workers in the middle of epoch "
                    f"{manifest['epoch']}. Each worker's position in that epoch depends on the worker count, so "
                    f"it can only resume with {manifest['world_size']} workers. Resume with "
                    f"{manifest['world_size']} workers, or wait for a live saved at the end of an epoch."
                )
        except (CheckpointError, StoreError, OSError) as exc:
            problem = f"rank {env.rank} ({env.hostname}): {exc}"
        problems = [p for p in env.all_gather_object(problem) if p]
        if problems:
            raise CheckpointError(f"cannot resume from {kind} {info['label']}:\n  " + "\n  ".join(problems))

        env.barrier()
        model_state, optim_state = get_state_dict(model, optimizer)
        state = {"model": model_state}
        if "optimizer" in manifest.get("contents", []):
            state["optimizer"] = optim_state
        dcp.load(state, checkpoint_id=str(directory))
        set_state_dict(model, optimizer, model_state_dict=state["model"],
                       optim_state_dict=state.get("optimizer", optim_state))

        rank_state = None
        rank_path = directory / rank_file(env.rank)
        if manifest["world_size"] == env.world_size and rank_path.is_file():
            rank_state = torch.load(rank_path, map_location="cpu", weights_only=True)
        env.barrier()
        return manifest, rank_state, directory

    def _locate(self, kind: str) -> Optional[Dict[str, Any]]:
        if self.remote is not None:
            store, _ = self.remote
            record = store.current_checkpoint(self.run_name, CheckpointKind(kind))
            if record is not None:
                if record.part is not CheckpointPart.MANIFEST:
                    raise CheckpointError(
                        f"the current {kind} of run {self.run_name!r} is a single-PC checkpoint file "
                        f"({record.object_path}). Start the distributed run from it with --init-from "
                        f"<that file> instead of resuming."
                    )
                return {"label": Path(record.object_path).parent.name, "group_id": record.checkpoint_group_id,
                        "manifest_object": record.object_path, "manifest_sha": record.sha256, "remote": True}
        pointer = self.current_group(kind)
        if pointer is None:
            return None
        return {"label": pointer["label"], "group_id": pointer["group_id"], "remote": False}

    def _download(self, object_path: str, target: Path, sha256: str) -> None:
        _, files = self.remote
        tmp = target.with_name(f".{target.name}.{self.env.rank}.download")
        files.download(object_path, tmp)
        if digest(tmp) != sha256:
            tmp.unlink(missing_ok=True)
            raise StoreError(f"{object_path} failed its sha256 check after download")
        os.replace(tmp, target)

    def _ensure_local(self, info: Dict[str, Any], directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        manifest_path = directory / MANIFEST
        if info.get("remote"):
            if not manifest_path.is_file() or digest(manifest_path) != info["manifest_sha"]:
                self._download(info["manifest_object"], manifest_path, info["manifest_sha"])
        manifest = read_manifest(directory)
        missing = []
        for entry in manifest["shards"]:
            path = directory / entry["name"]
            if path.is_file() and path.stat().st_size == entry["size_bytes"] and digest(path) == entry["sha256"]:
                continue
            if info.get("remote"):
                self._download(entry["object_path"], path, entry["sha256"])
            else:
                missing.append(entry["name"])
        if missing:
            raise CheckpointError(
                f"{len(missing)} file(s) of this checkpoint are not on this PC ({', '.join(missing[:4])}"
                f"{' ...' if len(missing) > 4 else ''}). Every PC needs every shard to resume: turn on "
                f"checkpoint.upload (Supabase) or put paths.checkpoint_dir on a folder all PCs share."
            )


def check_listing(manifest: Dict[str, Any]) -> List[str]:
    problems = []
    names = {e["name"] for e in manifest["shards"]}
    ranks = {e["rank"] for e in manifest["shards"]}
    if ranks != set(range(manifest["world_size"])):
        problems.append(f"shards reported by ranks {sorted(ranks)}, expected 0..{manifest['world_size'] - 1}")
    if METADATA not in names:
        problems.append("rank 0 did not write the DCP .metadata file")
    for rank in range(manifest["world_size"]):
        if rank_file(rank) not in names:
            problems.append(f"rank {rank} did not write {rank_file(rank)}")
    return problems
