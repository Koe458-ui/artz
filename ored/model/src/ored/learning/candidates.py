from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, replace
from typing import Dict, List, Optional, Sequence, Tuple

from ored.learning.records import LearningCandidate, Message, Role

EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
PHONE_RE = re.compile(r"(?<!\d)(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){9,14}\d(?!\d)")
TOKEN_RE = re.compile(r"\b(?:sk|pk|sb|ey|ghp|xox)[A-Za-z0-9_\-.]{16,}\b")
CARD_RE = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
URL_CREDENTIALS_RE = re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s/@]+:[^\s/@]+@")

REDACTIONS: Tuple[Tuple[re.Pattern, str], ...] = (
    (URL_CREDENTIALS_RE, "[redacted-credentials]"),
    (TOKEN_RE, "[redacted-token]"),
    (EMAIL_RE, "[redacted-email]"),
    (CARD_RE, "[redacted-number]"),
    (PHONE_RE, "[redacted-number]"),
)


@dataclass
class CandidatePolicy:

    min_prompt_chars: int = 8
    min_response_chars: int = 8
    max_prompt_chars: int = 4000
    max_response_chars: int = 8000
    drop_duplicates: bool = True


def redact(text: str) -> Tuple[str, bool]:
    cleaned = text
    for pattern, placeholder in REDACTIONS:
        cleaned = pattern.sub(placeholder, cleaned)
    return cleaned, cleaned != text


def fingerprint(prompt: str, response: str) -> str:
    joined = prompt.strip().lower() + "\x00" + response.strip().lower()
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def pair_messages(messages: Sequence[Message]) -> List[Tuple[Message, Message]]:
    ordered = sorted(messages, key=lambda m: m.created_at)
    pairs: List[Tuple[Message, Message]] = []
    pending: Optional[Message] = None
    for message in ordered:
        if message.role == Role.USER:
            pending = message
        elif message.role == Role.ASSISTANT and pending is not None:
            pairs.append((pending, message))
            pending = None
    return pairs


def build_candidates(
    conversation_id: str,
    messages: Sequence[Message],
    policy: Optional[CandidatePolicy] = None,
    seen: Optional[Dict[str, str]] = None,
) -> List[LearningCandidate]:
    policy = policy or CandidatePolicy()
    seen = seen if seen is not None else {}
    candidates: List[LearningCandidate] = []

    for prompt_message, response_message in pair_messages(messages):
        prompt, prompt_changed = redact(prompt_message.content.strip())
        response, response_changed = redact(response_message.content.strip())

        if len(prompt) < policy.min_prompt_chars or len(response) < policy.min_response_chars:
            continue
        if len(prompt) > policy.max_prompt_chars or len(response) > policy.max_response_chars:
            continue

        key = fingerprint(prompt, response)
        if policy.drop_duplicates and key in seen:
            continue
        seen[key] = conversation_id

        candidates.append(
            LearningCandidate(
                conversation_id=conversation_id,
                prompt=prompt,
                response=response,
                fingerprint=key,
                redacted=prompt_changed or response_changed,
            )
        )

    return candidates


def without_content(candidate: LearningCandidate) -> LearningCandidate:
    return replace(candidate, prompt="", response="")
