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
from ored.training.metrics import MetricAccumulator
from ored.training.schedules import build_schedule
from ored.training.tasks import build_task
from ored.utils.checkpoint import load_checkpoint, save_checkpoint
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
        self.device = resolve_device(cfg.training.device)

        self.task = build_task(cfg)

        generator = torch.Generator()
        generator.manual_seed(cfg.seed)
        self.loaders, self.datasets = self.task.build_data(generator=generator)

        self.model = self.task.build_model().to(self.device)

        self.criterion = self.task.criterion
        self.optimizer = build_optimizer(
            cfg.training.optimizer,
            self.model,
            cfg.training.learning_rate,
            cfg.training.weight_decay,
        )

        self.schedule = build_schedule(cfg.training.scheduler)
        self.steps_per_epoch = max(1, len(self.loaders["train"]))
        self.total_steps = self.steps_per_epoch * cfg.training.epochs
        self.global_step = 0
        self.current_lr = cfg.training.learning_rate

        self.history: List[Dict[str, float]] = []
        self.best_val_loss = float("inf")
        self.best_epoch = 0
        self.epochs_without_improvement = 0
        self.checkpoint_dir = cfg.checkpoint_dir
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        self.resumed_from = ""
        if cfg.training.resume:
            self._resume(cfg.training.resume)

        self.initial_parameters = snapshot_parameters(self.model)

    def _resume(self, path: str) -> None:
        payload = load_checkpoint(path, map_location=self.device)
        self.model.load_state_dict(payload["model_state"], strict=True)
        if payload.get("optimizer_state") is not None:
            self.optimizer.load_state_dict(payload["optimizer_state"])
        self.resumed_from = f"{path} (epoch {payload.get('epoch')})"

    def _train_one_epoch(self) -> Dict[str, float]:
        self.model.train()
        metrics = MetricAccumulator()

        for batch in self.loaders["train"]:
            self._apply_learning_rate()

            self.optimizer.zero_grad(set_to_none=True)

            loss, extra, batch_size = self.task.compute_loss(self.model, batch, self.device)

            loss.backward()

            if self.cfg.training.grad_clip and self.cfg.training.grad_clip > 0:
                nn.utils.clip_grad_norm_(self.model.parameters(), self.cfg.training.grad_clip)

            self.optimizer.step()
            self.global_step += 1

            metrics.update(batch_size=batch_size, loss=loss.item(), **extra)

        return metrics.compute()

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

        started = time.time()
        stopped_early = False

        for epoch in range(1, cfg.training.epochs + 1):
            train_metrics = self._train_one_epoch()
            val_metrics = self.evaluate("val")

            record: Dict[str, float] = {"epoch": epoch, "lr": self.current_lr}
            for key, value in train_metrics.items():
                record[f"train_{key}"] = value
            for key, value in val_metrics.items():
                record[f"val_{key}"] = value
            self.history.append(record)

            improved = val_metrics["loss"] < self.best_val_loss - 1e-6
            if improved:
                self.best_val_loss = val_metrics["loss"]
                self.best_epoch = epoch
                self.epochs_without_improvement = 0
                self._save("best.pt", epoch, val_metrics)
            else:
                self.epochs_without_improvement += 1

            self._log_epoch(epoch, record, improved)

            patience = cfg.training.early_stopping_patience
            if patience and self.epochs_without_improvement >= patience:
                logger.info(
                    f"\nEarly stopping: validation loss has not improved for "
                    f"{patience} epochs (best was epoch {self.best_epoch})."
                )
                stopped_early = True
                break

        elapsed = time.time() - started

        last_metrics = self.evaluate("val")
        self._save("last.pt", len(self.history), last_metrics)
        self._save_history()

        self._log_summary(elapsed, stopped_early)

        return {
            "history": self.history,
            "best_val_loss": self.best_val_loss,
            "best_epoch": self.best_epoch,
            "elapsed_seconds": elapsed,
            "checkpoint_dir": str(self.checkpoint_dir),
        }

    def _save(self, filename: str, epoch: int, metrics: Dict[str, float]) -> Path:
        return save_checkpoint(
            path=self.checkpoint_dir / filename,
            model=self.model,
            config=self.cfg.to_dict(),
            epoch=epoch,
            metrics=metrics,
            optimizer=self.optimizer,
            extra={"model_description": self.model.describe(), **self.task.checkpoint_extra()},
        )

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
        first = self.history[0]
        last = self.history[-1]

        logger.info(section("TRAINING COMPLETE"))
        logger.info(f"epochs run        : {len(self.history)}"
                    f"{' (stopped early)' if stopped_early else ''}")
        logger.info(f"wall clock        : {elapsed:.1f}s")
        logger.info(f"best val loss     : {self.best_val_loss:.6f} (epoch {self.best_epoch})")
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
        logger.info(f"checkpoints       : {self.checkpoint_dir}/best.pt, {self.checkpoint_dir}/last.pt")
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


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Train an Ored.ai model.")
    parser.add_argument("--config", default="configs/bit_adder_mlp.yaml")
    parser.add_argument("--set", dest="overrides", action="append", default=[],
                        metavar="KEY=VALUE", help="override a config value (repeatable)")
    args = parser.parse_args(argv)

    cfg = load_config(args.config, args.overrides)
    train(cfg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
