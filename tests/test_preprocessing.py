from __future__ import annotations

import pytest
import torch

from ored.data.preprocessing import (
    bits_to_int,
    bits_to_string,
    decode_prediction,
    encode_pair,
    encode_target,
    int_to_bits,
    logits_to_bits,
)


@pytest.mark.parametrize("value,n_bits,expected", [
    (0, 4, [0, 0, 0, 0]),
    (1, 4, [0, 0, 0, 1]),
    (9, 4, [1, 0, 0, 1]),
    (15, 4, [1, 1, 1, 1]),
    (30, 5, [1, 1, 1, 1, 0]),
])
def test_int_to_bits_is_most_significant_first(value, n_bits, expected):
    assert int_to_bits(value, n_bits) == expected


def test_round_trip_every_value():
    for n_bits in (1, 4, 6):
        for value in range(2**n_bits):
            assert bits_to_int(int_to_bits(value, n_bits)) == value


def test_out_of_range_is_rejected():
    with pytest.raises(ValueError):
        int_to_bits(16, 4)
    with pytest.raises(ValueError):
        int_to_bits(-1, 4)


def test_encode_shapes_and_values():
    x = encode_pair(9, 6, n_bits=4)
    assert x.shape == (8,)
    assert x.dtype.name == "float32"
    assert x.tolist() == [1, 0, 0, 1, 0, 1, 1, 0]

    y = encode_target(15, n_bits=4)
    assert y.shape == (5,)
    assert y.tolist() == [0, 1, 1, 1, 1]


def test_target_has_room_for_the_largest_sum():
    assert encode_target(30, n_bits=4).tolist() == [1, 1, 1, 1, 0]


def test_logits_threshold_at_zero():
    logits = torch.tensor([-5.0, -0.1, 0.1, 5.0])
    assert logits_to_bits(logits).tolist() == [0, 0, 1, 1]


def test_decode_prediction():
    logits = torch.tensor([-4.0, 3.0, 2.0, 5.0, 1.0])
    value, bits, probabilities = decode_prediction(logits, n_bits=4)
    assert bits == [0, 1, 1, 1, 1]
    assert value == 15
    assert all(0.0 < p < 1.0 for p in probabilities)


def test_bits_to_string():
    assert bits_to_string([1, 0, 0, 1]) == "1001"
