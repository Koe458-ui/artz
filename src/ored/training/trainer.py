"""The training loop.

This file is where a pile of random numbers becomes a model that can add. Read
``_train_one_epoch`` first -- the five lines inside its inner loop are the
entire principle of deep learning:

    1. optimizer.zero_grad()   forget the previous batch's gradients
    2. logits = model(inputs)  FORWARD PASS  -> a prediction
    3. loss = criterion(...)   LOSS          -> one number: how wrong we are
    4. loss.backward()         BACKPROPAGATION -> gradient of loss w.r.t. every weight
    5. optimizer.step()        WEIGHT UPDATE -> nudge every weight downhill

Everything else in this module is bookkeeping around those five lines:
seeding, batching, validation, checkpointing, early stopping and printing.

The vocabulary, precisely
-------------------------
**Gradient**
    For each individual weight ``w``, the gradient ``dL/dw`` says: "if you
    increase w by a tiny amount, the loss changes by this much, in this
    direction." It is a slope, one number per weight.

**Backpropagation**
    The algorithm that computes all those slopes efficiently. Rather than
    testing each of the 1,509 weights one at a time, it applies the chain rule
    from calculus backwards through the network, reusing shared work. PyTorch
    records every operation performed in the forward pass into a graph; calling
    ``.backward()`` walks that graph in reverse and fills in ``w.grad`` for
    every parameter. This is *automatic differentiation* -- the reason we use a
    framework at all.

**Optimizer**
    Turns gradients into an actual change. The simplest rule is
    ``w <- w - learning_rate * dL/dw``: step *against* the slope, because we
    want the loss to go down. Adam (used here) refines that by keeping running
    averages of recent gradients so each weight gets its own effective step
    size, which converges much faster on small problems like this one.

**Epoch vs batch**
    A batch is one weight update. An epoch is one full pass over the training
    data -- here about 12 batches, so 12 updates per epoch.

**Training vs validation**
    Training data shapes the weights. Validation data never does: we run it
    with gradients disabled, purely to ask "is this improving on examples it
    does not learn from?". When training loss falls while validation loss
    rises, the model is memorising rather than generalising -- overfitting.
"""

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
from ored.data.dataset import build_dataloaders
from ored.data.generate import generate_dataset
from ored.models.registry import build_model
from ored.training.metrics import MetricAccumulator, bit_accuracy, exact_match_accuracy
from ored.utils.checkpoint import save_checkpoint
from ored.utils.logging_utils import get_logger, section
from ored.utils.seed import resolve_device, set_seed
from ored.utils.weight_stats import (
    format_weight_change,
    snapshot_parameters,
    summarise_weight_change,
)

logger = get_logger(__name__)


def build_criterion(name: str) -> nn.Module:
    """Create the loss function.

    ``bce_with_logits`` = binary cross-entropy on raw logits. Each of the 5
    output bits is treated as its own yes/no question. For a target bit t and
    predicted probability p, the penalty is ``-[t*log(p) + (1-t)*log(1-p)]``:
    near zero when confident and right, and growing without bound when
    confident and wrong. It combines sigmoid and BCE into one numerically
    stable operation, which is why the model must emit logits, not
    probabilities.
    """
    losses = {
        "bce_with_logits": nn.BCEWithLogitsLoss,
        "mse": nn.MSELoss,
    }
    key = name.lower()
    if key not in losses:
        raise ValueError(f"unknown loss {name!r}; available: {sorted(losses)}")
    return losses[key]()


def build_optimizer(name: str, model: nn.Module, lr: float, weight_decay: float) -> torch.optim.Optimizer:
    """Create the optimizer and hand it the parameters it is allowed to change.

    ``model.parameters()`` is the complete list of weights and biases. The
    optimizer holds references to those exact tensors, which is how
    ``optimizer.step()`` can modify the model in place.
    """
    optimizers = {
        "adam": torch.optim.Adam,
        "adamw": torch.optim.AdamW,
        "sgd": torch.optim.SGD,
    }
    key = name.lower()
    if key not in optimizers:
        raise ValueError(f"unknown optimizer {name!r}; available: {sorted(optimizers)}")
    return optimizers[key](model.parameters(), lr=lr, weight_decay=weight_decay)


class Trainer:
    """Owns the model, the data and the loop that connects them."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg

        # --- 1. Reproducibility -------------------------------------------
        # Done before anything random happens: weight init and data shuffling.
        set_seed(cfg.seed, cfg.deterministic)
        self.device = resolve_device(cfg.training.device)

        # --- 2. Data -------------------------------------------------------
        generator = torch.Generator()
        generator.manual_seed(cfg.seed)
        self.loaders, self.datasets = build_dataloaders(cfg, generator=generator)

        # --- 3. Model ------------------------------------------------------
        # .to(device) moves every weight tensor onto the CPU or GPU. Inputs
        # must end up on the same device or PyTorch raises an error.
        self.model = build_model(cfg).to(self.device)

        # --- 4. Loss and optimizer ----------------------------------------
        self.criterion = build_criterion(cfg.training.loss)
        self.optimizer = build_optimizer(
            cfg.training.optimizer,
            self.model,
            cfg.training.learning_rate,
            cfg.training.weight_decay,
        )

        # --- 5. Bookkeeping -------------------------------------------------
        self.history: List[Dict[str, float]] = []
        self.best_val_loss = float("inf")
        self.best_epoch = 0
        self.epochs_without_improvement = 0
        self.checkpoint_dir = cfg.checkpoint_dir
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

        # Snapshot the freshly initialised weights so we can show, at the end,
        # exactly how far training moved them.
        self.initial_parameters = snapshot_parameters(self.model)

    # ------------------------------------------------------------------
    # One epoch of training
    # ------------------------------------------------------------------
    def _train_one_epoch(self) -> Dict[str, float]:
        """Run every training batch once, updating the weights each time."""
        # Training mode: enables dropout, if configured. Always pair this with
        # model.eval() during validation.
        self.model.train()
        metrics = MetricAccumulator()

        for inputs, targets in self.loaders["train"]:
            inputs = inputs.to(self.device)
            targets = targets.to(self.device)

            # (1) CLEAR OLD GRADIENTS.
            # PyTorch *accumulates* into .grad by default, so without this the
            # gradients of every previous batch would pile up and the updates
            # would be nonsense. This is the most common beginner bug.
            self.optimizer.zero_grad(set_to_none=True)

            # (2) FORWARD PASS: prediction.
            # Each operation is recorded in an autograd graph so the backward
            # pass knows how the loss depends on every weight.
            logits = self.model(inputs)

            # (3) LOSS: a single scalar measuring how wrong this batch was.
            loss = self.criterion(logits, targets)

            # (4) BACKPROPAGATION: fill in p.grad for every parameter p.
            # No weight has changed yet -- this step only computes slopes.
            loss.backward()

            # (4b) Optional safety rail: if the overall gradient is enormous,
            # scale it down so a single odd batch cannot wreck the weights.
            if self.cfg.training.grad_clip and self.cfg.training.grad_clip > 0:
                nn.utils.clip_grad_norm_(self.model.parameters(), self.cfg.training.grad_clip)

            # (5) WEIGHT UPDATE: the only line that changes the model.
            # Roughly: w <- w - learning_rate * (function of w.grad)
            self.optimizer.step()

            # Bookkeeping only. .item() pulls a Python float out of a tensor;
            # doing so detaches it from the graph so nothing is kept alive.
            metrics.update(
                batch_size=inputs.size(0),
                loss=loss.item(),
                bit_acc=bit_accuracy(logits, targets),
                exact_acc=exact_match_accuracy(logits, targets),
            )

        return metrics.compute()

    # ------------------------------------------------------------------
    # Evaluation (no learning happens here)
    # ------------------------------------------------------------------
    @torch.no_grad()  # do not build an autograd graph: faster, less memory
    def evaluate(self, split: str) -> Dict[str, float]:
        """Measure the model on a split without changing a single weight."""
        loader: DataLoader = self.loaders[split]
        self.model.eval()  # inference mode: dropout off
        metrics = MetricAccumulator()

        for inputs, targets in loader:
            inputs = inputs.to(self.device)
            targets = targets.to(self.device)

            logits = self.model(inputs)
            loss = self.criterion(logits, targets)

            metrics.update(
                batch_size=inputs.size(0),
                loss=loss.item(),
                bit_acc=bit_accuracy(logits, targets),
                exact_acc=exact_match_accuracy(logits, targets),
            )

        return metrics.compute()

    # ------------------------------------------------------------------
    # The full run
    # ------------------------------------------------------------------
    def fit(self) -> Dict[str, Any]:
        cfg = self.cfg
        self._log_run_header()

        started = time.time()
        stopped_early = False

        for epoch in range(1, cfg.training.epochs + 1):
            train_metrics = self._train_one_epoch()
            val_metrics = self.evaluate("val")

            record = {
                "epoch": epoch,
                "train_loss": train_metrics["loss"],
                "train_bit_acc": train_metrics["bit_acc"],
                "train_exact_acc": train_metrics["exact_acc"],
                "val_loss": val_metrics["loss"],
                "val_bit_acc": val_metrics["bit_acc"],
                "val_exact_acc": val_metrics["exact_acc"],
            }
            self.history.append(record)

            # "Best" = lowest validation loss ever seen. We keep that snapshot
            # because the final epoch is not necessarily the best one: a model
            # can get worse by continuing to train (overfitting).
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

        # Always keep the final state too, so training can be resumed.
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

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------
    def _save(self, filename: str, epoch: int, metrics: Dict[str, float]) -> Path:
        return save_checkpoint(
            path=self.checkpoint_dir / filename,
            model=self.model,
            config=self.cfg.to_dict(),
            epoch=epoch,
            metrics=metrics,
            optimizer=self.optimizer,
            extra={"model_description": self.model.describe()},
        )

    def _save_history(self) -> Path:
        """Write the per-epoch numbers as JSON, for plotting or comparison."""
        path = self.checkpoint_dir / "history.json"
        with path.open("w", encoding="utf-8") as fh:
            json.dump(
                {"config": self.cfg.to_dict(), "history": self.history},
                fh,
                indent=2,
            )
        return path

    # ------------------------------------------------------------------
    # Console output
    # ------------------------------------------------------------------
    def _log_run_header(self) -> None:
        cfg = self.cfg
        description = self.model.describe()

        logger.info(section(f"TRAINING RUN: {cfg.run_name}"))
        logger.info(f"device            : {self.device}")
        logger.info(f"seed              : {cfg.seed} (deterministic={cfg.deterministic})")
        logger.info("")
        logger.info("DATA")
        for name in ("train", "val", "test"):
            logger.info(f"  {self.datasets[name].describe()}")
        logger.info(f"  batch size    : {cfg.data.batch_size} "
                    f"({len(self.loaders['train'])} weight updates per epoch)")
        logger.info("")
        logger.info("MODEL")
        logger.info(f"  architecture  : {description['type']} "
                    f"{description['input_size']} -> "
                    f"{' -> '.join(str(h) for h in description['hidden_sizes'])} -> "
                    f"{description['output_size']}")
        logger.info(f"  activation    : {description['activation']}")
        logger.info(f"  parameters    : {description['parameters']:,} trainable numbers")
        logger.info("")
        logger.info("OPTIMISATION")
        logger.info(f"  loss          : {cfg.training.loss}")
        logger.info(f"  optimizer     : {cfg.training.optimizer} (lr={cfg.training.learning_rate}, "
                    f"weight_decay={cfg.training.weight_decay})")
        logger.info(f"  epochs        : {cfg.training.epochs} "
                    f"(early stopping patience {cfg.training.early_stopping_patience})")
        logger.info("")
        logger.info("Legend: bit-acc = individual output bits correct; "
                    "exact = all 5 bits correct (the real score).")
        logger.info("-" * 78)

    def _log_epoch(self, epoch: int, record: Dict[str, float], improved: bool) -> None:
        cfg = self.cfg
        is_edge = epoch == 1 or epoch == cfg.training.epochs
        if not (is_edge or epoch % cfg.training.log_every == 0):
            return

        marker = "  <- best so far" if improved else ""
        logger.info(
            f"Epoch {epoch:>4}/{cfg.training.epochs} | "
            f"train loss {record['train_loss']:.4f} | "
            f"val loss {record['val_loss']:.4f} | "
            f"val bit-acc {record['val_bit_acc']:6.1%} | "
            f"val exact {record['val_exact_acc']:6.1%}{marker}"
        )

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
        logger.info(f"  val   bit-acc   : {first['val_bit_acc']:.1%}  ->  {last['val_bit_acc']:.1%}")
        logger.info(f"  val   exact-acc : {first['val_exact_acc']:.1%}  ->  {last['val_exact_acc']:.1%}")
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
        logger.info(f"  python scripts/evaluate.py --checkpoint {self.checkpoint_dir}/best.pt")
        logger.info(f"  python scripts/infer.py --a 9 --b 6")


def train(cfg: Config, ensure_dataset: bool = True) -> Dict[str, Any]:
    """Convenience wrapper: generate the dataset if missing, then train."""
    if ensure_dataset and not Path(cfg.data.raw_path).exists():
        logger.info("dataset missing -- generating it first")
        generate_dataset(cfg)
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
