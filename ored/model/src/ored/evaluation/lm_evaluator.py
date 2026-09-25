from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch

from ored.config import Config, config_from_dict
from ored.data.corpus import load_arithmetic_pairs, load_grammar
from ored.data.text_dataset import build_text_datasets
from ored.data.tokenizer import Tokenizer
from ored.evaluation.text_metrics import score_arithmetic, score_text
from ored.inference.generator import complete, generate_text
from ored.models.registry import build_model
from ored.utils.checkpoint import check_compatible, load_checkpoint, load_model_state
from ored.utils.logging_utils import get_logger, section
from ored.utils.seed import resolve_device, set_seed

logger = get_logger(__name__)


def load_language_model(
    checkpoint_path: str | Path,
    device: str = "auto",
) -> Tuple[torch.nn.Module, Tokenizer, Config, Dict[str, Any]]:
    resolved = resolve_device(device)
    payload = load_checkpoint(checkpoint_path, map_location=resolved)
    cfg = config_from_dict(payload["config"])

    if not payload.get("tokenizer"):
        raise ValueError(
            f"{checkpoint_path} contains no tokenizer, so its token ids cannot be "
            f"interpreted. Was it trained with task: language_model?"
        )
    tokenizer = Tokenizer.from_dict(payload["tokenizer"])

    model = build_model(cfg, vocab_size=tokenizer.vocab_size).to(resolved)
    check_compatible(payload, model, path=checkpoint_path)
    load_model_state(model, payload["model_state_dict"], checkpoint_path)
    model.eval()

    info = {
        "path": str(checkpoint_path),
        "epoch": payload.get("epoch"),
        "metrics": payload.get("metrics", {}),
        "saved_at": payload.get("created_at"),
        "kind": payload.get("checkpoint_kind"),
        "global_step": payload.get("global_step"),
        "device": resolved,
    }
    return model, tokenizer, cfg, info


@torch.no_grad()
def measure_splits(model, cfg: Config, device: torch.device,
                   splits: List[str]) -> Dict[str, Dict[str, float]]:
    datasets, _ = build_text_datasets(cfg)
    criterion = torch.nn.CrossEntropyLoss()

    results: Dict[str, Dict[str, float]] = {}
    for split in splits:
        dataset = datasets[split]
        total_loss = 0.0
        total_tokens = 0

        for start in range(0, len(dataset), 32):
            chunk = [dataset[i] for i in range(start, min(start + 32, len(dataset)))]
            ids = torch.stack([c[0] for c in chunk]).to(device)
            targets = torch.stack([c[1] for c in chunk]).to(device)

            logits = model(ids)
            B, T, V = logits.shape
            loss = torch.nn.functional.cross_entropy(
                logits.reshape(B * T, V), targets.reshape(B * T), reduction="sum"
            )
            total_loss += loss.item()
            total_tokens += B * T

        mean_loss = total_loss / total_tokens
        results[split] = {
            "tokens": float(total_tokens),
            "loss": mean_loss,
            "bpc": mean_loss / math.log(2),
            "perplexity": math.exp(min(mean_loss, 20.0)),
        }
    return results


def evaluate_arithmetic(
    model, tokenizer: Tokenizer, cfg: Config, device: torch.device,
    split: str = "test", limit: int = 0,
):
    pairs = load_arithmetic_pairs(cfg.data.corpus.dir)[split]
    if limit:
        pairs = pairs[:limit]

    completions = []
    for a, b in pairs:
        prompt = f"{a} + {b} = "
        written = complete(model, tokenizer, prompt, cfg.data.block_size, device,
                           max_new_tokens=6)
        completions.append((a, b, written))
    return score_arithmetic(completions, reverse_answer=cfg.data.corpus.reverse_answer)


def evaluate_language_model(
    checkpoint_path: str | Path,
    splits: Optional[List[str]] = None,
    device: str = "auto",
    n_samples: int = 3,
    sample_tokens: int = 400,
    temperature: float = 0.8,
    arithmetic_limit: int = 0,
    seed: int = 1234,
) -> Dict[str, Any]:
    splits = splits or ["train", "val", "test"]
    model, tokenizer, cfg, info = load_language_model(checkpoint_path, device)
    resolved = info["device"]

    set_seed(seed, cfg.deterministic)

    logger.info(section("EVALUATION -- LANGUAGE MODEL"))
    logger.info(f"checkpoint : {checkpoint_path}")
    logger.info(f"trained to : epoch {info.get('epoch')}")
    logger.info(f"model      : {model.describe()}")
    logger.info("")

    split_results = measure_splits(model, cfg, resolved, splits)
    header = f"{'split':<8}{'tokens':>12}{'loss':>10}{'bits/char':>12}{'perplexity':>13}"
    logger.info(header)
    logger.info("-" * len(header))
    for split in splits:
        r = split_results[split]
        logger.info(f"{split:<8}{int(r['tokens']):>12,}{r['loss']:>10.4f}"
                    f"{r['bpc']:>12.4f}{r['perplexity']:>13.3f}")
    logger.info("")
    logger.info("bits/char = how many yes/no questions are needed, on average, to")
    logger.info(f"            identify the next character. {math.log2(tokenizer.vocab_size):.2f} = knows nothing.")

    grammar = load_grammar(cfg.data.corpus.dir)
    logger.info(section("GENERATED TEXT"))
    samples: List[str] = []
    for index in range(n_samples):
        text = generate_text(
            model=model, tokenizer=tokenizer, prompt="",
            max_new_tokens=sample_tokens, block_size=cfg.data.block_size,
            device=resolved, temperature=temperature,
        )
        samples.append(text)
        if index == 0:
            logger.info(f"(temperature {temperature}, {sample_tokens} characters)")
            logger.info("")
            for line in text.strip().split("\n")[:14]:
                logger.info(f"  {line}")

    quality = score_text("\n".join(samples), grammar,
                         reverse_answer=cfg.data.corpus.reverse_answer)
    logger.info("")
    logger.info(f"lines generated   : {quality.total_lines}")
    logger.info(f"valid sentences   : {quality.grammatical_lines}")
    logger.info(f"valid sums written: {quality.arithmetic_lines} "
                f"({quality.arithmetic_correct} arithmetically correct)")
    logger.info(f"malformed lines   : {quality.malformed_lines}")
    logger.info(f"WELL-FORMED RATE  : {quality.well_formed_rate:.1%}")
    if quality.examples_bad:
        logger.info("")
        logger.info("Examples of what it got wrong:")
        for line in quality.examples_bad:
            logger.info(f"  {line}")

    logger.info(section("ARITHMETIC"))
    if cfg.data.corpus.reverse_answer:
        logger.info("This corpus writes answer digits in reverse, so 13 + 8 = 12 is")
        logger.info("correct. Answers are un-reversed before they are scored.")
        logger.info("")

    seen = evaluate_arithmetic(model, tokenizer, cfg, resolved,
                               split="train", limit=arithmetic_limit)
    arithmetic = evaluate_arithmetic(model, tokenizer, cfg, resolved,
                                     split="test", limit=arithmetic_limit)

    header = f"{'pairs':<22}{'tested':>9}{'correct':>10}{'accuracy':>11}"
    logger.info(header)
    logger.info("-" * len(header))
    logger.info(f"{'train (seen ' + str(cfg.data.corpus.arithmetic_repeats) + 'x)':<22}"
                f"{seen.total:>9,}{seen.correct:>10,}{seen.accuracy:>11.1%}")
    logger.info(f"{'test (held out)':<22}"
                f"{arithmetic.total:>9,}{arithmetic.correct:>10,}{arithmetic.accuracy:>11.1%}")
    logger.info("")
    logger.info("Held-out pairs were excluded from the training corpus: the model has")
    logger.info("never read the line it is being asked to complete. The train row is")
    logger.info("the diagnostic -- low there means the model never fit the arithmetic")
    logger.info("at all, which is underfitting rather than failure to generalise.")
    if arithmetic.mistakes:
        logger.info("")
        logger.info("Mistakes on held-out pairs:")
        for line in arithmetic.mistakes:
            logger.info(f"  {line}")

    logger.info("")
    logger.info("Try it yourself:")
    logger.info('  python scripts/generate.py --prompt "anna "')
    logger.info('  python scripts/generate.py --complete "17 + 9 = "')

    return {
        "splits": split_results,
        "text_quality": quality,
        "arithmetic": arithmetic,
        "arithmetic_train": seen,
    }
