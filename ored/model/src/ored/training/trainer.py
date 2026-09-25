from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from ored.config import Config, load_config
from ored.training.checkpoints import CheckpointManager, capture_rng, restore_rng
from ored.training.metrics import MetricAccumulator
from ored.training.schedules import build_schedule
from ored.training.tasks import build_task
from ored.utils.checkpoint import check_compatible, load_checkpoint, load_model_state
from ored.utils.logging_utils import get_logger, section
from ored.utils.seed import resolve_device, set_seed
from ored.utils.weight_stats import (
    format_weight_change,
    snapshot_parameters,
    summarise_weight_change,
)

logger = get_logger(__name__)


def build_criterion(name: str) -> nn.Module:
    losses = {
        "bce_with_logits": nn.BCEWithLogitsLoss,
        "mse": nn.MSELoss,
        "cross_entropy": nn.CrossEntropyLoss,
    }
    key = name.lower()
    if key not in losses:
        raise ValueError(f"unknown loss {name!r}; available: {sorted(losses)}")
    return losses[key]()


def build_optimizer(name: str, model: nn.Module, lr: float, weight_decay: float) -> torch.optim.Optimizer:
    optimizers = {
        "adam": torch.optim.Adam,
        "adamw": torch.optim.AdamW,
        "sgd": torch.optim.SGD,
    }
    key = name.lower()
    if key not in optimizers:
        raise ValueError(f"unknown optimizer {name!r}; available: {sorted(optimizers)}")
    return optimizers[key](model.parameters(), lr=lr, weight_decay=weight_decay)


def _format_metric(name: str, value: float) -> str:
    if name.endswith("acc"):
        return f"{value:6.1%}"
    return f"{value:.4f}"


def _legend(metric_names: List[str]) -> str:
    known = {
        "bit_acc": "bit-acc = individual output bits correct",
        "exact_acc": "exact-acc = every bit correct (the real score)",
        "bpc": "bpc = bits per character (5.3 = knows nothing, 1.0 = knows words, lower is better)",
        "ppl": "ppl = perplexity, how many characters it is still choosing between",
    }
    parts = [known.get(name, name) for name in metric_names]
    return "; ".join(parts) if parts else "loss only"


def _describe_architecture(description: Dict[str, Any]) -> str:
    if description["type"] == "MLP":
        hidden = " -> ".join(str(h) for h in description["hidden_sizes"])
        return (f"MLP {description['input_size']} -> {hidden} -> "
                f"{description['output_size']} ({description['activation']})")
    if description["type"] == "Transformer":
        return (f"Transformer {description['n_layer']} layers x "
                f"{description['n_head']} heads, d_model {description['d_model']}, "
                f"d_ff {description['d_ff']}, block {description['block_size']}, "
                f"vocab {description['vocab_size']}")
    if description["type"] == "BigramLanguageModel":
        return f"Bigram lookup table, vocab {description['vocab_size']} (baseline)"
    return str(description)


class Trainer:

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

        set_seed(cfg.seed, cfg.deterministic)
        self.device = self._select_device()

        self.task = build_task(cfg)

        self.generator = torch.Generator()
        self.generator.manual_seed(cfg.seed)
        self.loaders, self.datasets = self.task.build_data(generator=self.generator)
        self._prepare_loaders()

        self.model = self.task.build_model().to(self.device)

        self.criterion = self.task.criterion
        self.optimizer = build_optimizer(
            cfg.training.optimizer,
            self.model,
            cfg.training.learning_rate,
            cfg.training.weight_decay,
        )
        self.forward_model = self._wrap_model(self.model)

        self.schedule = build_schedule(cfg.training.scheduler)
        self.steps_per_epoch = max(1, len(self.loaders["train"]))
        self.total_steps = self.steps_per_epoch * cfg.training.epochs
        self.global_step = 0
        self.current_lr = cfg.training.learning_rate

        self.history: List[Dict[str, float]] = []
        self.best_val_loss = float("inf")
        self.epochs_without_improvement = 0
        self.checkpoint_dir = cfg.checkpoint_dir
        self.checkpoints = self._build_checkpoints()

        self.epoch = 0
        self.start_epoch = 1
        self.batch_in_epoch = 0
        self.epoch_complete = True
        self.epoch_generator_state = self.generator.get_state()
        self.train_metrics = MetricAccumulator()
        self._resume_rng: Optional[Dict[str, Any]] = None

        self.resumed_from = ""
        self.resumed_live = False
        if cfg.training.resume == "live":
            self._resume_live()
        elif cfg.training.resume:
            self._warm_start(cfg.training.resume)

        self.initial_parameters = snapshot_parameters(self.model)

    def _select_device(self) -> torch.device:
        return resolve_device(self.cfg.training.device)

    def _prepare_loaders(self) -> None:
        pass

    def _wrap_model(self, model: nn.Module) -> nn.Module:
        return model

    def _build_checkpoints(self) -> CheckpointManager:
        return CheckpointManager.for_training(self.cfg)

    def _before_epoch(self) -> None:
        pass

    @property
    def best_epoch(self) -> int:
        return self.checkpoints.best_epoch

    def _tokenizer(self) -> Optional[Dict[str, Any]]:
        return self.task.checkpoint_extra().get("tokenizer")

    def _warm_start(self, path: str) -> None:
        payload = load_checkpoint(path, map_location=self.device)
        check_compatible(payload, self.model, path=path, tokenizer=self._tokenizer())
        load_model_state(self.model, payload["model_state_dict"], path)
        if payload.get("optimizer_state_dict") is not None:
            self.optimizer.load_state_dict(payload["optimizer_state_dict"])
        self.resumed_from = f"{path} (warm start from epoch {payload.get('epoch')})"

    def _resume_live(self) -> None:
        payload = self.checkpoints.load_live_checkpoint(map_location=self.device)
        path = payload["_path"]
        check_compatible(payload, self.model, path=path, expected_kind="live",
                         tokenizer=self._tokenizer())
        load_model_state(self.model, payload["model_state_dict"], path)
        self.optimizer.load_state_dict(payload["optimizer_state_dict"])
        self._log_config_drift(payload.get("config") or {})

        self._restore_loop_state(payload, payload.get("rng_state"), path)

    def _restore_loop_state(self, payload: Dict[str, Any], rng_state: Optional[Dict[str, Any]],
                            path: str, train_sums: Optional[Dict[str, Any]] = None) -> None:
        state = payload["trainer_state"]
        self.global_step = int(payload["global_step"])
        self.epoch = int(payload["epoch"])
        self.history = [dict(r) for r in state.get("history", [])]
        best_val_loss = state.get("best_val_loss")
        self.best_val_loss = float("inf") if best_val_loss is None else float(best_val_loss)
        self.epochs_without_improvement = int(state.get("epochs_without_improvement", 0))
        self.current_lr = float(state.get("current_lr", self.current_lr))

        promotion = payload.get("promotion") or {}
        if promotion.get("metric") == self.checkpoints.rule.metric and promotion.get("mode") == self.checkpoints.rule.mode:
            self.checkpoints.best_value = promotion.get("value")
            self.checkpoints.best_epoch = int(promotion.get("epoch") or 0)
        else:
            logger.info(
                f"the checkpoint's best was chosen by {promotion.get('metric')}/{promotion.get('mode')}, "
                f"this run uses {self.checkpoints.rule.describe()}: best restarts from here"
            )

        complete = state.get("epoch_complete", True)
        if complete:
            self.start_epoch = self.epoch + 1
            self.batch_in_epoch = 0
            restore_rng(rng_state, self.generator)
        else:
            self.start_epoch = self.epoch
            self.batch_in_epoch = int(state.get("batch_in_epoch", 0))
            if state.get("epoch_generator_state") is not None:
                self.generator.set_state(state["epoch_generator_state"])
            self._resume_rng = rng_state
            sums = train_sums if train_sums is not None else (state.get("train_sums") or {})
            self.train_metrics = MetricAccumulator(
                int(sums.get("total_examples", 0)), dict(sums.get("sums", {}))
            )
        self.checkpoints.last_live_step = self.global_step
        self.resumed_live = True
        where = (f"end of epoch {self.epoch}" if complete
                 else f"epoch {self.epoch}, batch {self.batch_in_epoch}")
        self.resumed_from = f"{path} ({where}, step {self.global_step:,})"

    def _log_config_drift(self, saved: Dict[str, Any]) -> None:
        def flat(d: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
            out: Dict[str, Any] = {}
            for k, v in d.items():
                key = f"{prefix}{k}"
                out.update(flat(v, key + ".") if isinstance(v, dict) else {key: v})
            return out

        before, after = flat(saved), flat(self.cfg.to_dict())
        changed = sorted(k for k in after if k in before and before[k] != after[k]
                         and k != "training.resume")
        if changed:
            logger.info(f"resuming with changed settings: {', '.join(changed)}")

    def _trainer_state(self) -> Dict[str, Any]:
        return {
            "history": self.history,
            "best_val_loss": self.best_val_loss,
            "epochs_without_improvement": self.epochs_without_improvement,
            "epoch_complete": self.epoch_complete,
            "batch_in_epoch": self.batch_in_epoch,
            "epoch_generator_state": self.epoch_generator_state,
            "train_sums": {
                "total_examples": self.train_metrics.total_examples,
                "sums": dict(self.train_metrics.sums),
            },
            "current_lr": self.current_lr,
        }

    def snapshot(self, metrics: Dict[str, float]) -> Dict[str, Any]:
        cfg = self.cfg.training
        return {
            "model": self.model,
            "config": self.cfg.to_dict(),
            "epoch": self.epoch,
            "global_step": self.global_step,
            "metrics": {k: v for k, v in metrics.items() if k != "epoch"},
            "optimizer": self.optimizer,
            "scheduler_state": {
                "name": cfg.scheduler,
                "current_lr": self.current_lr,
                "total_steps": self.total_steps,
                "warmup_steps": cfg.warmup_steps,
                "min_lr_ratio": cfg.min_lr_ratio,
            },
            "rng_state": capture_rng(self.generator),
            "trainer_state": self._trainer_state(),
            "tokenizer": self._tokenizer(),
            "promotion": self.checkpoints.promotion(),
        }

    def _step_metrics(self) -> Dict[str, float]:
        partial = {f"train_{k}": v for k, v in self.train_metrics.compute().items()}
        partial["lr"] = self.current_lr
        return partial

    def _train_one_epoch(self) -> Dict[str, float]:
        self.forward_model.train()
        self._before_epoch()
        skip = self.batch_in_epoch
        if skip == 0:
            self.train_metrics = MetricAccumulator()
            self.epoch_generator_state = self.generator.get_state()
        self.epoch_complete = False

        for index, batch in enumerate(self.loaders["train"]):
            if index < skip:
                continue
            if self._resume_rng is not None:
                restore_rng(self._resume_rng)
                self._resume_rng = None

            self._apply_learning_rate()

            self.optimizer.zero_grad(set_to_none=True)

            loss, extra, batch_size = self.task.compute_loss(self.forward_model, batch, self.device)

            loss.backward()

            if self.cfg.training.grad_clip and self.cfg.training.grad_clip > 0:
                nn.utils.clip_grad_norm_(self.model.parameters(), self.cfg.training.grad_clip)

            self.optimizer.step()
            self.global_step += 1
            self.batch_in_epoch = index + 1

            self.train_metrics.update(batch_size=batch_size, loss=loss.item(), **extra)

            if self.checkpoints.history_due(step=self.global_step):
                self.checkpoints.save_history_checkpoint(self.snapshot(self._step_metrics()))
            if self.checkpoints.live_due(step=self.global_step):
                self.checkpoints.save_live_checkpoint(self.snapshot(self._step_metrics()))

        if self._resume_rng is not None:
            restore_rng(self._resume_rng)
            self._resume_rng = None
        self.batch_in_epoch = 0
        self.epoch_complete = True
        return self.train_metrics.compute()

    def _apply_learning_rate(self) -> None:
        multiplier = self.schedule(
            self.global_step,
            self.total_steps,
            self.cfg.training.warmup_steps,
            self.cfg.training.min_lr_ratio,
        )
        self.current_lr = self.cfg.training.learning_rate * multiplier
        for group in self.optimizer.param_groups:
            group["lr"] = self.current_lr

    @torch.no_grad()
    def evaluate(self, split: str) -> Dict[str, float]:
        loader: DataLoader = self.loaders[split]
        self.model.eval()
        metrics = MetricAccumulator()

        for batch in loader:
            loss, extra, batch_size = self.task.compute_loss(self.model, batch, self.device)
            metrics.update(batch_size=batch_size, loss=loss.item(), **extra)

        return metrics.compute()

    def fit(self) -> Dict[str, Any]:
        cfg = self.cfg
        self._log_run_header()

        if not self.resumed_live:
            self.checkpoints.save_base_checkpoint(self.snapshot({}))

        started = time.time()
        stopped_early = False
        patience = cfg.training.early_stopping_patience

        for epoch in range(self.start_epoch, cfg.training.epochs + 1):
            if patience and self.epochs_without_improvement >= patience:
                stopped_early = True
                break
            self.epoch = epoch
            train_metrics = self._train_one_epoch()
            val_metrics = self.evaluate("val")

            record: Dict[str, float] = {"epoch": epoch, "lr": self.current_lr}
            for key, value in train_metrics.items():
                record[f"train_{key}"] = value
            for key, value in val_metrics.items():
                record[f"val_{key}"] = value
            self.history.append(record)

            improved = self.checkpoints.evaluate_and_promote_best(
                record, epoch, lambda: self.snapshot(record)
            )
            if improved:
                self.best_val_loss = val_metrics["loss"]
                self.epochs_without_improvement = 0
            else:
                self.epochs_without_improvement += 1

            if self.checkpoints.history_due(epoch=epoch):
                self.checkpoints.save_history_checkpoint(self.snapshot(record))
            if self.checkpoints.live_due(epoch=epoch):
                self.checkpoints.save_live_checkpoint(self.snapshot(record))

            self._log_epoch(epoch, record, improved)

            if patience and self.epochs_without_improvement >= patience:
                logger.info(
                    f"\nEarly stopping: {self.checkpoints.rule.describe()} has not improved for "
                    f"{patience} epochs (best was epoch {self.best_epoch})."
                )
                stopped_early = True
                break

        elapsed = time.time() - started

        if self.history and self.checkpoints.last_live_step != self.global_step:
            self.checkpoints.save_live_checkpoint(self.snapshot(self.history[-1]))
        if cfg.checkpoint.export_on_finish and self.checkpoints.path("best").exists():
            self.checkpoints.export_model("best")
        self._save_history()

        self._log_summary(elapsed, stopped_early)

        return {
            "history": self.history,
            "best_val_loss": self.best_val_loss,
            "best_epoch": self.best_epoch,
            "best_metric": self.checkpoints.rule.metric,
            "best_value": self.checkpoints.best_value,
            "elapsed_seconds": elapsed,
            "checkpoint_dir": str(self.checkpoint_dir),
            "upload_errors": list(self.checkpoints.upload_errors),
        }

    def _save_history(self) -> Path:
        path = self.checkpoint_dir / "history.json"
        with path.open("w", encoding="utf-8") as fh:
            json.dump(
                {"config": self.cfg.to_dict(), "history": self.history},
                fh,
                indent=2,
            )
        return path

    def _log_run_header(self) -> None:
        cfg = self.cfg
        description = self.model.describe()

        logger.info(section(f"TRAINING RUN: {cfg.run_name}"))
        logger.info(f"task              : {cfg.task}")
        logger.info(f"device            : {self.device}")
        logger.info(f"seed              : {cfg.seed} (deterministic={cfg.deterministic})")
        if self.resumed_from:
            logger.info(f"resumed from      : {self.resumed_from}")
        logger.info("")
        logger.info("DATA")
        for line in self.task.describe_data(self.datasets):
            logger.info(f"  {line}")
        logger.info(f"  batch size    : {cfg.data.batch_size} "
                    f"({self.steps_per_epoch} weight updates per epoch, "
                    f"{self.total_steps:,} in total)")
        logger.info("")
        logger.info("MODEL")
        logger.info(f"  architecture  : {_describe_architecture(description)}")
        logger.info(f"  parameters    : {description['parameters']:,} trainable numbers")
        logger.info("")
        logger.info("OPTIMISATION")
        logger.info(f"  loss          : {type(self.criterion).__name__}")
        logger.info(f"  optimizer     : {cfg.training.optimizer} (lr={cfg.training.learning_rate}, "
                    f"weight_decay={cfg.training.weight_decay})")
        if cfg.training.scheduler != "none":
            logger.info(f"  schedule      : {cfg.training.scheduler} "
                        f"(warmup {cfg.training.warmup_steps} steps, "
                        f"final lr x{cfg.training.min_lr_ratio})")
        logger.info(f"  epochs        : {cfg.training.epochs} "
                    f"(early stopping patience {cfg.training.early_stopping_patience})")
        logger.info("")
        logger.info(f"Legend: {_legend(self.task.metric_names)}")
        logger.info("-" * 78)

    def _log_epoch(self, epoch: int, record: Dict[str, float], improved: bool) -> None:
        cfg = self.cfg
        is_edge = epoch == 1 or epoch == cfg.training.epochs
        if not (is_edge or epoch % cfg.training.log_every == 0):
            return

        marker = "  <- best so far" if improved else ""
        line = (
            f"Epoch {epoch:>4}/{cfg.training.epochs} | "
            f"train loss {record['train_loss']:.4f} | "
            f"val loss {record['val_loss']:.4f}"
        )
        for name in self.task.metric_names:
            line += f" | val {name.replace('_', '-')} {_format_metric(name, record[f'val_{name}'])}"
        logger.info(line + marker)

    def _log_summary(self, elapsed: float, stopped_early: bool) -> None:
        if not self.history:
            logger.info(section("NOTHING TO TRAIN"))
            logger.info(f"the run is already at epoch {self.epoch} of {self.cfg.training.epochs}")
            return
        first = self.history[0]
        last = self.history[-1]

        logger.info(section("TRAINING COMPLETE"))
        logger.info(f"epochs run        : {len(self.history)}"
                    f"{' (stopped early)' if stopped_early else ''}")
        logger.info(f"wall clock        : {elapsed:.1f}s")
        if self.checkpoints.best_value is not None:
            logger.info(f"best {self.checkpoints.rule.metric:<13}: "
                        f"{self.checkpoints.best_value:.6f} (epoch {self.best_epoch})")
        logger.info("")
        logger.info("DID IT LEARN?  (first epoch  ->  last epoch)")
        logger.info(f"  train loss      : {first['train_loss']:.4f}  ->  {last['train_loss']:.4f}")
        logger.info(f"  val   loss      : {first['val_loss']:.4f}  ->  {last['val_loss']:.4f}")
        for name in self.task.metric_names:
            label = f"val {name}".replace("_", "-")
            logger.info(f"  {label:<16}: {_format_metric(name, first[f'val_{name}'])}"
                        f"  ->  {_format_metric(name, last[f'val_{name}'])}")
        logger.info("")
        logger.info("HOW THE WEIGHTS CHANGED  (|w| = length of the parameter tensor)")
        rows = summarise_weight_change(self.initial_parameters, self.model)
        logger.info(format_weight_change(rows))
        logger.info("")
        logger.info("'moved' is the distance each tensor travelled from its random")
        logger.info("starting point; 'rel' is that distance relative to where it started.")
        logger.info("A layer that learned nothing would sit near 0%.")
        logger.info("")
        logger.info(f"checkpoints       : {self.checkpoint_dir}/best.pt (best), "
                    f"{self.checkpoint_dir}/live.pt (resume with --set training.resume=live)")
        if self.checkpoints.settings.keep_history:
            logger.info(f"history           : {len(self.checkpoints.history_files())} snapshots in "
                        f"{self.checkpoints.history_dir}")
        for error in self.checkpoints.upload_errors:
            logger.info(f"NOT UPLOADED      : {error}")
        logger.info(f"per-epoch history : {self.checkpoint_dir}/history.json")
        logger.info("")
        logger.info("Next:")
        for line in self.task.next_steps():
            logger.info(f"  {line}")


def train(cfg: Config, ensure_dataset: bool = True) -> Dict[str, Any]:
    if ensure_dataset:
        if cfg.task == "bit_addition" and not Path(cfg.data.raw_path).exists():
            from ored.data.generate import generate_dataset
            logger.info("dataset missing -- generating it first")
            generate_dataset(cfg)
        elif cfg.task == "language_model" and not (Path(cfg.data.corpus.dir) / "train.txt").exists():
            from ored.data.corpus import generate_corpus
            logger.info("corpus missing -- generating it first")
            generate_corpus(cfg)
    return Trainer(cfg).fit()


def checkpoint_overrides(args: argparse.Namespace) -> List[str]:
    overrides = []
    if args.resume_live:
        overrides.append("training.resume=live")
    if args.init_from:
        overrides.append(f"training.resume={args.init_from}")
    if args.history_every is not None:
        overrides += ["checkpoint.keep_history=true",
                      f"checkpoint.save_history_every_epochs={args.history_every}"]
    if args.history_every_steps is not None:
        overrides += ["checkpoint.keep_history=true",
                      f"checkpoint.save_history_every_steps={args.history_every_steps}"]
    if args.live_every_steps is not None:
        overrides.append(f"checkpoint.save_live_every_steps={args.live_every_steps}")
    if args.upload:
        overrides.append("checkpoint.upload=true")
    return overrides


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Train an Ored.ai model.")
    parser.add_argument("--config", default="configs/bit_adder_mlp.yaml")
    parser.add_argument("--set", dest="overrides", action="append", default=[],
                        metavar="KEY=VALUE", help="override a config value (repeatable)")
    start = parser.add_mutually_exclusive_group()
    start.add_argument("--resume-live", action="store_true",
                       help="continue this run exactly from checkpoints/<run_name>/live.pt")
    start.add_argument("--init-from", metavar="PATH",
                       help="start a new run from another checkpoint's weights")
    parser.add_argument("--history-every", type=int, metavar="EPOCHS",
                        help="keep a history snapshot every N epochs")
    parser.add_argument("--history-every-steps", type=int, metavar="STEPS",
                        help="keep a history snapshot every N steps")
    parser.add_argument("--live-every-steps", type=int, metavar="STEPS",
                        help="also save live.pt every N steps, not just every epoch")
    parser.add_argument("--upload", action="store_true", help="publish checkpoints to Supabase")
    args = parser.parse_args(argv)

    cfg = load_config(args.config, args.overrides + checkpoint_overrides(args))
    train(cfg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
