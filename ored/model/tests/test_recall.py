from __future__ import annotations

import json
from pathlib import Path

import pytest

from ored.data.facts import Fact, FactSpec, generate_fact_corpus
from ored.evaluation.recall import (
    RecallError,
    RecallReport,
    ask_for,
    expected_for,
    read_facts,
    score,
)
from ored.evaluation.recall import main as recall_main
from ored.training.trainer import Trainer


@pytest.fixture()
def spec():
    return FactSpec(
        questions=[],
        facts=[
            Fact(question="What is velocity?", category="physics",
                 answer="Speed with a direction."),
            Fact(question="What is a verb?", category="english",
                 answer="A doing word."),
        ],
    ).validate()


class FakePredictor:

    def __init__(self, replies):
        self.replies = replies
        self.checkpoint_info = {"path": "fake.pt"}

    def predict(self, prompt, max_new_tokens=8):
        class Written:
            completion = self.replies.get(prompt.strip(), "")
        return Written()


def test_a_question_is_taken_from_the_fact_when_it_has_one():
    assert ask_for({"question": "What is force?"}, []) == "What is force?"


def test_a_question_is_built_from_a_template_when_the_fact_has_none():
    assert ask_for({"subject": "a cat"}, ["what is {subject} ?"]) == "what is a cat ?"


def test_a_subject_with_no_template_cannot_be_asked():
    with pytest.raises(RecallError, match="no question"):
        ask_for({"subject": "a cat"}, [])


def test_the_expected_answer_keeps_its_own_ending():
    assert expected_for({"answer": "Ends here."}) == "Ends here."
    assert expected_for({"answer": "No ending"}) == "No ending ."


def test_every_right_answer_scores(spec):
    facts = [{"question": f.question, "answer": f.answer, "category": f.category}
             for f in spec.facts]
    predictor = FakePredictor({f["question"]: f["answer"] for f in facts})

    report = score(predictor, facts, [])

    assert report.asked == 2
    assert report.right == 2
    assert report.score == 1.0
    assert report.misses == []


def test_a_wrong_answer_is_recorded_with_what_was_written(spec):
    facts = [{"question": f.question, "answer": f.answer, "category": f.category}
             for f in spec.facts]
    predictor = FakePredictor({"What is velocity?": "Speed with a direction."})

    report = score(predictor, facts, [])

    assert report.right == 1
    assert report.score == 0.5
    assert len(report.misses) == 1
    assert report.misses[0].question == "What is a verb?"
    assert report.misses[0].written == ""


def test_scores_are_broken_down_by_category(spec):
    facts = [{"question": f.question, "answer": f.answer, "category": f.category}
             for f in spec.facts]
    predictor = FakePredictor({"What is velocity?": "Speed with a direction."})

    report = score(predictor, facts, [])

    assert report.by_category == {"physics": [1, 1], "english": [0, 1]}
    assert "physics" in report.format()


def test_trailing_punctuation_does_not_decide_the_score():
    facts = [{"question": "Q?", "answer": "An answer."}]
    predictor = FakePredictor({"Q?": "An answer"})

    assert score(predictor, facts, []).right == 1


def test_an_empty_report_scores_zero_without_dividing_by_zero():
    assert RecallReport().score == 0.0


def test_a_corpus_with_no_facts_file_says_so(tmp_path):
    with pytest.raises(RecallError, match="nothing to score"):
        read_facts(tmp_path)


def test_the_facts_written_beside_the_corpus_can_be_read_back(tiny_lm_cfg, spec):
    generate_fact_corpus(tiny_lm_cfg, spec, repeats=3)

    facts = read_facts(tiny_lm_cfg.data.corpus.dir)

    assert len(facts) == 2
    assert facts[0]["question"] == "What is velocity?"
    assert facts[0]["category"] == "physics"


def test_the_cli_scores_a_trained_checkpoint(tiny_lm_cfg, spec):
    generate_fact_corpus(tiny_lm_cfg, spec, repeats=3)
    Trainer(tiny_lm_cfg).fit()

    exit_code = recall_main([
        "--checkpoint", str(tiny_lm_cfg.checkpoint_dir / "best.pt"),
        "--corpus", str(tiny_lm_cfg.data.corpus.dir),
        "--device", "cpu",
        "--tokens", "20",
    ])

    assert exit_code == 0


def test_the_cli_reports_a_missing_corpus(tmp_path):
    assert recall_main(["--corpus", str(tmp_path)]) == 1
