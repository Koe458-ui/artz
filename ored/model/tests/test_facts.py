from __future__ import annotations

import json
from pathlib import Path

import pytest

from ored.data.corpus import read_corpus
from ored.data.facts import (
    DEFAULT_FACTS,
    Fact,
    FactSpec,
    FactsError,
    fact_lines,
    generate_fact_corpus,
    load_fact_subjects,
    load_facts,
    repeats_by_split,
)
from ored.data.facts import main as facts_main

CONFIGS = Path(__file__).resolve().parent.parent / "configs"


@pytest.fixture()
def spec():
    return FactSpec(
        questions=["what is {subject} ?", "tell me what {subject} is ."],
        facts=[
            Fact(subject="a human", answer="a human is a person who thinks and feels"),
            Fact(subject="ored", answer="ored is a small model that learns"),
        ],
    ).validate()


def test_a_fact_becomes_a_question_and_its_answer(spec):
    line = spec.facts[0].line("what is {subject} ?")
    assert line == "what is a human ? a human is a person who thinks and feels ."


def test_every_fact_appears_as_often_as_asked(spec):
    import random

    lines = fact_lines(spec, repeats=5, rng=random.Random(0))

    assert len(lines) == 10
    for fact in spec.facts:
        assert sum(1 for line in lines if line.startswith(("what is " + fact.subject,
                                                           "tell me what " + fact.subject))) == 5


def test_a_question_template_without_a_subject_is_rejected():
    with pytest.raises(FactsError, match="no .subject."):
        FactSpec(questions=["what is a human ?"],
                 facts=[Fact(subject="a", answer="b")]).validate()


def test_a_repeated_subject_is_rejected():
    with pytest.raises(FactsError, match="more than once"):
        FactSpec(
            questions=["what is {subject} ?"],
            facts=[Fact(subject="a cat", answer="one"),
                   Fact(subject="a cat", answer="two")],
        ).validate()


def test_an_empty_spec_is_rejected():
    with pytest.raises(FactsError, match="at least one fact"):
        FactSpec(questions=["what is {subject} ?"], facts=[]).validate()


def test_a_subject_without_any_template_is_rejected():
    with pytest.raises(FactsError, match="no question"):
        FactSpec(questions=[], facts=[Fact(subject="a cat", answer="one")]).validate()


def test_a_fact_may_carry_its_own_question():
    fact = Fact(question="What is velocity?", category="physics",
                answer="Velocity is speed together with a specified direction.")

    assert fact.needs_a_template is False
    assert fact.label == "What is velocity?"
    assert fact.line() == (
        "What is velocity? Velocity is speed together with a specified direction.")


def test_an_answer_that_already_ends_a_sentence_is_not_given_a_second_full_stop():
    assert Fact(question="Q?", answer="Ends here.").line() == "Q? Ends here."
    assert Fact(question="Q?", answer="Ends here!").line() == "Q? Ends here!"
    assert Fact(question="Q?", answer="No ending").line() == "Q? No ending ."


def test_explicit_questions_need_no_templates():
    spec = FactSpec(questions=[], facts=[
        Fact(question="What is velocity?", answer="Speed with direction."),
        Fact(question="What is force?", answer="Mass times acceleration."),
    ]).validate()

    assert spec.subjects == ["What is velocity?", "What is force?"]


def test_two_facts_answering_the_same_question_are_rejected():
    with pytest.raises(FactsError, match="more than once"):
        FactSpec(questions=[], facts=[
            Fact(question="What is force?", answer="one"),
            Fact(question="What is force?", answer="two"),
        ]).validate()


def test_categories_and_longest_line_are_reported():
    spec = FactSpec(questions=[], facts=[
        Fact(question="What is force?", category="physics", answer="Mass times a."),
        Fact(question="What is a verb?", category="english", answer="A doing word."),
    ]).validate()

    assert spec.categories == {"physics": 1, "english": 1}
    assert spec.longest_line == len("What is a verb? A doing word.")


def test_the_shipped_facts_file_loads():
    loaded = load_facts(CONFIGS / "facts.yaml")

    assert len(loaded.facts) > 100
    assert all(fact.answer for fact in loaded.facts)
    assert len(set(loaded.subjects)) == len(loaded.facts)


def test_a_missing_facts_file_says_where_to_look(tmp_path):
    with pytest.raises(FactsError, match="facts file not found"):
        load_facts(tmp_path / "nope.yaml")


def test_a_fact_without_an_answer_is_rejected(tmp_path):
    path = tmp_path / "facts.yaml"
    path.write_text("questions: ['what is {subject} ?']\nfacts:\n  - subject: a cat\n",
                    encoding="utf-8")

    with pytest.raises(FactsError, match="either a question or a subject"):
        load_facts(path)


def test_val_and_test_get_fewer_repeats_than_train():
    counts = repeats_by_split(60, 0.15)

    assert counts["train"] == 60
    assert counts["val"] == counts["test"] == 9
    assert counts["val"] >= 1


def test_the_corpus_carries_the_facts_and_keeps_the_arithmetic(tiny_lm_cfg, spec):
    generate_fact_corpus(tiny_lm_cfg, spec, repeats=6)

    train = read_corpus(tiny_lm_cfg.data.corpus.dir, "train")
    assert "what is a human ?" in train or "tell me what a human is ." in train
    assert "a human is a person who thinks and feels ." in train
    assert " + " in train and " = " in train

    for split in ("val", "test"):
        assert "ored is a small model that learns ." in read_corpus(
            tiny_lm_cfg.data.corpus.dir, split)


def test_the_subjects_are_recorded_beside_the_corpus(tiny_lm_cfg, spec):
    generate_fact_corpus(tiny_lm_cfg, spec, repeats=4)

    recorded = json.loads(
        (Path(tiny_lm_cfg.data.corpus.dir) / "facts.json").read_text(encoding="utf-8"))

    assert recorded["repeats"]["train"] == 4
    assert load_fact_subjects(tiny_lm_cfg.data.corpus.dir) == ["a human", "ored"]
    assert recorded["facts"][0]["category"] == ""


def test_no_subjects_when_the_corpus_has_no_facts(tmp_path):
    assert load_fact_subjects(tmp_path) == []


def test_the_same_seed_writes_the_same_corpus(tiny_lm_cfg, spec):
    generate_fact_corpus(tiny_lm_cfg, spec, repeats=4)
    first = read_corpus(tiny_lm_cfg.data.corpus.dir, "train")

    generate_fact_corpus(tiny_lm_cfg, spec, repeats=4)
    assert read_corpus(tiny_lm_cfg.data.corpus.dir, "train") == first


def test_repeats_must_be_positive(tiny_lm_cfg, spec):
    with pytest.raises(FactsError, match="repeats must be"):
        generate_fact_corpus(tiny_lm_cfg, spec, repeats=0)


def test_the_cli_writes_a_corpus_from_the_shipped_facts(tiny_lm_cfg, tmp_path):
    exit_code = facts_main([
        "--config", str(CONFIGS / "char_transformer.yaml"),
        "--facts", DEFAULT_FACTS,
        "--repeats", "3",
        "--set", f"data.corpus.dir={tmp_path / 'corpus'}",
        "--set", "data.corpus.sentence_lines=40",
        "--set", "data.corpus.max_operand=9",
    ])

    assert exit_code == 0
    train = read_corpus(tmp_path / "corpus", "train")
    shipped = load_facts(DEFAULT_FACTS)
    assert shipped.facts[0].line() in train


def test_the_cli_reports_a_missing_facts_file(tmp_path):
    assert facts_main(["--facts", str(tmp_path / "nope.yaml")]) == 1
