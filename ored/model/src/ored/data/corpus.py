from __future__ import annotations

import argparse
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from ored.config import Config, load_config
from ored.utils.logging_utils import get_logger, section

logger = get_logger(__name__)

SPLITS = ("train", "val", "test")


NAMES = ["anna", "ben", "cora", "dan", "elsa", "finn", "gina", "hugo", "iris", "jonas"]

NOUNS = ["cat", "dog", "bird", "fox", "mouse", "horse", "ball", "box",
         "stone", "flower", "river", "house"]

ADJECTIVES = ["red", "blue", "green", "small", "big", "quiet",
              "happy", "clever", "young", "old"]

VERBS_SINGULAR = ["sees", "likes", "chases", "watches", "finds",
                  "follows", "wants", "hears", "carries", "meets"]
VERBS_PLURAL = ["see", "like", "chase", "watch", "find",
                "follow", "want", "hear", "carry", "meet"]

TEMPLATES = [
    "the {adj} {noun} {verb_s} the {adj} {noun} .",
    "{name} {verb_s} the {adj} {noun} .",
    "the {noun} is {adj} .",
    "{name} gives the {adj} {noun} to {name} .",
    "{name} and {name} {verb_p} the {noun} .",
    "the {adj} {noun} {verb_s} {name} .",
]


def grammar_spec() -> Dict[str, object]:
    return {
        "names": NAMES,
        "nouns": NOUNS,
        "adjectives": ADJECTIVES,
        "verbs_singular": VERBS_SINGULAR,
        "verbs_plural": VERBS_PLURAL,
        "templates": TEMPLATES,
    }


def vocabulary_words() -> List[str]:
    return sorted(set(
        NAMES + NOUNS + ADJECTIVES + VERBS_SINGULAR + VERBS_PLURAL
        + ["the", "is", "gives", "to", "and", "."]
    ))


def make_sentence(rng: random.Random) -> str:
    template = rng.choice(TEMPLATES)
    line = template
    while "{" in line:
        start = line.index("{")
        end = line.index("}", start)
        placeholder = line[start + 1:end]
        word = {
            "adj": lambda: rng.choice(ADJECTIVES),
            "noun": lambda: rng.choice(NOUNS),
            "name": lambda: rng.choice(NAMES),
            "verb_s": lambda: rng.choice(VERBS_SINGULAR),
            "verb_p": lambda: rng.choice(VERBS_PLURAL),
        }[placeholder]()
        line = line[:start] + word + line[end + 1:]
    return line


def format_answer(total: int, reverse_answer: bool) -> str:
    text = str(total)
    return text[::-1] if reverse_answer else text


def read_answer(written: str, reverse_answer: bool) -> str:
    return written[::-1] if reverse_answer else written


def make_arithmetic(a: int, b: int, reverse_answer: bool = False) -> str:
    return f"{a} + {b} = {format_answer(a + b, reverse_answer)}"


def split_pairs(
    max_operand: int,
    train_frac: float,
    val_frac: float,
    seed: int,
) -> Dict[str, List[Tuple[int, int]]]:
    pairs = [(a, b) for a in range(max_operand + 1) for b in range(max_operand + 1)]
    rng = random.Random(seed)
    rng.shuffle(pairs)

    n_total = len(pairs)
    n_train = int(round(train_frac * n_total))
    n_val = int(round(val_frac * n_total))
    if n_total - n_train - n_val <= 0:
        raise ValueError("pair split leaves no pairs for the test corpus")

    return {
        "train": pairs[:n_train],
        "val": pairs[n_train:n_train + n_val],
        "test": pairs[n_train + n_val:],
    }


def build_corpus_text(
    sentence_lines: int,
    pairs: Sequence[Tuple[int, int]],
    repeats: int,
    rng: random.Random,
    reverse_answer: bool = False,
    extra_lines: Sequence[str] = (),
) -> str:
    lines = [make_sentence(rng) for _ in range(sentence_lines)]
    for _ in range(repeats):
        lines.extend(make_arithmetic(a, b, reverse_answer) for a, b in pairs)
    lines.extend(extra_lines)

    rng.shuffle(lines)
    return "\n".join(lines) + "\n"


@dataclass
class CorpusStats:
    split: str
    path: Path
    characters: int
    lines: int
    sentence_lines: int
    arithmetic_lines: int
    pairs: int
    fact_lines: int = 0


def generate_corpus(
    cfg: Config,
    force: bool = False,
    extra_lines: Optional[Dict[str, Sequence[str]]] = None,
) -> Dict[str, CorpusStats]:
    corpus_cfg = cfg.data.corpus
    directory = Path(corpus_cfg.dir)

    train_path = directory / "train.txt"
    if train_path.exists() and not force:
        logger.info(f"corpus already exists: {directory}  (use --force to regenerate)")
        return read_corpus_stats(cfg)

    directory.mkdir(parents=True, exist_ok=True)

    pairs_by_split = split_pairs(
        max_operand=corpus_cfg.max_operand,
        train_frac=corpus_cfg.pair_split.train,
        val_frac=corpus_cfg.pair_split.val,
        seed=cfg.seed,
    )

    sentence_counts = {
        "train": corpus_cfg.sentence_lines,
        "val": max(1, int(corpus_cfg.sentence_lines * corpus_cfg.val_test_fraction)),
        "test": max(1, int(corpus_cfg.sentence_lines * corpus_cfg.val_test_fraction)),
    }

    stats: Dict[str, CorpusStats] = {}
    for split in SPLITS:
        rng = random.Random(cfg.seed + SPLITS.index(split))
        pairs = pairs_by_split[split]
        repeats = corpus_cfg.arithmetic_repeats if split == "train" else 1

        added = list((extra_lines or {}).get(split, ()))
        text = build_corpus_text(sentence_counts[split], pairs, repeats, rng,
                                 corpus_cfg.reverse_answer, added)
        path = directory / f"{split}.txt"
        path.write_text(text, encoding="utf-8")

        stats[split] = CorpusStats(
            split=split,
            path=path,
            characters=len(text),
            lines=text.count("\n"),
            sentence_lines=sentence_counts[split],
            arithmetic_lines=len(pairs) * repeats,
            pairs=len(pairs),
            fact_lines=len(added),
        )

    (directory / "grammar.json").write_text(
        json.dumps(grammar_spec(), indent=2), encoding="utf-8"
    )
    (directory / "corpus_meta.json").write_text(
        json.dumps({"reverse_answer": corpus_cfg.reverse_answer,
                    "max_operand": corpus_cfg.max_operand,
                    "arithmetic_repeats": corpus_cfg.arithmetic_repeats,
                    "sentence_lines": corpus_cfg.sentence_lines}, indent=2),
        encoding="utf-8",
    )
    (directory / "arithmetic_pairs.json").write_text(
        json.dumps({k: [list(p) for p in v] for k, v in pairs_by_split.items()}, indent=2),
        encoding="utf-8",
    )

    _log_summary(cfg, stats, pairs_by_split)
    return stats


def read_corpus_stats(cfg: Config) -> Dict[str, CorpusStats]:
    directory = Path(cfg.data.corpus.dir)
    pairs_by_split = load_arithmetic_pairs(directory)
    stats: Dict[str, CorpusStats] = {}
    for split in SPLITS:
        path = directory / f"{split}.txt"
        text = path.read_text(encoding="utf-8")
        stats[split] = CorpusStats(
            split=split,
            path=path,
            characters=len(text),
            lines=text.count("\n"),
            sentence_lines=-1,
            arithmetic_lines=-1,
            pairs=len(pairs_by_split[split]),
        )
    return stats


def load_arithmetic_pairs(directory: str | Path) -> Dict[str, List[Tuple[int, int]]]:
    path = Path(directory) / "arithmetic_pairs.json"
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found. Generate the corpus first:\n"
            f"  python scripts/generate_corpus.py"
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {split: [tuple(pair) for pair in pairs] for split, pairs in raw.items()}


def load_grammar(directory: str | Path) -> Dict[str, object]:
    path = Path(directory) / "grammar.json"
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Run scripts/generate_corpus.py")
    return json.loads(path.read_text(encoding="utf-8"))


def read_corpus(directory: str | Path, split: str) -> str:
    path = Path(directory) / f"{split}.txt"
    if not path.exists():
        raise FileNotFoundError(
            f"corpus not found: {path}\n"
            f"Generate it first:  python scripts/generate_corpus.py"
        )
    return path.read_text(encoding="utf-8")


def _log_summary(cfg, stats, pairs_by_split) -> None:
    logger.info(section("CORPUS GENERATED"))
    logger.info(f"directory : {cfg.data.corpus.dir}")
    logger.info("")
    header = (f"{'split':<8}{'characters':>12}{'lines':>10}{'sentences':>12}"
              f"{'sums':>8}{'facts':>8}{'pairs':>8}")
    logger.info(header)
    logger.info("-" * len(header))
    for split in SPLITS:
        st = stats[split]
        logger.info(f"{split:<8}{st.characters:>12,}{st.lines:>10,}"
                    f"{st.sentence_lines:>12,}{st.arithmetic_lines:>8,}"
                    f"{st.fact_lines:>8,}{st.pairs:>8,}")
    logger.info("")
    logger.info(f"Operand pairs are disjoint across splits: "
                f"{len(pairs_by_split['train'])} train / "
                f"{len(pairs_by_split['val'])} val / "
                f"{len(pairs_by_split['test'])} test, "
                f"out of {(cfg.data.corpus.max_operand + 1) ** 2} possible.")
    logger.info("A sum in the test corpus never appears in the training corpus.")
    logger.info("")
    logger.info("First lines of the training corpus:")
    for line in read_corpus(cfg.data.corpus.dir, "train").split("\n")[:8]:
        logger.info(f"  {line}")


def main(argv: List[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate the Ored.ai text corpus.")
    parser.add_argument("--config", default="configs/char_transformer.yaml")
    parser.add_argument("--set", dest="overrides", action="append", default=[],
                        metavar="KEY=VALUE")
    parser.add_argument("--force", action="store_true", help="regenerate even if it exists")
    args = parser.parse_args(argv)

    cfg = load_config(args.config, args.overrides)
    generate_corpus(cfg, force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
