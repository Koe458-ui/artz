from __future__ import annotations

import pytest

from ored.data.tokenizer import UNK_TOKEN, CharTokenizer, Tokenizer, build_tokenizer


@pytest.fixture()
def tokenizer():
    return CharTokenizer.from_text("the cat sees 13 + 8 = 21 .\n")


def test_round_trip_is_exact(tokenizer):
    for text in ["the cat", "13 + 8 = 21", "\n", "the cat sees 13 .\n"]:
        assert tokenizer.decode(tokenizer.encode(text)) == text


def test_vocab_is_deterministic():
    a = CharTokenizer.from_text("banana split")
    b = CharTokenizer.from_text("banana split")
    assert a.itos == b.itos


def test_vocab_ordering_does_not_depend_on_text_order():
    a = CharTokenizer.from_text("abc")
    b = CharTokenizer.from_text("cba")
    assert a.itos == b.itos


def test_unknown_token_is_id_zero(tokenizer):
    assert tokenizer.itos[0] == UNK_TOKEN
    assert tokenizer.encode("Z") == [0]


def test_unknown_characters_do_not_crash(tokenizer):
    assert tokenizer.decode(tokenizer.encode("the ZZZ cat")) == "the  cat"


def test_vocab_size_counts_the_unknown_token(tokenizer):
    assert tokenizer.vocab_size == len(tokenizer.itos)
    assert tokenizer.vocab_size == len(set("the cat sees 13 + 8 = 21 .\n")) + 1


def test_out_of_range_id_is_rejected(tokenizer):
    with pytest.raises(ValueError, match="outside this tokenizer"):
        tokenizer.decode([tokenizer.vocab_size + 5])


def test_save_and_load(tokenizer, tmp_path):
    path = tokenizer.save(tmp_path / "tok.json")
    reloaded = Tokenizer.load(path)
    assert reloaded.itos == tokenizer.itos
    assert reloaded.encode("the cat") == tokenizer.encode("the cat")


def test_dict_round_trip(tokenizer):
    rebuilt = Tokenizer.from_dict(tokenizer.to_dict())
    assert rebuilt.decode(rebuilt.encode("13 + 8")) == "13 + 8"


def test_build_tokenizer_rejects_unknown_name():
    with pytest.raises(ValueError, match="unknown tokenizer"):
        build_tokenizer("bpe_that_does_not_exist_yet", "text")
