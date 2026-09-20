# Data

This folder is **intentionally almost empty in git**. The dataset is generated
by code, not committed, because it is:

* small and instant to rebuild (`python scripts/generate_dataset.py`),
* fully determined by `configs/*.yaml` + the seed, so everyone gets byte-identical data,
* the kind of thing that, at larger scale, must never live in a repository.

## Layout

| Folder | Contents |
|---|---|
| `raw/` | The dataset as generated: `bit_addition.csv`. |
| `processed/` | Reserved for cached/tokenised data in later steps. Empty for now. |

## `raw/bit_addition.csv`

One row per example, 256 rows for 4-bit inputs (every possible pair).

| Column | Meaning |
|---|---|
| `split` | `train`, `val` or `test` — assigned once, at generation time |
| `a`, `b` | The two input numbers (0–15) |
| `sum` | The correct answer, `a + b` (0–30) |
| `a_bits`, `b_bits` | The inputs in binary, most-significant bit first |
| `sum_bits` | The answer in binary, 5 bits wide |

```csv
split,a,b,sum,a_bits,b_bits,sum_bits
train,0,0,0,0000,0000,00000
train,0,1,1,0000,0001,00001
val,0,4,4,0000,0100,00100
```

The split is written into the file rather than decided at load time. That makes
it impossible for a later code change to accidentally move a test example into
the training set and inflate the reported accuracy.
