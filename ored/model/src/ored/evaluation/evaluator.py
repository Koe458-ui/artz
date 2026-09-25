from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch

from ored.config import config_from_dict
from ored.data.dataset import build_datasets
from ored.data.preprocessing import bits_to_string
from ored.inference.predictor import resolve_task
from ored.models.registry import build_model
from ored.training.metrics import bit_accuracy, exact_match_accuracy
from ored.utils.checkpoint import check_compatible, load_checkpoint, load_model_state
from ored.utils.logging_utils import get_logger, section
from ored.utils.seed import resolve_device

logger = get_logger(__name__)

DEFAULT_CHECKPOINT = "checkpoints/bit_adder_mlp/best.pt"


@torch.no_grad()
def evaluate_checkpoint(
    checkpoint_path: str | Path = DEFAULT_CHECKPOINT,
    splits: Optional[List[str]] = None,
    device: str = "auto",
    show_errors: int = 10,
) -> Dict[str, Dict[str, float]]:
    splits = splits or ["train", "val", "test"]
    resolved_device = resolve_device(device)

    payload = load_checkpoint(checkpoint_path, map_location=resolved_device)
    cfg = config_from_dict(payload["config"])

    if resolve_task(payload, cfg, checkpoint_path) == "language_model":
        raise ValueError(
            f"{checkpoint_path} holds a language model, which this evaluator cannot "
            f"score. Use ored.evaluation.lm_evaluator.evaluate_language_model(), or "
            f"run scripts/evaluate.py, which picks the right one."
        )

    model = build_model(cfg).to(resolved_device)
    check_compatible(payload, model, path=checkpoint_path)
    load_model_state(model, payload["model_state_dict"], checkpoint_path)
    model.eval()

    datasets = build_datasets(cfg)
    criterion = torch.nn.BCEWithLogitsLoss()

    logger.info(section("EVALUATION"))
    logger.info(f"checkpoint : {checkpoint_path}")
    logger.info(f"trained to : epoch {payload.get('epoch')}")
    logger.info(f"model      : {model.describe()}")
    logger.info("")

    header = f"{'split':<8}{'examples':>10}{'loss':>10}{'bit-acc':>10}{'exact-acc':>12}"
    logger.info(header)
    logger.info("-" * len(header))

    results: Dict[str, Dict[str, float]] = {}
    per_split_errors: Dict[str, List[str]] = {}

    for split in splits:
        dataset = datasets[split]
        inputs = dataset.inputs.to(resolved_device)
        targets = dataset.targets.to(resolved_device)

        logits = model(inputs)

        results[split] = {
            "examples": float(len(dataset)),
            "loss": criterion(logits, targets).item(),
            "bit_acc": bit_accuracy(logits, targets),
            "exact_acc": exact_match_accuracy(logits, targets),
        }
        logger.info(
            f"{split:<8}{len(dataset):>10}{results[split]['loss']:>10.4f}"
            f"{results[split]['bit_acc']:>10.1%}{results[split]['exact_acc']:>12.1%}"
        )

        predicted_bits = (logits > 0).to(torch.int64).cpu()
        wrong_rows = (predicted_bits != targets.cpu().to(torch.int64)).any(dim=1).nonzero().flatten()
        lines = []
        for index in wrong_rows.tolist():
            a, b, expected = dataset.pairs[index]
            bits = predicted_bits[index].tolist()
            got = int("".join(str(bit) for bit in bits), 2)
            lines.append(
                f"  {a:>3} + {b:<3} -> predicted {got:<3} (bits {bits_to_string(bits)})"
                f"  expected {expected:<3} (bits {bits_to_string([int(t) for t in targets[index].tolist()])})"
            )
        per_split_errors[split] = lines

    logger.info("")
    logger.info("bit-acc   = fraction of individual output bits correct")
    logger.info("exact-acc = fraction of sums fully correct -- the score that matters")

    if "test" in results:
        exact = results["test"]["exact_acc"]
        logger.info("")
        logger.info(
            f"The test split contains {int(results['test']['examples'])} pairs the model "
            f"has never seen in training."
        )
        logger.info(f"It got {exact:.1%} of them completely right.")

    if show_errors:
        for split in splits:
            errors = per_split_errors[split]
            if not errors:
                continue
            logger.info("")
            logger.info(f"Mistakes on {split} ({len(errors)} of {int(results[split]['examples'])}):")
            for line in errors[:show_errors]:
                logger.info(line)
            if len(errors) > show_errors:
                logger.info(f"  ... and {len(errors) - show_errors} more")

        _log_per_bit_accuracy(model, datasets, splits, resolved_device)

    return results


@torch.no_grad()
def _log_per_bit_accuracy(model, datasets, splits, device) -> None:
    logger.info("")
    logger.info("Per-bit accuracy (bit 0 = most significant, i.e. the 16s place):")
    for split in splits:
        dataset = datasets[split]
        logits = model(dataset.inputs.to(device))
        predicted = (logits > 0).float().cpu()
        correct = (predicted == dataset.targets).float().mean(dim=0)
        cells = "  ".join(f"bit{i}:{value:6.1%}" for i, value in enumerate(correct.tolist()))
        logger.info(f"  {split:<6}{cells}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate a trained Ored.ai checkpoint (any task).")
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    parser.add_argument("--splits", nargs="*", default=["train", "val", "test"])
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--show-errors", type=int, default=10,
                        help="how many wrong answers to print per split (0 = none)")
    parser.add_argument("--samples", type=int, default=3,
                        help="language models: how many text samples to score")
    parser.add_argument("--temperature", type=float, default=0.8,
                        help="language models: sampling temperature for the samples")
    args = parser.parse_args(argv)

    payload = load_checkpoint(args.checkpoint, map_location="cpu")
    task = resolve_task(payload, config_from_dict(payload["config"]), args.checkpoint)

    if task == "language_model":
        from ored.evaluation.lm_evaluator import evaluate_language_model

        evaluate_language_model(
            args.checkpoint,
            splits=args.splits,
            device=args.device,
            n_samples=args.samples,
            temperature=args.temperature,
        )
    else:
        evaluate_checkpoint(args.checkpoint, args.splits, args.device, args.show_errors)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
