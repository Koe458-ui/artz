from __future__ import annotations

import pytest

from ored.training.schedules import build_schedule, constant, cosine_with_warmup


def test_warmup_rises_from_near_zero_to_one():
    assert cosine_with_warmup(0, 1000, 100) == pytest.approx(0.01)
    assert cosine_with_warmup(49, 1000, 100) == pytest.approx(0.5)
    assert cosine_with_warmup(99, 1000, 100) == pytest.approx(1.0)


def test_warmup_is_monotonically_increasing():
    values = [cosine_with_warmup(s, 1000, 100) for s in range(100)]
    assert values == sorted(values)


def test_decay_is_monotonically_decreasing():
    values = [cosine_with_warmup(s, 1000, 100) for s in range(100, 1000)]
    assert values == sorted(values, reverse=True)


def test_ends_at_min_ratio():
    assert cosine_with_warmup(999, 1000, 100, min_ratio=0.1) == pytest.approx(0.1, abs=1e-3)
    assert cosine_with_warmup(999, 1000, 100, min_ratio=0.5) == pytest.approx(0.5, abs=1e-3)


def test_never_leaves_its_bounds():
    for step in range(0, 1200, 7):
        value = cosine_with_warmup(step, 1000, 100, min_ratio=0.1)
        assert 0.0 < value <= 1.0


def test_no_warmup_starts_at_full_rate():
    assert cosine_with_warmup(0, 1000, 0) == pytest.approx(1.0)


def test_constant_schedule_never_changes():
    assert all(constant(s, 1000, 0) == 1.0 for s in range(0, 1000, 50))


def test_registry():
    assert build_schedule("cosine") is cosine_with_warmup
    assert build_schedule("none") is constant
    with pytest.raises(ValueError, match="unknown scheduler"):
        build_schedule("triangular")
