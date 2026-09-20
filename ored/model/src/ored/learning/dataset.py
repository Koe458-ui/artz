from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Sequence

from ored.learning.records import TrainingExample
from ored.learning.store import LearningStore

DEFAULT_EXPORT_DIR = "data/processed/learning"


class DatasetError(RuntimeError):
    pass


@dataclass
class DatasetSpec:

    tag: str
    min_examples: int = 50
    min_conversations: int = 10
    val_fraction: float = 0.15

    def validate(self) -> None:
        if not self.tag:
            raise DatasetError("a dataset needs a tag")
        if self.min_examples < 1:
            raise DatasetError("min_examples must be >= 1")
        if not 0 < self.val_fraction < 1:
            raise DatasetError("val_fraction must be in (0, 1)")


@dataclass
class DatasetReport:

    tag: str
    path: Path
    train: int
    val: int
    conversations: int

    def describe(self) -> str:
        return (
            f"dataset   : {self.tag}\n"
            f"written to: {self.path}\n"
            f"examples  : {self.train} train, {self.val} val\n"
            f"sources   : {self.conversations} conversations"
        )


def _split(examples: Sequence[TrainingExample], val_fraction: float) -> Dict[str, List[TrainingExample]]:
    ordered = sorted(examples, key=lambda e: e.id)
    cut = max(1, int(round(len(ordered) * (1.0 - val_fraction))))
    return {"train": ordered[:cut], "val": ordered[cut:]}


def export(
    store: LearningStore,
    spec: DatasetSpec,
    out_dir: str | Path = DEFAULT_EXPORT_DIR,
    candidate_lookup: Dict[str, str] | None = None,
) -> DatasetReport:
    spec.validate()
    examples = store.examples(spec.tag)

    if len(examples) < spec.min_examples:
        raise DatasetError(
            f"{spec.tag} holds {len(examples)} approved examples, "
            f"below the {spec.min_examples} this dataset requires"
        )

    lookup = candidate_lookup or {}
    sources = {lookup.get(e.candidate_id, e.candidate_id) for e in examples}
    if len(sources) < spec.min_conversations:
        raise DatasetError(
            f"{spec.tag} draws on {len(sources)} conversations, "
            f"below the {spec.min_conversations} this dataset requires"
        )

    parts = _split(examples, spec.val_fraction)
    if not parts["val"]:
        raise DatasetError("the split left no validation examples")

    directory = Path(out_dir) / spec.tag
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "dataset.jsonl"

    with path.open("w", encoding="utf-8") as handle:
        for split, rows in parts.items():
            for example in rows:
                handle.write(json.dumps({
                    "split": split,
                    "prompt": example.prompt,
                    "response": example.response,
                    "example_id": example.id,
                }, ensure_ascii=False) + "\n")

    return DatasetReport(
        tag=spec.tag,
        path=path,
        train=len(parts["train"]),
        val=len(parts["val"]),
        conversations=len(sources),
    )
