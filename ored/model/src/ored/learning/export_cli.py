from __future__ import annotations

import argparse
from typing import List, Optional

from ored.learning.dataset import DEFAULT_EXPORT_DIR, DatasetError, DatasetSpec, export
from ored.learning.store import StoreError
from ored.learning.supabase_store import SupabaseStore
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Turn approved learning data into a training dataset.",
        epilog="Reads ORED_SB_URL and ORED_SB_SERVICE_KEY from the environment.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--tag", required=True)
    parser.add_argument("--out-dir", default=DEFAULT_EXPORT_DIR)
    parser.add_argument("--min-examples", type=int, default=50)
    parser.add_argument("--min-conversations", type=int, default=10)
    parser.add_argument("--val-fraction", type=float, default=0.15)
    args = parser.parse_args(argv)

    spec = DatasetSpec(
        tag=args.tag,
        min_examples=args.min_examples,
        min_conversations=args.min_conversations,
        val_fraction=args.val_fraction,
    )

    try:
        store = SupabaseStore.from_env()
        report = export(store, spec, args.out_dir)
    except (DatasetError, StoreError) as exc:
        logger.error(str(exc))
        return 1

    logger.info(section("ORED.AI -- LEARNING DATASET"))
    logger.info(report.describe())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
