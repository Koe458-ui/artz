from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, List, Optional

from ored.learning.checkpoints import (
    CheckpointStore,
    delete_checkpoint,
    digest,
    export_checkpoint,
    fetch,
    find,
    find_duplicates,
    orphans,
    promote_best,
    promote_existing_best,
    prune_history,
    publish,
    remove_duplicates,
    verify_checkpoint,
)
from ored.learning.records import Checkpoint, CheckpointKind, CheckpointPart
from ored.learning.store import StoreError
from ored.learning.supabase_store import SupabaseStore
from ored.utils.checkpoint import CheckpointError, PromotionRule, as_kind, load_checkpoint, write_payload
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

KINDS = [k.value for k in CheckpointKind]

EPILOG = """\
Reads ORED_SB_URL and ORED_SB_SERVICE_KEY from the environment (server side
only: the service key must never reach a browser or phone app).

  list                         every checkpoint, newest last
  show-live  --run ored_v2     the current live (resumable) checkpoint
  show-best  --run ored_v2     the current best checkpoint
  show <id>                    any checkpoint
  history    --run ored_v2     the append-only snapshots of a run
  verify <id|path|live|best>   download, re-hash and load it
  promote-best <id|path>       make it best if it beats the current best
  resume-live --config ...     continue training from live
  save FILE --as live|best|history --config ...
                               put a file into this run's role (best only if better)
  merge-live --config ...      online session's live.pt -> best.pt, if it validates better
  export     --run ored_v2     inference-only copy of the current best
  duplicates [--apply]         byte-identical rows (report; --apply removes extras)
  cleanup-history --run R --keep N [--apply]
  delete <id> --yes            remove one row and its object
  orphans                      objects in the bucket that no row records
  push / pull                  upload a file / download a role
"""


def _metric(record_metrics: dict, name: str) -> Optional[float]:
    return PromotionRule(metric=name).value(record_metrics)


def _num(value: Optional[float], digits: int = 5) -> str:
    return "-" if value is None else f"{value:.{digits}f}"


def _mb(size: int) -> str:
    return f"{size / 1_000_000:.2f} MB"


def _verified(record: Checkpoint, report: Any = None) -> str:
    if report is not None:
        return "YES (just now)" if report.ok else "NO: " + "; ".join(report.problems)
    if record.verified_at:
        return f"YES ({record.verified_at})"
    return "not yet (run: verify " + record.id + ")"


def card(record: Checkpoint, report: Any = None) -> str:
    m = record.metrics or {}
    role = record.kind.value.upper() + (" (current)" if record.is_current else "")
    lines = [
        "Ored Checkpoint",
        "",
        f"Role:            {role}",
        f"Model:           {record.run_name}",
        f"Run:             {record.run_name}",
        f"Session:         {record.session_id or '-'}",
        f"Model version:   {record.version_id or '-'}",
        f"Epoch:           {record.epoch}",
        f"Global step:     {record.global_step:,}",
        "",
        f"Validation loss: {_num(_metric(m, 'val_loss'))}",
        f"BPC:             {_num(_metric(m, 'val_bpc'))}",
        f"PPL:             {_num(_metric(m, 'val_ppl'))}",
        f"Train loss:      {_num(_metric(m, 'train_loss'))}",
    ]
    if record.promotion_metric:
        rule = PromotionRule(record.promotion_metric, record.promotion_mode or "min")
        lines.append(f"Promoted by:     {rule.describe()}")
    lines += [
        "",
        f"Size:            {_mb(record.size_bytes)} ({record.size_bytes:,} bytes)",
        f"SHA-256:         {record.sha256}",
        f"Format:          {record.format_version}",
        f"PyTorch:         {record.torch_version or '-'}",
        f"Storage path:    {record.bucket_id}/{record.object_path}",
        f"Derived from:    {record.parent_checkpoint_id or '-'}",
        *([f"Distributed:     {record.world_size} workers, group {record.checkpoint_group_id} "
           f"({'complete' if record.is_complete else 'INCOMPLETE'})"] if record.part is not CheckpointPart.FILE else []),
        f"Created:         {record.created_at}",
        f"Uploaded by:     {record.uploaded_by or '-'}",
        f"Verified:        {_verified(record, report)}",
        f"Id:              {record.id}",
    ]
    return "\n".join(lines)


def table(records: List[Checkpoint]) -> str:
    header = f"{'role':<8} {'cur':<3} {'run':<22} {'epoch':>5} {'step':>10} {'val_loss':>9} {'size':>9}  {'created':<25} id"
    rows = [header, "-" * len(header)]
    for r in records:
        rows.append(
            f"{r.kind.value:<8} {'*' if r.is_current else '':<3} {r.run_name[:22]:<22} "
            f"{r.epoch:>5} {r.global_step:>10,} {_num(_metric(r.metrics, 'val_loss')):>9} "
            f"{_mb(r.size_bytes):>9}  {str(r.created_at)[:25]:<25} {r.id}"
        )
    return "\n".join(rows)


def local_card(path: Path) -> str:
    payload = load_checkpoint(path)
    m = payload.get("metrics") or {}
    promotion = payload.get("promotion") or {}
    resumable = bool(payload.get("optimizer_state_dict") and payload.get("trainer_state"))
    return "\n".join([
        "Ored Checkpoint (local file)",
        "",
        f"Role:            {(payload.get('checkpoint_kind') or 'unknown (format 1)').upper()}",
        f"Run:             {payload.get('run_name') or '-'}",
        f"Task:            {payload.get('task') or '-'}",
        f"Architecture:    {payload.get('architecture') or '-'}",
        f"Epoch:           {payload.get('epoch')}",
        f"Global step:     {int(payload.get('global_step') or 0):,}",
        "",
        f"Validation loss: {_num(_metric(m, 'val_loss'))}",
        f"BPC:             {_num(_metric(m, 'val_bpc'))}",
        f"PPL:             {_num(_metric(m, 'val_ppl'))}",
        f"Train loss:      {_num(_metric(m, 'train_loss'))}",
        f"Best so far:     {promotion.get('metric', '-')} {_num(promotion.get('value'))} "
        f"(epoch {promotion.get('epoch', '-')})",
        f"Resumable:       {'YES' if resumable else 'NO'}",
        "",
        f"Size:            {_mb(path.stat().st_size)}",
        f"SHA-256:         {digest(path)}",
        f"Format:          {payload.get('format_version')}",
        f"PyTorch:         {payload.get('torch_version') or '-'}",
        f"Created:         {payload.get('created_at') or '-'}",
        f"Path:            {path}",
        "Loads:           YES",
    ])


def _connect():
    return SupabaseStore.from_env(), CheckpointStore.from_env()


def _rule(args: argparse.Namespace) -> PromotionRule:
    return PromotionRule(metric=args.metric, mode=args.mode)


def _resolve(store: Any, ref: str, run: str) -> Checkpoint:
    if ref in KINDS:
        record = find(store, CheckpointKind(ref), run)
        if record is None:
            raise StoreError(f"no {ref} checkpoint{' for run ' + run if run else ''} is stored")
        return record
    record = store.checkpoint(ref)
    if record is None:
        raise StoreError(f"no checkpoint with id {ref}")
    return record


def _show_role(store: Any, kind: CheckpointKind, run: str) -> int:
    runs = [run] if run else sorted({r.run_name for r in store.checkpoints(kind, logical=True)})
    shown = 0
    for name in runs:
        record = find(store, kind, name)
        if record is None:
            continue
        if shown:
            print()
        print(card(record))
        shown += 1
    if not shown:
        print(f"No {kind.value} checkpoint{' for run ' + run if run else ''} is stored.")
        if kind is CheckpointKind.LIVE:
            print("There is nothing to resume from: start a fresh run.")
        return 1
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    store, _ = _connect()
    records = store.checkpoints(
        CheckpointKind(args.kind) if args.kind else None,
        run_name=args.run or None,
        current=True if args.current else None,
        logical=True,
    )
    if not records:
        print("Nothing stored yet.")
        return 0
    print(table(records))
    print("\n* = current live / best / base / export of its run")
    return 0


def cmd_show(args: argparse.Namespace) -> int:
    path = Path(args.checkpoint)
    if path.suffix == ".pt" and path.exists():
        print(local_card(path))
        return 0
    store, files = _connect()
    record = _resolve(store, args.checkpoint, args.run)
    report = verify_checkpoint(store, files, record) if args.verify else None
    print(card(record, report))
    return 0 if report is None or report.ok else 1


def cmd_history(args: argparse.Namespace) -> int:
    store, _ = _connect()
    records = sorted(
        store.checkpoints(CheckpointKind.HISTORY, run_name=args.run, logical=True),
        key=lambda r: (r.global_step, r.epoch),
    )
    if not records:
        print(f"Run {args.run} has no history snapshots. Turn on checkpoint.keep_history to keep them.")
        return 0
    print(f"History of {args.run}: {len(records)} snapshots\n")
    print(table(records))
    return 0


def _verify_group(args: argparse.Namespace, store: Any = None, files: Any = None) -> int:
    from ored.config import load_config
    from ored.distributed.checkpoint import verify_group_dir, verify_group_remote
    from ored.distributed.cli import report

    cfg = load_config(args.config) if getattr(args, "config", "") else None
    if Path(args.checkpoint).is_dir():
        manifest, problems = verify_group_dir(args.checkpoint, cfg)
    else:
        manifest, problems = verify_group_remote(store, files, args.checkpoint, cfg)
    print(report(manifest, problems, args.checkpoint, model_checked=cfg is not None))
    return 0 if not problems else 1


def cmd_verify(args: argparse.Namespace) -> int:
    path = Path(args.checkpoint)
    if path.is_dir():
        return _verify_group(args)
    if path.exists():
        print(local_card(path))
        return 0
    store, files = _connect()
    record = store.checkpoint(args.checkpoint) if args.checkpoint not in KINDS else None
    if record is None and args.checkpoint not in KINDS and store.group(args.checkpoint):
        return _verify_group(args, store, files)
    if record is None or record.part is not CheckpointPart.FILE:
        record = record or _resolve(store, args.checkpoint, args.run)
    if record.part is not CheckpointPart.FILE:
        args.checkpoint = record.checkpoint_group_id
        return _verify_group(args, store, files)
    report = verify_checkpoint(store, files, record)
    print(card(record, report))
    return 0 if report.ok else 1


def cmd_promote_best(args: argparse.Namespace) -> int:
    store, files = _connect()
    path = Path(args.checkpoint)
    if path.exists():
        record, message = promote_best(store, files, path, args.run, _rule(args), force=args.force)
    else:
        record, message = promote_existing_best(
            store, files, _resolve(store, args.checkpoint, args.run).id, _rule(args), force=args.force
        )
    print(message)
    if record is not None:
        print()
        print(card(record))
    return 0 if record is not None else 1


def cmd_resume_live(args: argparse.Namespace) -> int:
    from ored.config import load_config
    from ored.training.trainer import train

    cfg = load_config(args.config, list(args.overrides) + ["training.resume=live"])
    train(cfg, ensure_dataset=False)
    return 0


def _place(args: argparse.Namespace, source: str, kind: str) -> int:
    from ored.config import load_config
    from ored.training.checkpoints import CheckpointManager, place_checkpoint

    overrides = list(args.overrides) + (["checkpoint.upload=true"] if args.upload else [])
    cfg = load_config(args.config, overrides)
    path, message = place_checkpoint(
        cfg, source, kind, force=getattr(args, "force", False), device=args.device,
        manager=CheckpointManager.for_training(cfg),
    )
    print(message)
    if path is not None:
        print()
        print(local_card(path))
    return 0 if path is not None else 1


def cmd_save(args: argparse.Namespace) -> int:
    return _place(args, args.path, args.role)


def cmd_merge_live(args: argparse.Namespace) -> int:
    return _place(args, args.live, "best")


def cmd_export(args: argparse.Namespace) -> int:
    if args.path:
        source = Path(args.path)
        out = Path(args.out) if args.out else source.with_name("export.pt")
        write_payload(out, as_kind(load_checkpoint(source), "export"))
        print(local_card(out))
        return 0
    if not args.run:
        raise StoreError("export needs --run (Supabase) or --path (a local checkpoint)")
    store, files = _connect()
    record = export_checkpoint(store, files, args.run, CheckpointKind(args.source), local_copy=args.out)
    print(card(record))
    return 0


def cmd_duplicates(args: argparse.Namespace) -> int:
    store, files = _connect()
    groups = find_duplicates(store)
    if not groups:
        print("No duplicate checkpoints.")
        return 0
    for group in groups:
        c = group.canonical
        print(f"sha256 {group.sha256}")
        print(f"  keep   {c.id}  {c.kind.value:<7} {c.run_name:<20} {c.object_path}"
              f"{'  (current)' if c.is_current else ''}")
        for extra in group.extras:
            note = "  (current: kept)" if extra.is_current else ""
            print(f"  extra  {extra.id}  {extra.kind.value:<7} {extra.run_name:<20} {extra.object_path}{note}")
        print(f"  reclaimable: {_mb(group.reclaimable_bytes)}")
    doomed = remove_duplicates(store, files, apply=args.apply)
    print()
    if args.apply:
        print(f"Removed {len(doomed)} duplicate rows and their objects.")
    else:
        print(f"{len(doomed)} rows would be removed. Nothing was changed: re-run with --apply.")
    return 0


def cmd_cleanup_history(args: argparse.Namespace) -> int:
    store, files = _connect()
    doomed = prune_history(store, files, args.run, args.keep, apply=args.apply)
    for record in doomed:
        print(f"  {'removed' if args.apply else 'would remove'} {record.object_path}")
    if not doomed:
        print("Nothing to remove.")
    elif not args.apply:
        print("Nothing was changed: re-run with --apply.")
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    store, files = _connect()
    record = _resolve(store, args.checkpoint, args.run)
    print(card(record))
    if not args.yes:
        print("\nNothing was changed: re-run with --yes to delete this checkpoint.")
        return 1
    delete_checkpoint(store, files, record.id, allow_current=args.allow_current)
    print(f"\nDeleted {record.object_path}.")
    return 0


def cmd_orphans(args: argparse.Namespace) -> int:
    store, files = _connect()
    found = orphans(store, files, args.prefix)
    if not found:
        print("Every object in the bucket is recorded.")
        return 0
    print("Objects no row records (safe to inspect; nothing is removed automatically):")
    for path, size in sorted(found.items()):
        print(f"  {files.bucket}/{path}  {_mb(size)}")
    return 0


def cmd_push(args: argparse.Namespace) -> int:
    store, files = _connect()
    record = publish(
        store=store,
        files=files,
        path=args.path,
        kind=CheckpointKind(args.kind),
        run_name=args.run_name,
        version_id=args.version_id,
        session_id=args.session_id,
        rule=_rule(args),
        force=args.force,
    )
    print(card(record))
    return 0


def cmd_pull(args: argparse.Namespace) -> int:
    store, files = _connect()
    record = fetch(store, files, args.path, kind=CheckpointKind(args.kind), run_name=args.run_name)
    if record is None:
        logger.error(f"no {args.kind} checkpoint is stored")
        return 1
    print(f"pulled {record.bucket_id}/{record.object_path} -> {args.path} (sha256 verified)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="checkpoints",
        description="Inspect, verify, promote and clean up Ored checkpoints.",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def with_rule(p: argparse.ArgumentParser) -> None:
        p.add_argument("--metric", default="val_loss", help="promotion metric (default val_loss)")
        p.add_argument("--mode", default="min", choices=["min", "max"],
                       help="min = lower is better (default)")
        p.add_argument("--force", action="store_true", help="promote even if not better")

    p = sub.add_parser("list")
    p.add_argument("--run", default="")
    p.add_argument("--kind", default="", choices=[""] + KINDS)
    p.add_argument("--current", action="store_true", help="only the current rows")
    p.set_defaults(func=cmd_list)

    for name, kind in (("show-live", CheckpointKind.LIVE), ("show-best", CheckpointKind.BEST)):
        p = sub.add_parser(name)
        p.add_argument("--run", default="")
        p.set_defaults(func=lambda a, k=kind: _show_role(_connect()[0], k, a.run))

    p = sub.add_parser("show")
    p.add_argument("checkpoint", help="id, role (live/best/...) or local .pt path")
    p.add_argument("--run", default="")
    p.add_argument("--verify", action="store_true", help="also download and re-hash it")
    p.set_defaults(func=cmd_show)

    p = sub.add_parser("history")
    p.add_argument("--run", required=True)
    p.set_defaults(func=cmd_history)

    p = sub.add_parser("verify")
    p.add_argument("checkpoint", help="id, checkpoint_group_id, role (live/best/...), .pt file or checkpoint folder")
    p.add_argument("--run", default="")
    p.add_argument("--config", default="", help="also check the model config is compatible")
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("promote-best")
    p.add_argument("checkpoint", help="id, role or local .pt path")
    p.add_argument("--run", default="")
    with_rule(p)
    p.set_defaults(func=cmd_promote_best)

    p = sub.add_parser("resume-live")
    p.add_argument("--config", required=True)
    p.add_argument("--set", dest="overrides", action="append", default=[], metavar="KEY=VALUE")
    p.set_defaults(func=cmd_resume_live)

    def with_run_config(p: argparse.ArgumentParser) -> None:
        p.add_argument("--config", required=True, help="the run's config; its run_name picks checkpoints/<run_name>/")
        p.add_argument("--set", dest="overrides", action="append", default=[], metavar="KEY=VALUE")
        p.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
        p.add_argument("--upload", action="store_true", help="also publish to Supabase")

    p = sub.add_parser("save", help="put a checkpoint file into this run's live, best or history")
    p.add_argument("path")
    p.add_argument("--as", dest="role", required=True, choices=["live", "best", "history"])
    p.add_argument("--force", action="store_true", help="for best: replace even if not better")
    with_run_config(p)
    p.set_defaults(func=cmd_save)

    p = sub.add_parser("merge-live", help="make the online session's live.pt the best if it validates better")
    p.add_argument("--live", default="checkpoints/live/live.pt")
    p.add_argument("--force", action="store_true")
    with_run_config(p)
    p.set_defaults(func=cmd_merge_live)

    p = sub.add_parser("export")
    p.add_argument("--run", default="")
    p.add_argument("--source", default="best", choices=["best", "live"])
    p.add_argument("--path", default="", help="export a local checkpoint instead")
    p.add_argument("--out", default="", help="where to write the export locally")
    p.set_defaults(func=cmd_export)

    p = sub.add_parser("duplicates")
    p.add_argument("--apply", action="store_true", help="remove the non-canonical rows")
    p.set_defaults(func=cmd_duplicates)

    p = sub.add_parser("cleanup-history")
    p.add_argument("--run", required=True)
    p.add_argument("--keep", type=int, required=True, help="newest snapshots to keep")
    p.add_argument("--apply", action="store_true")
    p.set_defaults(func=cmd_cleanup_history)

    p = sub.add_parser("delete")
    p.add_argument("checkpoint")
    p.add_argument("--run", default="")
    p.add_argument("--allow-current", action="store_true")
    p.add_argument("--yes", action="store_true")
    p.set_defaults(func=cmd_delete)

    p = sub.add_parser("orphans")
    p.add_argument("--prefix", default="")
    p.set_defaults(func=cmd_orphans)

    p = sub.add_parser("push")
    p.add_argument("path")
    p.add_argument("--kind", default="best", choices=KINDS)
    p.add_argument("--run-name", default="")
    p.add_argument("--version-id", default=None)
    p.add_argument("--session-id", default=None)
    with_rule(p)
    p.set_defaults(func=cmd_push)

    p = sub.add_parser("pull")
    p.add_argument("path")
    p.add_argument("--kind", default="best", choices=KINDS)
    p.add_argument("--run-name", default="")
    p.set_defaults(func=cmd_pull)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    logger.info(section("ORED.AI -- CHECKPOINTS"))
    try:
        return args.func(args)
    except (StoreError, CheckpointError, FileNotFoundError) as exc:
        logger.error(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
