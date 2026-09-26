from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple, Type, TypeVar

from ored.data.training_data import ALL_TAGS, Selection
from ored.learning.records import (
    CandidateStatus,
    Checkpoint,
    CheckpointKind,
    Conversation,
    Dataset,
    LearningCandidate,
    Message,
    ModelVersion,
    RECORD_TABLES,
    SessionStatus,
    TrainingData,
    TrainingExample,
    TrainingSession,
    TrainingWorker,
    VersionStatus,
    to_row,
)
from ored.learning.store import (
    DuplicateTrainingDataError,
    StaleCheckpointError,
    StoreError,
    check_checkpoint,
    training_data_row,
)

T = TypeVar("T")

TIMEOUT_SECONDS = 20
PAGE_SIZE = 1000


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

    def _request(self, method: str, path: str, payload: Any = None,
                 prefer: str = "") -> Tuple[Any, Dict[str, str]]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.base + path, data=body, method=method, headers=self._headers(prefer)
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
                headers = {k.lower(): v for k, v in response.headers.items()}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise StoreError(f"{method} {path} -> {exc.code} {detail}") from exc
        except urllib.error.URLError as exc:
            raise StoreError(f"{method} {path} could not be reached: {exc.reason}") from exc
        return (json.loads(raw) if raw else []), headers

    def _call(self, method: str, path: str, payload: Any = None, prefer: str = "") -> Any:
        return self._request(method, path, payload, prefer)[0]

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

    def datasets(self, name: Optional[str] = None) -> List[Dataset]:
        query = "order=name.asc,version.desc"
        if name is not None:
            query = f"name=eq.{urllib.parse.quote(name)}&" + query
        return self._select(Dataset, query)

    def dataset(self, dataset_id: str) -> Optional[Dataset]:
        found = self._select(Dataset, f"id=eq.{urllib.parse.quote(dataset_id)}")
        return found[0] if found else None

    def dataset_by_hash(self, name: str, sha256: str) -> Optional[Dataset]:
        found = self._select(
            Dataset, f"name=eq.{urllib.parse.quote(name)}&sha256=eq.{urllib.parse.quote(sha256)}"
        )
        return found[0] if found else None

    def register_dataset(self, dataset: Dataset) -> Dataset:
        returned = self._call("POST", "/rpc/ored_dataset_register", {"p_row": to_row(dataset)})
        if isinstance(returned, list):
            returned = returned[0] if returned else None
        if not returned:
            raise StoreError("ored_dataset_register returned nothing")
        return self._build(Dataset, returned)

    def set_dataset_storage(self, dataset_id: str, storage_path: str) -> Dataset:
        path = f"/{self._table(Dataset)}?id=eq.{urllib.parse.quote(dataset_id)}"
        returned = self._call("PATCH", path, {"storage_path": storage_path}, "return=representation")
        if not returned:
            raise StoreError(f"dataset {dataset_id} was not updated")
        return self._build(Dataset, returned[0])

    @staticmethod
    def _selection_filters(selection: Selection) -> List[str]:
        def listed(values: List[str]) -> str:
            return "(" + ",".join(urllib.parse.quote(v, safe="") for v in values) + ")"

        filters = []
        if selection.enabled_only:
            filters.append("enabled=is.true")
        if selection.verified_only:
            filters.append("verified=is.true")
        if selection.dataset_tag != ALL_TAGS:
            filters.append(f"dataset_tag=eq.{urllib.parse.quote(selection.dataset_tag, safe='')}")
        for column, values in (("type", selection.types), ("category", selection.categories),
                               ("subject", selection.subjects), ("language", selection.languages)):
            if values:
                filters.append(f"{column}=in.{listed(values)}")
        if selection.as_of:
            filters.append(f"updated_at=lte.{urllib.parse.quote(selection.as_of, safe='')}")
        return filters

    def training_data_page(self, selection: Selection, after: Optional[str] = None,
                           limit: int = PAGE_SIZE) -> List[TrainingData]:
        filters = self._selection_filters(selection)
        if after:
            filters.append(f"fingerprint=gt.{urllib.parse.quote(after, safe='')}")
        filters += ["order=fingerprint.asc", f"limit={int(limit)}"]
        return self._select(TrainingData, "&".join(filters))

    def iter_training_data(self, selection: Selection, page_size: int = PAGE_SIZE) -> Iterator[TrainingData]:
        after: Optional[str] = None
        while True:
            page = self.training_data_page(selection, after, page_size)
            if not page:
                return
            yield from page
            after = page[-1].fingerprint

    def training_data(self, selection: Optional[Selection] = None) -> List[TrainingData]:
        return list(self.iter_training_data(selection or Selection(mode="everything")))

    def count_training_data(self, selection: Optional[Selection] = None) -> int:
        filters = self._selection_filters(selection or Selection(mode="everything"))
        path = f"/{self._table(TrainingData)}?select=id&limit=1"
        if filters:
            path += "&" + "&".join(filters)
        _, headers = self._request("GET", path, prefer="count=exact")
        total = headers.get("content-range", "").rpartition("/")[2]
        if not total.isdigit():
            raise StoreError(f"Supabase did not report a row count (content-range {total!r})")
        return int(total)

    def latest_training_data_update(self, selection: Selection) -> Optional[str]:
        filters = self._selection_filters(selection) + ["order=updated_at.desc", "limit=1"]
        path = f"/{self._table(TrainingData)}?select=updated_at&" + "&".join(filters)
        found = self._call("GET", path)
        return found[0]["updated_at"] if found else None

    def training_data_by_fingerprint(self, fingerprints: Iterable[str]) -> List[TrainingData]:
        wanted = sorted(set(fingerprints))
        found: List[TrainingData] = []
        for start in range(0, len(wanted), 100):
            chunk = ",".join(wanted[start:start + 100])
            found += self._select(TrainingData, f"fingerprint=in.({chunk})")
        return found

    def add_training_data(self, records: Iterable[TrainingData]) -> List[TrainingData]:
        rows = [training_data_row(r) for r in records]
        if not rows:
            return []
        fingerprints = [r["fingerprint"] for r in rows]
        repeated = sorted({f for f in fingerprints if fingerprints.count(f) > 1})
        if repeated:
            raise DuplicateTrainingDataError(repeated, [])
        existing = self.training_data_by_fingerprint(fingerprints)
        if existing:
            raise DuplicateTrainingDataError([e.fingerprint for e in existing], existing)
        stored: List[TrainingData] = []
        for start in range(0, len(rows), PAGE_SIZE):
            try:
                returned = self._call("POST", "/" + self._table(TrainingData),
                                      rows[start:start + PAGE_SIZE], "return=representation")
            except StoreError as exc:
                if "ored_training_data_fingerprint_idx" in str(exc):
                    raise DuplicateTrainingDataError(fingerprints, []) from exc
                raise
            stored += [self._build(TrainingData, row) for row in returned]
        return stored

    def update_training_data(self, record_id: str, **fields: Any) -> TrainingData:
        allowed = set(TrainingData.__dataclass_fields__) - {"id", "fingerprint", "created_at", "updated_at"}
        unknown = sorted(set(fields) - allowed)
        if unknown:
            raise StoreError(f"cannot update {unknown} on a training record")
        path = f"/{self._table(TrainingData)}?id=eq.{urllib.parse.quote(record_id)}"
        try:
            returned = self._call("PATCH", path, fields, "return=representation")
        except StoreError as exc:
            if "ored_training_data_fingerprint_idx" in str(exc):
                raise DuplicateTrainingDataError([], [], f"the edit makes record {record_id} an exact "
                                                         f"duplicate of another record") from exc
            raise
        if not returned:
            raise StoreError(f"training record {record_id} was not found")
        return self._build(TrainingData, returned[0])

    def training_data_summary(self) -> List[Dict[str, Any]]:
        return self._call("GET", "/ored_training_data_summary?select=*"
                                 "&order=dataset_tag.asc,category.asc,subject.asc,type.asc")

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

    def session(self, session_id: str) -> Optional[TrainingSession]:
        found = self._select(TrainingSession, f"id=eq.{urllib.parse.quote(session_id)}")
        return found[0] if found else None

    def patch_session(self, session_id: str, **fields: Any) -> None:
        values = {k: (v.value if hasattr(v, "value") else v) for k, v in fields.items()}
        path = f"/{self._table(TrainingSession)}?id=eq.{urllib.parse.quote(session_id)}"
        self._call("PATCH", path, values)

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

    def _rpc(self, name: str, args: Dict[str, Any]) -> Checkpoint:
        try:
            returned = self._call("POST", f"/rpc/{name}", args)
        except StoreError as exc:
            if "it changed" in str(exc):
                raise StaleCheckpointError(str(exc)) from exc
            raise
        if isinstance(returned, list):
            returned = returned[0] if returned else None
        if not returned:
            raise StoreError(f"{name} returned nothing")
        return self._build(Checkpoint, returned)

    def add_checkpoint(self, checkpoint: Checkpoint) -> Checkpoint:
        return self.register_checkpoint(checkpoint)

    def register_checkpoint(
        self, checkpoint: Checkpoint, make_current: bool = False, replaces: Optional[str] = None
    ) -> Checkpoint:
        check_checkpoint(checkpoint)
        return self._rpc("ored_checkpoint_register", {
            "p_row": to_row(checkpoint),
            "p_make_current": bool(make_current),
            "p_replaces": replaces,
        })

    def make_current(self, checkpoint_id: str, replaces: Optional[str] = None) -> Checkpoint:
        return self._rpc("ored_checkpoint_make_current", {"p_id": checkpoint_id, "p_replaces": replaces})

    def delete_checkpoint(self, checkpoint_id: str, allow_current: bool = False) -> Checkpoint:
        return self._rpc("ored_checkpoint_delete", {"p_id": checkpoint_id, "p_allow_current": allow_current})

    def mark_verified(self, checkpoint_id: str, sha256: str) -> Checkpoint:
        return self._rpc("ored_checkpoint_mark_verified", {"p_id": checkpoint_id, "p_sha256": sha256})

    def checkpoint(self, checkpoint_id: str) -> Optional[Checkpoint]:
        found = self._select(Checkpoint, f"id=eq.{urllib.parse.quote(checkpoint_id)}")
        return found[0] if found else None

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
        filters = []
        if logical is not None:
            filters.append("part=neq.shard" if logical else "part=eq.shard")
        if kind is not None:
            filters.append(f"kind=eq.{CheckpointKind(kind).value}")
        if run_name is not None:
            filters.append(f"run_name=eq.{urllib.parse.quote(run_name)}")
        if current is not None:
            filters.append(f"is_current=is.{'true' if current else 'false'}")
        filters.append("order=created_at.asc")
        return self._select(Checkpoint, "&".join(filters))

    def drop_checkpoint(self, checkpoint_id: str) -> None:
        self.delete_checkpoint(checkpoint_id, allow_current=True)

    def set_shard_status(self, checkpoint_id: str, status: str) -> Checkpoint:
        return self._rpc("ored_checkpoint_shard_status", {"p_id": checkpoint_id, "p_status": status})

    def finalize_group(
        self, group_id: str, manifest: Checkpoint, make_current: bool = False,
        replaces: Optional[str] = None,
    ) -> Checkpoint:
        return self._rpc("ored_checkpoint_finalize_group", {
            "p_group": group_id,
            "p_manifest": to_row(manifest),
            "p_make_current": bool(make_current),
            "p_replaces": replaces,
        })

    def delete_group(self, group_id: str, allow_current: bool = False) -> int:
        returned = self._call("POST", "/rpc/ored_checkpoint_delete_group",
                              {"p_group": group_id, "p_allow_current": allow_current})
        return int(returned if not isinstance(returned, list) else (returned[0] if returned else 0))

    def group(self, group_id: str) -> List[Checkpoint]:
        safe = urllib.parse.quote(group_id)
        return self._select(Checkpoint, f"checkpoint_group_id=eq.{safe}&order=part.asc,rank.asc,object_path.asc")

    def claim_session(self, session_key: str, run_name: str, dataset_tag: str,
                      config: Dict[str, Any]) -> TrainingSession:
        returned = self._call("POST", "/rpc/ored_training_session_claim", {
            "p_session_key": session_key,
            "p_run_name": run_name,
            "p_dataset_tag": dataset_tag,
            "p_config": config,
        })
        if isinstance(returned, list):
            returned = returned[0] if returned else None
        if not returned:
            raise StoreError("ored_training_session_claim returned nothing")
        return self._build(TrainingSession, returned)

    def upsert_worker(self, worker: TrainingWorker) -> TrainingWorker:
        row = to_row(worker)
        row.pop("id")
        row.pop("created_at")
        returned = self._call(
            "POST", "/" + self._table(TrainingWorker) + "?on_conflict=session_id,worker_id", [row],
            "resolution=merge-duplicates,return=representation",
        )
        return self._build(TrainingWorker, returned[0])

    def update_worker(self, worker_row_id: str, **fields: Any) -> None:
        values = {k: (v.value if hasattr(v, "value") else v) for k, v in fields.items()}
        path = f"/{self._table(TrainingWorker)}?id=eq.{urllib.parse.quote(worker_row_id)}"
        self._call("PATCH", path, values)

    def workers(self, session_id: str) -> List[TrainingWorker]:
        safe = urllib.parse.quote(session_id)
        return self._select(TrainingWorker, f"session_id=eq.{safe}&order=rank.asc")
