from __future__ import annotations

import argparse
from typing import List, Optional

from ored.data.corpus import load_arithmetic_pairs
from ored.evaluation.lm_evaluator import load_language_model
from ored.inference.generator import complete, generate_text
from ored.utils.logging_utils import get_logger, section
from ored.utils.seed import set_seed

logger = get_logger(__name__)

DEFAULT_CHECKPOINT = "checkpoints/char_transformer/best.pt"


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate text with a trained Ored.ai language model.",
        epilog=(
            "Examples:\n"
            '  python scripts/generate.py --prompt "the "\n'
            '  python scripts/generate.py --complete "17 + 9 = "\n'
            "  python scripts/generate.py --arithmetic\n"
            "  python scripts/generate.py --temperature 1.2 --tokens 600\n"
            "  python scripts/generate.py --interactive"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--prompt", default=None, help="text to continue")
    parser.add_argument("--tokens", type=int, default=None,
                        help="how many characters to generate")
    parser.add_argument("--temperature", type=float, default=None,
                        help="<1 safer and more repetitive, >1 more varied")
    parser.add_argument("--top-k", type=int, default=None,
                        help="sample only from the k most likely characters")
    parser.add_argument("--top-p", type=float, default=None,
                        help="nucleus sampling threshold, e.g. 0.9")
    parser.add_argument("--greedy", action="store_true",
                        help="always take the most likely character (deterministic)")
    parser.add_argument("--seed", type=int, default=None,
                        help="fix the sampling seed to reproduce a sample")
    parser.add_argument("--complete", default=None, metavar="TEXT",
                        help="greedily finish one line, e.g. \"17 + 9 = \"")
    parser.add_argument("--arithmetic", action="store_true",
                        help="ask it to add pairs held out of the training corpus")
    parser.add_argument("--n", type=int, default=12,
                        help="--arithmetic: how many held-out pairs to try")
    parser.add_argument("--quiet", action="store_true", help="output only")
    args = parser.parse_args(argv)

    model, tokenizer, cfg, info = load_language_model(args.checkpoint, args.device)
    device = info["device"]

    gen = cfg.generation
    tokens = args.tokens if args.tokens is not None else gen.max_new_tokens
    temperature = args.temperature if args.temperature is not None else gen.temperature
    top_k = args.top_k if args.top_k is not None else gen.top_k
    top_p = args.top_p if args.top_p is not None else gen.top_p
    prompt = args.prompt if args.prompt is not None else gen.prompt

    if args.seed is not None:
        set_seed(args.seed, cfg.deterministic)

    if not args.quiet:
        logger.info(section("ORED.AI -- TEXT GENERATION"))
        logger.info(f"checkpoint : {args.checkpoint}")
        logger.info(f"trained to : epoch {info.get('epoch')} (saved {info.get('saved_at')})")
        metrics = info.get("metrics") or {}
        if metrics:
            logger.info("val        : " + "  ".join(f"{k}={v:.4f}" for k, v in metrics.items()))
        logger.info(f"sampling   : temperature {temperature}, top_k {top_k}, top_p {top_p}"
                    f"{', greedy' if args.greedy else ''}")
        logger.info("")

    if args.complete is not None:
        written = complete(model, tokenizer, args.complete, cfg.data.block_size, device)
        logger.info(f"{args.complete}{written}")
        return 0

    if args.arithmetic:
        pairs = load_arithmetic_pairs(cfg.data.corpus.dir)["test"][:args.n]
        if not args.quiet:
            logger.info("These operand pairs were held out of the training corpus, so")
            logger.info("the model has never read the line it is completing.")
            logger.info("")
        correct = 0
        for a, b in pairs:
            written = complete(model, tokenizer, f"{a} + {b} = ",
                               cfg.data.block_size, device)
            expected = a + b
            ok = written.strip() == str(expected)
            correct += ok
            mark = "OK   " if ok else "WRONG"
            logger.info(f"  {a:>3} + {b:<3} = {written:<6} [{mark}] expected {expected}")
        logger.info("")
        logger.info(f"  {correct}/{len(pairs)} correct ({correct / max(1, len(pairs)):.0%})")
        return 0

    text = generate_text(
        model=model, tokenizer=tokenizer, prompt=prompt,
        max_new_tokens=tokens, block_size=cfg.data.block_size, device=device,
        temperature=temperature, top_k=top_k, top_p=top_p, greedy=args.greedy,
    )
    logger.info(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
