from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Type, TypeVar

from ored.learning.records import (
    CandidateStatus,
    Conversation,
    LearningCandidate,
    Message,
    ModelVersion,
    RECORD_TABLES,
    SessionStatus,
    TrainingExample,
    TrainingSession,
    VersionStatus,
    to_row,
)
from ored.learning.store import StoreError

T = TypeVar("T")

TIMEOUT_SECONDS = 20


class SupabaseStore:

    def __init__(self, url: str, service_key: str, timeout: int = TIMEOUT_SECONDS) -> None:
        if not url or not service_key:
            raise StoreError("SupabaseStore needs a project url and a service key")
        self.base = url.rstrip("/") + "/rest/v1"
        self.service_key = service_key
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "SupabaseStore":
        url = os.environ.get("ORED_SB_URL", "")
        key = os.environ.get("ORED_SB_SERVICE_KEY", "")
        if not url or not key:
            raise StoreError(
                "set ORED_SB_URL and ORED_SB_SERVICE_KEY to reach the learning tables"
            )
        return cls(url, key)

    def _headers(self, prefer: str = "") -> Dict[str, str]:
        headers = {
            "apikey": self.service_key,
            "authorization": "Bearer " + self.service_key,
            "content-type": "application/json",
        }
        if prefer:
            headers["prefer"] = prefer
        return headers

    def _call(self, method: str, path: str, payload: Any = None, prefer: str = "") -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.base + path, data=body, method=method, headers=self._headers(prefer)
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise StoreError(f"{method} {path} -> {exc.code} {detail}") from exc
        except urllib.error.URLError as exc:
            raise StoreError(f"{method} {path} could not be reached: {exc.reason}") from exc
        return json.loads(raw) if raw else []

    def _table(self, record_type: Type[Any]) -> str:
        table = RECORD_TABLES.get(record_type)
        if not table:
            raise StoreError(f"no table mapped for {record_type.__name__}")
        return table

    def _insert(self, record_type: Type[T], records: Iterable[Any]) -> List[T]:
        rows = [to_row(r) for r in records]
        if not rows:
            return []
        returned = self._call(
            "POST", "/" + self._table(record_type), rows, "return=representation"
        )
        return [self._build(record_type, row) for row in returned]

    def _update(self, record_type: Type[T], record: Any) -> T:
        row = to_row(record)
        path = f"/{self._table(record_type)}?id=eq.{urllib.parse.quote(row['id'])}"
        returned = self._call("PATCH", path, row, "return=representation")
        if not returned:
            raise StoreError(f"{record_type.__name__} {row['id']} was not updated")
        return self._build(record_type, returned[0])

    def _select(self, record_type: Type[T], query: str = "") -> List[T]:
        path = "/" + self._table(record_type) + "?select=*"
        if query:
            path += "&" + query
        return [self._build(record_type, row) for row in self._call("GET", path)]

    @staticmethod
    def _build(record_type: Type[T], row: Dict[str, Any]) -> T:
        fields = {f for f in record_type.__dataclass_fields__}
        return record_type(**{k: v for k, v in row.items() if k in fields})

    def add_conversation(self, conversation: Conversation) -> Conversation:
        return self._insert(Conversation, [conversation])[0]

    def add_messages(self, messages: Iterable[Message]) -> List[Message]:
        return self._insert(Message, messages)

    def messages_for(self, conversation_id: str) -> List[Message]:
        safe = urllib.parse.quote(conversation_id)
        return self._select(Message, f"conversation_id=eq.{safe}&order=created_at.asc")

    def add_candidates(self, candidates: Iterable[LearningCandidate]) -> List[LearningCandidate]:
        return self._insert(LearningCandidate, candidates)

    def candidates(self, status: Optional[CandidateStatus] = None) -> List[LearningCandidate]:
        query = "order=created_at.asc"
        if status is not None:
            query = f"status=eq.{status.value}&" + query
        return self._select(LearningCandidate, query)

    def update_candidate(self, candidate: LearningCandidate) -> LearningCandidate:
        return self._update(LearningCandidate, candidate)

    def add_examples(self, examples: Iterable[TrainingExample]) -> List[TrainingExample]:
        return self._insert(TrainingExample, examples)

    def examples(self, dataset_tag: str) -> List[TrainingExample]:
        safe = urllib.parse.quote(dataset_tag)
        return self._select(TrainingExample, f"dataset_tag=eq.{safe}&order=created_at.asc")

    def add_session(self, session: TrainingSession) -> TrainingSession:
        return self._insert(TrainingSession, [session])[0]

    def update_session(self, session: TrainingSession) -> TrainingSession:
        return self._update(TrainingSession, session)

    def sessions(self, status: Optional[SessionStatus] = None) -> List[TrainingSession]:
        query = "order=created_at.asc"
        if status is not None:
            query = f"status=eq.{status.value}&" + query
        return self._select(TrainingSession, query)

    def add_version(self, version: ModelVersion) -> ModelVersion:
        return self._insert(ModelVersion, [version])[0]

    def update_version(self, version: ModelVersion) -> ModelVersion:
        return self._update(ModelVersion, version)

    def versions(self, status: Optional[VersionStatus] = None) -> List[ModelVersion]:
        query = "order=created_at.asc"
        if status is not None:
            query = f"status=eq.{status.value}&" + query
        return self._select(ModelVersion, query)
