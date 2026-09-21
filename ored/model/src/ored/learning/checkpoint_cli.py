from __future__ import annotations

import argparse
from typing import List, Optional

from ored.learning.checkpoints import CheckpointStore, fetch, publish
from ored.learning.records import CheckpointKind
from ored.learning.store import StoreError
from ored.learning.supabase_store import SupabaseStore
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Push, pull and list Ored checkpoints held in Supabase storage.",
        epilog="Reads ORED_SB_URL and ORED_SB_SERVICE_KEY from the environment.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    push = sub.add_parser("push")
    push.add_argument("path")
    push.add_argument("--kind", default="best", choices=[k.value for k in CheckpointKind])
    push.add_argument("--run-name", default="")
    push.add_argument("--version-id", default=None)
    push.add_argument("--session-id", default=None)

    pull = sub.add_parser("pull")
    pull.add_argument("path")
    pull.add_argument("--kind", default="best", choices=[k.value for k in CheckpointKind])
    pull.add_argument("--run-name", default="")

    listing = sub.add_parser("list")
    listing.add_argument("--kind", default="", choices=[""] + [k.value for k in CheckpointKind])

    args = parser.parse_args(argv)

    try:
        store = SupabaseStore.from_env()
        files = CheckpointStore.from_env()

        logger.info(section("ORED.AI -- CHECKPOINTS"))

        if args.command == "push":
            record = publish(
                store=store,
                files=files,
                path=args.path,
                kind=CheckpointKind(args.kind),
                run_name=args.run_name,
                version_id=args.version_id,
                session_id=args.session_id,
            )
            logger.info(f"pushed {args.path} -> {record.bucket_id}/{record.object_path}")
            logger.info(f"{record.size_bytes} bytes, sha256 {record.sha256}")
            return 0

        if args.command == "pull":
            record = fetch(
                store=store,
                files=files,
                path=args.path,
                kind=CheckpointKind(args.kind),
                run_name=args.run_name,
            )
            if record is None:
                logger.error(f"no {args.kind} checkpoint is stored")
                return 1
            logger.info(f"pulled {record.bucket_id}/{record.object_path} -> {args.path}")
            return 0

        kind = CheckpointKind(args.kind) if args.kind else None
        found = store.checkpoints(kind)
        if not found:
            logger.info("nothing stored yet")
            return 0
        for record in found:
            logger.info(
                f"{record.kind} {record.run_name or '-'} {record.object_path} "
                f"{record.size_bytes} bytes {record.created_at}"
            )
        return 0

    except StoreError as exc:
        logger.error(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
