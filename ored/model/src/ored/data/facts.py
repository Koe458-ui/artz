from __future__ import annotations

import argparse
import json
import random
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence

import yaml

from ored.config import Config, load_config
from ored.data.corpus import SPLITS, generate_corpus
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

DEFAULT_FACTS = "configs/facts.yaml"
PLACEHOLDER = "{subject}"
SUBJECTS_LISTED = 20


class FactsError(RuntimeError):
    pass


@dataclass
class Fact:

    subject: str
    answer: str

    def line(self, question: str) -> str:
        return f"{question.replace(PLACEHOLDER, self.subject)} {self.answer} ."


@dataclass
class FactSpec:

    questions: List[str]
    facts: List[Fact]

    def validate(self) -> "FactSpec":
        if not self.questions:
            raise FactsError("a facts file needs at least one question template")
        if not self.facts:
            raise FactsError("a facts file needs at least one fact")
        for question in self.questions:
            if PLACEHOLDER not in question:
                raise FactsError(
                    f"question template {question!r} has no {PLACEHOLDER} to fill in"
                )
        counts = Counter(fact.subject for fact in self.facts)
        duplicates = sorted(subject for subject, seen in counts.items() if seen > 1)
        if duplicates:
            raise FactsError(
                f"these subjects are listed more than once: {duplicates[:10]}"
                + (f" and {len(duplicates) - 10} more" if len(duplicates) > 10 else "")
            )
        return self

    @property
    def subjects(self) -> List[str]:
        return [fact.subject for fact in self.facts]


def load_facts(path: str | Path = DEFAULT_FACTS) -> FactSpec:
    path = Path(path)
    if not path.exists():
        raise FactsError(
            f"facts file not found: {path}\n"
            f"Copy {DEFAULT_FACTS} and list what Ored should be able to answer."
        )

    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    entries = raw.get("facts") or []

    facts: List[Fact] = []
    for entry in entries:
        subject = str((entry or {}).get("subject") or "").strip()
        answer = str((entry or {}).get("answer") or "").strip()
        if not subject or not answer:
            raise FactsError(f"every fact needs a subject and an answer, got {entry!r}")
        facts.append(Fact(subject=subject, answer=answer))

    questions = [str(q).strip() for q in (raw.get("questions") or []) if str(q).strip()]
    return FactSpec(questions=questions, facts=facts).validate()


def fact_lines(spec: FactSpec, repeats: int, rng: random.Random) -> List[str]:
    lines: List[str] = []
    for fact in spec.facts:
        for _ in range(repeats):
            lines.append(fact.line(rng.choice(spec.questions)))
    rng.shuffle(lines)
    return lines


def repeats_by_split(repeats: int, val_test_fraction: float) -> Dict[str, int]:
    smaller = max(1, int(round(repeats * val_test_fraction)))
    return {"train": repeats, "val": smaller, "test": smaller}


def generate_fact_corpus(
    cfg: Config,
    spec: FactSpec,
    repeats: int = 60,
    force: bool = True,
) -> Dict[str, object]:
    if repeats < 1:
        raise FactsError("repeats must be >= 1")

    counts = repeats_by_split(repeats, cfg.data.corpus.val_test_fraction)
    extra_lines = {
        split: fact_lines(spec, counts[split], random.Random(cfg.seed + SPLITS.index(split)))
        for split in SPLITS
    }

    stats = generate_corpus(cfg, force=force, extra_lines=extra_lines)

    directory = Path(cfg.data.corpus.dir)
    (directory / "facts.json").write_text(
        json.dumps(
            {
                "questions": spec.questions,
                "facts": [{"subject": f.subject, "answer": f.answer} for f in spec.facts],
                "repeats": counts,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return stats


def load_fact_subjects(directory: str | Path) -> List[str]:
    path = Path(directory) / "facts.json"
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [str(fact["subject"]) for fact in raw.get("facts", [])]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Write the corpus with a set of questions Ored should answer.",
        epilog="Edit configs/facts.yaml, run this, then train:\n"
               "  python scripts/generate_facts.py\n"
               "  python scripts/train.py --config configs/char_transformer.yaml",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--config", default="configs/char_transformer.yaml")
    parser.add_argument("--facts", default=DEFAULT_FACTS)
    parser.add_argument("--repeats", type=int, default=60,
                        help="how many times each fact appears in the training corpus")
    parser.add_argument("--set", dest="overrides", action="append", default=[],
                        metavar="KEY=VALUE")
    args = parser.parse_args(argv)

    try:
        spec = load_facts(args.facts)
        cfg = load_config(args.config, args.overrides)
        generate_fact_corpus(cfg, spec, repeats=args.repeats)
    except FactsError as exc:
        logger.error(str(exc))
        return 1

    logger.info("")
    logger.info(section("FACTS ADDED"))
    logger.info(f"facts file : {args.facts}")
    logger.info(f"questions  : {len(spec.questions)} templates")
    logger.info(f"subjects   : {len(spec.facts)}")
    for subject in spec.subjects[:SUBJECTS_LISTED]:
        logger.info(f"  {subject}")
    if len(spec.facts) > SUBJECTS_LISTED:
        logger.info(f"  ... and {len(spec.facts) - SUBJECTS_LISTED} more")
    logger.info("")
    logger.info("Train on it:")
    logger.info(f"  python scripts/train.py --config {args.config}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
