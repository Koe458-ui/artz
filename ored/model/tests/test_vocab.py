from __future__ import annotations

import pytest

from ored.data.tokenizer import CharTokenizer
from ored.inference.vocab_cli import corpus_words, inspect, tokenizer_from_checkpoint
from ored.inference.vocab_cli import main as vocab_main
from ored.training.trainer import Trainer


@pytest.fixture()
def lowercase_tokenizer():
    return CharTokenizer.from_text("abcdefghijklmnopqrstuvwxyz0123456789 +=.?\n")


def test_a_sentence_it_can_read_is_fully_known(lowercase_tokenizer):
    report = inspect(lowercase_tokenizer, "what is a human ?")

    assert report.known_ratio == 1.0
    assert report.unknown_characters == []
    assert report.learnable is True


def test_capitals_and_punctuation_outside_the_vocabulary_are_named(lowercase_tokenizer):
    report = inspect(lowercase_tokenizer, "What is a Human? Explain!")

    assert report.unknown_characters == ["!", "E", "H", "W"]
    assert report.known_ratio < 1.0
    assert report.learnable is False


def test_the_verdict_follows_the_online_learner_threshold(lowercase_tokenizer):
    report = inspect(lowercase_tokenizer, "Xbcdefghij", min_known_ratio=0.9)
    assert report.known_ratio == pytest.approx(0.9)
    assert report.learnable is True

    stricter = inspect(lowercase_tokenizer, "Xbcdefghij", min_known_ratio=0.95)
    assert stricter.learnable is False


def test_empty_text_is_not_learnable(lowercase_tokenizer):
    assert inspect(lowercase_tokenizer, "").known_ratio == 0.0
    assert inspect(lowercase_tokenizer, "").learnable is False


def test_words_are_checked_against_the_corpus(lowercase_tokenizer, tmp_path):
    (tmp_path / "train.txt").write_text("the cat sees the dog .\n", encoding="utf-8")
    known = corpus_words(tmp_path)

    report = inspect(lowercase_tokenizer, "the cat sees a mountain", known_words=known)

    assert report.unseen_words == ["a", "mountain"]


def test_the_word_check_is_skipped_without_a_corpus(lowercase_tokenizer, tmp_path):
    assert corpus_words(tmp_path) == set()
    assert inspect(lowercase_tokenizer, "anything").unseen_words is None


def test_the_report_reads_as_a_verdict(lowercase_tokenizer):
    accepted = inspect(lowercase_tokenizer, "what is a human ?").format()
    assert "unknown chars  : none" in accepted
    assert "online learning: YES" in accepted

    refused = inspect(lowercase_tokenizer, "What is a Human? Explain!").format()
    assert "online learning: NO" in refused
    assert "outside the vocabulary" in refused


@pytest.fixture()
def trained_lm_checkpoint(tiny_corpus):
    Trainer(tiny_corpus).fit()
    return tiny_corpus.checkpoint_dir / "best.pt"


def test_the_tokenizer_is_read_back_from_a_checkpoint(trained_lm_checkpoint):
    tokenizer = tokenizer_from_checkpoint(trained_lm_checkpoint)

    assert tokenizer.vocab_size > 1
    assert inspect(tokenizer, "3 + 4 = 7").learnable is True


def test_the_cli_reports_on_each_message(trained_lm_checkpoint, tmp_path):
    exit_code = vocab_main([
        "--checkpoint", str(trained_lm_checkpoint),
        "--text", "3 + 4 = 7",
        "--text", "WHAT IS A HUMAN?",
        "--corpus", str(tmp_path),
    ])

    assert exit_code == 0
