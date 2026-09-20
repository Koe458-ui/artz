from __future__ import annotations

import pytest
import torch

from ored.data.tokenizer import build_tokenizer
from ored.learning.online import OnlineLearner, OnlinePolicy
from ored.models.registry import build_model


@pytest.fixture()
def learner(tiny_corpus, tmp_path):
    from ored.data.corpus import read_corpus

    text = read_corpus(tiny_corpus.data.corpus.dir, "train")
    tokenizer = build_tokenizer(tiny_corpus.data.tokenizer, text)
    model = build_model(tiny_corpus, vocab_size=tokenizer.vocab_size)
    return OnlineLearner(
        model=model,
        tokenizer=tokenizer,
        cfg=tiny_corpus,
        device=torch.device("cpu"),
        policy=OnlinePolicy(learning_rate=1e-3, save_every=0),
        live_dir=tmp_path / "live",
    )


def test_a_message_moves_the_weights(learner):
    before = [p.detach().clone() for p in learner.model.parameters()]
    result = learner.learn("the small cat sees the red dog .")
    assert result.learned
    after = list(learner.model.parameters())
    assert any(not torch.equal(b, a) for b, a in zip(before, after))


def test_learning_lowers_the_loss_on_the_same_text(learner):
    text = "the small cat sees the red dog ."
    first = learner.learn(text).loss
    for _ in range(12):
        learner.learn(text)
    assert learner.learn(text).loss < first


def test_a_short_message_is_not_learned_from(learner):
    result = learner.learn("hi")
    assert not result.learned and result.reason == "too short"


def test_text_outside_the_vocabulary_is_refused(learner):
    result = learner.learn("你好世界こんにちはمرحبا")
    assert not result.learned and result.reason == "outside the vocabulary"


def test_stats_count_what_happened(learner):
    learner.learn("the small cat sees the red dog .")
    learner.learn("hi")
    assert learner.stats.seen == 2
    assert learner.stats.learned == 1
    assert learner.stats.skipped == 1


def test_it_replies_with_text(learner):
    answer = learner.reply("the ", max_new_tokens=12)
    assert isinstance(answer, str)


def test_respond_answers_and_learns(learner):
    before = learner.stats.learned
    answer, result = learner.respond("the small cat sees the red dog .")
    assert isinstance(answer, str)
    assert learner.stats.learned == before + 1
    assert result.learned


def test_the_live_checkpoint_is_written_separately(learner, tmp_path):
    learner.learn("the small cat sees the red dog .")
    path = learner.save()
    assert path.exists()
    assert "live" in str(path)


def test_a_long_message_is_clipped_to_the_block(learner):
    result = learner.learn("the small cat sees the red dog . " * 200)
    assert result.learned
    assert result.tokens <= learner.block_size + 1


def test_the_policy_rejects_nonsense():
    with pytest.raises(ValueError):
        OnlinePolicy(learning_rate=0).validate()
    with pytest.raises(ValueError):
        OnlinePolicy(steps_per_message=0).validate()
