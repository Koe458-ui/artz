from __future__ import annotations

from typing import List, Optional, Sequence

from ored.learning.records import (
    CandidateStatus,
    LearningCandidate,
    TrainingExample,
    now,
)
from ored.learning.store import LearningStore, StoreError

ALLOWED_TRANSITIONS = {
    CandidateStatus.PENDING: {
        CandidateStatus.APPROVED,
        CandidateStatus.REJECTED,
        CandidateStatus.WITHDRAWN,
    },
    CandidateStatus.APPROVED: {CandidateStatus.WITHDRAWN},
    CandidateStatus.REJECTED: {CandidateStatus.PENDING},
    CandidateStatus.WITHDRAWN: set(),
}


class ReviewError(RuntimeError):
    pass


def _move(
    candidate: LearningCandidate,
    status: CandidateStatus,
    reviewer: str,
    note: str,
) -> LearningCandidate:
    if not reviewer:
        raise ReviewError("a review must name the reviewer")
    allowed = ALLOWED_TRANSITIONS[candidate.status]
    if status not in allowed:
        raise ReviewError(f"cannot move a candidate from {candidate.status.value} to {status.value}")
    candidate.status = status
    candidate.reviewed_by = reviewer
    candidate.reviewed_at = now()
    candidate.review_note = note
    return candidate


def approve(
    store: LearningStore,
    candidate: LearningCandidate,
    reviewer: str,
    dataset_tag: str,
    note: str = "",
) -> TrainingExample:
    if not dataset_tag:
        raise ReviewError("approved data must be filed under a dataset tag")
    _move(candidate, CandidateStatus.APPROVED, reviewer, note)
    store.update_candidate(candidate)
    example = TrainingExample(
        candidate_id=candidate.id,
        dataset_tag=dataset_tag,
        prompt=candidate.prompt,
        response=candidate.response,
        approved_by=reviewer,
    )
    stored = store.add_examples([example])
    if not stored:
        raise StoreError("the approved example was not written")
    return stored[0]


def reject(
    store: LearningStore,
    candidate: LearningCandidate,
    reviewer: str,
    note: str = "",
) -> LearningCandidate:
    _move(candidate, CandidateStatus.REJECTED, reviewer, note)
    return store.update_candidate(candidate)


def withdraw(
    store: LearningStore,
    candidate: LearningCandidate,
    reviewer: str,
    note: str = "",
) -> LearningCandidate:
    _move(candidate, CandidateStatus.WITHDRAWN, reviewer, note)
    return store.update_candidate(candidate)


def approve_many(
    store: LearningStore,
    candidates: Sequence[LearningCandidate],
    reviewer: str,
    dataset_tag: str,
    note: str = "",
) -> List[TrainingExample]:
    return [approve(store, c, reviewer, dataset_tag, note) for c in candidates]


def pending(store: LearningStore, limit: Optional[int] = None) -> List[LearningCandidate]:
    found = store.candidates(CandidateStatus.PENDING)
    return found if limit is None else found[:limit]
