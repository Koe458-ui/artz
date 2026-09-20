from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCRIPT = textwrap.dedent(
    """
    import hashlib, sys, tempfile
    sys.path.insert(0, sys.argv[1])
    from ored.config import load_config
    from ored.data.corpus import generate_corpus, read_corpus

    directory = tempfile.mkdtemp()
    cfg = load_config(sys.argv[2], ["data.corpus.sentence_lines=120",
                                    "data.corpus.max_operand=9",
                                    "data.corpus.arithmetic_repeats=2"])
    cfg.data.corpus.dir = directory
    generate_corpus(cfg, force=True)
    digests = [hashlib.sha256(read_corpus(directory, s).encode()).hexdigest()
               for s in ("train", "val", "test")]
    print(" ".join(digests))
    """
)


def _generate_with_hash_seed(hash_seed: str) -> str:
    env = dict(os.environ, PYTHONHASHSEED=hash_seed)
    result = subprocess.run(
        [sys.executable, "-c", SCRIPT, str(ROOT / "src"),
         str(ROOT / "configs" / "char_transformer.yaml")],
        capture_output=True, text=True, env=env, check=True,
    )
    return result.stdout.strip().splitlines()[-1]


def test_corpus_is_identical_across_processes():
    assert _generate_with_hash_seed("1") == _generate_with_hash_seed("2")


def test_the_three_splits_differ_from_each_other():
    train, val, test = _generate_with_hash_seed("0").split()
    assert len({train, val, test}) == 3
