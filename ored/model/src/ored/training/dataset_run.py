from __future__ import annotations

import os
from typing import Any, Dict, Optional, Tuple

from ored.config import Config
from ored.data.snapshot import (
    PreparedDataset,
    SnapshotError,
    dataset_files_from_env,
    describe_snapshot,
    prepare_dataset,
)
from ored.learning.registry import PromotionError
from ored.learning.store import StoreError
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)


def supabase_from_env(required: bool) -> Tuple[Any, Any]:
    from ored.learning.supabase_store import SupabaseStore

    if not (os.environ.get("ORED_SB_URL") and os.environ.get("ORED_SB_SERVICE_KEY")):
        if required:
            raise SnapshotError(
                "data.source is supabase: set ORED_SB_URL and ORED_SB_SERVICE_KEY (server side only) "
                "so the trainer can read ored_training_data")
        return None, None
    return SupabaseStore.from_env(), dataset_files_from_env()


def pin_resumed_snapshot(cfg: Config) -> None:
    settings = cfg.data.supabase
    if settings.snapshot or cfg.training.resume != "live":
        return
    live = cfg.checkpoint_dir / "live.pt"
    if not live.is_file():
        return
    from ored.utils.checkpoint import load_checkpoint

    saved = ((load_checkpoint(live).get("config") or {}).get("data") or {}).get("supabase") or {}
    if saved.get("snapshot") and saved.get("dataset_tag") == settings.dataset_tag:
        settings.snapshot = saved["snapshot"]
        logger.info(f"resuming live: training continues on the snapshot it started with, {settings.snapshot[:16]}")


def session_config(cfg: Config, prepared: PreparedDataset) -> Dict[str, Any]:
    config = cfg.to_dict()
    config["dataset"] = prepared.link()
    return config


def best_metrics(result: Dict[str, Any], trainer: Any) -> Dict[str, float]:
    last = result["history"][-1] if result["history"] else {}
    metrics: Dict[str, float] = {
        "epochs": float(len(result["history"])),
        "global_step": float(trainer.global_step),
        "best_epoch": float(result["best_epoch"]),
        "upload_errors": float(len(result.get("upload_errors") or [])),
    }
    if result.get("best_value") is not None:
        metrics[str(result["best_metric"])] = float(result["best_value"])
    for key, value in last.items():
        if isinstance(value, (int, float)) and key != "epoch":
            metrics[f"last_{key}"] = float(value)
    return metrics


def record_candidate_version(store: Any, session: Any, cfg: Config, prepared: PreparedDataset) -> Optional[Any]:
    from ored.learning.records import CheckpointKind
    from ored.learning.registry import record_version

    bests = [c for c in store.checkpoints(CheckpointKind.BEST, run_name=cfg.run_name, logical=True)
             if c.session_id == session.id]
    if not bests:
        logger.info("model version : none recorded -- Supabase kept an earlier best, so this session "
                    "produced no best checkpoint of its own")
        return None
    best = bests[-1]
    dataset = prepared.dataset
    notes = (f"trained on {prepared.snapshot.tag}"
             + (f" v{dataset.version}" if dataset is not None else "")
             + f" (snapshot {prepared.snapshot.sha256[:16]}, {prepared.snapshot.record_count} records)")
    version = record_version(store, f"{cfg.run_name}-{session.id[:8]}", session,
                             f"{best.bucket_id}/{best.object_path}", notes)
    logger.info(f"model version : {version.version} (candidate; promote it deliberately, never automatically)")
    return version


def run_supabase_training(cfg: Config) -> Dict[str, Any]:
    from ored.learning import sessions
    from ored.training.trainer import Trainer

    pin_resumed_snapshot(cfg)
    store, files = supabase_from_env(required=not cfg.data.supabase.snapshot)
    prepared = prepare_dataset(cfg, store, files, upload=cfg.checkpoint.upload)

    logger.info(section("TRAINING DATA SNAPSHOT"))
    for line in describe_snapshot(prepared):
        logger.info(line)

    session = None
    if store is not None:
        session = sessions.queue(
            store,
            dataset_tag=prepared.snapshot.tag,
            config=session_config(cfg, prepared),
            example_count=prepared.snapshot.record_count,
            conversation_count=0,
            base_version=(f"{cfg.run_name}:live" if cfg.training.resume == "live"
                          else cfg.training.resume) or None,
            run_name=cfg.run_name,
            dataset_id=prepared.dataset.id if prepared.dataset is not None else None,
        )
        session = sessions.start(store, session)
        logger.info(f"session       : {session.id} (ored_training_sessions, running)")
    else:
        logger.info("session       : not recorded -- Supabase is not configured on this machine")

    try:
        trainer = Trainer(cfg)
        trainer.dataset_link = prepared.link()
        if session is not None:
            trainer.checkpoints.session_id = session.id
        result = trainer.fit()
    except KeyboardInterrupt:
        if session is not None:
            sessions.cancel(store, session, "stopped by hand")
        raise
    except BaseException as exc:
        if session is not None:
            sessions.fail(store, session, f"{type(exc).__name__}: {exc}")
        raise

    result["dataset"] = prepared.link()
    if session is not None:
        session = sessions.finish(store, session, best_metrics(result, trainer))
        result["session_id"] = session.id
        logger.info(f"session       : {session.id} evaluated")
        if cfg.checkpoint.upload:
            try:
                version = record_candidate_version(store, session, cfg, prepared)
                result["model_version"] = version.version if version is not None else None
            except (StoreError, PromotionError) as exc:
                result["model_version"] = None
                logger.error(f"model version : not recorded ({exc}); the session and checkpoints are recorded")
    return result


def lineage_of_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    dataset = dict((payload.get("extra") or {}).get("dataset") or {})
    data = (payload.get("config") or {}).get("data") or {}
    if not dataset and data.get("source") == "supabase":
        dataset = {"source": "supabase", "dataset_tag": (data.get("supabase") or {}).get("dataset_tag"),
                   "snapshot_sha256": (data.get("supabase") or {}).get("snapshot")}
    if not dataset:
        dataset = {"source": data.get("source") or "generated", "corpus_dir": (data.get("corpus") or {}).get("dir")}
    return dataset
