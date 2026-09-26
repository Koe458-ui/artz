from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Type

import torch

from ored.config import Config, config_from_dict
from ored.data.preprocessing import bits_to_string, decode_prediction, encode_pair
from ored.data.tokenizer import Tokenizer
from ored.inference.generator import complete, generate_text
from ored.models.registry import build_model
from ored.utils.checkpoint import check_compatible, load_checkpoint, load_model_state
from ored.utils.logging_utils import get_logger, section
from ored.utils.seed import resolve_device

logger = get_logger(__name__)

DEFAULT_CHECKPOINT = "checkpoints/bit_adder_mlp/best.pt"

LM_CHECKPOINT = "checkpoints/char_transformer/best.pt"

PREDICTOR_REGISTRY: Dict[str, Type["BasePredictor"]] = {}


def register_predictor(task: str):
    def decorator(cls: Type["BasePredictor"]) -> Type["BasePredictor"]:
        key = task.lower()
        if key in PREDICTOR_REGISTRY:
            raise ValueError(f"predictor for task {task!r} is already registered")
        PREDICTOR_REGISTRY[key] = cls
        cls.task = key
        return cls

    return decorator


TEXT_MODELS = frozenset({"transformer", "bigram"})


def find_tokenizer_data(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    extra = payload.get("extra") or {}
    return payload.get("tokenizer") or extra.get("tokenizer")


def read_tokenizer(payload: Dict[str, Any], path: str | Path) -> Tokenizer:
    data = find_tokenizer_data(payload)
    if not data:
        raise ValueError(
            f"{path} carries no tokenizer, so its token ids cannot be turned back "
            f"into text. Was it trained with task: language_model?"
        )
    return Tokenizer.from_dict(data)


def resolve_task(payload: Dict[str, Any], cfg: Config, path: str | Path) -> str:
    declared = (cfg.task or "").lower()
    has_tokenizer = find_tokenizer_data(payload) is not None

    if has_tokenizer or cfg.model.name.lower() in TEXT_MODELS:
        if declared != "language_model":
            logger.info(
                f"{path} records task {declared or 'none'!r}, but carries a "
                f"{cfg.model.name} model{' and a tokenizer' if has_tokenizer else ''}: "
                f"reading it as a language model."
            )
        return "language_model"

    if declared in PREDICTOR_REGISTRY:
        return declared

    raise ValueError(
        f"{path} was trained for task {cfg.task!r}, which has no predictor. "
        f"Known tasks: {sorted(PREDICTOR_REGISTRY)}"
    )


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


@dataclass
class TextPrediction:

    prompt: str
    completion: str
    expected: Optional[str] = None

    @property
    def text(self) -> str:
        return f"{self.prompt}{self.completion}"

    @property
    def correct(self) -> Optional[bool]:
        if self.expected is None:
            return None
        return self.completion.strip() == self.expected.strip()

    def format(self) -> str:
        if self.expected is None:
            return self.text
        mark = "OK  " if self.correct else "WRONG"
        return f"{self.prompt}{self.completion:<8} [{mark}] expected {self.expected}"


class BasePredictor:

    task: str = "base"

    def __init__(self, model: torch.nn.Module, cfg: Config, device: torch.device,
                 checkpoint_info: Dict[str, Any]) -> None:
        self.model = model
        self.cfg = cfg
        self.device = device
        self.checkpoint_info = checkpoint_info

        self.model.eval()

    @classmethod
    def from_checkpoint(
        cls,
        path: str | Path = DEFAULT_CHECKPOINT,
        device: str = "auto",
    ) -> "BasePredictor":
        resolved_device = resolve_device(device)
        payload = load_checkpoint(path, map_location=resolved_device)
        cfg = config_from_dict(payload["config"])

        key = resolve_task(payload, cfg, path)
        target = PREDICTOR_REGISTRY[key]
        if cls is not BasePredictor and target is not cls:
            logger.info(
                f"{path} was trained for task {key!r}: loading it as "
                f"{target.__name__} rather than {cls.__name__}."
            )

        info = {
            "path": str(path),
            "task": key,
            "epoch": payload.get("epoch"),
            "metrics": payload.get("metrics", {}),
            "saved_at": payload.get("created_at"),
            "kind": payload.get("checkpoint_kind"),
            "global_step": payload.get("global_step"),
            "torch_version": payload.get("torch_version"),
            "device": resolved_device,
        }
        return target._build(payload, cfg, resolved_device, info)

    @classmethod
    def _build(cls, payload: Dict[str, Any], cfg: Config, device: torch.device,
               info: Dict[str, Any]) -> "BasePredictor":
        raise NotImplementedError

    def _describe_header(self) -> str:
        info = self.checkpoint_info
        metrics = info.get("metrics") or {}
        metric_text = "  ".join(f"{k}={v:.4f}" for k, v in metrics.items()) or "n/a"
        return (
            f"checkpoint : {info['path']}\n"
            f"task       : {info.get('task')}\n"
            f"trained to : epoch {info.get('epoch')}  (saved {info.get('saved_at')})\n"
            f"val metrics: {metric_text}\n"
            f"model      : {self.model.describe()}"
        )

    def describe(self) -> str:
        return self._describe_header()


@register_predictor("bit_addition")
class Predictor(BasePredictor):

    def __init__(self, model: torch.nn.Module, cfg: Config, device: torch.device,
                 checkpoint_info: Dict[str, Any]) -> None:
        super().__init__(model, cfg, device, checkpoint_info)
        self.n_bits = cfg.data.n_bits

    @classmethod
    def _build(cls, payload, cfg, device, info):
        model = build_model(cfg).to(device)
        check_compatible(payload, model, path=info["path"])
        load_model_state(model, payload["model_state_dict"], info["path"])
        return cls(model, cfg, device, info)

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


@register_predictor("language_model")
class LanguageModelPredictor(BasePredictor):

    def __init__(self, model: torch.nn.Module, cfg: Config, device: torch.device,
                 checkpoint_info: Dict[str, Any], tokenizer: Tokenizer) -> None:
        super().__init__(model, cfg, device, checkpoint_info)
        self.tokenizer = tokenizer
        self.block_size = cfg.data.block_size

    @classmethod
    def _build(cls, payload, cfg, device, info):
        tokenizer = read_tokenizer(payload, info["path"])
        model = build_model(cfg, vocab_size=tokenizer.vocab_size).to(device)
        check_compatible(payload, model, path=info["path"])
        load_model_state(model, payload["model_state_dict"], info["path"])
        return cls(model, cfg, device, info, tokenizer)

    @property
    def vocab_size(self) -> int:
        return self.tokenizer.vocab_size

    @property
    def reverse_answer(self) -> bool:
        return self.cfg.data.corpus.reverse_answer

    def predict(self, prompt: str, max_new_tokens: int = 8,
                expected: Optional[str] = None) -> TextPrediction:
        written = complete(
            model=self.model,
            tokenizer=self.tokenizer,
            prompt=prompt,
            block_size=self.block_size,
            device=self.device,
            max_new_tokens=max_new_tokens,
        )
        return TextPrediction(prompt=prompt, completion=written, expected=expected)

    def predict_many(self, prompts: Sequence[str], max_new_tokens: int = 8
                     ) -> List[TextPrediction]:
        return [self.predict(prompt, max_new_tokens) for prompt in prompts]

    def predict_sum(self, a: int, b: int) -> TextPrediction:
        from ored.data.corpus import format_answer

        return self.predict(
            f"{a} + {b} = ",
            expected=format_answer(a + b, self.reverse_answer),
        )

    def generate(
        self,
        prompt: str = "",
        max_new_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        top_k: Optional[int] = None,
        top_p: Optional[float] = None,
        greedy: bool = False,
    ) -> str:
        gen = self.cfg.generation
        return generate_text(
            model=self.model,
            tokenizer=self.tokenizer,
            prompt=prompt if prompt else gen.prompt,
            max_new_tokens=max_new_tokens if max_new_tokens is not None else gen.max_new_tokens,
            block_size=self.block_size,
            device=self.device,
            temperature=temperature if temperature is not None else gen.temperature,
            top_k=top_k if top_k is not None else gen.top_k,
            top_p=top_p if top_p is not None else gen.top_p,
            greedy=greedy,
        )

    def describe(self) -> str:
        return f"{self._describe_header()}\ntokenizer  : {self.tokenizer.describe()}"


def resolve_checkpoint(path: str | Path | None = None) -> str:
    if path is not None:
        return str(path)
    if not Path(DEFAULT_CHECKPOINT).exists() and Path(LM_CHECKPOINT).exists():
        logger.info(f"(no {DEFAULT_CHECKPOINT} -- using {LM_CHECKPOINT})")
        return LM_CHECKPOINT
    return DEFAULT_CHECKPOINT


def load_predictor(path: str | Path | None = None, device: str = "auto") -> BasePredictor:
    return BasePredictor.from_checkpoint(resolve_checkpoint(path), device)


def _parse_pairs(tokens: Sequence[str]) -> List[Tuple[int, int]]:
    pairs: List[Tuple[int, int]] = []
    for token in tokens:
        if "+" not in token:
            raise SystemExit(f"--pairs expects A+B tokens, got {token!r}")
        left, right = token.split("+", 1)
        pairs.append((int(left), int(right)))
    return pairs


def _run_bit_addition(predictor: Predictor, args: argparse.Namespace) -> int:
    pairs: List[Tuple[int, int]] = []
    if args.a is not None and args.b is not None:
        pairs.append((args.a, args.b))
    pairs.extend(_parse_pairs(args.pairs or []))

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


def _run_language_model(predictor: LanguageModelPredictor, args: argparse.Namespace) -> int:
    did_something = False

    for question in args.ask or []:
        from ored.data.training_data import prompt_for

        prompt = prompt_for(question, args.ask_type)
        answer = predictor.predict(prompt, max_new_tokens=args.tokens or 200).completion
        logger.info(f"{prompt}{answer}")
        logger.info("")
        did_something = True

    if args.text is not None:
        if args.sample:
            logger.info(predictor.generate(
                prompt=args.text,
                max_new_tokens=args.tokens,
                temperature=args.temperature,
            ))
        else:
            logger.info(predictor.predict(
                args.text, max_new_tokens=args.tokens or 8).format())
        did_something = True

    pairs: List[Tuple[int, int]] = []
    if args.a is not None and args.b is not None:
        pairs.append((args.a, args.b))
    pairs.extend(_parse_pairs(args.pairs or []))

    if not pairs and not did_something and not args.interactive:
        if not args.quiet:
            logger.info("(no input given -- showing a default sample)")
            logger.info("")
            logger.info("generated text:")
            logger.info(predictor.generate(
                max_new_tokens=args.tokens or 160,
                temperature=args.temperature,
                greedy=not args.sample,
            ))
            logger.info("")
            logger.info("completions:")
        pairs = [(0, 0), (1, 1), (3, 4), (9, 6), (7, 8), (15, 15)]

    for a, b in pairs:
        logger.info(predictor.predict_sum(a, b).format())

    if args.interactive:
        logger.info("\nEnter text to continue, e.g. '17 + 9 = '. Type 'q' to quit.")
        while True:
            try:
                raw = input("> ")
            except (EOFError, KeyboardInterrupt):
                logger.info("")
                break
            if raw.strip().lower() in ("q", "quit", "exit"):
                break
            if not raw.strip():
                continue
            logger.info(predictor.predict(raw, max_new_tokens=args.tokens or 8).format())

    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run inference with a trained Ored.ai model.",
        epilog="Examples:\n"
               "  python scripts/infer.py --a 9 --b 6\n"
               "  python scripts/infer.py --pairs 1+1 7+8 15+15\n"
               "  python scripts/infer.py --checkpoint checkpoints/char_transformer/best.pt \\\n"
               '      --text \"17 + 9 = \"\n'
               "  python scripts/infer.py --interactive",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--checkpoint", default=None,
                        help=f"default: {DEFAULT_CHECKPOINT}, "
                             f"or {LM_CHECKPOINT} when that is the only one present")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--a", type=int, help="first number")
    parser.add_argument("--b", type=int, help="second number")
    parser.add_argument("--pairs", nargs="*", default=None,
                        metavar="A+B", help="several pairs at once, e.g. 3+4 9+6")
    parser.add_argument("--text", default=None, metavar="TEXT",
                        help="language models only: text to continue, e.g. \"17 + 9 = \"")
    parser.add_argument("--ask", action="append", default=[], metavar="QUESTION",
                        help="language models trained on Supabase data: ask a question in the "
                             "'Question: ... / Answer: ...' form they learned (repeatable)")
    parser.add_argument("--ask-type", default="qna", metavar="TYPE",
                        help="the row type whose text form --ask uses (default qna)")
    parser.add_argument("--tokens", type=int, default=None,
                        help="language models only: how many characters to write")
    parser.add_argument("--temperature", type=float, default=None,
                        help="language models only: sampling temperature (needs --sample)")
    parser.add_argument("--sample", action="store_true",
                        help="language models only: sample freely instead of "
                             "finishing one line greedily")
    parser.add_argument("--interactive", action="store_true",
                        help="type inputs until you enter 'q'")
    parser.add_argument("--quiet", action="store_true", help="print predictions only")
    args = parser.parse_args(argv)

    predictor = load_predictor(args.checkpoint, args.device)

    if not args.quiet:
        logger.info(section("ORED.AI -- INFERENCE"))
        logger.info(predictor.describe())
        logger.info("")

    if isinstance(predictor, LanguageModelPredictor):
        return _run_language_model(predictor, args)
    return _run_bit_addition(predictor, args)


if __name__ == "__main__":
    raise SystemExit(main())
