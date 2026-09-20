from __future__ import annotations

import pytest
import torch

from ored.data.corpus import load_arithmetic_pairs, make_arithmetic, read_corpus
from ored.data.text_dataset import TextDataset, build_text_dataloaders, build_text_datasets
from ored.data.tokenizer import CharTokenizer


def test_targets_are_inputs_shifted_by_one():
    ids = torch.arange(50)
    dataset = TextDataset(ids, block_size=8, stride=4)
    x, y = dataset[0]
    assert torch.equal(x[1:], y[:-1])
    assert torch.equal(y, ids[1:9])


def test_window_shapes_and_count():
    ids = torch.arange(100)
    dataset = TextDataset(ids, block_size=10, stride=10)
    assert len(dataset) == 9
    x, y = dataset[0]
    assert x.shape == (10,) and y.shape == (10,)


def test_stride_controls_overlap():
    ids = torch.arange(100)
    dense = TextDataset(ids, block_size=10, stride=5)
    sparse = TextDataset(ids, block_size=10, stride=10)
    assert len(dense) > len(sparse)


def test_corpus_too_short_is_rejected():
    with pytest.raises(ValueError, match="fewer than"):
        TextDataset(torch.arange(5), block_size=10, stride=1)


def test_arithmetic_pairs_are_disjoint_across_splits(tiny_corpus):
    pairs = load_arithmetic_pairs(tiny_corpus.data.corpus.dir)
    train, val, test = set(pairs["train"]), set(pairs["val"]), set(pairs["test"])
    assert train & val == set()
    assert train & test == set()
    assert val & test == set()


def test_held_out_sums_are_absent_from_training_text(tiny_corpus):
    pairs = load_arithmetic_pairs(tiny_corpus.data.corpus.dir)
    train_text = read_corpus(tiny_corpus.data.corpus.dir, "train")
    for a, b in pairs["test"]:
        assert make_arithmetic(a, b) not in train_text, f"{a}+{b} leaked into training text"


def test_corpus_arithmetic_is_correct(tiny_corpus):
    import re
    text = read_corpus(tiny_corpus.data.corpus.dir, "train")
    pattern = re.compile(r"^(\d+) \+ (\d+) = (\d+)$")
    checked = 0
    for line in text.split("\n"):
        match = pattern.match(line.strip())
        if match:
            a, b, c = (int(g) for g in match.groups())
            assert a + b == c
            checked += 1
    assert checked > 0


def test_tokenizer_is_fitted_on_training_text_only(tiny_corpus):
    datasets, tokenizer = build_text_datasets(tiny_corpus)
    train_text = read_corpus(tiny_corpus.data.corpus.dir, "train")
    assert set(tokenizer.itos[1:]) == set(train_text)


def test_dataloaders_produce_correct_batch_shapes(tiny_corpus):
    loaders, datasets, tokenizer = build_text_dataloaders(tiny_corpus)
    ids, targets = next(iter(loaders["train"]))
    assert ids.shape[1] == tiny_corpus.data.block_size
    assert ids.shape == targets.shape
    assert ids.dtype == torch.long
    assert int(ids.max()) < tokenizer.vocab_size


def test_eval_splits_use_non_overlapping_windows(tiny_corpus):
    _, datasets, _ = build_text_dataloaders(tiny_corpus)
    assert datasets["val"].stride == tiny_corpus.data.block_size
    assert datasets["test"].stride == tiny_corpus.data.block_size
