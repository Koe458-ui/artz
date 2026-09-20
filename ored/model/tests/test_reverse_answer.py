from __future__ import annotations

from ored.data.corpus import (format_answer, generate_corpus, load_arithmetic_pairs,
                              make_arithmetic, read_answer, read_corpus)
from ored.evaluation.text_metrics import score_arithmetic, score_text


def test_format_answer_reverses_only_when_asked():
    assert format_answer(21, False) == "21"
    assert format_answer(21, True) == "12"
    assert format_answer(9, True) == "9"
    assert format_answer(100, True) == "001"


def test_read_answer_is_the_inverse_of_format_answer():
    for total in (0, 7, 21, 30, 100, 99):
        assert int(read_answer(format_answer(total, True), True)) == total
        assert int(read_answer(format_answer(total, False), False)) == total


def test_make_arithmetic_writes_the_reversed_sum():
    assert make_arithmetic(13, 8) == "13 + 8 = 21"
    assert make_arithmetic(13, 8, reverse_answer=True) == "13 + 8 = 12"


def test_score_arithmetic_accepts_reversed_answers():
    completions = [(13, 8, "12"), (5, 4, "9"), (13, 8, "21")]

    reversed_score = score_arithmetic(completions, reverse_answer=True)
    assert reversed_score.correct == 2

    forward_score = score_arithmetic(completions, reverse_answer=False)
    assert forward_score.correct == 2
    assert reversed_score.mistakes and "21" in reversed_score.mistakes[0]


def test_score_arithmetic_counts_non_numbers_as_parse_failures():
    result = score_arithmetic([(1, 2, "abc")], reverse_answer=True)
    assert result.parse_failures == 1
    assert result.correct == 0


def test_score_text_grades_reversed_sums(tiny_corpus):
    grammar = {
        "names": ["anna"], "nouns": ["cat"], "adjectives": ["red"],
        "verbs_singular": ["sees"], "verbs_plural": ["see"],
        "templates": ["the {adj} {noun} {verb_s} {name} ."],
    }
    text = "\n".join(["", "13 + 8 = 12", "5 + 4 = 9", "13 + 8 = 21", ""])

    quality = score_text(text, grammar, reverse_answer=True)
    assert quality.arithmetic_lines == 3
    assert quality.arithmetic_correct == 2


def test_reversed_corpus_contains_reversed_sums(tiny_lm_cfg):
    tiny_lm_cfg.data.corpus.reverse_answer = True
    generate_corpus(tiny_lm_cfg, force=True)

    train_text = read_corpus(tiny_lm_cfg.data.corpus.dir, "train")
    pairs = load_arithmetic_pairs(tiny_lm_cfg.data.corpus.dir)["train"]

    for a, b in pairs[:10]:
        assert make_arithmetic(a, b, reverse_answer=True) in train_text


def test_held_out_pairs_stay_out_of_a_reversed_training_corpus(tiny_lm_cfg):
    tiny_lm_cfg.data.corpus.reverse_answer = True
    generate_corpus(tiny_lm_cfg, force=True)

    train_text = read_corpus(tiny_lm_cfg.data.corpus.dir, "train")
    for a, b in load_arithmetic_pairs(tiny_lm_cfg.data.corpus.dir)["test"]:
        assert make_arithmetic(a, b, reverse_answer=True) not in train_text
