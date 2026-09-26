from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from ored.data.facts_import import FACT_CATEGORIES, FactsImportError, fact_to_row, facts_to_rows
from ored.data.training_data import CATEGORIES, check_record, split_of, group_key

FACTS = Path(__file__).resolve().parent.parent / "configs" / "facts.yaml"


def test_every_fact_in_the_repository_becomes_a_valid_row():
    facts = yaml.safe_load(FACTS.read_text(encoding="utf-8"))["facts"]
    rows = facts_to_rows(FACTS)
    assert len(rows) == len(facts)
    assert all(check_record(r).ok and not check_record(r).warnings for r in rows)
    assert {r.type for r in rows} == {"qna"}
    assert {r.dataset_tag for r in rows} == {"facts"} and {r.source for r in rows} == {"facts_yaml"}
    assert all(r.verified and r.enabled for r in rows)
    assert [r.metadata["facts_id"] for r in rows] == [str(f["id"]) for f in facts]
    assert [(r.input, r.output) for r in rows] == [(f["question"].strip(), f["answer"].strip()) for f in facts]


def test_mapping_targets_real_categories():
    assert all(category in CATEGORIES for category, _ in FACT_CATEGORIES.values())


def test_arithmetic_is_grouped_so_swapped_sums_share_a_split():
    a = fact_to_row({"id": "1", "category": "mathematics", "question": "What is 3 + 4?", "answer": "7."})
    b = fact_to_row({"id": "2", "category": "mathematics", "question": "What is 4 + 3?", "answer": "7."})
    c = fact_to_row({"id": "3", "category": "mathematics", "question": "What is 9 - 4?", "answer": "5."})
    d = fact_to_row({"id": "4", "category": "mathematics", "question": "What is 4 - 9?", "answer": "-5."})
    assert a.subject == "addition" and a.metadata["group"] == b.metadata["group"] == "addition:3,4"
    assert split_of(group_key(a), 1337, {"train": .7, "val": .15, "test": .15}) == \
        split_of(group_key(b), 1337, {"train": .7, "val": .15, "test": .15})
    assert c.metadata["group"] != d.metadata["group"]


def test_capitals_get_a_topic():
    row = fact_to_row({"id": "1", "category": "geography", "question": "What is the capital of Peru?", "answer": "Lima."})
    assert (row.category, row.subject, row.topic) == ("general_knowledge", "geography", "capitals")


def test_unmapped_categories_and_duplicates_are_refused(tmp_path):
    with pytest.raises(FactsImportError, match="no mapping"):
        fact_to_row({"id": "1", "category": "astrology", "question": "q?", "answer": "a."})
    path = tmp_path / "facts.yaml"
    path.write_text(yaml.safe_dump({"facts": [
        {"id": "1", "category": "physics", "question": "What is mass?", "answer": "Matter."},
        {"id": "2", "category": "physics", "question": "What  is mass?", "answer": "Matter."},
    ]}), encoding="utf-8")
    with pytest.raises(FactsImportError, match="same question and answer"):
        facts_to_rows(path)


def test_import_command_dry_run_writes_nothing(caplog):
    from ored.learning import InMemoryStore
    from ored.learning.training_data_cli import main

    total = len(yaml.safe_load(FACTS.read_text(encoding="utf-8"))["facts"])
    store = InMemoryStore()
    caplog.set_level("INFO")
    assert main(["import-facts", str(FACTS), "--dry-run"], store=store) == 0
    assert store.count_training_data() == 0 and f"{total} valid, 0 invalid" in caplog.text
    assert main(["import-facts", str(FACTS)], store=store) == 0
    assert store.count_training_data() == total
    assert main(["import-facts", str(FACTS)], store=store) == 2
    assert main(["import-facts", str(FACTS), "--skip-duplicates"], store=store) == 0
    assert store.count_training_data() == total
