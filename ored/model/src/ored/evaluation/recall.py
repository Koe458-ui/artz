from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from ored.data.facts import TERMINATORS
from ored.inference.predictor import LanguageModelPredictor, load_predictor
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

DEFAULT_CORPUS_DIR = "data/raw/corpus"
MISSES_SHOWN = 10


class RecallError(RuntimeError):
    pass


@dataclass
class Miss:

    question: str
    expected: str
    written: str
    category: str = ""


@dataclass
class RecallReport:

    asked: int = 0
    right: int = 0
    misses: List[Miss] = field(default_factory=list)
    by_category: Dict[str, List[int]] = field(default_factory=dict)

    @property
    def score(self) -> float:
        return self.right / self.asked if self.asked else 0.0

    def format(self) -> str:
        lines = [f"recall     : {self.right}/{self.asked} = {self.score:.1%}"]
        if self.by_category:
            lines.append("")
            lines.append(f"{'category':<20}{'right':>8}{'asked':>8}{'score':>9}")
            lines.append("-" * 45)
            for name in sorted(self.by_category):
                right, asked = self.by_category[name]
                lines.append(f"{name:<20}{right:>8}{asked:>8}{right / asked:>8.1%}")
        return "\n".join(lines)


def read_facts(directory: str | Path) -> List[Dict[str, str]]:
    path = Path(directory) / "facts.json"
    if not path.exists():
        raise RecallError(
            f"{path} not found, so there is nothing to score.\n"
            f"Write a corpus first:  python scripts/generate_facts.py"
        )
    return json.loads(path.read_text(encoding="utf-8")).get("facts", [])


def ask_for(fact: Dict[str, str], templates: Sequence[str]) -> str:
    if fact.get("question"):
        return str(fact["question"])
    if not templates:
        raise RecallError(
            f"fact {fact.get('subject')!r} has no question and the corpus recorded "
            f"no templates to build one from"
        )
    return str(templates[0]).replace("{subject}", str(fact.get("subject", "")))


def expected_for(fact: Dict[str, str]) -> str:
    answer = str(fact.get("answer", "")).strip()
    return answer if answer[-1:] in TERMINATORS else answer + " ."


def score(
    predictor: LanguageModelPredictor,
    facts: Sequence[Dict[str, str]],
    templates: Sequence[str],
    max_new_tokens: int = 0,
) -> RecallReport:
    report = RecallReport()
    budget = max_new_tokens or max(len(expected_for(f)) for f in facts) + 8

    for fact in facts:
        question = ask_for(fact, templates)
        expected = expected_for(fact)
        written = predictor.predict(question + " ", max_new_tokens=budget).completion.strip()

        correct = written.rstrip(TERMINATORS + " ") == expected.rstrip(TERMINATORS + " ")
        report.asked += 1
        report.right += int(correct)

        name = str(fact.get("category") or "")
        if name:
            tally = report.by_category.setdefault(name, [0, 0])
            tally[0] += int(correct)
            tally[1] += 1

        if not correct:
            report.misses.append(Miss(question, expected, written, name))

    return report


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Ask a checkpoint every fact its corpus was built from.",
        epilog="Example:\n"
               "  python scripts/recall.py --checkpoint checkpoints/ored_v2/best.pt",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--checkpoint", default=None)
    parser.add_argument("--corpus", default=DEFAULT_CORPUS_DIR)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--tokens", type=int, default=0,
                        help="characters to write per answer (default: the longest answer)")
    parser.add_argument("--misses", type=int, default=MISSES_SHOWN,
                        help="how many wrong answers to print (0 = none)")
    args = parser.parse_args(argv)

    try:
        facts = read_facts(args.corpus)
        if not facts:
            raise RecallError(f"{args.corpus}/facts.json lists no facts")
        templates = json.loads(
            (Path(args.corpus) / "facts.json").read_text(encoding="utf-8")
        ).get("questions", [])

        predictor = load_predictor(args.checkpoint, args.device)
        if not isinstance(predictor, LanguageModelPredictor):
            raise RecallError("recall only applies to a language model checkpoint")

        report = score(predictor, facts, templates, args.tokens)
    except RecallError as exc:
        logger.error(str(exc))
        return 1

    logger.info(section("ORED.AI -- FACT RECALL"))
    logger.info(f"checkpoint : {predictor.checkpoint_info['path']}")
    logger.info(f"corpus     : {args.corpus}")
    logger.info(report.format())

    if args.misses and report.misses:
        logger.info("")
        logger.info(f"Wrong ({len(report.misses)} of {report.asked}):")
        for miss in report.misses[:args.misses]:
            logger.info(f"  {miss.question}")
            logger.info(f"    wanted : {miss.expected}")
            logger.info(f"    wrote  : {miss.written or '(nothing)'}")
        if len(report.misses) > args.misses:
            logger.info(f"  ... and {len(report.misses) - args.misses} more")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
