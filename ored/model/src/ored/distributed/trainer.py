from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

import torch
import torch.nn as nn
from torch.nn.parallel import DistributedDataParallel
from torch.utils.data import DataLoader, Subset
from torch.utils.data.distributed import DistributedSampler

from ored.config import Config
from ored.distributed.checkpoint import DistributedCheckpointManager
from ored.distributed.control import ControlPlane
from ored.distributed.env import DistEnv, DistributedError, check_membership
from ored.distributed.metrics import reduce_metrics
from ored.training.metrics import MetricAccumulator
from ored.training.trainer import Trainer
from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)


def per_worker_batch_size(cfg: Config, world_size: int) -> int:
    if cfg.distributed.batch_size_mode == "per_worker":
        return cfg.data.batch_size
    if cfg.data.batch_size % world_size:
        valid = [n for n in range(1, cfg.data.batch_size + 1) if cfg.data.batch_size % n == 0]
        raise DistributedError(
            f"distributed.batch_size_mode is global, so data.batch_size {cfg.data.batch_size} must split "
            f"evenly over {world_size} workers. Worker counts that fit: {valid}. Or use "
            f"batch_size_mode: per_worker (global batch = {cfg.data.batch_size} x workers)."
        )
    return cfg.data.batch_size // world_size


def quiet_other_ranks(env: DistEnv) -> None:
    if not env.is_coordinator:
        logging.getLogger("ored").setLevel(logging.WARNING)


class DistributedTrainer(Trainer):

    def __init__(self, cfg: Config, env: DistEnv, control: Optional[ControlPlane] = None,
                 remote: Any = None) -> None:
        self.env = env
        self.control = control or ControlPlane()
        self.remote = remote
        self.eval_tokens: Dict[str, int] = {}
        super().__init__(cfg)
        self.checkpoints.session_id = self.control.session_id

    def _select_device(self) -> torch.device:
        return self.env.select_device(self.cfg.training.device)

    def _prepare_loaders(self) -> None:
        env, cfg = self.env, self.cfg
        self.batch_size = per_worker_batch_size(cfg, env.world_size)
        train = self.datasets["train"]
        self.sampler = DistributedSampler(
            train, num_replicas=env.world_size, rank=env.rank,
            shuffle=cfg.data.shuffle_train, seed=cfg.seed, drop_last=False,
        )
        self.loaders["train"] = DataLoader(train, batch_size=self.batch_size, sampler=self.sampler, drop_last=False)
        for split in ("val", "test"):
            dataset = self.datasets[split]
            shard = Subset(dataset, list(range(env.rank, len(dataset), env.world_size)))
            size = self.loaders[split].batch_size or cfg.data.batch_size
            self.loaders[split] = DataLoader(shard, batch_size=size, shuffle=False)
        check_membership(env, cfg, self.data_signature())

    def data_signature(self) -> Dict[str, Any]:
        signature: Dict[str, Any] = {split: len(self.datasets[split]) for split in ("train", "val", "test")}
        tokenizer = self.task.checkpoint_extra().get("tokenizer")
        if tokenizer:
            signature["tokenizer"] = hashlib.sha256(
                json.dumps(tokenizer, sort_keys=True).encode()).hexdigest()[:16]
        return signature

    def _wrap_model(self, model: nn.Module) -> nn.Module:
        torch.manual_seed(self.cfg.seed + self.env.rank)
        device_ids = [self.env.local_rank] if self.device.type == "cuda" else None
        return DistributedDataParallel(model, device_ids=device_ids)

    def _build_checkpoints(self) -> DistributedCheckpointManager:
        return DistributedCheckpointManager(self.cfg, self.env, remote=self.remote, control=self.control)

    def _before_epoch(self) -> None:
        self.sampler.set_epoch(self.epoch)

    def _train_one_epoch(self) -> Dict[str, float]:
        self.control.set_status("training")
        super()._train_one_epoch()
        return reduce_metrics(self.env, self.train_metrics, self.cfg.task)

    @torch.no_grad()
    def evaluate(self, split: str) -> Dict[str, float]:
        self.model.eval()
        metrics = MetricAccumulator()
        tokens = 0
        for batch in self.loaders[split]:
            loss, extra, batch_size = self.task.compute_loss(self.model, batch, self.device)
            metrics.update(batch_size=batch_size, loss=loss.item(), **extra)
            if self.cfg.task == "language_model":
                tokens += int(batch[1].numel())
        return reduce_metrics(self.env, metrics, self.cfg.task, tokens)

    def _warm_start(self, path: str) -> None:
        problem = None
        try:
            super()._warm_start(path)
        except (FileNotFoundError, ValueError) as exc:
            problem = f"rank {self.env.rank} ({self.env.hostname}): {exc}"
        problems = [p for p in self.env.all_gather_object(problem) if p]
        if problems:
            raise DistributedError(
                f"--init-from {path} must exist, and fit this model, on every PC:\n  " + "\n  ".join(problems))

    def _resume_live(self) -> None:
        manifest, rank_state, directory = self.checkpoints.resume_group(
            self.model, self.optimizer, self._tokenizer(), kind="live")
        self._log_config_drift(manifest.get("config") or {})
        payload = {
            "global_step": manifest["global_step"],
            "epoch": manifest["epoch"],
            "trainer_state": manifest["trainer_state"],
            "promotion": manifest.get("promotion"),
        }
        rng = rank_state["rng"] if rank_state else None
        sums = rank_state.get("train_sums") if rank_state else None
        self._restore_loop_state(payload, rng, str(directory), train_sums=sums)
        if rank_state is None:
            torch.manual_seed(self.cfg.seed + self.env.rank + self.global_step)
            if self.env.is_coordinator:
                logger.info(f"worker count changed ({manifest['world_size']} -> {self.env.world_size}): "
                            f"model and optimizer restored, each worker's random stream reseeded")
        self.resumed_from += f", saved by {manifest['world_size']} workers"

    def _save_history(self) -> Path:
        path = self.checkpoint_dir / "history.json"
        if self.env.is_coordinator:
            return super()._save_history()
        return path

    def _log_run_header(self) -> None:
        super()._log_run_header()
        env = self.env
        logger.info(f"DISTRIBUTED       : {env.world_size} workers on {env.nnodes} node(s), backend "
                    f"{env.backend}, session {env.session_key!r}")
        logger.info(f"  batch           : {self.batch_size} per worker, {self.batch_size * env.world_size} "
                    f"per optimizer step ({self.cfg.distributed.batch_size_mode})")
        logger.info(f"  data            : {len(self.sampler)} training examples per worker per epoch "
                    f"(DistributedSampler), validation split {env.world_size} ways")
        logger.info("-" * 78)

    def fit(self) -> Dict[str, Any]:
        result = super().fit()
        result["world_size"] = self.env.world_size
        return result

