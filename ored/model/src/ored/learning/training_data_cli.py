from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

from ored.config import load_config
from ored.data.snapshot import (
    SnapshotError,
    dataset_files_from_env,
    describe_snapshot,
    download_snapshot,
    prepare_dataset,
    split_overlap,
)
from ored.data.training_data import (
    ALL_TAGS,
    CATEGORIES,
    DIFFICULTIES,
    TYPES,
    Selection,
    check_record,
    format_record,
    normalise_fields,
    taxonomy_lines,
)
from ored.learning.records import TrainingData
from ored.learning.store import DuplicateTrainingDataError, StoreError
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

EPILOG = """\
Reads ORED_SB_URL and ORED_SB_SERVICE_KEY from the environment. They are
server-side secrets: never put them in a browser, a public asset or Git.

  stats                        how many rows, by tag / category / subject / type
  validate                     check every row (or a selection) and list problems
  add --type qna ...           add one row (unverified unless --verified)
  import rows.jsonl            add many rows; refuses exact duplicates
  import-facts                 add every question in configs/facts.yaml (tag "facts")
  export --dataset-tag T       write the selected rows to a .jsonl file
  snapshot --dataset-tag T     take (or reuse) the immutable training snapshot
  pull --dataset-tag T --snapshot HASH   download a snapshot taken elsewhere
  lineage CHECKPOINT           which training data produced a checkpoint
  taxonomy                     the valid types and categories

Training:  python scripts/train.py --config configs/char_transformer.yaml --supabase-dataset T --upload
"""


def _connect() -> Any:
    from ored.learning.supabase_store import SupabaseStore
    return SupabaseStore.from_env()


def _selection(args: argparse.Namespace, default_mode: str = "verified") -> Selection:
    mode = default_mode
    if getattr(args, "include_unverified", False):
        mode = "unverified_too"
    if getattr(args, "all_rows", False):
        mode = "everything"
    return Selection(
        dataset_tag=args.dataset_tag or ALL_TAGS,
        types=list(args.types),
        categories=list(args.categories),
        subjects=list(args.subjects),
        languages=list(args.languages),
        mode=mode,
    ).validate()


def cmd_stats(args: argparse.Namespace, store: Any) -> int:
    rows = store.training_data_summary()
    logger.info(section("ORED TRAINING DATA"))
    if not rows:
        logger.info("ored_training_data is empty. Add rows in Supabase or with: training_data.py add")
        return 0
    totals: Counter = Counter()
    by_tag: Dict[str, Counter] = {}
    logger.info(f"{'tag':<16}{'category':<22}{'subject':<24}{'type':<14}{'rows':>7}{'train':>7}"
                f"{'review':>8}{'off':>6}")
    for row in rows:
        logger.info(f"{row['dataset_tag'] or '-':<16}{row['category']:<22}{row['subject'] or '-':<24}"
                    f"{row['type']:<14}{row['records']:>7}{row['trainable']:>7}"
                    f"{row['awaiting_review']:>8}{row['disabled']:>6}")
        for key in ("records", "trainable", "awaiting_review", "disabled"):
            totals[key] += int(row[key])
            by_tag.setdefault(row["dataset_tag"] or "-", Counter())[key] += int(row[key])
    logger.info("")
    for tag, counts in sorted(by_tag.items()):
        logger.info(f"tag {tag:<14}: {counts['records']} rows, {counts['trainable']} trainable "
                    f"(enabled and verified), {counts['awaiting_review']} awaiting review, "
                    f"{counts['disabled']} disabled")
    logger.info(f"total             : {totals['records']} rows, {totals['trainable']} trainable, "
                f"{totals['awaiting_review']} awaiting review, {totals['disabled']} disabled")
    return 0


def cmd_validate(args: argparse.Namespace, store: Any) -> int:
    selection = _selection(args, default_mode="everything")
    checked = errors = warned = 0
    inputs: Dict[str, List[str]] = {}
    for record in store.iter_training_data(selection):
        checked += 1
        check = check_record(record)
        if check.errors:
            errors += 1
        if check.warnings:
            warned += 1
        if check.errors or (check.warnings and args.warnings):
            logger.info(check.describe())
        if not check.errors:
            key = f"{record.type}|{record.language}|{' '.join(record.input.split()).casefold()}"
            inputs.setdefault(key, []).append(record.id)
    repeated = {k: v for k, v in inputs.items() if len(v) > 1}
    logger.info(section("VALIDATION"))
    logger.info(f"selection : {selection.describe()}")
    logger.info(f"checked   : {checked} rows")
    logger.info(f"invalid   : {errors}")
    logger.info(f"warnings  : {warned}" + ("" if args.warnings else " (show them with --warnings)"))
    logger.info(f"same input, several outputs: {len(repeated)} "
                f"(allowed; they always share a split)")
    for key, ids in list(repeated.items())[:10]:
        logger.info(f"  {key.split('|', 2)[2][:60]!r}: {', '.join(ids)}")
    return 1 if errors else 0


def _record_from(values: Dict[str, Any]) -> TrainingData:
    known = set(TrainingData.__dataclass_fields__) - {"id", "fingerprint", "created_at", "updated_at"}
    unknown = sorted(set(values) - known)
    if unknown:
        raise StoreError(f"unknown field(s) {unknown}; a row has {sorted(known)}")
    return normalise_fields(TrainingData(**values))


def _insert(store: Any, records: List[TrainingData], skip_duplicates: bool) -> int:
    bad = [c for c in (check_record(r) for r in records) if not c.ok]
    if bad:
        for check in bad[:20]:
            logger.error(check.describe())
        logger.error(f"{len(bad)} row(s) are invalid; nothing was inserted")
        return 1
    try:
        stored = store.add_training_data(records)
    except DuplicateTrainingDataError as exc:
        if not skip_duplicates:
            logger.error(f"DUPLICATE: {exc}")
            return 2
        taken = set(exc.fingerprints)
        fresh = [r for r in records if r.fingerprint not in taken]
        logger.info(f"skipping {len(records) - len(fresh)} row(s) that already exist: "
                    + ", ".join(sorted(f[:12] for f in taken))[:400])
        stored = store.add_training_data(fresh) if fresh else []
    for record in stored[:20]:
        logger.info(f"added {record.id}  {record.type}/{record.category}  "
                    f"verified={str(record.verified).lower()}  fingerprint {record.fingerprint[:16]}")
    logger.info(f"{len(stored)} row(s) added"
                + ("" if all(r.verified for r in stored) else
                   "; unverified rows are not trained on until verified = true"))
    return 0


def cmd_add(args: argparse.Namespace, store: Any) -> int:
    record = _record_from({
        "type": args.type, "category": args.category, "subject": args.subject, "topic": args.topic,
        "input": args.input, "output": args.output, "difficulty": args.difficulty,
        "language": args.language, "source": args.source, "dataset_tag": args.tag,
        "enabled": not args.disabled, "verified": args.verified,
        "metadata": json.loads(args.metadata) if args.metadata else {},
    })
    if check_record(record).ok:
        logger.info("text form:\n" + format_record(record))
    return _insert(store, [record], skip_duplicates=False)


def cmd_import(args: argparse.Namespace, store: Any) -> int:
    records = []
    with open(args.file, encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                values = json.loads(line)
                if args.tag and not values.get("dataset_tag"):
                    values["dataset_tag"] = args.tag
                records.append(_record_from(values))
            except (ValueError, TypeError, StoreError) as exc:
                logger.error(f"{args.file}:{number}: {exc}")
                return 1
    logger.info(f"read {len(records)} row(s) from {args.file}")
    return _insert(store, records, args.skip_duplicates)


def cmd_import_facts(args: argparse.Namespace, store: Any) -> int:
    from collections import Counter

    from ored.data.facts_import import facts_to_rows

    rows = facts_to_rows(args.file, args.tag, verified=not args.unverified)
    logger.info(f"read {len(rows)} question(s) from {args.file} -> dataset_tag {args.tag!r}, "
                f"verified={str(not args.unverified).lower()}")
    for (category, subject), count in sorted(Counter((r.category, r.subject) for r in rows).items()):
        logger.info(f"  {category:<20}{subject:<24}{count:>5}")
    if args.dry_run:
        bad = [c for c in (check_record(r) for r in rows) if not c.ok]
        logger.info(f"dry run: {len(rows) - len(bad)} valid, {len(bad)} invalid, nothing written")
        return 1 if bad else 0
    return _insert(store, rows, args.skip_duplicates)


def cmd_export(args: argparse.Namespace, store: Any) -> int:
    selection = _selection(args)
    out = Path(args.out or f"data/processed/training_data/{selection.dataset_tag}.jsonl")
    out.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with open(out, "w", encoding="utf-8") as handle:
        for record in store.iter_training_data(selection):
            row = {k: getattr(record, k) for k in record.__dataclass_fields__}
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True, default=str) + "\n")
            count += 1
    logger.info(f"selection : {selection.describe()}")
    logger.info(f"wrote {count} row(s) to {out} (a plain export; train from a snapshot, not from this file)")
    return 0


def _snapshot_config(args: argparse.Namespace) -> Any:
    cfg = load_config(args.config, args.overrides)
    settings = cfg.data.supabase
    cfg.data.source = "supabase"
    settings.dataset_tag = args.dataset_tag or ALL_TAGS
    for name in ("types", "categories", "subjects", "languages"):
        if getattr(args, name):
            setattr(settings, name, list(getattr(args, name)))
    settings.include_unverified = bool(getattr(args, "include_unverified", False))
    if getattr(args, "skip_invalid", False):
        settings.on_invalid = "skip"
    if getattr(args, "split_seed", None) is not None:
        settings.split_seed = args.split_seed
    if getattr(args, "notes", None) is not None:
        settings.notes = args.notes
    if getattr(args, "snapshot", None):
        settings.snapshot = args.snapshot.strip().lower()
    return cfg.validate()


def cmd_snapshot(args: argparse.Namespace, store: Any) -> int:
    cfg = _snapshot_config(args)
    files = dataset_files_from_env() if args.upload else None
    prepared = prepare_dataset(cfg, store, files, upload=args.upload)
    logger.info(section("TRAINING DATA SNAPSHOT"))
    for line in describe_snapshot(prepared):
        logger.info(line)
    overlap = split_overlap(prepared.snapshot)
    leaks = {k: v for k, v in overlap.items() if v}
    logger.info(f"leakage       : {'none -- no group and no example text is in two splits' if not leaks else leaks}")
    logger.info("")
    logger.info("Train on exactly this snapshot:")
    logger.info(f"  python scripts/train.py --config {args.config} --supabase-dataset "
                f"{prepared.snapshot.tag} --snapshot {prepared.snapshot.sha256} --upload")
    return 1 if leaks else 0


def cmd_pull(args: argparse.Namespace, store: Any) -> int:
    cfg = _snapshot_config(args)
    snapshot = download_snapshot(dataset_files_from_env(), cfg.data.supabase.dataset_tag,
                                 cfg.data.supabase.snapshot, cfg.data.supabase.snapshot_dir)
    logger.info(f"snapshot {snapshot.sha256} of {snapshot.tag}: {snapshot.record_count} records "
                f"in {snapshot.directory} (sha256 of every file checked)")
    return 0


def _lineage_payload(ref: str, store: Any) -> Dict[str, Any]:
    from ored.utils.checkpoint import load_checkpoint

    path = Path(ref)
    if path.is_file():
        return {"file": str(path), "payload": load_checkpoint(path)}
    record = store.checkpoint(ref) if store is not None else None
    if record is None:
        raise StoreError(f"{ref} is neither a checkpoint file nor an ored_checkpoints id")
    session = store.session(record.session_id) if record.session_id else None
    if session is None:
        return {"record": record}
    config = dict(session.config or {})
    return {"record": record, "payload": {"config": config, "extra": {"dataset": config.get("dataset")}}}


def cmd_lineage(args: argparse.Namespace, store: Any) -> int:
    from ored.training.dataset_run import lineage_of_payload

    info = _lineage_payload(args.checkpoint, store)
    logger.info(section("WHICH DATA PRODUCED THIS CHECKPOINT"))
    record = info.get("record")
    payload = info.get("payload") or {}
    if record is not None:
        logger.info(f"checkpoint    : {record.id} ({record.kind.value} of {record.run_name}, epoch "
                    f"{record.epoch}, step {record.global_step})")
    else:
        logger.info(f"checkpoint    : {info['file']} ({payload.get('checkpoint_kind')} of "
                    f"{payload.get('run_name')}, epoch {payload.get('epoch')})")
    dataset = lineage_of_payload(payload) if payload else {}
    session_id = (record.session_id if record is not None else None) or dataset.get("session_id")
    session = store.session(session_id) if session_id and store is not None else None
    row = None
    dataset_id = (session.dataset_id if session is not None else None) or dataset.get("dataset_id")
    if dataset_id and store is not None:
        row = store.dataset(dataset_id)
    if not dataset and row is None:
        logger.info("dataset       : not recorded (this checkpoint predates dataset tracking)")
        return 0
    if dataset.get("source") == "generated":
        logger.info(f"dataset       : the generated corpus in {dataset.get('corpus_dir')} (not Supabase data)")
        return 0
    logger.info(f"dataset       : {dataset.get('dataset_tag') or (row.name if row else '?')}"
                + (f" v{row.version} (ored_datasets {row.id})" if row else ""))
    logger.info(f"snapshot      : {dataset.get('snapshot_sha256') or (row.sha256 if row else '?')}")
    if row is not None and dataset.get("snapshot_sha256") and row.sha256 != dataset["snapshot_sha256"]:
        logger.info("WARNING       : the checkpoint and its session disagree about the snapshot")
    selection = dataset.get("selection") or (row.selection if row else {})
    logger.info(f"selection     : {selection.get('rule', selection)}")
    counts = dataset.get("split_counts") or (row.split_counts if row else {})
    logger.info(f"records       : {dataset.get('records') or (row.record_count if row else '?')} "
                f"(train {counts.get('train')} / val {counts.get('val')} / test {counts.get('test')})")
    tokenizer = dataset.get("tokenizer") or {}
    config = payload.get("config") or {}
    logger.info(f"tokenizer     : {tokenizer.get('name')} ({tokenizer.get('vocab_size')} symbols, "
                f"sha256 {str(tokenizer.get('sha256'))[:16]}), block_size "
                f"{(config.get('data') or {}).get('block_size')}")
    logger.info(f"split seed    : {dataset.get('split_seed')}")
    logger.info(f"git commit    : {dataset.get('git_commit')}"
                + (" (with uncommitted changes)" if dataset.get("git_dirty") else ""))
    if session is not None:
        logger.info(f"session       : {session.id} ({session.status.value if hasattr(session.status, 'value') else session.status}, "
                    f"run {session.run_name})")
    if row is not None and row.storage_path:
        logger.info(f"files         : ored-datasets/{row.storage_path}")
    return 0


def cmd_taxonomy(args: argparse.Namespace, store: Any) -> int:
    logger.info("types: " + ", ".join(f"{t} ({a} / {b})" for t, (a, b) in TYPES.items()))
    logger.info("difficulty: " + ", ".join(DIFFICULTIES))
    logger.info("categories and their usual subjects (subject/topic are free, lowercase_with_underscores):")
    for line in taxonomy_lines(CATEGORIES):
        logger.info("  " + line)
    return 0


def _filters(p: argparse.ArgumentParser, tag_required: bool = False) -> None:
    p.add_argument("--dataset-tag", required=tag_required, help="a dataset_tag, or 'all' for every row")
    p.add_argument("--type", dest="types", action="append", default=[])
    p.add_argument("--category", dest="categories", action="append", default=[])
    p.add_argument("--subject", dest="subjects", action="append", default=[])
    p.add_argument("--language", dest="languages", action="append", default=[])


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage Ored's manual training data (ored_training_data).",
        epilog=EPILOG, formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("stats")

    p = sub.add_parser("validate")
    _filters(p)
    p.add_argument("--warnings", action="store_true", help="also list warnings")

    p = sub.add_parser("add")
    p.add_argument("--type", required=True, choices=list(TYPES))
    p.add_argument("--category", required=True)
    p.add_argument("--subject")
    p.add_argument("--topic")
    p.add_argument("--input", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--difficulty")
    p.add_argument("--language", default="en")
    p.add_argument("--source", default="manual")
    p.add_argument("--tag", help="dataset_tag")
    p.add_argument("--metadata", help="a JSON object")
    p.add_argument("--verified", action="store_true", help="mark it verified now")
    p.add_argument("--disabled", action="store_true")

    p = sub.add_parser("import")
    p.add_argument("file", help="one JSON object per line, with the ored_training_data columns")
    p.add_argument("--tag", help="dataset_tag for rows that do not give one")
    p.add_argument("--skip-duplicates", action="store_true",
                   help="insert the new rows and list the ones that already exist")

    p = sub.add_parser("import-facts", help="add every question in configs/facts.yaml")
    p.add_argument("file", nargs="?", default="configs/facts.yaml")
    p.add_argument("--tag", default="facts", help="dataset_tag for the rows (default facts)")
    p.add_argument("--unverified", action="store_true", help="import them with verified = false")
    p.add_argument("--skip-duplicates", action="store_true",
                   help="insert the new questions and list the ones already in Supabase")
    p.add_argument("--dry-run", action="store_true", help="validate and show the mapping, write nothing")

    p = sub.add_parser("export")
    _filters(p, tag_required=True)
    p.add_argument("--include-unverified", action="store_true")
    p.add_argument("--all-rows", action="store_true", help="also disabled rows")
    p.add_argument("--out")

    for name in ("snapshot", "pull"):
        p = sub.add_parser(name)
        _filters(p, tag_required=True)
        p.add_argument("--config", default="configs/char_transformer.yaml")
        p.add_argument("--set", dest="overrides", action="append", default=[], metavar="KEY=VALUE")
        p.add_argument("--snapshot", required=name == "pull", metavar="HASH")
        if name == "snapshot":
            p.add_argument("--include-unverified", action="store_true")
            p.add_argument("--skip-invalid", action="store_true")
            p.add_argument("--split-seed", type=int)
            p.add_argument("--notes")
            p.add_argument("--upload", action="store_true",
                           help="also store the snapshot files in the private ored-datasets bucket")

    p = sub.add_parser("lineage")
    p.add_argument("checkpoint", help="a local .pt file or an ored_checkpoints id")

    sub.add_parser("taxonomy")
    return parser


COMMANDS = {
    "stats": cmd_stats, "validate": cmd_validate, "add": cmd_add, "import": cmd_import,
    "import-facts": cmd_import_facts,
    "export": cmd_export, "snapshot": cmd_snapshot, "pull": cmd_pull, "lineage": cmd_lineage,
    "taxonomy": cmd_taxonomy,
}
OFFLINE = ("taxonomy", "pull", "lineage")


def _offline(args: argparse.Namespace) -> bool:
    return args.command in OFFLINE or (args.command == "import-facts" and args.dry_run)


def main(argv: Optional[List[str]] = None, store: Any = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if store is None and not _offline(args):
            store = _connect()
        if args.command == "lineage" and store is None:
            try:
                store = _connect()
            except StoreError:
                if not Path(args.checkpoint).is_file():
                    raise
        return COMMANDS[args.command](args, store)
    except (StoreError, SnapshotError, ValueError, OSError) as exc:
        logger.error(str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
