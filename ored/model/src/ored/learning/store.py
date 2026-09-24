from __future__ import annotations

import re
import threading
from dataclasses import replace
from typing import Any, Dict, Iterable, List, Optional, Protocol

from ored.learning.records import (
    CandidateStatus,
    Checkpoint,
    CheckpointKind,
    CheckpointPart,
    Conversation,
    Dataset,
    LearningCandidate,
    Message,
    ModelVersion,
    SessionStatus,
    TrainingExample,
    TrainingSession,
    TrainingWorker,
    VersionStatus,
    now,
    to_row,
)


class StoreError(RuntimeError):
    pass


class StaleCheckpointError(StoreError):
    pass


SHA256 = re.compile(r"^[0-9a-f]{64}$")


def check_checkpoint(checkpoint: Checkpoint) -> None:
    if not checkpoint.object_path:
        raise StoreError("a checkpoint must name the object it was uploaded to")
    if not SHA256.match(checkpoint.sha256 or ""):
        raise StoreError(f"checkpoint {checkpoint.object_path} has no valid sha256")
    if checkpoint.epoch < 0 or checkpoint.global_step < 0:
        raise StoreError("epoch and global_step must be >= 0")
    if checkpoint.kind is CheckpointKind.BEST and not (
        checkpoint.promotion_metric and checkpoint.promotion_mode in ("min", "max")
    ):
        raise StoreError("a best checkpoint must record the metric that promoted it")
    if checkpoint.world_size < 1:
        raise StoreError("world_size must be >= 1")
    if (checkpoint.part is CheckpointPart.FILE) != (checkpoint.checkpoint_group_id is None):
        raise StoreError("only a distributed checkpoint's manifest and shards have a group id")
    if checkpoint.part is CheckpointPart.SHARD:
        if checkpoint.rank is None or not 0 <= checkpoint.rank < checkpoint.world_size:
            raise StoreError(f"shard rank {checkpoint.rank} is outside world size {checkpoint.world_size}")
    elif checkpoint.rank is not None:
        raise StoreError("only a shard has a rank")


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

    def register_checkpoint(
        self, checkpoint: Checkpoint, make_current: bool = False, replaces: Optional[str] = None
    ) -> Checkpoint: ...

    def make_current(self, checkpoint_id: str, replaces: Optional[str] = None) -> Checkpoint: ...

    def delete_checkpoint(self, checkpoint_id: str, allow_current: bool = False) -> Checkpoint: ...

    def mark_verified(self, checkpoint_id: str, sha256: str) -> Checkpoint: ...

    def checkpoint(self, checkpoint_id: str) -> Optional[Checkpoint]: ...

    def current_checkpoint(self, run_name: str, kind: CheckpointKind) -> Optional[Checkpoint]: ...

    def checkpoints(
        self,
        kind: Optional[CheckpointKind] = None,
        run_name: Optional[str] = None,
        current: Optional[bool] = None,
        logical: Optional[bool] = None,
    ) -> List[Checkpoint]: ...

    def drop_checkpoint(self, checkpoint_id: str) -> None: ...

    def set_shard_status(self, checkpoint_id: str, status: str) -> Checkpoint: ...

    def finalize_group(
        self, group_id: str, manifest: Checkpoint, make_current: bool = False,
        replaces: Optional[str] = None,
    ) -> Checkpoint: ...

    def delete_group(self, group_id: str, allow_current: bool = False) -> int: ...

    def group(self, group_id: str) -> List[Checkpoint]: ...

    def claim_session(self, session_key: str, run_name: str, dataset_tag: str,
                      config: Dict[str, Any]) -> TrainingSession: ...

    def upsert_worker(self, worker: TrainingWorker) -> TrainingWorker: ...

    def update_worker(self, worker_row_id: str, **fields: Any) -> None: ...

    def workers(self, session_id: str) -> List[TrainingWorker]: ...


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
        self._workers: Dict[str, TrainingWorker] = {}
        self._lock = threading.RLock()

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
        return self.register_checkpoint(checkpoint)

    def register_checkpoint(
        self, checkpoint: Checkpoint, make_current: bool = False, replaces: Optional[str] = None
    ) -> Checkpoint:
        with self._lock:
            return self._register(checkpoint, make_current, replaces)

    def _register(self, checkpoint: Checkpoint, make_current: bool, replaces: Optional[str],
                  finalizing: bool = False) -> Checkpoint:
        check_checkpoint(checkpoint)
        if checkpoint.part is CheckpointPart.MANIFEST and not finalizing:
            raise StoreError("a manifest row is written only by finalize_group")
        if checkpoint.part is CheckpointPart.SHARD:
            if checkpoint.is_complete or checkpoint.upload_status != "uploading":
                raise StoreError("a shard is registered as uploading and incomplete")
            if make_current:
                raise StoreError("a distributed checkpoint becomes current only through finalize_group")
        if checkpoint.id in self._checkpoints:
            raise StoreError(f"checkpoint {checkpoint.id} already exists")
        if any(c.object_path == checkpoint.object_path for c in self._checkpoints.values()):
            raise StoreError(f"object {checkpoint.object_path} is already recorded")

        checkpoint.is_current = False
        previous = None
        if make_current:
            if checkpoint.kind is CheckpointKind.HISTORY:
                raise StoreError("history checkpoints are never current")
            previous = self.current_checkpoint(checkpoint.run_name, checkpoint.kind)
            if previous is not None and checkpoint.kind is CheckpointKind.BASE:
                raise StoreError(
                    f"run {checkpoint.run_name} already has a base checkpoint; base is immutable"
                )
            self._expect_current(checkpoint.run_name, checkpoint.kind, previous, replaces)

        if previous is not None:
            previous.is_current = False
        checkpoint.is_current = make_current
        self._checkpoints[checkpoint.id] = checkpoint
        return checkpoint

    @staticmethod
    def _expect_current(run_name: str, kind: CheckpointKind,
                        previous: Optional[Checkpoint], replaces: Optional[str]) -> None:
        actual = previous.id if previous else None
        if actual != replaces:
            raise StaleCheckpointError(
                f"current {kind.value} of run {run_name} is {actual or 'none'}, "
                f"not {replaces or 'none'}: it changed, compare again"
            )

    def make_current(self, checkpoint_id: str, replaces: Optional[str] = None) -> Checkpoint:
        target = self._checkpoints.get(checkpoint_id)
        if target is None:
            raise StoreError(f"no checkpoint {checkpoint_id}")
        if target.kind in (CheckpointKind.HISTORY, CheckpointKind.BASE):
            raise StoreError(f"a {target.kind.value} checkpoint cannot be promoted in place")
        if target.part is CheckpointPart.SHARD:
            raise StoreError(f"checkpoint {checkpoint_id} is one shard of a group; promote its manifest")
        if target.is_current:
            return target
        previous = self.current_checkpoint(target.run_name, target.kind)
        self._expect_current(target.run_name, target.kind, previous, replaces)
        if previous is not None:
            previous.is_current = False
        target.is_current = True
        return target

    def delete_checkpoint(self, checkpoint_id: str, allow_current: bool = False) -> Checkpoint:
        target = self._checkpoints.get(checkpoint_id)
        if target is None:
            raise StoreError(f"no checkpoint {checkpoint_id}")
        if target.part is not CheckpointPart.FILE:
            raise StoreError(
                f"checkpoint {checkpoint_id} belongs to group {target.checkpoint_group_id}; use delete_group"
            )
        if target.is_current and not allow_current:
            raise StoreError(
                f"checkpoint {checkpoint_id} is the current {target.kind.value} of run "
                f"{target.run_name}; pass allow_current to remove it"
            )
        del self._checkpoints[checkpoint_id]
        for other in self._checkpoints.values():
            if other.parent_checkpoint_id == checkpoint_id:
                other.parent_checkpoint_id = None
        return target

    def mark_verified(self, checkpoint_id: str, sha256: str) -> Checkpoint:
        target = self._checkpoints.get(checkpoint_id)
        if target is None or target.sha256 != sha256:
            raise StoreError(f"checkpoint {checkpoint_id} does not have sha256 {sha256}")
        target.verified_at = now()
        return target

    def checkpoint(self, checkpoint_id: str) -> Optional[Checkpoint]:
        return self._checkpoints.get(checkpoint_id)

    def current_checkpoint(self, run_name: str, kind: CheckpointKind) -> Optional[Checkpoint]:
        found = self.checkpoints(kind, run_name=run_name, current=True)
        return found[0] if found else None

    def checkpoints(
        self,
        kind: Optional[CheckpointKind] = None,
        run_name: Optional[str] = None,
        current: Optional[bool] = None,
        logical: Optional[bool] = None,
    ) -> List[Checkpoint]:
        found = list(self._checkpoints.values())
        if logical is not None:
            found = [c for c in found if c.is_logical == logical]
        if kind is not None:
            found = [c for c in found if c.kind == kind]
        if run_name is not None:
            found = [c for c in found if c.run_name == run_name]
        if current is not None:
            found = [c for c in found if c.is_current == current]
        return sorted(found, key=lambda c: c.created_at)

    def drop_checkpoint(self, checkpoint_id: str) -> None:
        self.delete_checkpoint(checkpoint_id, allow_current=True)

    def set_shard_status(self, checkpoint_id: str, status: str) -> Checkpoint:
        if status not in ("verified", "failed"):
            raise StoreError(f"a shard upload ends verified or failed, not {status}")
        with self._lock:
            target = self._checkpoints.get(checkpoint_id)
            if target is None or target.part is not CheckpointPart.SHARD or target.upload_status != "uploading":
                raise StoreError(f"no uploading shard {checkpoint_id}")
            target.upload_status = status
            if status == "verified":
                target.verified_at = now()
            return target

    def group(self, group_id: str) -> List[Checkpoint]:
        found = [c for c in self._checkpoints.values() if c.checkpoint_group_id == group_id]
        return sorted(found, key=lambda c: (c.part is not CheckpointPart.MANIFEST, c.rank or 0, c.object_path))

    def finalize_group(
        self, group_id: str, manifest: Checkpoint, make_current: bool = False,
        replaces: Optional[str] = None,
    ) -> Checkpoint:
        with self._lock:
            rows = self.group(group_id)
            if any(r.part is CheckpointPart.MANIFEST for r in rows):
                raise StoreError(f"checkpoint group {group_id} is already finalized")
            shards = [r for r in rows if r.part is CheckpointPart.SHARD]
            if not shards:
                raise StoreError(f"checkpoint group {group_id} has no shards")
            if any(s.kind != manifest.kind or s.run_name != manifest.run_name
                   or s.world_size != manifest.world_size for s in shards):
                raise StoreError(f"checkpoint group {group_id} has shards from another run, role or world size")
            pending = sorted({f"{s.rank}:{s.upload_status}" for s in shards if s.upload_status != "verified"})
            if pending:
                raise StoreError(
                    f"checkpoint group {group_id} is not complete: shards not verified (rank:status) {', '.join(pending)}"
                )
            ranks = {s.rank for s in shards}
            if len(ranks) != manifest.world_size:
                raise StoreError(
                    f"checkpoint group {group_id} is not complete: {len(ranks)} of "
                    f"{manifest.world_size} ranks have verified shards"
                )
            record = replace(manifest, part=CheckpointPart.MANIFEST, checkpoint_group_id=group_id,
                             rank=None, is_complete=True, upload_status="verified",
                             verified_at=manifest.verified_at or now())
            stored = self._register(record, make_current, replaces, finalizing=True)
            for shard in shards:
                shard.is_complete = True
            return stored

    def delete_group(self, group_id: str, allow_current: bool = False) -> int:
        with self._lock:
            rows = self.group(group_id)
            if not rows:
                raise StoreError(f"no checkpoint group {group_id}")
            if any(r.is_current for r in rows) and not allow_current:
                raise StoreError(f"checkpoint group {group_id} is current; pass allow_current to remove it")
            for row in rows:
                del self._checkpoints[row.id]
            return len(rows)

    def claim_session(self, session_key: str, run_name: str, dataset_tag: str,
                      config: Dict[str, Any]) -> TrainingSession:
        if not session_key:
            raise StoreError("a distributed session needs a session key")
        with self._lock:
            for session in self._sessions.values():
                if session.session_key == session_key:
                    session.status = SessionStatus.RUNNING
                    session.config = dict(config)
                    session.run_name = run_name
                    session.error = ""
                    session.finished_at = None
                    session.started_at = session.started_at or now()
                    return session
            session = TrainingSession(session_key=session_key, run_name=run_name, dataset_tag=dataset_tag,
                                      config=dict(config), status=SessionStatus.RUNNING, started_at=now())
            self._sessions[session.id] = session
            return session

    def upsert_worker(self, worker: TrainingWorker) -> TrainingWorker:
        with self._lock:
            for existing in self._workers.values():
                if existing.session_id == worker.session_id and existing.worker_id == worker.worker_id:
                    worker.id = existing.id
                    worker.created_at = existing.created_at
                    break
            self._workers[worker.id] = worker
            return worker

    def update_worker(self, worker_row_id: str, **fields: Any) -> None:
        with self._lock:
            worker = self._workers.get(worker_row_id)
            if worker is None:
                raise StoreError(f"no worker {worker_row_id}")
            for key, value in fields.items():
                setattr(worker, key, value)
            worker.__post_init__()

    def workers(self, session_id: str) -> List[TrainingWorker]:
        found = [w for w in self._workers.values() if w.session_id == session_id]
        return sorted(found, key=lambda w: (w.rank is None, w.rank or 0, w.worker_id))

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
            "workers": [to_row(r) for r in self._workers.values()],
        }
