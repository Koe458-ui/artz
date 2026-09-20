from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import torch

from ored.config import Config, config_from_dict
from ored.data.preprocessing import bits_to_string, decode_prediction, encode_pair
from ored.models.registry import build_model
from ored.utils.checkpoint import load_checkpoint
from ored.utils.logging_utils import get_logger, section
from ored.utils.seed import resolve_device

logger = get_logger(__name__)

DEFAULT_CHECKPOINT = "checkpoints/bit_adder_mlp/best.pt"


@dataclass
class Prediction:

    a: int
    b: int
    predicted: int
    predicted_bits: List[int]
    probabilities: List[float]
    expected: Optional[int] = None

    @property
    def correct(self) -> Optional[bool]:
        if self.expected is None:
            return None
        return self.predicted == self.expected

    @property
    def confidence(self) -> float:
        return min(max(p, 1.0 - p) for p in self.probabilities)

    def format(self) -> str:
        arrow = f"{self.a:>3} + {self.b:<3} = {self.predicted:<3}"
        bits = f"bits {bits_to_string(self.predicted_bits)}"
        conf = f"confidence {self.confidence:.1%}"
        if self.expected is None:
            return f"{arrow}  ({bits}, {conf})"
        mark = "OK  " if self.correct else "WRONG"
        return f"{arrow}  [{mark}] expected {self.expected:<3} ({bits}, {conf})"


class Predictor:

    def __init__(self, model: torch.nn.Module, cfg: Config, device: torch.device,
                 checkpoint_info: Dict[str, Any]) -> None:
        self.model = model
        self.cfg = cfg
        self.device = device
        self.checkpoint_info = checkpoint_info
        self.n_bits = cfg.data.n_bits

        self.model.eval()

    @classmethod
    def from_checkpoint(
        cls,
        path: str | Path = DEFAULT_CHECKPOINT,
        device: str = "auto",
    ) -> "Predictor":
        resolved_device = resolve_device(device)
        payload = load_checkpoint(path, map_location=resolved_device)

        cfg = config_from_dict(payload["config"])
        model = build_model(cfg).to(resolved_device)

        model.load_state_dict(payload["model_state"], strict=True)

        info = {
            "path": str(path),
            "epoch": payload.get("epoch"),
            "metrics": payload.get("metrics", {}),
            "saved_at": payload.get("saved_at"),
            "torch_version": payload.get("torch_version"),
        }
        return cls(model, cfg, resolved_device, info)

    @torch.no_grad()
    def predict(self, a: int, b: int) -> Prediction:
        limit = 2**self.n_bits - 1
        for name, value in (("a", a), ("b", b)):
            if not 0 <= value <= limit:
                raise ValueError(
                    f"{name}={value} is out of range: this model was trained on "
                    f"{self.n_bits}-bit inputs, so both numbers must be in 0..{limit}."
                )

        x = torch.from_numpy(encode_pair(a, b, self.n_bits)).to(self.device)

        logits = self.model(x.unsqueeze(0))[0]

        value, bits, probabilities = decode_prediction(logits, self.n_bits)
        return Prediction(
            a=a,
            b=b,
            predicted=value,
            predicted_bits=bits,
            probabilities=probabilities,
            expected=a + b,
        )

    def predict_many(self, pairs: Sequence[Tuple[int, int]]) -> List[Prediction]:
        return [self.predict(a, b) for a, b in pairs]

    def describe(self) -> str:
        info = self.checkpoint_info
        metrics = info.get("metrics") or {}
        metric_text = "  ".join(f"{k}={v:.4f}" for k, v in metrics.items()) or "n/a"
        return (
            f"checkpoint : {info['path']}\n"
            f"trained to : epoch {info.get('epoch')}  (saved {info.get('saved_at')})\n"
            f"val metrics: {metric_text}\n"
            f"model      : {self.model.describe()}"
        )


def load_predictor(path: str | Path = DEFAULT_CHECKPOINT, device: str = "auto") -> Predictor:
    return Predictor.from_checkpoint(path, device)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run inference with a trained Ored.ai model.",
        epilog="Examples:\n"
               "  python scripts/infer.py --a 9 --b 6\n"
               "  python scripts/infer.py --pairs 1+1 7+8 15+15\n"
               "  python scripts/infer.py --interactive",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--a", type=int, help="first number")
    parser.add_argument("--b", type=int, help="second number")
    parser.add_argument("--pairs", nargs="*", default=None,
                        metavar="A+B", help="several pairs at once, e.g. 3+4 9+6")
    parser.add_argument("--interactive", action="store_true",
                        help="type pairs until you enter 'q'")
    parser.add_argument("--quiet", action="store_true", help="print predictions only")
    args = parser.parse_args(argv)

    predictor = load_predictor(args.checkpoint, args.device)

    if not args.quiet:
        logger.info(section("ORED.AI -- INFERENCE"))
        logger.info(predictor.describe())
        logger.info("")

    pairs: List[Tuple[int, int]] = []
    if args.a is not None and args.b is not None:
        pairs.append((args.a, args.b))
    for token in args.pairs or []:
        if "+" not in token:
            raise SystemExit(f"--pairs expects A+B tokens, got {token!r}")
        left, right = token.split("+", 1)
        pairs.append((int(left), int(right)))

    if not pairs and not args.interactive:
        pairs = [(0, 0), (1, 1), (3, 4), (9, 6), (7, 8), (15, 15)]
        if not args.quiet:
            logger.info("(no pair given -- showing a default sample)")

    for a, b in pairs:
        try:
            logger.info(predictor.predict(a, b).format())
        except ValueError as exc:
            logger.info(f"skipped {a}+{b}: {exc}")

    if args.interactive:
        logger.info("\nEnter pairs like '9 6' or '9+6'. Type 'q' to quit.")
        while True:
            try:
                raw = input("> ").strip()
            except (EOFError, KeyboardInterrupt):
                logger.info("")
                break
            if raw.lower() in ("q", "quit", "exit"):
                break
            if not raw:
                continue
            try:
                parts = raw.replace("+", " ").split()
                a, b = int(parts[0]), int(parts[1])
                logger.info(predictor.predict(a, b).format())
            except (ValueError, IndexError) as exc:
                logger.info(f"could not read that: {exc}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
