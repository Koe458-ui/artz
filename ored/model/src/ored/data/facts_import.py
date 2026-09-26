from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import yaml

from ored.data.training_data import normalise_fields

DEFAULT_FACTS = "configs/facts.yaml"
FACTS_TAG = "facts"
FACTS_SOURCE = "facts_yaml"

FACT_CATEGORIES: Dict[str, Tuple[str, str]] = {
    "physics": ("science", "physics"),
    "chemistry": ("science", "chemistry"),
    "biology": ("science", "biology"),
    "astronomy": ("science", "astronomy"),
    "mathematics": ("mathematics", "arithmetic"),
    "computing": ("computer_science", "computer_fundamentals"),
    "geography": ("general_knowledge", "geography"),
    "civics": ("general_knowledge", "civics"),
    "english": ("grammar", "english_grammar"),
    "online_game": ("general_knowledge", "online_games"),
    "outdoor_sports": ("general_knowledge", "outdoor_sports"),
    "philosophy": ("general_knowledge", "philosophy"),
    "commerce": ("general_knowledge", "commerce"),
    "language_studies": ("language_skills", "linguistics"),
    "art_and_artists": ("general_knowledge", "art_and_artists"),
}

ARITHMETIC = re.compile(r"^What is (\d+)\s*([+\-x×*/÷])\s*(\d+)\?$")
OPERATIONS = {"+": "addition", "-": "subtraction", "x": "multiplication", "×": "multiplication",
              "*": "multiplication", "/": "division", "÷": "division"}
COMMUTATIVE = {"addition", "multiplication"}
CAPITAL = re.compile(r"^What is the capital of ", re.IGNORECASE)


class FactsImportError(ValueError):
    pass


def _arithmetic(question: str) -> Optional[Tuple[str, str]]:
    match = ARITHMETIC.match(question.strip())
    if not match:
        return None
    a, sign, b = match.groups()
    operation = OPERATIONS[sign]
    left, right = (min(a, b, key=int), max(a, b, key=int)) if operation in COMMUTATIVE else (a, b)
    return operation, f"{operation}:{left},{right}"


def fact_to_row(fact: Dict[str, object], dataset_tag: str = FACTS_TAG, verified: bool = True) -> object:
    from ored.learning.records import TrainingData

    original = str(fact.get("category") or "").strip()
    if original not in FACT_CATEGORIES:
        raise FactsImportError(f"fact {fact.get('id')!r} has category {original!r}, which has no mapping; "
                               f"known: {', '.join(FACT_CATEGORIES)}")
    question = str(fact.get("question") or "").strip()
    answer = str(fact.get("answer") or "").strip()
    if not question or not answer:
        raise FactsImportError(f"fact {fact.get('id')!r} needs both a question and an answer")

    category, subject = FACT_CATEGORIES[original]
    topic = None
    metadata: Dict[str, object] = {"facts_id": str(fact.get("id") or ""), "facts_category": original}
    if original == "mathematics":
        found = _arithmetic(question)
        if found:
            subject, metadata["group"] = found
    if original == "geography" and CAPITAL.match(question):
        topic = "capitals"

    return normalise_fields(TrainingData(
        type="qna", category=category, subject=subject, topic=topic, input=question, output=answer,
        language="en", source=FACTS_SOURCE, dataset_tag=dataset_tag, enabled=True, verified=verified,
        metadata=metadata,
    ))


def facts_to_rows(path: str | Path = DEFAULT_FACTS, dataset_tag: str = FACTS_TAG,
                  verified: bool = True) -> List[object]:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    facts = raw.get("facts") or []
    if raw.get("questions"):
        raise FactsImportError("templated facts (a questions: list) are not imported; give each fact its own question")
    rows = [fact_to_row(fact, dataset_tag, verified) for fact in facts]
    seen: Dict[str, str] = {}
    for row in rows:
        if row.fingerprint in seen:
            raise FactsImportError(f"facts {seen[row.fingerprint]} and {row.metadata['facts_id']} are the same "
                                   f"question and answer")
        seen[row.fingerprint] = str(row.metadata["facts_id"])
    return rows
