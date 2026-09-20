from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path
from typing import Dict, List

from ored.config import Config, load_config
from ored.data.preprocessing import bits_to_string, int_to_bits
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

CSV_FIELDS = ["split", "a", "b", "sum", "a_bits", "b_bits", "sum_bits"]


def build_examples(n_bits: int) -> List[Dict[str, object]]:
    max_value = 2**n_bits
    rows: List[Dict[str, object]] = []
    for a in range(max_value):
        for b in range(max_value):
            total = a + b
            rows.append(
                {
                    "a": a,
                    "b": b,
                    "sum": total,
                    "a_bits": bits_to_string(int_to_bits(a, n_bits)),
                    "b_bits": bits_to_string(int_to_bits(b, n_bits)),
                    "sum_bits": bits_to_string(int_to_bits(total, n_bits + 1)),
                }
            )
    return rows


def assign_splits(
    rows: List[Dict[str, object]],
    train_frac: float,
    val_frac: float,
    seed: int,
) -> List[Dict[str, object]]:
    rng = random.Random(seed)
    order = list(range(len(rows)))
    rng.shuffle(order)

    n_total = len(rows)
    n_train = int(round(train_frac * n_total))
    n_val = int(round(val_frac * n_total))
    n_test = n_total - n_train - n_val
    if n_test <= 0:
        raise ValueError("split fractions leave no examples for the test set")

    for rank, index in enumerate(order):
        if rank < n_train:
            rows[index]["split"] = "train"
        elif rank < n_train + n_val:
            rows[index]["split"] = "val"
        else:
            rows[index]["split"] = "test"
    return rows


def generate_dataset(cfg: Config, force: bool = False) -> Path:
    path = Path(cfg.data.raw_path)
    if path.exists() and not force:
        logger.info(f"dataset already exists: {path}  (use --force to regenerate)")
        return path

    rows = build_examples(cfg.data.n_bits)
    rows = assign_splits(
        rows,
        train_frac=cfg.data.split.train,
        val_frac=cfg.data.split.val,
        seed=cfg.seed,
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row[key] for key in CSV_FIELDS})

    counts = {name: sum(1 for r in rows if r["split"] == name) for name in ("train", "val", "test")}
    logger.info(section("DATASET GENERATED"))
    logger.info(f"file          : {path}")
    logger.info(f"task          : add two {cfg.data.n_bits}-bit numbers")
    logger.info(f"input  vector : {cfg.data.input_size} bits  (a bits ++ b bits)")
    logger.info(f"target vector : {cfg.data.output_size} bits (their sum)")
    logger.info(f"examples      : {len(rows)} total  ->  "
                f"train {counts['train']} | val {counts['val']} | test {counts['test']}")
    logger.info("")
    logger.info("First 5 rows:")
    logger.info(f"  {'split':<6}{'a':>3}{'b':>4}{'sum':>5}   {'a_bits':<7}{'b_bits':<8}{'sum_bits'}")
    for row in rows[:5]:
        logger.info(
            f"  {row['split']:<6}{row['a']:>3}{row['b']:>4}{row['sum']:>5}   "
            f"{row['a_bits']:<7}{row['b_bits']:<8}{row['sum_bits']}"
        )
    return path


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the Ored.ai Step 1 dataset.")
    parser.add_argument("--config", default="configs/bit_adder_mlp.yaml", help="path to a YAML config")
    parser.add_argument("--set", dest="overrides", action="append", default=[],
                        metavar="KEY=VALUE", help="override a config value (repeatable)")
    parser.add_argument("--force", action="store_true", help="overwrite an existing dataset file")
    args = parser.parse_args(argv)

    cfg = load_config(args.config, args.overrides)
    generate_dataset(cfg, force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
