from __future__ import annotations

import hashlib
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

from ored.learning.records import Checkpoint, CheckpointKind
from ored.learning.store import StoreError

DEFAULT_BUCKET = "ored-checkpoints"
TIMEOUT_SECONDS = 120
READ_CHUNK = 1024 * 1024


def digest(path: str | Path) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(READ_CHUNK), b""):
            sha.update(chunk)
    return sha.hexdigest()


def describe(path: str | Path) -> Dict[str, Any]:
    import torch

    payload = torch.load(path, map_location="cpu", weights_only=True)
    metrics = payload.get("metrics") or {}
    return {
        "format_version": int(payload.get("format_version") or 0),
        "torch_version": str(payload.get("torch_version") or ""),
        "epoch": int(payload.get("epoch") or 0),
        "metrics": {k: float(v) for k, v in metrics.items() if isinstance(v, (int, float))},
    }


class CheckpointStore:

    def __init__(
        self,
        url: str,
        service_key: str,
        bucket: str = DEFAULT_BUCKET,
        timeout: int = TIMEOUT_SECONDS,
    ) -> None:
        if not url or not service_key:
            raise StoreError("CheckpointStore needs a project url and a service key")
        self.base = url.rstrip("/") + "/storage/v1"
        self.service_key = service_key
        self.bucket = bucket
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "CheckpointStore":
        url = os.environ.get("ORED_SB_URL", "")
        key = os.environ.get("ORED_SB_SERVICE_KEY", "")
        bucket = os.environ.get("ORED_SB_CHECKPOINT_BUCKET", DEFAULT_BUCKET)
        if not url or not key:
            raise StoreError(
                "set ORED_SB_URL and ORED_SB_SERVICE_KEY to reach checkpoint storage"
            )
        return cls(url, key, bucket)

    def _object_url(self, object_path: str) -> str:
        quoted = "/".join(urllib.parse.quote(p) for p in object_path.strip("/").split("/"))
        return f"{self.base}/object/{urllib.parse.quote(self.bucket)}/{quoted}"

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {
            "apikey": self.service_key,
            "authorization": "Bearer " + self.service_key,
        }
        if extra:
            headers.update(extra)
        return headers

    def _send(self, method: str, url: str, data: Any = None, headers: Optional[Dict[str, str]] = None) -> bytes:
        request = urllib.request.Request(
            url, data=data, method=method, headers=self._headers(headers)
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300]
            raise StoreError(f"{method} {url} -> {exc.code} {detail}") from exc
        except urllib.error.URLError as exc:
            raise StoreError(f"{method} {url} could not be reached: {exc.reason}") from exc

    def upload(self, path: str | Path, object_path: str) -> Dict[str, Any]:
        path = Path(path)
        if not path.is_file():
            raise StoreError(f"checkpoint not found: {path}")
        size = path.stat().st_size
        with open(path, "rb") as handle:
            self._send(
                "POST",
                self._object_url(object_path),
                data=handle.read(),
                headers={
                    "content-type": "application/octet-stream",
                    "x-upsert": "true",
                },
            )
        return {"object_path": object_path, "size_bytes": size, "sha256": digest(path)}

    def download(self, object_path: str, path: str | Path) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = self._send("GET", self._object_url(object_path))
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(raw)
        tmp.replace(path)
        return path

    def remove(self, object_path: str) -> None:
        self._send("DELETE", self._object_url(object_path))


def object_path_for(kind: CheckpointKind, run_name: str, checkpoint_id: str) -> str:
    safe_run = "".join(c if c.isalnum() or c in "-_" else "-" for c in (run_name or "run"))
    return f"{kind.value}/{safe_run}/{checkpoint_id}.pt"


def publish(
    store: Any,
    files: CheckpointStore,
    path: str | Path,
    kind: CheckpointKind = CheckpointKind.BEST,
    run_name: str = "",
    version_id: Optional[str] = None,
    session_id: Optional[str] = None,
    uploaded_by: Optional[str] = None,
) -> Checkpoint:
    meta = describe(path)
    record = Checkpoint(
        version_id=version_id,
        session_id=session_id,
        kind=kind,
        run_name=run_name,
        bucket_id=files.bucket,
        uploaded_by=uploaded_by,
        **meta,
    )
    record.object_path = object_path_for(kind, run_name, record.id)

    uploaded = files.upload(path, record.object_path)
    record.size_bytes = uploaded["size_bytes"]
    record.sha256 = uploaded["sha256"]

    if kind is CheckpointKind.LIVE:
        for old in store.checkpoints(CheckpointKind.LIVE):
            store.drop_checkpoint(old.id)
            try:
                files.remove(old.object_path)
            except StoreError:
                pass

    return store.add_checkpoint(record)


def fetch(
    store: Any,
    files: CheckpointStore,
    path: str | Path,
    kind: CheckpointKind = CheckpointKind.BEST,
    run_name: str = "",
) -> Optional[Checkpoint]:
    found: List[Checkpoint] = store.checkpoints(kind)
    if run_name:
        found = [c for c in found if c.run_name == run_name]
    if not found:
        return None

    record = found[-1]
    files.download(record.object_path, path)

    if record.sha256 and digest(path) != record.sha256:
        raise StoreError(f"checkpoint {record.object_path} failed its sha256 check")

    return record
