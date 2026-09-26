from __future__ import annotations

from typing import Any, Dict, Optional

from ored.learning.records import SessionStatus, TrainingSession, now
from ored.learning.store import LearningStore


class SessionError(RuntimeError):
    pass


ALLOWED_TRANSITIONS = {
    SessionStatus.QUEUED: {SessionStatus.RUNNING, SessionStatus.CANCELLED},
    SessionStatus.RUNNING: {SessionStatus.EVALUATED, SessionStatus.FAILED, SessionStatus.CANCELLED},
    SessionStatus.EVALUATED: set(),
    SessionStatus.FAILED: set(),
    SessionStatus.CANCELLED: set(),
}


def queue(
    store: LearningStore,
    dataset_tag: str,
    config: Dict[str, Any],
    example_count: int,
    conversation_count: int,
    base_version: Optional[str] = None,
    run_name: str = "",
    dataset_id: Optional[str] = None,
) -> TrainingSession:
    if not dataset_tag:
        raise SessionError("a training session must name the dataset it runs on")
    if example_count < 1:
        raise SessionError("a training session needs at least one approved example")
    session = TrainingSession(
        dataset_tag=dataset_tag,
        base_version=base_version,
        config=config,
        example_count=example_count,
        conversation_count=conversation_count,
        run_name=run_name,
        dataset_id=dataset_id,
    )
    return store.add_session(session)


def _move(session: TrainingSession, status: SessionStatus) -> None:
    if status not in ALLOWED_TRANSITIONS[session.status]:
        raise SessionError(f"cannot move a session from {session.status.value} to {status.value}")
    session.status = status


def start(store: LearningStore, session: TrainingSession) -> TrainingSession:
    _move(session, SessionStatus.RUNNING)
    session.started_at = now()
    return store.update_session(session)


def finish(
    store: LearningStore,
    session: TrainingSession,
    metrics: Dict[str, float],
) -> TrainingSession:
    if not metrics:
        raise SessionError("a session cannot be recorded as evaluated without metrics")
    _move(session, SessionStatus.EVALUATED)
    session.metrics = dict(metrics)
    session.finished_at = now()
    return store.update_session(session)


def fail(store: LearningStore, session: TrainingSession, error: str) -> TrainingSession:
    _move(session, SessionStatus.FAILED)
    session.error = error[:500]
    session.finished_at = now()
    return store.update_session(session)


def cancel(store: LearningStore, session: TrainingSession, reason: str = "") -> TrainingSession:
    _move(session, SessionStatus.CANCELLED)
    session.error = reason[:500]
    session.finished_at = now()
    return store.update_session(session)
