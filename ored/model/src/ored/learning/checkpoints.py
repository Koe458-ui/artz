from __future__ import annotations

import hashlib
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ored.learning.records import Checkpoint, CheckpointKind, now
from ored.learning.store import StoreError
from ored.utils.checkpoint import (
    CheckpointError,
    PromotionRule,
    as_kind,
    clean_metrics,
    load_checkpoint,
    write_payload,
)

DEFAULT_BUCKET = "ored-checkpoints"
TIMEOUT_SECONDS = 120
READ_CHUNK = 1024 * 1024
LIST_PAGE = 1000


class ObjectExistsError(StoreError):
    pass


class NotBetterError(StoreError):
    pass


def digest(path: str | Path) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(READ_CHUNK), b""):
            sha.update(chunk)
    return sha.hexdigest()


def describe(path: str | Path) -> Dict[str, Any]:
    payload = load_checkpoint(path, map_location="cpu")
    return {
        "format_version": int(payload["format_version"]),
        "torch_version": str(payload.get("torch_version") or ""),
        "epoch": int(payload.get("epoch") or 0),
        "global_step": int(payload.get("global_step") or 0),
        "metrics": clean_metrics(payload.get("metrics")),
        "kind": payload.get("checkpoint_kind"),
        "run_name": payload.get("run_name") or "",
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
            if exc.code == 409 or "Duplicate" in detail or "already exists" in detail:
                raise ObjectExistsError(f"{method} {url} -> {exc.code} {detail}") from exc
            raise StoreError(f"{method} {url} -> {exc.code} {detail}") from exc
        except urllib.error.URLError as exc:
            raise StoreError(f"{method} {url} could not be reached: {exc.reason}") from exc

    def upload(self, path: str | Path, object_path: str, upsert: bool = False) -> Dict[str, Any]:
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
                    "x-upsert": "true" if upsert else "false",
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

    def _list(self, prefix: str, search: str = "") -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        offset = 0
        while True:
            body = json.dumps({
                "prefix": prefix, "search": search, "limit": LIST_PAGE, "offset": offset,
                "sortBy": {"column": "name", "order": "asc"},
            }).encode("utf-8")
            raw = self._send(
                "POST",
                f"{self.base}/object/list/{urllib.parse.quote(self.bucket)}",
                data=body,
                headers={"content-type": "application/json"},
            )
            page = json.loads(raw or b"[]")
            items.extend(page)
            if len(page) < LIST_PAGE:
                return items
            offset += LIST_PAGE

    def stat(self, object_path: str) -> Optional[int]:
        folder, _, name = object_path.strip("/").rpartition("/")
        for item in self._list(folder, name):
            if item.get("name") == name and item.get("id"):
                return int((item.get("metadata") or {}).get("size") or 0)
        return None

    def list_objects(self, prefix: str = "") -> Dict[str, int]:
        found: Dict[str, int] = {}
        for item in self._list(prefix.strip("/")):
            path = f"{prefix.strip('/')}/{item['name']}".strip("/")
            if item.get("id"):
                found[path] = int((item.get("metadata") or {}).get("size") or 0)
            else:
                found.update(self.list_objects(path))
        return found


def safe_name(run_name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in (run_name or "run"))


def object_path_for(kind: CheckpointKind, run_name: str, epoch: int = 0, global_step: int = 0) -> str:
    kind = CheckpointKind(kind)
    run = safe_name(run_name)
    if kind is CheckpointKind.BASE:
        return f"{run}/base/base.pt"
    return f"{run}/{kind.value}/epoch_{int(epoch):04d}_step_{int(global_step):08d}.pt"


def _with_suffix(object_path: str, n: int) -> str:
    stem, dot, ext = object_path.rpartition(".")
    return f"{stem}-{n}{dot}{ext}"


def _row_for_path(store: Any, object_path: str) -> Optional[Checkpoint]:
    for record in store.checkpoints():
        if record.object_path == object_path:
            return record
    return None


def _tempdir(workdir: Optional[str | Path]) -> tempfile.TemporaryDirectory:
    if workdir is not None:
        Path(workdir).mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=workdir)


def upload_verified(files: CheckpointStore, path: Path, object_path: str, sha256: str,
                    rehash: bool = True, workdir: Optional[str | Path] = None) -> None:
    size = path.stat().st_size
    try:
        files.upload(path, object_path, upsert=False)
    except ObjectExistsError:
        files.upload(path, object_path, upsert=True)

    try:
        stored = files.stat(object_path)
        if stored is None:
            raise StoreError(f"{object_path} was uploaded but Storage cannot find it")
        if stored != size:
            raise StoreError(f"{object_path} is {stored} bytes in Storage, {size} locally")
        if rehash:
            with _tempdir(workdir) as tmp:
                landed = files.download(object_path, Path(tmp) / "check.pt")
                if digest(landed) != sha256:
                    raise StoreError(f"{object_path} failed its sha256 check after upload")
    except StoreError:
        try:
            files.remove(object_path)
        except StoreError:
            pass
        raise


def publish(
    store: Any,
    files: CheckpointStore,
    path: str | Path,
    kind: CheckpointKind = CheckpointKind.BEST,
    run_name: str = "",
    version_id: Optional[str] = None,
    session_id: Optional[str] = None,
    uploaded_by: Optional[str] = None,
    *,
    make_current: Optional[bool] = None,
    parent_id: Optional[str] = None,
    rule: Optional[PromotionRule] = None,
    force: bool = False,
    rehash: bool = True,
    prune_superseded: bool = True,
    workdir: Optional[str | Path] = None,
) -> Checkpoint:
    kind = CheckpointKind(kind)
    path = Path(path)
    rule = rule or PromotionRule()
    if make_current is None:
        make_current = kind is not CheckpointKind.HISTORY

    meta = describe(path)
    if meta["kind"] not in (None, kind.value):
        raise CheckpointError(
            f"{path} is a {meta['kind']} checkpoint, not {kind.value}. "
            f"Use promote-best or export to turn one role into another."
        )
    run_name = run_name or meta["run_name"] or "run"
    sha256 = digest(path)
    size = path.stat().st_size

    object_path = object_path_for(kind, run_name, meta["epoch"], meta["global_step"])
    candidate, n = object_path, 1
    while True:
        existing = _row_for_path(store, candidate)
        if existing is None:
            break
        if existing.sha256 == sha256:
            return existing
        n += 1
        candidate = _with_suffix(object_path, n)
    object_path = candidate

    current = store.current_checkpoint(run_name, kind) if make_current else None
    if make_current and kind is CheckpointKind.BASE and current is not None:
        raise StoreError(
            f"run {run_name} already has a base checkpoint ({current.object_path}); base is immutable"
        )
    if kind is CheckpointKind.BEST and make_current and current is not None and not force:
        new_value, old_value = rule.value(meta["metrics"]), rule.value(current.metrics)
        if not rule.is_better(new_value, old_value):
            raise NotBetterError(
                f"not promoted: {rule.metric} {_num(new_value)} does not beat the current "
                f"best {_num(old_value)} (epoch {current.epoch}); {rule.describe()}"
            )

    upload_verified(files, path, object_path, sha256, rehash=rehash, workdir=workdir)

    record = Checkpoint(
        version_id=version_id,
        session_id=session_id,
        kind=kind,
        run_name=run_name,
        bucket_id=files.bucket,
        object_path=object_path,
        size_bytes=size,
        sha256=sha256,
        format_version=meta["format_version"],
        torch_version=meta["torch_version"],
        epoch=meta["epoch"],
        global_step=meta["global_step"],
        metrics=meta["metrics"],
        uploaded_by=uploaded_by,
        parent_checkpoint_id=parent_id,
        promotion_metric=rule.metric if kind is CheckpointKind.BEST else None,
        promotion_mode=rule.mode if kind is CheckpointKind.BEST else None,
        verified_at=now() if rehash else None,
    )
    try:
        record = store.register_checkpoint(
            record, make_current=make_current, replaces=current.id if current else None
        )
    except StoreError:
        try:
            files.remove(object_path)
        except StoreError:
            pass
        raise

    if kind is CheckpointKind.LIVE and prune_superseded:
        for old in store.checkpoints(CheckpointKind.LIVE, run_name=run_name, current=False):
            delete_checkpoint(store, files, old.id)
    return record


def _num(value: Optional[float]) -> str:
    return "n/a" if value is None else f"{value:.5f}"


def promote_best(
    store: Any,
    files: CheckpointStore,
    path: str | Path,
    run_name: str = "",
    rule: Optional[PromotionRule] = None,
    *,
    force: bool = False,
    parent_id: Optional[str] = None,
    workdir: Optional[str | Path] = None,
    **publish_args: Any,
) -> Tuple[Optional[Checkpoint], str]:
    rule = rule or PromotionRule()
    payload = load_checkpoint(path, map_location="cpu")
    if rule.value(payload.get("metrics")) is None and not force:
        return None, f"not promoted: {path} has no {rule.metric} to compare"

    with _tempdir(workdir) as tmp:
        source = Path(path)
        if payload.get("checkpoint_kind") != "best":
            source = write_payload(Path(tmp) / "best.pt", as_kind(payload, "best"))
        try:
            record = publish(
                store, files, source, CheckpointKind.BEST, run_name or payload.get("run_name", ""),
                rule=rule, force=force, parent_id=parent_id, workdir=workdir, **publish_args,
            )
        except NotBetterError as exc:
            return None, str(exc)
    value = rule.value(record.metrics)
    return record, f"promoted to best: {rule.metric} {_num(value)} (epoch {record.epoch})"


def promote_existing_best(
    store: Any,
    files: CheckpointStore,
    checkpoint_id: str,
    rule: Optional[PromotionRule] = None,
    *,
    force: bool = False,
    workdir: Optional[str | Path] = None,
) -> Tuple[Optional[Checkpoint], str]:
    rule = rule or PromotionRule()
    source = store.checkpoint(checkpoint_id)
    if source is None:
        raise StoreError(f"no checkpoint {checkpoint_id}")
    if source.kind is CheckpointKind.BEST:
        if source.is_current:
            return source, "already the current best"
        current = store.current_checkpoint(source.run_name, CheckpointKind.BEST)
        if current is not None and not force and not rule.is_better(
            rule.value(source.metrics), rule.value(current.metrics)
        ):
            return None, (
                f"not promoted: {rule.metric} {_num(rule.value(source.metrics))} does not beat "
                f"{_num(rule.value(current.metrics))}; pass --force to roll back anyway"
            )
        verify_checkpoint(store, files, source, workdir=workdir).raise_for_failure()
        record = store.make_current(source.id, replaces=current.id if current else None)
        return record, f"best is now {record.object_path}"

    with _tempdir(workdir) as tmp:
        landed = fetch_record(files, source, Path(tmp) / "source.pt")
        return promote_best(
            store, files, landed, source.run_name, rule,
            force=force, parent_id=source.id, workdir=workdir,
            version_id=source.version_id, session_id=source.session_id,
        )


def export_checkpoint(
    store: Any,
    files: CheckpointStore,
    run_name: str,
    source_kind: CheckpointKind = CheckpointKind.BEST,
    local_copy: Optional[str | Path] = None,
    workdir: Optional[str | Path] = None,
) -> Checkpoint:
    source = store.current_checkpoint(run_name, source_kind)
    if source is None:
        raise StoreError(f"run {run_name} has no current {CheckpointKind(source_kind).value} checkpoint to export")
    with _tempdir(workdir) as tmp:
        landed = fetch_record(files, source, Path(tmp) / "source.pt")
        exported = write_payload(
            Path(local_copy) if local_copy else Path(tmp) / "export.pt",
            as_kind(load_checkpoint(landed), "export"),
        )
        return publish(
            store, files, exported, CheckpointKind.EXPORT, run_name,
            version_id=source.version_id, session_id=source.session_id,
            parent_id=source.id, workdir=workdir,
        )


def fetch_record(files: CheckpointStore, record: Checkpoint, path: str | Path) -> Path:
    path = Path(path)
    try:
        files.download(record.object_path, path)
    except StoreError as exc:
        raise StoreError(
            f"checkpoint {record.id} ({record.kind.value} of {record.run_name}) is recorded at "
            f"{record.bucket_id}/{record.object_path}, but the object could not be read: {exc}"
        ) from exc
    if record.sha256 and digest(path) != record.sha256:
        path.unlink(missing_ok=True)
        raise StoreError(f"checkpoint {record.object_path} failed its sha256 check")
    return path


def find(store: Any, kind: CheckpointKind, run_name: str = "") -> Optional[Checkpoint]:
    kind = CheckpointKind(kind)
    found: List[Checkpoint] = store.checkpoints(kind, run_name=run_name or None)
    if not found:
        return None
    current = [c for c in found if c.is_current]
    return current[-1] if current else found[-1]


def fetch(
    store: Any,
    files: CheckpointStore,
    path: str | Path,
    kind: CheckpointKind = CheckpointKind.BEST,
    run_name: str = "",
) -> Optional[Checkpoint]:
    record = find(store, kind, run_name)
    if record is None:
        return None
    fetch_record(files, record, path)
    return record


@dataclass
class VerifyReport:

    record: Checkpoint
    exists: bool = False
    size_ok: bool = False
    sha_ok: bool = False
    loads: bool = False
    problems: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.exists and self.size_ok and self.sha_ok and self.loads

    def raise_for_failure(self) -> "VerifyReport":
        if not self.ok:
            raise StoreError(
                f"checkpoint {self.record.object_path} failed verification: " + "; ".join(self.problems)
            )
        return self


def verify_checkpoint(
    store: Any,
    files: CheckpointStore,
    record: Checkpoint,
    workdir: Optional[str | Path] = None,
    load: bool = True,
) -> VerifyReport:
    report = VerifyReport(record)
    size = files.stat(record.object_path)
    if size is None:
        report.problems.append("the Storage object is missing")
        return report
    report.exists = True
    report.size_ok = size == record.size_bytes
    if not report.size_ok:
        report.problems.append(f"size is {size} bytes, recorded {record.size_bytes}")

    with _tempdir(workdir) as tmp:
        landed = files.download(record.object_path, Path(tmp) / "verify.pt")
        actual = digest(landed)
        report.sha_ok = actual == record.sha256
        if not report.sha_ok:
            report.problems.append(f"sha256 is {actual}, recorded {record.sha256}")
        if load:
            try:
                payload = load_checkpoint(landed)
                report.loads = int(payload["format_version"]) == record.format_version
                if not report.loads:
                    report.problems.append(
                        f"file says format {payload['format_version']}, row says {record.format_version}"
                    )
            except (CheckpointError, FileNotFoundError) as exc:
                report.problems.append(str(exc).splitlines()[0])
        else:
            report.loads = True

    if report.ok:
        store.mark_verified(record.id, record.sha256)
    return report


@dataclass
class DuplicateGroup:

    sha256: str
    canonical: Checkpoint
    extras: List[Checkpoint]

    @property
    def reclaimable_bytes(self) -> int:
        return sum(r.size_bytes for r in self.extras if r.object_path != self.canonical.object_path)


def find_duplicates(store: Any) -> List[DuplicateGroup]:
    by_sha: Dict[str, List[Checkpoint]] = {}
    for record in store.checkpoints():
        if record.sha256:
            by_sha.setdefault(record.sha256, []).append(record)
    groups = []
    for sha, records in by_sha.items():
        if len(records) < 2:
            continue
        ordered = sorted(records, key=lambda r: (not r.is_current, str(r.created_at), r.id))
        groups.append(DuplicateGroup(sha, ordered[0], ordered[1:]))
    return sorted(groups, key=lambda g: str(g.canonical.created_at))


def delete_checkpoint(store: Any, files: CheckpointStore, checkpoint_id: str,
                      allow_current: bool = False) -> Checkpoint:
    record = store.delete_checkpoint(checkpoint_id, allow_current=allow_current)
    if _row_for_path(store, record.object_path) is None:
        try:
            files.remove(record.object_path)
        except StoreError:
            pass
    return record


def remove_duplicates(store: Any, files: CheckpointStore, apply: bool = False) -> List[Checkpoint]:
    doomed = [r for g in find_duplicates(store) for r in g.extras if not r.is_current]
    if apply:
        for record in doomed:
            delete_checkpoint(store, files, record.id)
    return doomed


def prune_history(store: Any, files: CheckpointStore, run_name: str, keep_last: int,
                  apply: bool = False) -> List[Checkpoint]:
    if keep_last < 0:
        raise ValueError("keep_last must be >= 0")
    history = sorted(
        store.checkpoints(CheckpointKind.HISTORY, run_name=run_name),
        key=lambda r: (r.global_step, r.epoch, str(r.created_at)),
    )
    doomed = history[: max(0, len(history) - keep_last)]
    if apply:
        for record in doomed:
            delete_checkpoint(store, files, record.id)
    return doomed


def orphans(store: Any, files: CheckpointStore, prefix: str = "") -> Dict[str, int]:
    recorded = {r.object_path for r in store.checkpoints()}
    return {p: s for p, s in files.list_objects(prefix).items() if p not in recorded}
