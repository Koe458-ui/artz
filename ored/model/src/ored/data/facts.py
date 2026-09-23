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
TERMINATORS = ".?!"
SUBJECTS_LISTED = 20


class FactsError(RuntimeError):
    pass


@dataclass
class Fact:

    answer: str
    subject: str = ""
    question: str = ""
    category: str = ""

    @property
    def label(self) -> str:
        return self.subject or self.question

    @property
    def needs_a_template(self) -> bool:
        return not self.question

    def ask(self, template: str = "") -> str:
        if self.question:
            return self.question
        return template.replace(PLACEHOLDER, self.subject)

    def line(self, template: str = "") -> str:
        ending = "" if self.answer[-1:] in TERMINATORS else " ."
        return f"{self.ask(template)} {self.answer}{ending}"


@dataclass
class FactSpec:

    questions: List[str]
    facts: List[Fact]

    def validate(self) -> "FactSpec":
        if not self.facts:
            raise FactsError("a facts file needs at least one fact")

        templated = [fact for fact in self.facts if fact.needs_a_template]
        if templated and not self.questions:
            raise FactsError(
                f"{len(templated)} facts give a subject but no question, and the file "
                f"lists no question templates. Give each fact its own question, or add "
                f"a questions: list using {PLACEHOLDER}."
            )
        for question in self.questions:
            if PLACEHOLDER not in question:
                raise FactsError(
                    f"question template {question!r} has no {PLACEHOLDER} to fill in"
                )

        counts = Counter(fact.label for fact in self.facts)
        duplicates = sorted(label for label, seen in counts.items() if seen > 1)
        if duplicates:
            raise FactsError(
                f"these are listed more than once: {duplicates[:10]}"
                + (f" and {len(duplicates) - 10} more" if len(duplicates) > 10 else "")
            )
        return self

    @property
    def subjects(self) -> List[str]:
        return [fact.label for fact in self.facts]

    @property
    def categories(self) -> Dict[str, int]:
        return dict(Counter(fact.category for fact in self.facts if fact.category))

    @property
    def longest_line(self) -> int:
        return max((len(fact.line(self.questions[0] if self.questions else ""))
                    for fact in self.facts), default=0)


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
        entry = entry or {}
        answer = str(entry.get("answer") or "").strip()
        subject = str(entry.get("subject") or "").strip()
        question = str(entry.get("question") or "").strip()
        category = str(entry.get("category") or "").strip()
        if not answer or not (subject or question):
            raise FactsError(
                f"every fact needs an answer and either a question or a subject, "
                f"got {entry!r}"
            )
        facts.append(Fact(answer=answer, subject=subject, question=question,
                          category=category))

    questions = [str(q).strip() for q in (raw.get("questions") or []) if str(q).strip()]
    return FactSpec(questions=questions, facts=facts).validate()


def fact_lines(spec: FactSpec, repeats: int, rng: random.Random) -> List[str]:
    lines: List[str] = []
    for fact in spec.facts:
        for _ in range(repeats):
            template = rng.choice(spec.questions) if spec.questions else ""
            lines.append(fact.line(template))
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
                "facts": [
                    {
                        "subject": f.subject,
                        "question": f.question,
                        "category": f.category,
                        "answer": f.answer,
                    }
                    for f in spec.facts
                ],
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
    return [str(fact.get("subject") or fact.get("question") or "")
            for fact in raw.get("facts", [])]


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
    logger.info(f"templates  : {len(spec.questions)}")
    logger.info(f"facts      : {len(spec.facts)}")
    if spec.categories:
        listed = sorted(spec.categories.items())
        logger.info("categories : " + ", ".join(f"{name} {n}" for name, n in listed))
    logger.info(f"longest    : {spec.longest_line} characters "
                f"(raise data.block_size above this or it is cut short)")
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
