from __future__ import annotations

from typing import List, Optional

import torch
import torch.nn.functional as F

from ored.data.tokenizer import Tokenizer


@torch.no_grad()
def generate_tokens(
    model: torch.nn.Module,
    ids: torch.Tensor,
    max_new_tokens: int,
    block_size: int,
    temperature: float = 1.0,
    top_k: int = 0,
    top_p: float = 0.0,
    greedy: bool = False,
    stop_ids: Optional[List[int]] = None,
) -> torch.Tensor:
    if ids.dim() != 2 or ids.size(0) != 1:
        raise ValueError(f"expected ids of shape (1, T), got {tuple(ids.shape)}")
    if temperature <= 0:
        raise ValueError("temperature must be > 0 (use greedy=True for argmax)")

    model.eval()
    stop = set(stop_ids or [])

    for _ in range(max_new_tokens):
        context = ids[:, -block_size:]

        logits = model(context)

        logits = logits[:, -1, :]

        if greedy:
            next_id = logits.argmax(dim=-1, keepdim=True)
        else:
            logits = logits / temperature

            if top_k and top_k > 0:
                k = min(top_k, logits.size(-1))
                threshold = torch.topk(logits, k, dim=-1).values[:, -1:]
                logits = logits.masked_fill(logits < threshold, float("-inf"))

            if top_p and 0.0 < top_p < 1.0:
                ordered, order = torch.sort(logits, descending=True, dim=-1)
                cumulative = torch.softmax(ordered, dim=-1).cumsum(dim=-1)
                remove = cumulative - torch.softmax(ordered, dim=-1) > top_p
                remove[:, 0] = False
                ordered = ordered.masked_fill(remove, float("-inf"))
                logits = torch.full_like(logits, float("-inf")).scatter(1, order, ordered)

            probabilities = F.softmax(logits, dim=-1)
            next_id = torch.multinomial(probabilities, num_samples=1)

        ids = torch.cat([ids, next_id], dim=1)

        if int(next_id) in stop:
            break

    return ids


def generate_text(
    model: torch.nn.Module,
    tokenizer: Tokenizer,
    prompt: str,
    max_new_tokens: int,
    block_size: int,
    device: torch.device,
    temperature: float = 0.8,
    top_k: int = 0,
    top_p: float = 0.0,
    greedy: bool = False,
    stop_on_newline: bool = False,
) -> str:
    text = prompt if prompt else "\n"
    ids = torch.tensor([tokenizer.encode(text)], dtype=torch.long, device=device)

    stop_ids = tokenizer.encode("\n") if stop_on_newline else None

    out = generate_tokens(
        model=model,
        ids=ids,
        max_new_tokens=max_new_tokens,
        block_size=block_size,
        temperature=temperature,
        top_k=top_k,
        top_p=top_p,
        greedy=greedy,
        stop_ids=stop_ids,
    )
    return tokenizer.decode(out[0].tolist())


def complete(
    model: torch.nn.Module,
    tokenizer: Tokenizer,
    prompt: str,
    block_size: int,
    device: torch.device,
    max_new_tokens: int = 8,
) -> str:
    text = generate_text(
        model=model,
        tokenizer=tokenizer,
        prompt=prompt,
        max_new_tokens=max_new_tokens,
        block_size=block_size,
        device=device,
        greedy=True,
        stop_on_newline=True,
    )
    continuation = text[len(prompt):]
    return continuation.split("\n")[0].strip()
