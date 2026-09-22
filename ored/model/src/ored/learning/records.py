from __future__ import annotations

import time
import uuid
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class Role(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class CandidateStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class SessionStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    EVALUATED = "evaluated"
    FAILED = "failed"
    CANCELLED = "cancelled"


class VersionStatus(str, Enum):
    CANDIDATE = "candidate"
    PRODUCTION = "production"
    RETIRED = "retired"


class CheckpointKind(str, Enum):
    BASE = "base"
    BEST = "best"
    LIVE = "live"
    EXPORT = "export"


@dataclass
class Conversation:

    id: str = field(default_factory=new_id)
    user_id: Optional[str] = None
    visitor: str = ""
    title: str = ""
    created_at: str = field(default_factory=now)
    updated_at: str = field(default_factory=now)
    message_count: int = 0

    def __post_init__(self) -> None:
        if not self.visitor:
            self.visitor = "account" if self.user_id else "anonymous"


@dataclass
class Message:

    id: str = field(default_factory=new_id)
    conversation_id: str = ""
    role: Role = Role.USER
    content: str = ""
    model_version: Optional[str] = None
    created_at: str = field(default_factory=now)


@dataclass
class LearningCandidate:

    id: str = field(default_factory=new_id)
    conversation_id: str = ""
    prompt: str = ""
    response: str = ""
    status: CandidateStatus = CandidateStatus.PENDING
    source: str = "conversation"
    fingerprint: str = ""
    redacted: bool = False
    quality: Optional[float] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    review_note: str = ""
    created_at: str = field(default_factory=now)


@dataclass
class TrainingExample:

    id: str = field(default_factory=new_id)
    candidate_id: str = ""
    dataset_tag: str = ""
    prompt: str = ""
    response: str = ""
    approved_by: Optional[str] = None
    created_at: str = field(default_factory=now)


@dataclass
class Dataset:

    id: str = field(default_factory=new_id)
    name: str = ""
    kind: str = "text"
    summary: str = ""
    generator: str = ""
    spec: Dict[str, Any] = field(default_factory=dict)
    samples: List[Dict[str, Any]] = field(default_factory=list)
    version: int = 1
    created_at: str = field(default_factory=now)
    updated_at: str = field(default_factory=now)


@dataclass
class TrainingSession:

    id: str = field(default_factory=new_id)
    dataset_tag: str = ""
    base_version: Optional[str] = None
    status: SessionStatus = SessionStatus.QUEUED
    config: Dict[str, Any] = field(default_factory=dict)
    metrics: Dict[str, float] = field(default_factory=dict)
    example_count: int = 0
    conversation_count: int = 0
    error: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    created_at: str = field(default_factory=now)


@dataclass
class ModelVersion:

    id: str = field(default_factory=new_id)
    version: str = ""
    status: VersionStatus = VersionStatus.CANDIDATE
    session_id: Optional[str] = None
    checkpoint_path: str = ""
    metrics: Dict[str, float] = field(default_factory=dict)
    notes: str = ""
    promoted_at: Optional[str] = None
    created_at: str = field(default_factory=now)


@dataclass
class Checkpoint:

    id: str = field(default_factory=new_id)
    version_id: Optional[str] = None
    session_id: Optional[str] = None
    kind: CheckpointKind = CheckpointKind.BEST
    run_name: str = ""
    bucket_id: str = "ored-checkpoints"
    object_path: str = ""
    size_bytes: int = 0
    sha256: str = ""
    format_version: int = 1
    torch_version: str = ""
    epoch: int = 0
    metrics: Dict[str, float] = field(default_factory=dict)
    uploaded_by: Optional[str] = None
    created_at: str = field(default_factory=now)


RECORD_TABLES = {
    Dataset: "ored_datasets",
    Conversation: "ored_conversations",
    Message: "ored_messages",
    LearningCandidate: "ored_learning_candidates",
    TrainingExample: "ored_training_examples",
    TrainingSession: "ored_training_sessions",
    ModelVersion: "ored_model_versions",
    Checkpoint: "ored_checkpoints",
}


def to_row(record: Any) -> Dict[str, Any]:
    row = asdict(record)
    for key, value in row.items():
        if isinstance(value, Enum):
            row[key] = value.value
    return row


def to_rows(records: List[Any]) -> List[Dict[str, Any]]:
    return [to_row(r) for r in records]
