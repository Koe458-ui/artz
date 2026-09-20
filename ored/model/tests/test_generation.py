from __future__ import annotations

import pytest
import torch

from ored.data.tokenizer import CharTokenizer
from ored.inference.generator import complete, generate_text, generate_tokens
from ored.models.transformer import Transformer


@pytest.fixture()
def setup():
    torch.manual_seed(0)
    tokenizer = CharTokenizer.from_text("the cat sees 0123456789 + = .\n")
    model = Transformer(vocab_size=tokenizer.vocab_size, block_size=16, d_model=32,
                        n_layer=2, n_head=2, d_ff=64, dropout=0.0)
    model.eval()
    return model, tokenizer


def test_generates_the_requested_number_of_tokens(setup):
    model, tokenizer = setup
    ids = torch.tensor([tokenizer.encode("the ")])
    out = generate_tokens(model, ids, max_new_tokens=10, block_size=16)
    assert out.shape[1] == ids.shape[1] + 10


def test_output_never_leaves_the_vocabulary(setup):
    model, tokenizer = setup
    ids = torch.tensor([tokenizer.encode("the ")])
    out = generate_tokens(model, ids, max_new_tokens=30, block_size=16)
    assert int(out.max()) < tokenizer.vocab_size
    assert int(out.min()) >= 0


def test_context_is_cropped_to_block_size(setup):
    model, tokenizer = setup
    ids = torch.tensor([tokenizer.encode("the cat sees the")])
    out = generate_tokens(model, ids, max_new_tokens=40, block_size=16)
    assert out.shape[1] == ids.shape[1] + 40


def test_greedy_is_deterministic(setup):
    model, tokenizer = setup
    ids = torch.tensor([tokenizer.encode("the ")])
    a = generate_tokens(model, ids, max_new_tokens=15, block_size=16, greedy=True)
    b = generate_tokens(model, ids, max_new_tokens=15, block_size=16, greedy=True)
    assert torch.equal(a, b)


def test_sampling_is_reproducible_with_a_seed(setup):
    model, tokenizer = setup
    ids = torch.tensor([tokenizer.encode("the ")])

    torch.manual_seed(42)
    a = generate_tokens(model, ids, max_new_tokens=20, block_size=16, temperature=1.0)
    torch.manual_seed(42)
    b = generate_tokens(model, ids, max_new_tokens=20, block_size=16, temperature=1.0)
    assert torch.equal(a, b)


def test_top_k_restricts_the_choices(setup):
    model, tokenizer = setup
    ids = torch.tensor([tokenizer.encode("the ")])

    greedy = generate_tokens(model, ids, max_new_tokens=12, block_size=16, greedy=True)
    torch.manual_seed(7)
    top1 = generate_tokens(model, ids, max_new_tokens=12, block_size=16, top_k=1)
    assert torch.equal(greedy, top1)


def test_top_p_keeps_at_least_one_token(setup):
    model, tokenizer = setup
    ids = torch.tensor([tokenizer.encode("the ")])
    out = generate_tokens(model, ids, max_new_tokens=10, block_size=16, top_p=0.01)
    assert out.shape[1] == ids.shape[1] + 10


def test_stop_token_ends_generation_early(setup):
    model, tokenizer = setup
    newline = tokenizer.encode("\n")
    ids = torch.tensor([tokenizer.encode("the ")])
    out = generate_tokens(model, ids, max_new_tokens=200, block_size=16,
                          greedy=True, stop_ids=newline)
    if out.shape[1] < ids.shape[1] + 200:
        assert int(out[0, -1]) == newline[0]


def test_generated_text_starts_with_the_prompt(setup):
    model, tokenizer = setup
    text = generate_text(model, tokenizer, "the cat", max_new_tokens=10,
                         block_size=16, device=torch.device("cpu"))
    assert text.startswith("the cat")


def test_complete_returns_only_the_continuation(setup):
    model, tokenizer = setup
    prompt = "3 + 4 = "
    written = complete(model, tokenizer, prompt, block_size=16,
                       device=torch.device("cpu"), max_new_tokens=5)
    assert not written.startswith(prompt)
    assert "\n" not in written


def test_invalid_temperature_is_rejected(setup):
    model, tokenizer = setup
    ids = torch.tensor([tokenizer.encode("the ")])
    with pytest.raises(ValueError, match="temperature"):
        generate_tokens(model, ids, max_new_tokens=5, block_size=16, temperature=0.0)


def test_batched_input_is_rejected(setup):
    model, tokenizer = setup
    with pytest.raises(ValueError, match="shape"):
        generate_tokens(model, torch.zeros(2, 4, dtype=torch.long),
                        max_new_tokens=5, block_size=16)
