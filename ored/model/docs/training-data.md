# Training Ored on data managed in Supabase

Questions, facts, vocabulary, conversations and every other kind of teaching
material live in one Supabase table, `ored_training_data`. A training run never
reads that table batch by batch: it takes an **immutable snapshot** of the rows
it is allowed to use, trains the existing character-level Transformer on the
snapshot, and records which snapshot produced every checkpoint.

```
ored_training_data (rows you add / verify / disable)
      │   enabled = true AND verified = true   (the default selection)
      ▼
fetch in fingerprint order, 1,000 rows a page ──► validate every row
      ▼
deterministic split by group (train / val / test) ──► text form of each row
      ▼
data/snapshots/<tag>/<hash16>/  train.txt val.txt test.txt records.jsonl manifest.json
      ▼                                   (sha256 of the content = the snapshot's name)
ored_datasets row  (name = tag, version 1, 2, 3 …, sha256, counts, selection)
      ▼
ored_training_sessions row (queued → running → evaluated / failed / cancelled, dataset_id)
      ▼
char tokenizer from train.txt ──► existing Trainer ──► base / best / live / history checkpoints
      ▼                                              (each payload carries extra.dataset)
ored_checkpoints rows (session_id) ──► ored_model_versions (candidate, never production)
```

The conversation-learning path (`ored_conversations` → `ored_learning_candidates`
→ `ored_training_examples`) is untouched and separate. The generated corpus
(`scripts/generate_corpus.py`) still works exactly as before and is still the
default: `data.source: generated`.

## The simple workflow

1. In the Supabase dashboard, open `ored_training_data` and insert a row:

   | column | value |
   |---|---|
   | type | `qna` |
   | category | `science` |
   | subject | `physics` |
   | topic | `mechanics` |
   | input | `What is force?` |
   | output | `Force is a push or pull that can change the motion of an object.` |
   | difficulty | `beginner` |
   | language | `en` |
   | verified | `true` |
   | enabled | `true` |

   Leave `id`, `fingerprint`, `created_at` and `updated_at` empty: the database
   fills them. `Physics`, ` Science ` or `Acids / Bases` are normalised to
   `physics`, `science`, `acids_bases`.

2. On the training machine (server side, never in a browser):

   ```bash
   export ORED_SB_URL=https://<project>.supabase.co
   export ORED_SB_SERVICE_KEY=<the secret key, from the dashboard>
   cd ored/model
   python scripts/train.py --config configs/char_transformer.yaml --supabase-dataset --upload
   ```

   `--supabase-dataset` with no value trains on every enabled, verified row.
   `--supabase-dataset physics_v1` trains on the rows whose `dataset_tag` is
   `physics_v1`. The run is called `char_transformer-<tag>` (so
   `char_transformer-all` here), which keeps its checkpoints apart from the
   generated-corpus run `char_transformer`, whose vocabulary is different.
   `--run-name` chooses another name.

That is the whole loop. The log opens with the snapshot it is training on:

```
dataset       : all v1 (ored_datasets 987d07d1-…)
snapshot      : 72a9afda52da3ba0b2a642fc03200bbda6b2ed761ff3661f066519a429436118
selection     : enabled = true AND verified = true AND any dataset_tag AND updated_at <= 2026-09-26T06:43:40…
records       : 53  train 37 / val 5 / test 11  (seed 1337)
groups        : train 35 / val 5 / test 10  (a group never crosses splits)
tokenizer     : char, 60 symbols (sha256 c2ec5326223d5afd)
session       : f4a9ef72-… (ored_training_sessions, running)
```

## The table

`ored_training_data` (migration `20260926120000_ored_training_data.sql`):

| Column | Meaning |
|---|---|
| `type` | the record's shape, which decides its text form (below) |
| `category` | top-level area, one of 19 (below) |
| `subject`, `topic` | optional, `lowercase_with_underscores`, free — `python scripts/training_data.py taxonomy` lists the usual ones |
| `input`, `output` | the text; 1–10,000 characters, no control characters except tab and newline |
| `difficulty` | `beginner`, `intermediate`, `advanced`, `expert` or empty |
| `language` | `en`, `pt-br`, … |
| `source` | where it came from, default `manual` |
| `dataset_tag` | optional grouping used by `--supabase-dataset TAG`; `all` is reserved |
| `enabled` | `false` keeps the row out of every snapshot |
| `verified` | only verified rows are trained on unless a run asks otherwise |
| `fingerprint` | set by the database; unique |
| `metadata` | free JSON object; `metadata.group` keeps related rows in one split |

Categories, deliberately not separate tables: `language_foundation`, `grammar`,
`sentences`, `general_knowledge`, `qna`, `conversation`, `mathematics`,
`science` (subjects `physics`, `chemistry`, `biology`), `computer_science`,
`engineering`, `reasoning`, `instructions`, `reading`, `writing`,
`language_skills`, `data`, `everyday`, `safety`, `ored`. The list lives in the
migration's check constraint and in `src/ored/data/training_data.py`; a test
keeps the two equal. Adding a category is a migration plus one line of Python.

### Text form

`src/ored/data/training_data.py` (`format_record`) is the only place a row
becomes text, so the same row always produces the same characters:

| type | text |
|---|---|
| `qna`, `fact` | `Question: …` / `Answer: …` |
| `definition` | `Term: …` / `Definition: …` |
| `vocabulary` | `Word: …` / `Meaning: …` |
| `sentence` | `Prompt: …` / `Sentence: …` |
| `conversation` | `User: …` / `Assistant: …` |
| `instruction` | `Instruction: …` / `Response: …` |
| `comprehension` | `Passage: …` / `Answer: …` |
| `correction` | `Incorrect: …` / `Correct: …` |
| `translation` | `Translate: …` / `Translation: …` |
| `math` | `Problem: …` / `Solution: …` |
| `reasoning` | `Problem: …` / `Answer: …` |
| `writing` | `Task: …` / `Text: …` |
| `classification` | `Text: …` / `Label: …` |

Examples are separated by a blank line. Text is NFC-normalised, `\r\n` becomes
`\n`, trailing spaces go, and three or more newlines collapse to one blank line.

### Fingerprints and duplicates

The fingerprint is the sha256 of `v1`, type, category, subject, topic,
language, input and output — Unicode NFC, runs of whitespace collapsed to one
space, the classification fields lower-cased — joined by U+001F. The database
computes it in a trigger (`ored_training_data_fingerprint`), so a row typed into
the dashboard is fingerprinted exactly like one inserted by a script; Python
computes the same value (`fingerprint_of`) and a test pins both to one known
digest. `validate` and every snapshot recompute it, so a row whose content and
fingerprint disagree is reported, never trained on silently.

The fingerprint is unique. Inserting `What   is force?` next to `What is force?`
with the same answer is refused with the id of the existing row; nothing is
merged or deleted. The same question with a *different* answer is allowed, and
both copies always land in the same split.

## Selection

| Mode | Rule | How |
|---|---|---|
| default | `enabled = true AND verified = true` | nothing to pass |
| unverified too | `enabled = true` | `--include-unverified` |

`enabled = false` is excluded in every training mode. Filters narrow it further:
`--dataset-tag` / `--supabase-dataset`, `--type`, `--category`, `--subject`,
`--language` (each repeatable). The exact rule, including the `updated_at`
cut-off the snapshot was taken at, is printed in the log and stored in the
manifest, in `ored_datasets.selection` and in every checkpoint.

## The snapshot

Rows are fetched in pages of 1,000 ordered by fingerprint with keyset
pagination (`fingerprint > last`), never by offset, and filtered to
`updated_at <= as_of`, where `as_of` is the newest matching row when the
snapshot starts. A row edited mid-fetch is therefore left out rather than half
read. Each page is validated and written straight to disk, so memory does not
grow with the table: 500,000 rows cost the same RAM as 5,000, and the database
is not touched again once training starts.

**Split.** Rows are split before any text is tokenised, never window by window.
The unit is a *group*: `metadata.group` when a row gives one (for example
`add:3+4` for both `3 + 4` and `4 + 3`), otherwise the normalised input. A
group's split is `sha256(seed, group)` mapped onto the `data.split` fractions
(70/15/15 by default), so:

* one question never appears in two splits, whatever its answers;
* adding rows never moves an existing row to another split, so a later
  snapshot cannot leak an old test question into training;
* the split seed (`data.supabase.split_seed`, `--split-seed`) is stored.

`snapshot` checks and prints that no group and no example text is shared
between splits. A split that ends up empty stops the run with a message saying
how many groups there were; add rows or change the seed.

**Hash.** The snapshot's sha256 covers the format, fingerprint and text
versions, the split seed and fractions, and for every row in order its
fingerprint, split and the sha256 of its text. The same selected content gives
the same hash on any machine, whatever the row ids. The folder is
`data/snapshots/<tag>/<first 16 hex>/` and holds:

| File | Content |
|---|---|
| `train.txt`, `val.txt`, `test.txt` | the corpus the existing text pipeline reads |
| `records.jsonl` | every selected row in full, with its split, group hash and text hash |
| `manifest.json` | hash, selection, counts by split / type / category / subject, split seed, tokenizer (vocabulary size and sha256), block size, git commit, notes, and the sha256 of every file |

A snapshot is never rewritten. Taking one whose content already exists reuses
the folder after checking its files. Loading one re-hashes every file and
refuses a damaged folder. `data/snapshots/` is ignored by Git.

**Invalid rows** stop the snapshot with a list of ids and reasons. `--skip-invalid`
(`data.supabase.on_invalid: skip`) leaves them out instead and lists them in the
manifest.

**Tokenizer.** Unchanged: the character tokenizer is built from `train.txt`
exactly as it is built from the generated corpus. Its sha256 is written into the
manifest when the snapshot is taken and checked again when training builds it.

## Versions: `ored_datasets`

`ored_datasets` was already the dataset registry; it is now unique on
`(name, version)` rather than `name`, and a snapshot is one row of it:
`source = 'supabase'`, `sha256`, `record_count`, `selection`, `split_counts`,
`spec` (the manifest without the per-row list), `samples` (three training
examples) and `storage_path`. `ored_dataset_register()` gives new content the
next version of its tag and returns the existing row for content it has seen.
Such rows are immutable (a trigger refuses edits); only `storage_path` can be
filled in once. `bit_addition` and `char_corpus` stay as they were
(`source = 'generated'`).

With `--upload`, the snapshot files also go to the private `ored-datasets`
bucket under `<tag>/<sha256>/`, uploaded and re-downloaded to check their
sha256 by the same `upload_verified` the checkpoints use. Another machine gets
the exact files with

```bash
python scripts/training_data.py pull --dataset-tag all --snapshot <sha256>
```

## Sessions, checkpoints, model versions

`ored_training_sessions` gains `dataset_id` (foreign key to `ored_datasets`,
`on delete restrict`, so a snapshot that trained something cannot be deleted).
A run creates the session `queued` with `dataset_tag`, `run_name`, `config`
(the full config plus a `dataset` block), `example_count` and
`conversation_count = 0`, moves it to `running`, and finishes it `evaluated`
with the best and last metrics — or `failed` with the error, or `cancelled` on
Ctrl-C. These are the existing `ored.learning.sessions` transitions.

Checkpoints go through the existing `CheckpointManager` and `publish`: base,
best, live and history keep their rules, paths and promotion. Two things are
added: every uploaded row carries the session's `session_id`, and every payload
carries `extra.dataset` — tag, version, `ored_datasets` id, snapshot sha256,
record and split counts, selection, split seed, tokenizer, git commit and
session id. The payload's `config` also records `data.source` and
`data.supabase.snapshot`. Payload format is unchanged (still 2) and old
checkpoints load exactly as before; they simply have no dataset.

After an uploaded run whose best was accepted by Supabase, a
`ored_model_versions` row is added as a **candidate** pointing at that best.
Nothing becomes `production` automatically.

## Which data produced this checkpoint?

```bash
python scripts/training_data.py lineage <ored_checkpoints id | path/to/best.pt>
```

prints the dataset tag and version, snapshot sha256, selection rule, record and
split counts, tokenizer, block size, split seed, git commit, session and the
Storage folder. In SQL, `ored_checkpoint_lineage` answers the same question for
every checkpoint; checkpoints from before this change show null dataset columns.

## Continuing and pinning

`--resume-live` continues on the snapshot the live checkpoint was trained on,
even if rows were added since. `--snapshot <sha256>` trains on a given
snapshot. A distributed run (`python -m ored.distributed launch train`)
requires `--set data.supabase.snapshot=<sha256>`, so every PC trains on
identical files: take it once with `training_data.py snapshot --dataset-tag T
--upload` and every PC downloads it by hash.

## The facts from `configs/facts.yaml`

The 1,003 questions in `configs/facts.yaml` were imported on 2026-09-26 as
`ored_training_data` rows with `dataset_tag = 'facts'`, `source = 'facts_yaml'`,
`type = 'qna'`, `enabled` and `verified` (they were already curated and trained
on). `src/ored/data/facts_import.py` holds the mapping:

| facts.yaml category | category / subject | rows |
|---|---|---|
| physics, chemistry, biology, astronomy | `science` / same name | 40, 50, 30, 10 |
| mathematics | `mathematics` / `addition`, `subtraction`, `multiplication`, `division` from the operator | 50 |
| computing | `computer_science` / `computer_fundamentals` | 20 |
| geography | `general_knowledge` / `geography`, topic `capitals` | 19 |
| civics, philosophy, commerce | `general_knowledge` / same name | 100 each |
| online_game, outdoor_sports, art_and_artists | `general_knowledge` / `online_games`, `outdoor_sports`, `art_and_artists` | 100, 100, 84 |
| english | `grammar` / `english_grammar` | 100 |
| language_studies | `language_skills` / `linguistics` | 100 |

`metadata` keeps `facts_id` and `facts_category`, so every row can be traced back
to its line in the file. Ids `00217`–`00219` are used twice in the file (once for
geography, once for civics); each row keeps its own. Sums get
`metadata.group` (`addition:3,4`), so `3 + 4` and `4 + 3` always share a split.

Train on them alone with `--supabase-dataset facts`, or with everything else
using `--supabase-dataset`. `configs/facts.yaml` stays in the repository because
`scripts/generate_facts.py` and `scripts/recall.py` still read it for the
generated corpus; new questions belong in Supabase. To bring later edits of the
file across, run `python scripts/training_data.py import-facts --skip-duplicates`:
changed questions are added as new rows, and identical ones are listed and left
alone. Replaced wording stays in Supabase until it is disabled there.

## Commands

```bash
python scripts/training_data.py stats
python scripts/training_data.py validate
python scripts/training_data.py add --type qna --category science --subject physics \
    --input "What is force?" --output "A push or a pull." --verified
python scripts/training_data.py import rows.jsonl [--skip-duplicates]
python scripts/training_data.py import-facts [configs/facts.yaml] [--dry-run] [--skip-duplicates]
python scripts/training_data.py export --dataset-tag physics_v1
python scripts/training_data.py snapshot --dataset-tag physics_v1 [--upload]
python scripts/training_data.py pull --dataset-tag physics_v1 --snapshot <sha256>
python scripts/training_data.py lineage <checkpoint>
python scripts/training_data.py taxonomy

python scripts/train.py --config configs/char_transformer.yaml --supabase-dataset physics_v1 --upload
python scripts/train.py --config configs/char_transformer.yaml --supabase-dataset \
    --subject physics --include-unverified --split-seed 7 --epochs 20 --batch-size 64
```

The same settings are available in YAML under `data.source` and
`data.supabase` in `configs/char_transformer.yaml`.

## Security

`ored_training_data` follows every other Ored table: RLS enabled and forced, no
policy, no grant to `anon` or `authenticated`; the summary and lineage views are
`security_invoker` and granted to `service_role` only; the bucket is private.
The data is read and written only by the trainer and these commands with
`ORED_SB_SERVICE_KEY`, which stays on the server — never in the chat page,
`public/`, a Worker variable the browser can see, or Git. The chat API has no
endpoint that writes training data.

## Combining with conversation learning later

A snapshot row is a `TrainingData` record and the formatter works on any record
with `type`, `input` and `output`. Approved `ored_training_examples` can later
be added to a snapshot as a second source (as `conversation` rows with their
own `source` value) without changing the split, the hash or the trainer; they
are not mixed in today.

## Tests

* `tests/test_training_data.py` — fingerprint parity with SQL, validation,
  formatting, duplicates, selection, deterministic and leak-free snapshots,
  stable splits, tampering, Storage round trip, tokenizer, a full training run
  with uploads, session and model-version records, resume, failure, the
  command line, lineage, and the generated corpus unchanged.
* `../supabase/tests/training_data_invariants.sql` — the database side, in a
  transaction that is rolled back, safe on the real project.
