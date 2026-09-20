from __future__ import annotations

import pytest
import torch

from ored.models.bigram import BigramLanguageModel
from ored.models.transformer import CausalSelfAttention, Transformer


@pytest.fixture()
def model():
    torch.manual_seed(0)
    m = Transformer(vocab_size=20, block_size=16, d_model=32,
                    n_layer=2, n_head=4, d_ff=64, dropout=0.0)
    m.eval()
    return m


def test_future_tokens_cannot_influence_the_past(model):
    ids = torch.randint(0, 20, (1, 12))
    with torch.no_grad():
        before = model(ids)

    changed = ids.clone()
    position = 7
    changed[0, position] = (changed[0, position] + 5) % 20
    with torch.no_grad():
        after = model(changed)

    assert torch.allclose(before[0, :position], after[0, :position], atol=1e-6), \
        "a later token changed an earlier prediction: the causal mask is broken"
    assert not torch.allclose(before[0, position], after[0, position], atol=1e-6), \
        "the changed position should change its own output"


def test_every_future_position_is_masked(model):
    ids = torch.randint(0, 20, (1, 10))
    with torch.no_grad():
        baseline = model(ids)

    for position in range(1, 10):
        changed = ids.clone()
        changed[0, position] = (changed[0, position] + 3) % 20
        with torch.no_grad():
            out = model(changed)
        assert torch.allclose(baseline[0, :position], out[0, :position], atol=1e-6), \
            f"changing position {position} leaked backwards"


def test_attention_weights_are_lower_triangular():
    attention = CausalSelfAttention(d_model=8, n_head=2, block_size=5, dropout=0.0)
    mask = attention.causal_mask[0, 0]
    for i in range(5):
        for j in range(5):
            expected = 1.0 if j <= i else 0.0
            assert mask[i][j] == expected


def test_prefix_gives_the_same_prediction_as_the_full_sequence(model):
    ids = torch.randint(0, 20, (1, 10))
    with torch.no_grad():
        full = model(ids)
        prefix = model(ids[:, :5])
    assert torch.allclose(full[0, 4], prefix[0, 4], atol=1e-6)


def test_output_shape_is_one_logit_per_vocabulary_entry(model):
    logits = model(torch.randint(0, 20, (3, 12)))
    assert logits.shape == (3, 12, 20)


def test_sequence_longer_than_block_size_is_rejected(model):
    with pytest.raises(ValueError, match="exceeds block_size"):
        model(torch.randint(0, 20, (1, 17)))


def test_wrong_input_rank_is_rejected(model):
    with pytest.raises(ValueError, match="expected ids"):
        model(torch.randint(0, 20, (12,)))


def test_d_model_must_divide_by_n_head():
    with pytest.raises(ValueError, match="divisible"):
        CausalSelfAttention(d_model=10, n_head=4, block_size=8)


def test_weight_tying_shares_one_matrix():
    tied = Transformer(vocab_size=20, block_size=8, d_model=16, n_layer=1,
                       n_head=2, d_ff=32, tie_weights=True)
    assert tied.head.weight is tied.token_embedding.weight

    untied = Transformer(vocab_size=20, block_size=8, d_model=16, n_layer=1,
                         n_head=2, d_ff=32, tie_weights=False)
    assert untied.head.weight is not untied.token_embedding.weight
    assert untied.num_parameters() > tied.num_parameters()


def test_gradients_reach_every_parameter(model):
    model.train()
    ids = torch.randint(0, 20, (2, 8))
    targets = torch.randint(0, 20, (2, 8))
    logits = model(ids)
    loss = torch.nn.functional.cross_entropy(logits.reshape(-1, 20), targets.reshape(-1))
    loss.backward()

    for name, param in model.named_parameters():
        assert param.grad is not None, f"{name} received no gradient"
        assert torch.isfinite(param.grad).all(), f"{name} has non-finite gradients"


def test_position_embedding_makes_order_matter(model):
    ids = torch.tensor([[1, 2, 3, 4]])
    reversed_ids = torch.tensor([[4, 3, 2, 1]])
    with torch.no_grad():
        a = model(ids)[0, -1]
        b = model(reversed_ids)[0, -1]
    assert not torch.allclose(a, b, atol=1e-5)


def test_dropout_only_applies_in_training_mode():
    m = Transformer(vocab_size=20, block_size=8, d_model=16, n_layer=1,
                    n_head=2, d_ff=32, dropout=0.5)
    ids = torch.randint(0, 20, (4, 8))

    m.eval()
    with torch.no_grad():
        assert torch.allclose(m(ids), m(ids))

    m.train()
    torch.manual_seed(1)
    first = m(ids)
    torch.manual_seed(2)
    second = m(ids)
    assert not torch.allclose(first, second)


def test_bigram_ignores_context():
    m = BigramLanguageModel(vocab_size=10)
    with torch.no_grad():
        a = m(torch.tensor([[3, 7]]))[0, -1]
        b = m(torch.tensor([[5, 7]]))[0, -1]
    assert torch.allclose(a, b)


def test_bigram_output_shape():
    m = BigramLanguageModel(vocab_size=10)
    assert m(torch.randint(0, 10, (2, 6))).shape == (2, 6, 10)
