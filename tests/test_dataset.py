from __future__ import annotations

import pytest
import torch

from ored.data.dataset import SPLIT_NAMES, BitAdditionDataset, build_dataloaders, load_rows
from ored.data.generate import build_examples, generate_dataset
from ored.data.preprocessing import bits_to_int


def test_generates_every_possible_pair():
    rows = build_examples(n_bits=3)
    assert len(rows) == 8 * 8
    pairs = {(row["a"], row["b"]) for row in rows}
    assert len(pairs) == 64


def test_labels_are_actually_correct():
    for row in build_examples(n_bits=4):
        assert row["sum"] == row["a"] + row["b"]
        assert bits_to_int(row["sum_bits"]) == row["sum"]
        assert bits_to_int(row["a_bits"]) == row["a"]


def test_splits_are_disjoint_and_complete(tiny_dataset):
    rows = load_rows(tiny_dataset.data.raw_path)
    by_split = {name: {(r["a"], r["b"]) for r in rows if r["split"] == name}
                for name in SPLIT_NAMES}

    assert by_split["train"] & by_split["val"] == set()
    assert by_split["train"] & by_split["test"] == set()
    assert by_split["val"] & by_split["test"] == set()
    assert sum(len(v) for v in by_split.values()) == len(rows)


def test_generation_is_deterministic(tiny_cfg, tmp_path):
    generate_dataset(tiny_cfg, force=True)
    first = load_rows(tiny_cfg.data.raw_path)
    generate_dataset(tiny_cfg, force=True)
    second = load_rows(tiny_cfg.data.raw_path)
    assert first == second


def test_tensor_shapes_and_dtypes(tiny_dataset):
    rows = load_rows(tiny_dataset.data.raw_path)
    dataset = BitAdditionDataset(rows, "train", tiny_dataset.data.n_bits)

    x, y = dataset[0]
    assert x.shape == (tiny_dataset.data.input_size,)
    assert y.shape == (tiny_dataset.data.output_size,)
    assert x.dtype == torch.float32 and y.dtype == torch.float32
    assert set(x.tolist()) <= {0.0, 1.0}


def test_dataloader_batches(tiny_dataset):
    loaders, datasets = build_dataloaders(tiny_dataset)
    inputs, targets = next(iter(loaders["train"]))
    assert inputs.shape[0] <= tiny_dataset.data.batch_size
    assert inputs.shape[1] == tiny_dataset.data.input_size
    assert targets.shape[1] == tiny_dataset.data.output_size

    seen = sum(batch[0].shape[0] for batch in loaders["train"])
    assert seen == len(datasets["train"])


def test_unknown_split_is_rejected(tiny_dataset):
    rows = load_rows(tiny_dataset.data.raw_path)
    with pytest.raises(ValueError):
        BitAdditionDataset(rows, "nonexistent", tiny_dataset.data.n_bits)
