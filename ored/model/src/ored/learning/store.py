from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Protocol

from ored.learning.records import (
    CandidateStatus,
    Checkpoint,
    CheckpointKind,
    Conversation,
    Dataset,
    LearningCandidate,
    Message,
    ModelVersion,
    SessionStatus,
    TrainingExample,
    TrainingSession,
    VersionStatus,
    to_row,
)


class StoreError(RuntimeError):
    pass


class LearningStore(Protocol):

    def datasets(self, name: Optional[str] = None) -> List[Dataset]: ...

    def add_conversation(self, conversation: Conversation) -> Conversation: ...

    def add_messages(self, messages: Iterable[Message]) -> List[Message]: ...

    def messages_for(self, conversation_id: str) -> List[Message]: ...

    def add_candidates(self, candidates: Iterable[LearningCandidate]) -> List[LearningCandidate]: ...

    def candidates(self, status: Optional[CandidateStatus] = None) -> List[LearningCandidate]: ...

    def update_candidate(self, candidate: LearningCandidate) -> LearningCandidate: ...

    def add_examples(self, examples: Iterable[TrainingExample]) -> List[TrainingExample]: ...

    def examples(self, dataset_tag: str) -> List[TrainingExample]: ...

    def add_session(self, session: TrainingSession) -> TrainingSession: ...

    def update_session(self, session: TrainingSession) -> TrainingSession: ...

    def sessions(self, status: Optional[SessionStatus] = None) -> List[TrainingSession]: ...

    def add_version(self, version: ModelVersion) -> ModelVersion: ...

    def update_version(self, version: ModelVersion) -> ModelVersion: ...

    def versions(self, status: Optional[VersionStatus] = None) -> List[ModelVersion]: ...

    def add_checkpoint(self, checkpoint: Checkpoint) -> Checkpoint: ...

    def checkpoints(self, kind: Optional[CheckpointKind] = None) -> List[Checkpoint]: ...

    def drop_checkpoint(self, checkpoint_id: str) -> None: ...


class InMemoryStore:

    def __init__(self) -> None:
        self._datasets: Dict[str, Dataset] = {}
        self._conversations: Dict[str, Conversation] = {}
        self._messages: Dict[str, Message] = {}
        self._candidates: Dict[str, LearningCandidate] = {}
        self._examples: Dict[str, TrainingExample] = {}
        self._sessions: Dict[str, TrainingSession] = {}
        self._versions: Dict[str, ModelVersion] = {}
        self._checkpoints: Dict[str, Checkpoint] = {}

    def add_dataset(self, dataset: Dataset) -> Dataset:
        self._datasets[dataset.name] = dataset
        return dataset

    def datasets(self, name: Optional[str] = None) -> List[Dataset]:
        found = list(self._datasets.values())
        if name is not None:
            found = [d for d in found if d.name == name]
        return sorted(found, key=lambda d: (d.name, d.version))

    def add_conversation(self, conversation: Conversation) -> Conversation:
        self._conversations[conversation.id] = conversation
        return conversation

    def add_messages(self, messages: Iterable[Message]) -> List[Message]:
        stored = []
        for message in messages:
            if not message.conversation_id:
                raise StoreError("a message must belong to a conversation")
            self._messages[message.id] = message
            stored.append(message)
        return stored

    def messages_for(self, conversation_id: str) -> List[Message]:
        found = [m for m in self._messages.values() if m.conversation_id == conversation_id]
        return sorted(found, key=lambda m: m.created_at)

    def add_candidates(self, candidates: Iterable[LearningCandidate]) -> List[LearningCandidate]:
        stored = []
        for candidate in candidates:
            self._candidates[candidate.id] = candidate
            stored.append(candidate)
        return stored

    def candidates(self, status: Optional[CandidateStatus] = None) -> List[LearningCandidate]:
        found = list(self._candidates.values())
        if status is not None:
            found = [c for c in found if c.status == status]
        return sorted(found, key=lambda c: c.created_at)

    def update_candidate(self, candidate: LearningCandidate) -> LearningCandidate:
        if candidate.id not in self._candidates:
            raise StoreError(f"no candidate {candidate.id}")
        self._candidates[candidate.id] = candidate
        return candidate

    def add_examples(self, examples: Iterable[TrainingExample]) -> List[TrainingExample]:
        stored = []
        for example in examples:
            self._examples[example.id] = example
            stored.append(example)
        return stored

    def examples(self, dataset_tag: str) -> List[TrainingExample]:
        found = [e for e in self._examples.values() if e.dataset_tag == dataset_tag]
        return sorted(found, key=lambda e: e.created_at)

    def add_session(self, session: TrainingSession) -> TrainingSession:
        self._sessions[session.id] = session
        return session

    def update_session(self, session: TrainingSession) -> TrainingSession:
        if session.id not in self._sessions:
            raise StoreError(f"no session {session.id}")
        self._sessions[session.id] = session
        return session

    def sessions(self, status: Optional[SessionStatus] = None) -> List[TrainingSession]:
        found = list(self._sessions.values())
        if status is not None:
            found = [s for s in found if s.status == status]
        return sorted(found, key=lambda s: s.created_at)

    def add_version(self, version: ModelVersion) -> ModelVersion:
        self._versions[version.id] = version
        return version

    def update_version(self, version: ModelVersion) -> ModelVersion:
        if version.id not in self._versions:
            raise StoreError(f"no model version {version.id}")
        self._versions[version.id] = version
        return version

    def versions(self, status: Optional[VersionStatus] = None) -> List[ModelVersion]:
        found = list(self._versions.values())
        if status is not None:
            found = [v for v in found if v.status == status]
        return sorted(found, key=lambda v: v.created_at)

    def add_checkpoint(self, checkpoint: Checkpoint) -> Checkpoint:
        if not checkpoint.object_path:
            raise StoreError("a checkpoint must name the object it was uploaded to")
        self._checkpoints[checkpoint.id] = checkpoint
        return checkpoint

    def checkpoints(self, kind: Optional[CheckpointKind] = None) -> List[Checkpoint]:
        found = list(self._checkpoints.values())
        if kind is not None:
            found = [c for c in found if c.kind == kind]
        return sorted(found, key=lambda c: c.created_at)

    def drop_checkpoint(self, checkpoint_id: str) -> None:
        if checkpoint_id not in self._checkpoints:
            raise StoreError(f"no checkpoint {checkpoint_id}")
        del self._checkpoints[checkpoint_id]

    def snapshot(self) -> Dict[str, List[Dict[str, Any]]]:
        return {
            "datasets": [to_row(r) for r in self._datasets.values()],
            "conversations": [to_row(r) for r in self._conversations.values()],
            "messages": [to_row(r) for r in self._messages.values()],
            "candidates": [to_row(r) for r in self._candidates.values()],
            "examples": [to_row(r) for r in self._examples.values()],
            "sessions": [to_row(r) for r in self._sessions.values()],
            "versions": [to_row(r) for r in self._versions.values()],
            "checkpoints": [to_row(r) for r in self._checkpoints.values()],
        }
