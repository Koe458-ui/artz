from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ored.config import Config
from ored.data.corpus import SPLITS
from ored.data.tokenizer import CharTokenizer
from ored.data.training_data import (
    ALL_TAGS,
    FINGERPRINT_VERSION,
    TEXT_FORMAT_VERSION,
    RecordCheck,
    Selection,
    check_record,
    format_record,
    group_key,
    split_of,
)
from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)

SNAPSHOT_FORMAT = "ored-snapshot/1"
MANIFEST = "manifest.json"
RECORDS = "records.jsonl"
FILES = ("train.txt", "val.txt", "test.txt", RECORDS)
EXAMPLE_SEPARATOR = "\n\n"
DATASET_BUCKET = "ored-datasets"
SHOWN_PROBLEMS = 20
SAMPLES = 3


class SnapshotError(RuntimeError):
    pass


def digest_file(path: Path) -> str:
    sha = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def safe_tag(tag: str) -> str:
    return "".join(c if c.isalnum() or c in "-_." else "-" for c in tag) or "dataset"


def selection_from_config(cfg: Config) -> Selection:
    settings = cfg.data.supabase
    return Selection(
        dataset_tag=settings.dataset_tag or ALL_TAGS,
        types=list(settings.types),
        categories=list(settings.categories),
        subjects=list(settings.subjects),
        languages=list(settings.languages),
        mode="unverified_too" if settings.include_unverified else "verified",
    ).validate()


def split_fractions(cfg: Config) -> Dict[str, float]:
    return {"train": cfg.data.split.train, "val": cfg.data.split.val, "test": cfg.data.split.test}


def code_version() -> Dict[str, Any]:
    here = Path(__file__).resolve().parent
    info: Dict[str, Any] = {"git_commit": None, "git_dirty": None}
    try:
        info["git_commit"] = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=here, capture_output=True, text=True, timeout=10, check=True,
        ).stdout.strip() or None
        status = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=no"], cwd=here, capture_output=True,
            text=True, timeout=10, check=True,
        ).stdout
        info["git_dirty"] = bool(status.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    return info


def tokenizer_digest(tokenizer: Dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(tokenizer, sort_keys=True).encode()).hexdigest()


@dataclass
class Snapshot:

    directory: Path
    manifest: Dict[str, Any]

    @property
    def sha256(self) -> str:
        return self.manifest["sha256"]

    @property
    def tag(self) -> str:
        return self.manifest["dataset_tag"]

    @property
    def record_count(self) -> int:
        return int(self.manifest["counts"]["records"])

    @property
    def split_counts(self) -> Dict[str, int]:
        return {s: int(self.manifest["counts"][s]) for s in SPLITS}

    def path(self, name: str) -> Path:
        return self.directory / name

    def summary(self) -> Dict[str, Any]:
        m = self.manifest
        return {
            "source": "supabase",
            "dataset_tag": m["dataset_tag"],
            "snapshot_sha256": m["sha256"],
            "records": m["counts"]["records"],
            "split_counts": self.split_counts,
            "selection": m["selection"],
            "split_seed": m["split"]["seed"],
            "split_fractions": m["split"]["fractions"],
            "tokenizer": m["tokenizer"],
            "text_format_version": m["text_format_version"],
            "git_commit": m["code"].get("git_commit"),
            "git_dirty": m["code"].get("git_dirty"),
            "created_at": m["created_at"],
        }

    def verify(self) -> "Snapshot":
        problems = []
        if set(self.manifest.get("files") or {}) != set(FILES):
            raise SnapshotError(f"snapshot {self.directory} lists unexpected files in {MANIFEST}")
        for name, expected in self.manifest["files"].items():
            path = self.path(name)
            if not path.is_file():
                problems.append(f"{name} is missing")
            elif digest_file(path) != expected["sha256"]:
                problems.append(f"{name} does not match its sha256 in {MANIFEST}")
        if problems:
            raise SnapshotError(f"snapshot {self.directory} is damaged: " + "; ".join(problems)
                                + ". Delete the folder and let it be rebuilt or downloaded.")
        return self

    def samples(self, limit: int = SAMPLES) -> List[Dict[str, Any]]:
        blocks: List[str] = []
        pending = ""
        with open(self.path("train.txt"), encoding="utf-8") as handle:
            while len(blocks) < limit:
                chunk = handle.read(64 * 1024)
                if not chunk:
                    break
                pending += chunk
                *complete, pending = pending.split(EXAMPLE_SEPARATOR)
                blocks += [b for b in complete if b.strip()]
        return [{"split": "train", "text": b} for b in blocks[:limit]]


@dataclass
class _Writer:

    directory: Path
    seed: int
    fractions: Dict[str, float]
    block_size: int
    handles: Dict[str, Any] = field(default_factory=dict)
    content: Any = field(default_factory=hashlib.sha256)
    counts: Counter = field(default_factory=Counter)
    by_type: Counter = field(default_factory=Counter)
    by_category: Counter = field(default_factory=Counter)
    by_subject: Counter = field(default_factory=Counter)
    groups: Dict[str, set] = field(default_factory=lambda: {s: set() for s in SPLITS})
    train_characters: set = field(default_factory=lambda: {"\n"})
    longest: int = 0
    over_block: int = 0
    same_input: Counter = field(default_factory=Counter)

    def __post_init__(self) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        for name in FILES:
            self.handles[name] = open(self.directory / name, "w", encoding="utf-8", newline="\n")
        self.content.update(json.dumps({
            "format": SNAPSHOT_FORMAT,
            "fingerprint_version": FINGERPRINT_VERSION,
            "text_format_version": TEXT_FORMAT_VERSION,
            "split_seed": self.seed,
            "split_fractions": self.fractions,
        }, sort_keys=True).encode("utf-8") + b"\n")

    def add(self, record: Any) -> None:
        text = format_record(record)
        group = group_key(record)
        split = split_of(group, self.seed, self.fractions)
        group_hash = hashlib.sha256(group.encode("utf-8")).hexdigest()[:16]
        text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

        self.handles[f"{split}.txt"].write(text + EXAMPLE_SEPARATOR)
        row = {k: getattr(record, k) for k in record.__dataclass_fields__}
        row.update(split=split, group=group_hash, text_sha256=text_hash)
        self.handles[RECORDS].write(json.dumps(row, sort_keys=True, ensure_ascii=False, default=str) + "\n")
        self.content.update(f"{record.fingerprint}\t{split}\t{text_hash}\n".encode("utf-8"))

        self.counts["records"] += 1
        self.counts[split] += 1
        self.groups[split].add(group_hash)
        self.by_type[record.type] += 1
        self.by_category[record.category] += 1
        self.by_subject[f"{record.category}/{record.subject or '-'}"] += 1
        self.same_input[group_hash] += 1
        if split == "train":
            self.train_characters.update(text)
        self.longest = max(self.longest, len(text))
        self.over_block += int(len(text) + len(EXAMPLE_SEPARATOR) > self.block_size)

    def close(self) -> None:
        for handle in self.handles.values():
            handle.close()


def _problem_text(problems: List[RecordCheck]) -> str:
    lines = [p.describe() for p in problems[:SHOWN_PROBLEMS]]
    if len(problems) > SHOWN_PROBLEMS:
        lines.append(f"... and {len(problems) - SHOWN_PROBLEMS} more (python scripts/training_data.py validate)")
    return "\n  ".join(lines)


def build_snapshot(store: Any, cfg: Config, page_size: int = 1000) -> Snapshot:
    settings = cfg.data.supabase
    selection = selection_from_config(cfg)
    as_of = store.latest_training_data_update(selection)
    if as_of is None:
        waiting = store.count_training_data(Selection(
            dataset_tag=selection.dataset_tag, mode="unverified_too")) if selection.verified_only else 0
        hint = (f" {waiting} matching row(s) are enabled but not verified yet; set verified = true, "
                f"or pass --include-unverified to train on them anyway." if waiting else "")
        raise SnapshotError(f"no training records match: {selection.describe()}.{hint}")
    selection.as_of = as_of

    root = Path(settings.snapshot_dir) / safe_tag(selection.dataset_tag)
    building = root / f".building-{uuid.uuid4().hex[:12]}"
    fractions = split_fractions(cfg)
    writer = _Writer(building, settings.split_seed, fractions, cfg.data.block_size)
    problems: List[RecordCheck] = []
    warnings = 0
    try:
        for record in store.iter_training_data(selection, page_size):
            check = check_record(record)
            warnings += int(bool(check.warnings))
            if not check.ok:
                problems.append(check)
                continue
            writer.add(record)
        writer.close()

        expected = store.count_training_data(selection)
        if expected != writer.counts["records"] + len(problems):
            raise SnapshotError(
                f"read {writer.counts['records'] + len(problems)} rows but Supabase counts {expected} for "
                f"the same selection; rows were deleted while the snapshot was taken. Run it again.")
        if problems and settings.on_invalid == "fail":
            raise SnapshotError(
                f"{len(problems)} selected record(s) are invalid, so no snapshot was taken:\n  "
                f"{_problem_text(problems)}\nFix them in Supabase, or set data.supabase.on_invalid: skip "
                f"(--skip-invalid) to leave them out; the snapshot records what was skipped.")
        empty = [s for s in SPLITS if writer.counts[s] == 0]
        if empty:
            total_groups = sum(len(g) for g in writer.groups.values())
            raise SnapshotError(
                f"the {', '.join(empty)} split got no records: {writer.counts['records']} record(s) in "
                f"{total_groups} group(s) were split {fractions} with seed {settings.split_seed}. "
                f"Add more records (distinct questions), or try another data.supabase.split_seed.")

        sha256 = writer.content.hexdigest()
        tokenizer = CharTokenizer(writer.train_characters).to_dict()
        manifest = {
            "format": SNAPSHOT_FORMAT,
            "sha256": sha256,
            "dataset_tag": selection.dataset_tag,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "selection": selection.to_dict(),
            "on_invalid": settings.on_invalid,
            "skipped": [{"id": p.record_id, "errors": p.errors} for p in problems],
            "fingerprint_version": FINGERPRINT_VERSION,
            "text_format_version": TEXT_FORMAT_VERSION,
            "example_separator": EXAMPLE_SEPARATOR,
            "split": {
                "seed": settings.split_seed,
                "fractions": fractions,
                "unit": "group: metadata.group when set, else the normalised input",
                "groups": {s: len(writer.groups[s]) for s in SPLITS},
            },
            "counts": {
                "records": writer.counts["records"],
                **{s: writer.counts[s] for s in SPLITS},
                "by_type": dict(sorted(writer.by_type.items())),
                "by_category": dict(sorted(writer.by_category.items())),
                "by_subject": dict(sorted(writer.by_subject.items())),
                "groups_with_several_records": sum(1 for n in writer.same_input.values() if n > 1),
                "warnings": warnings,
            },
            "text": {
                "longest_example_chars": writer.longest,
                "examples_longer_than_block": writer.over_block,
                "block_size": cfg.data.block_size,
            },
            "tokenizer": {
                "name": cfg.data.tokenizer,
                "vocab_size": len(tokenizer["itos"]),
                "sha256": tokenizer_digest(tokenizer),
            },
            "intended": {
                "tokenizer": cfg.data.tokenizer,
                "block_size": cfg.data.block_size,
                "stride": cfg.data.stride,
            },
            "notes": settings.notes,
            "code": code_version(),
            "files": {name: {"sha256": digest_file(building / name),
                             "bytes": (building / name).stat().st_size} for name in FILES},
        }
        final = root / sha256[:16]
        if final.exists():
            existing = Snapshot(final, json.loads((final / MANIFEST).read_text(encoding="utf-8")))
            if existing.sha256 != sha256:
                raise SnapshotError(f"{final} holds snapshot {existing.sha256}, not {sha256}")
            shutil.rmtree(building, ignore_errors=True)
            return existing.verify()
        (building / MANIFEST).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
                                         encoding="utf-8")
        building.replace(final)
        return Snapshot(final, manifest)
    except BaseException:
        writer.close()
        shutil.rmtree(building, ignore_errors=True)
        raise


def find_local(snapshot_dir: str | Path, tag: str, ref: str) -> Optional[Snapshot]:
    root = Path(snapshot_dir) / safe_tag(tag)
    if not ref or not root.is_dir():
        return None
    for candidate in sorted(root.iterdir()):
        manifest_path = candidate / MANIFEST
        if candidate.name.startswith(".") or not manifest_path.is_file():
            continue
        if candidate.name.startswith(ref[:16]) or ref.startswith(candidate.name):
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if manifest.get("sha256", "").startswith(ref):
                return Snapshot(candidate, manifest)
    return None


def load_snapshot(cfg: Config, verify: bool = True) -> Snapshot:
    settings = cfg.data.supabase
    if not settings.snapshot:
        raise SnapshotError(
            "data.source is supabase but no snapshot is pinned (data.supabase.snapshot). "
            "scripts/train.py takes the snapshot before training; to reuse one, pass --snapshot HASH.")
    found = find_local(settings.snapshot_dir, settings.dataset_tag or ALL_TAGS, settings.snapshot)
    if found is None:
        raise SnapshotError(
            f"snapshot {settings.snapshot} of dataset {settings.dataset_tag!r} is not in "
            f"{Path(settings.snapshot_dir) / safe_tag(settings.dataset_tag or ALL_TAGS)}. "
            f"Download it with: python scripts/training_data.py pull --dataset-tag "
            f"{settings.dataset_tag} --snapshot {settings.snapshot}")
    return found.verify() if verify else found


def corpus_directory(cfg: Config) -> Path:
    if cfg.data.source == "supabase":
        return load_snapshot(cfg).directory
    return Path(cfg.data.corpus.dir)


def dataset_files_from_env() -> Any:
    from ored.learning.checkpoints import CheckpointStore

    url = os.environ.get("ORED_SB_URL", "")
    key = os.environ.get("ORED_SB_SERVICE_KEY", "")
    bucket = os.environ.get("ORED_SB_DATASET_BUCKET", DATASET_BUCKET)
    return CheckpointStore(url, key, bucket)


def storage_prefix(snapshot: Snapshot) -> str:
    return f"{safe_tag(snapshot.tag)}/{snapshot.sha256}"


def upload_snapshot(files: Any, snapshot: Snapshot, workdir: Optional[Path] = None) -> str:
    from ored.learning.checkpoints import upload_verified

    prefix = storage_prefix(snapshot)
    names = list(snapshot.manifest["files"]) + [MANIFEST]
    for name in names:
        path = snapshot.path(name)
        upload_verified(files, path, f"{prefix}/{name}", digest_file(path), rehash=True,
                        workdir=workdir or snapshot.directory.parent / ".upload")
    return prefix


def download_snapshot(files: Any, tag: str, sha256: str, snapshot_dir: str | Path) -> Snapshot:
    if len(sha256) != 64:
        raise SnapshotError("downloading a snapshot needs its full 64-character sha256")
    root = Path(snapshot_dir) / safe_tag(tag)
    final = root / sha256[:16]
    if (final / MANIFEST).is_file():
        return Snapshot(final, json.loads((final / MANIFEST).read_text(encoding="utf-8"))).verify()
    landing = root / f".download-{uuid.uuid4().hex[:12]}"
    prefix = f"{safe_tag(tag)}/{sha256}"
    try:
        files.download(f"{prefix}/{MANIFEST}", landing / MANIFEST)
        manifest = json.loads((landing / MANIFEST).read_text(encoding="utf-8"))
        if manifest.get("sha256") != sha256:
            raise SnapshotError(f"{prefix}/{MANIFEST} describes snapshot {manifest.get('sha256')}, not {sha256}")
        unexpected = sorted(set(manifest.get("files") or {}) - set(FILES))
        if unexpected or set(manifest.get("files") or {}) != set(FILES):
            raise SnapshotError(f"{prefix}/{MANIFEST} lists files {unexpected or sorted(manifest.get('files') or {})}; "
                                f"a snapshot holds exactly {', '.join(FILES)}")
        for name in manifest["files"]:
            files.download(f"{prefix}/{name}", landing / name)
        snapshot = Snapshot(landing, manifest).verify()
        landing.replace(final)
        return Snapshot(final, snapshot.manifest)
    except BaseException:
        shutil.rmtree(landing, ignore_errors=True)
        raise


def dataset_record(snapshot: Snapshot, storage_path: Optional[str] = None) -> Any:
    from ored.learning.records import Dataset

    m = snapshot.manifest
    return Dataset(
        name=snapshot.tag,
        kind="text",
        summary=(f"Snapshot of ored_training_data: {m['counts']['records']} records "
                 f"({m['selection']['rule']}), split train/val/test by group with seed "
                 f"{m['split']['seed']}, one example per block of text."),
        generator="scripts/training_data.py snapshot",
        spec={k: m[k] for k in ("format", "fingerprint_version", "text_format_version", "split",
                                 "counts", "text", "tokenizer", "intended", "notes", "code", "files",
                                 "on_invalid", "created_at")},
        samples=snapshot.samples(),
        source="supabase",
        sha256=snapshot.sha256,
        record_count=snapshot.record_count,
        selection=m["selection"],
        split_counts=snapshot.split_counts,
        storage_path=storage_path,
    )


@dataclass
class PreparedDataset:

    snapshot: Snapshot
    dataset: Any = None
    built: bool = False

    def link(self) -> Dict[str, Any]:
        info = self.snapshot.summary()
        if self.dataset is not None:
            info.update(dataset_id=self.dataset.id, dataset_name=self.dataset.name,
                        dataset_version=self.dataset.version, storage_path=self.dataset.storage_path)
        return info


def prepare_dataset(cfg: Config, store: Any = None, files: Any = None,
                    upload: bool = False) -> PreparedDataset:
    settings = cfg.data.supabase
    tag = settings.dataset_tag or ALL_TAGS
    built = False
    if settings.snapshot:
        snapshot = find_local(settings.snapshot_dir, tag, settings.snapshot)
        if snapshot is None:
            if files is None:
                raise SnapshotError(f"snapshot {settings.snapshot} is not on this machine and Supabase "
                                    f"is not configured to download it (set ORED_SB_URL / ORED_SB_SERVICE_KEY)")
            snapshot = download_snapshot(files, tag, settings.snapshot, settings.snapshot_dir)
            logger.info(f"downloaded snapshot {snapshot.sha256[:16]} of {tag}")
        snapshot.verify()
    else:
        if store is None:
            raise SnapshotError("taking a snapshot needs Supabase: set ORED_SB_URL and ORED_SB_SERVICE_KEY")
        snapshot = build_snapshot(store, cfg)
        built = True

    dataset = None
    if store is not None:
        dataset = store.register_dataset(dataset_record(snapshot))
        if upload and files is not None and not dataset.storage_path:
            dataset = store.set_dataset_storage(dataset.id, upload_snapshot(files, snapshot))
    settings.snapshot = snapshot.sha256
    return PreparedDataset(snapshot, dataset, built)


def describe_snapshot(prepared: PreparedDataset) -> List[str]:
    snapshot, m = prepared.snapshot, prepared.snapshot.manifest
    counts = m["counts"]
    lines = [
        f"dataset       : {snapshot.tag}"
        + (f" v{prepared.dataset.version} (ored_datasets {prepared.dataset.id})" if prepared.dataset else ""),
        f"snapshot      : {snapshot.sha256}",
        f"folder        : {snapshot.directory}"
        + (" (new)" if prepared.built else " (reused, files verified)"),
        f"selection     : {m['selection']['rule']}",
        f"records       : {counts['records']:,}  train {counts['train']:,} / val {counts['val']:,} / "
        f"test {counts['test']:,}  (seed {m['split']['seed']})",
        f"groups        : train {m['split']['groups']['train']:,} / val {m['split']['groups']['val']:,} / "
        f"test {m['split']['groups']['test']:,}  (a group never crosses splits)",
        f"types         : {', '.join(f'{k} {v}' for k, v in counts['by_type'].items())}",
        f"categories    : {', '.join(f'{k} {v}' for k, v in counts['by_category'].items())}",
        f"tokenizer     : {m['tokenizer']['name']}, {m['tokenizer']['vocab_size']} symbols "
        f"(sha256 {m['tokenizer']['sha256'][:16]})",
    ]
    if m["skipped"]:
        lines.append(f"SKIPPED       : {len(m['skipped'])} invalid record(s), listed in {MANIFEST}")
    if m["text"]["examples_longer_than_block"]:
        lines.append(f"note          : {m['text']['examples_longer_than_block']} example(s) are longer than "
                     f"block_size {m['text']['block_size']}; the model never sees them whole")
    if prepared.dataset is not None and prepared.dataset.storage_path:
        lines.append(f"stored at     : {DATASET_BUCKET}/{prepared.dataset.storage_path}")
    return lines


def iter_records(snapshot: Snapshot) -> Iterable[Dict[str, Any]]:
    with open(snapshot.path(RECORDS), encoding="utf-8") as handle:
        for line in handle:
            yield json.loads(line)


def split_overlap(snapshot: Snapshot) -> Dict[Tuple[str, str], int]:
    seen: Dict[str, Dict[str, set]] = {"group": {s: set() for s in SPLITS},
                                       "text": {s: set() for s in SPLITS}}
    for row in iter_records(snapshot):
        seen["group"][row["split"]].add(row["group"])
        seen["text"][row["split"]].add(row["text_sha256"])
    overlap = {}
    for kind in ("group", "text"):
        for a, b in (("train", "val"), ("train", "test"), ("val", "test")):
            overlap[(kind, f"{a}/{b}")] = len(seen[kind][a] & seen[kind][b])
    return overlap
