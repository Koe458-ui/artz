from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Sequence

from ored.data.tokenizer import Tokenizer
from ored.inference.predictor import read_tokenizer, resolve_checkpoint
from ored.learning.online import OnlinePolicy
from ored.utils.checkpoint import load_checkpoint
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

DEFAULT_CORPUS_DIR = "data/raw/corpus"
UNK_ID = 0
WORD_RE = re.compile(r"[^\W\d_]+", re.UNICODE)


@dataclass
class VocabReport:

    text: str
    vocab_size: int
    symbols: str
    known_ratio: float
    unknown_characters: List[str]
    min_known_ratio: float
    unseen_words: Optional[List[str]] = None

    @property
    def learnable(self) -> bool:
        return self.known_ratio >= self.min_known_ratio

    def format(self) -> str:
        lines = [
            f"text           : {self.text!r}",
            f"known          : {self.known_ratio:.1%}",
            f"unknown chars  : {self.unknown_characters or 'none'}",
        ]
        if self.unseen_words is not None:
            lines.append(f"words not seen : {self.unseen_words or 'none'}")
        verdict = "YES" if self.learnable else (
            f"NO -- below {self.min_known_ratio:.0%}, the server skips it "
            f"as outside the vocabulary"
        )
        lines.append(f"online learning: {verdict}")
        return "\n".join(lines)


def corpus_words(directory: str | Path, split: str = "train") -> set:
    path = Path(directory) / f"{split}.txt"
    if not path.exists():
        return set()
    return {word.lower() for word in WORD_RE.findall(path.read_text(encoding="utf-8"))}


def inspect(
    tokenizer: Tokenizer,
    text: str,
    min_known_ratio: float = OnlinePolicy().min_known_ratio,
    known_words: Optional[set] = None,
) -> VocabReport:
    ids = tokenizer.encode(text)
    unknown = sorted({c for c, i in zip(text, ids) if i == UNK_ID})
    ratio = sum(1 for i in ids if i != UNK_ID) / len(ids) if ids else 0.0

    unseen = None
    if known_words is not None:
        unseen = sorted({
            word for word in WORD_RE.findall(text) if word.lower() not in known_words
        })

    symbols = "".join(s for s in tokenizer.itos[1:] if s != "\n")
    return VocabReport(
        text=text,
        vocab_size=tokenizer.vocab_size,
        symbols=symbols,
        known_ratio=ratio,
        unknown_characters=unknown,
        min_known_ratio=min_known_ratio,
        unseen_words=unseen,
    )


def tokenizer_from_checkpoint(path: str | Path) -> Tokenizer:
    return read_tokenizer(load_checkpoint(path, map_location="cpu"), path)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Show what a checkpoint can read, and whether it would learn from a message.",
        epilog='Examples:\n'
               '  python scripts/vocab.py\n'
               '  python scripts/vocab.py --text "what is a human ?"\n'
               '  python scripts/vocab.py --text "What is a Human?" --text "17 + 9 = "',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--checkpoint", default=None)
    parser.add_argument("--text", action="append", default=None, metavar="TEXT",
                        help="a message to test; repeat for several")
    parser.add_argument("--corpus", default=DEFAULT_CORPUS_DIR,
                        help=f"corpus to check words against (default: {DEFAULT_CORPUS_DIR})")
    parser.add_argument("--no-words", action="store_true",
                        help="skip the word check and report characters only")
    args = parser.parse_args(argv)

    checkpoint = resolve_checkpoint(args.checkpoint)
    tokenizer = tokenizer_from_checkpoint(checkpoint)

    known_words = None if args.no_words else corpus_words(args.corpus)
    if known_words is not None and not known_words:
        logger.info(f"(no corpus at {args.corpus} -- checking characters only)")
        known_words = None

    logger.info(section("ORED.AI -- VOCABULARY"))
    logger.info(f"checkpoint : {checkpoint}")
    logger.info(f"tokenizer  : {tokenizer.describe()}")
    if known_words is not None:
        logger.info(f"corpus     : {args.corpus}  ({len(known_words):,} distinct words)")

    for text in args.text or []:
        logger.info("")
        logger.info(inspect(tokenizer, text, known_words=known_words).format())

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
