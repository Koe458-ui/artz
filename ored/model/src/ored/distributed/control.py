from __future__ import annotations

import threading
import time
from typing import Any, Dict, Optional

from ored.distributed.env import DistEnv
from ored.learning.records import SessionStatus, TrainingWorker, WorkerStatus, now
from ored.learning.store import StoreError
from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)


class ControlPlane:

    session_id: Optional[str] = None

    def start(self, run_name: str, dataset_tag: str, config: Dict[str, Any]) -> Optional[str]:
        return None

    def set_status(self, status: str) -> None:
        pass

    def link_dataset(self, dataset_id: str, example_count: int) -> None:
        pass

    def finish(self, status: str, metrics: Optional[Dict[str, Any]] = None, error: str = "") -> None:
        pass


class SupabaseControlPlane(ControlPlane):

    def __init__(self, store: Any, env: DistEnv, heartbeat_seconds: int = 30) -> None:
        self.store = store
        self.env = env
        self.heartbeat_seconds = heartbeat_seconds
        self.worker_row_id: Optional[str] = None
        self.status = WorkerStatus.JOINING
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_error = 0.0

    def _safely(self, action: str, fn: Any, *args: Any, **kwargs: Any) -> Any:
        try:
            return fn(*args, **kwargs)
        except StoreError as exc:
            if time.time() - self._last_error > 60:
                logger.warning(f"rank {self.env.rank}: Supabase {action} failed (training continues): {exc}")
                self._last_error = time.time()
            return None

    def start(self, run_name: str, dataset_tag: str, config: Dict[str, Any]) -> Optional[str]:
        session_id = None
        error = None
        if self.env.is_coordinator:
            try:
                session_id = self.store.claim_session(self.env.session_key, run_name, dataset_tag, config).id
            except StoreError as exc:
                error = str(exc)
        session_id, error = self.env.broadcast_object((session_id, error))
        if error:
            raise StoreError(f"could not claim training session {self.env.session_key!r}: {error}")
        self.session_id = session_id
        info = self.env.describe()
        worker = TrainingWorker(
            session_id=session_id,
            worker_id=self.env.worker_id,
            rank=self.env.rank,
            node_rank=self.env.node_rank,
            local_rank=self.env.local_rank,
            hostname=self.env.hostname,
            device=info["device"],
            gpu_name=info["gpu"],
            torch_version=info["torch"],
            status=WorkerStatus.READY,
            last_heartbeat=now(),
            started_at=now(),
        )
        stored = self._safely("worker registration", self.store.upsert_worker, worker)
        self.worker_row_id = stored.id if stored else None
        self.status = WorkerStatus.READY
        self._thread = threading.Thread(target=self._beat, name="ored-heartbeat", daemon=True)
        self._thread.start()
        return session_id

    def link_dataset(self, dataset_id: str, example_count: int) -> None:
        if self.env.is_coordinator and self.session_id:
            self._safely("dataset link", self.store.patch_session, self.session_id,
                         dataset_id=dataset_id, example_count=example_count)

    def _beat(self) -> None:
        while not self._stop.wait(self.heartbeat_seconds):
            if self.worker_row_id:
                self._safely("heartbeat", self.store.update_worker, self.worker_row_id,
                             last_heartbeat=now(), status=self.status)

    def set_status(self, status: str) -> None:
        status = WorkerStatus(status)
        if status == self.status:
            return
        self.status = status
        if self.worker_row_id:
            self._safely("status update", self.store.update_worker, self.worker_row_id,
                         status=status, last_heartbeat=now())

    def finish(self, status: str, metrics: Optional[Dict[str, Any]] = None, error: str = "") -> None:
        self._stop.set()
        worker_status = {"completed": WorkerStatus.COMPLETED, "failed": WorkerStatus.FAILED,
                         "cancelled": WorkerStatus.DISCONNECTED}[status]
        self.status = worker_status
        if self.worker_row_id:
            self._safely("final status", self.store.update_worker, self.worker_row_id,
                         status=worker_status, last_heartbeat=now(), finished_at=now(), error=error[:500])
        if self.env.is_coordinator and self.session_id:
            session_status = {"completed": SessionStatus.EVALUATED, "failed": SessionStatus.FAILED,
                              "cancelled": SessionStatus.CANCELLED}[status]
            sessions = [s for s in self._safely("session read", self.store.sessions) or []
                        if s.id == self.session_id]
            if sessions:
                session = sessions[0]
                session.status = session_status
                session.metrics = dict(metrics or session.metrics)
                session.error = error[:500]
                session.finished_at = now()
                self._safely("session update", self.store.update_session, session)
