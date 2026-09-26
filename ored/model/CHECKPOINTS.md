# Checkpoint Architecture

How Ored stores, finds, verifies and restores its checkpoints. Read this and you
should be able to open Supabase on a phone, point at a row and say exactly what
it is, where its file is, and whether training can continue from it.

| Role | Meaning | How many per run | Ever overwritten? |
|---|---|---|---|
| `base` | Where a run started: the weights before the first step | one | never |
| `live` | The latest **resumable** state: weights, optimizer, schedule position, epoch, step, RNG | one current | replaced by the next live |
| `best` | The best **validation** result so far, by one rule | one current | only by a genuinely better one |
| `history` | Old snapshots for rollback, debugging and comparison | many, append-only | never |
| `export` | An inference-only copy for deployment, no training state | one current | never (a new export is a new row) |

Training on several PCs keeps these roles; one checkpoint is then a group of
files, one shard per worker plus a manifest. See
[`docs/distributed-training.md`](docs/distributed-training.md).

"live" is the name the database already used. It means *latest and resumable*;
there is no separate "latest" or "last" role.

## Where the code is

| File | What it owns |
|---|---|
| `src/ored/utils/checkpoint.py` | The `.pt` payload: its keys, format version, writing, reading, compatibility checks, and `PromotionRule`, the one definition of "better". |
| `src/ored/training/checkpoints.py` | Checkpoints during training: `CheckpointManager` (`save_base_checkpoint`, `save_live_checkpoint`, `save_history_checkpoint`, `evaluate_and_promote_best`, `export_model`, `load_live_checkpoint`, `load_best_checkpoint`) and RNG capture/restore. |
| `src/ored/learning/checkpoints.py` | Supabase: Storage paths, upload, verification, `publish`, `promote_best`, `export_checkpoint`, `fetch`, `verify_checkpoint`, duplicates and cleanup. |
| `src/ored/learning/store.py`, `supabase_store.py` | The `ored_checkpoints` rows. `InMemoryStore` enforces the same rules as the database so the tests exercise them. |
| `src/ored/learning/checkpoint_cli.py` | The maintenance commands. |
| `../supabase/migrations/20260924150000_ored_checkpoint_roles.sql` | The schema, constraints, trigger, functions and views. |
| `../supabase/tests/checkpoint_invariants.sql` | The database invariants, checked in a transaction that is rolled back. |

`trainer.py` calls the manager and contains no paths, SQL or Storage code.

## Local files

`checkpoints/<run_name>/` (from `paths.checkpoint_dir` and `run_name`):

```
checkpoints/ored_v2/
  base.pt
  live.pt                                 # was last.pt before format 2
  best.pt
  export.pt                               # checkpoint.export_on_finish or the export command
  history/epoch_0010_step_00024570.pt     # checkpoint.keep_history
  history.json                            # per-epoch metrics, unchanged
```

Every file is written to `<name>.tmp` and renamed, so a crash mid-write never
leaves a half file where a good one was. The local directory is a working copy:
a fresh run with the same `run_name` replaces its files. The permanent record is
Supabase.

## Storage layout

Bucket: `ored-checkpoints` (override with `ORED_SB_CHECKPOINT_BUCKET`). Private,
no Storage policy, so only the service key can read or write it.

```
ored-checkpoints/
  <model_version>/                         # = run_name, e.g. ored_v2
    base/base.pt
    live/epoch_0030_step_00073710.pt
    best/epoch_0020_step_00049140.pt
    history/epoch_0010_step_00024570.pt
    history/epoch_0020_step_00049140.pt
    export/epoch_0020_step_00049140.pt
```

Names say what the file is, and a file is **never overwritten** once a row
records it. That is why live and best are not literally `live.pt` and `best.pt`
in the bucket: replacing an object in place cannot happen in the same
transaction as the row that describes it, so for a moment the table would
describe bytes that are no longer there, and a failed upload could destroy the
only good live. Instead a new object is uploaded under its own name and one
database transaction moves `is_current` to it. "Which one is live?" is always
answered by the row, never by guessing from file names.

If the same role is saved twice at the same epoch and step with different
bytes (a resumed run re-saving its first live), the second gets `-2`, then
`-3`, before `.pt`.

Rows written before this design keep their original paths
(`best/<run>/<uuid>.pt`, `live/live/<uuid>.pt`). Nothing was moved: every
command reads the path from the row.

## Database

One table, `public.ored_checkpoints`, extended rather than duplicated.

| Column | Meaning |
|---|---|
| `id` | uuid |
| `kind` | `base` / `live` / `best` / `history` / `export` |
| `run_name` | the model version, and the first folder of `object_path` |
| `session_id` → `ored_training_sessions.id` | the training session, when there is one |
| `version_id` → `ored_model_versions.id` | the model version this checkpoint became, when registered |
| `parent_checkpoint_id` → `ored_checkpoints.id` | what it was derived from: an export's best, a best promoted from history |
| `is_current` | the one current base/live/best/export of the run |
| `epoch`, `global_step` | where training was |
| `metrics` | `train_loss`, `val_loss`, `val_bpc`, `val_ppl`, ... (format 1 rows: `loss`, `bpc`, `ppl` = validation) |
| `promotion_metric`, `promotion_mode` | for best: the rule that promoted it, e.g. `val_loss` / `min` |
| `bucket_id`, `object_path` | where the bytes are |
| `size_bytes`, `sha256` | what the bytes must be |
| `format_version`, `torch_version` | what can read them |
| `verified_at` | last time the object was downloaded and its sha256 matched |
| `uploaded_by`, `created_at` | who and when |

Enforced by PostgreSQL, not only by Python:

| Rule | How |
|---|---|
| One current row per run and role | partial unique index `ored_checkpoints_one_current_idx (run_name, kind) where is_current` |
| History is never current | check `ored_checkpoints_history_not_current_check` |
| A best records its rule | check `ored_checkpoints_best_metric_check` |
| sha256 is a real digest; epoch and step are not negative | checks |
| No two rows for one object | existing unique `object_path` |
| Rows are immutable (path, size, hash, metrics, epoch, step, kind, run...) | trigger `ored_checkpoints_guard` |
| `is_current` moves only inside `ored_checkpoint_register` / `ored_checkpoint_make_current` | trigger |
| A base, once current, is never replaced | trigger and `ored_checkpoint_register` |
| Rows (history included) are deleted only through `ored_checkpoint_delete`, and a current row only with `p_allow_current` | trigger |
| Promotion is compare-and-swap | `p_replaces` must name the current row the caller compared against, or the call fails with "it changed, compare again" |

Functions (service role only):

- `ored_checkpoint_register(p_row jsonb, p_make_current bool, p_replaces uuid)`
- `ored_checkpoint_make_current(p_id uuid, p_replaces uuid)`
- `ored_checkpoint_delete(p_id uuid, p_allow_current bool)`
- `ored_checkpoint_mark_verified(p_id uuid, p_sha256 text)`

Views (service role only, `security_invoker`):

| View | Answers |
|---|---|
| `ored_checkpoint_current` | What is the current live / best / base / export of each run, and its metrics? |
| `ored_checkpoint_overview` | Everything, with `val_loss`, `val_bpc`, `val_ppl`, `size_mb`, session status and model version pulled out |
| `ored_checkpoint_duplicates` | Which rows hold byte-identical files, and which one is canonical |

From the Supabase SQL editor on a phone:

```sql
select * from ored_checkpoint_current where run_name = 'ored_v2';
select * from ored_checkpoint_current where run_name = 'ored_v2' and role = 'best';
select epoch, global_step, val_loss, val_bpc, object_path
  from ored_checkpoint_overview where run_name = 'ored_v2' and role = 'history' order by global_step;
select run_name, role, epoch, object_path from ored_checkpoint_overview where model_version = 'v2';
select * from ored_checkpoint_duplicates;
```

Security: RLS stays enabled and forced on every `ored_` table with no policy,
so `anon` and `authenticated` see nothing; the views and functions grant nothing
to them either. The trainer and the CLI use `ORED_SB_SERVICE_KEY`, which lives
in the trainer's environment only, never in this repository, the Worker's page
or a mobile client.

## Payload format (format 2)

A checkpoint is a dict with named keys. A positional tuple such as
`torch.save((model, optimizer, epoch))` is refused.

| Key | base | live | best | history | export |
|---|---|---|---|---|---|
| `format_version` (2), `checkpoint_kind` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `run_name`, `task`, `created_at`, `torch_version` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `architecture` (`model.describe()` minus the count), `parameters` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `config` (full training config; `config["model"]` is the model config) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `tokenizer` (language models) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `model_state_dict` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `epoch`, `global_step`, `metrics`, `promotion` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `optimizer_state_dict` | – | ✓ | ✓ | ✓ | – |
| `scheduler_state_dict` (name, current lr, total/warmup steps; the LR is a function of `global_step`) | – | ✓ | ✓ | ✓ | – |
| `scaler_state_dict` (AMP; `None` because Ored trains without AMP) | – | ✓ | ✓ | ✓ | – |
| `rng_state` (torch, CUDA, Python, NumPy, data-order generator) | – | ✓ | ✓ | ✓ | – |
| `trainer_state` (history, best so far, early-stopping count, position inside the epoch) | – | ✓ | ✓ | ✓ | – |

`best` keeps its training state so a run can be restarted from it; `export`
drops it and is roughly a third of the size.

`epoch` is the epoch the snapshot was taken in, `global_step` the optimizer
steps taken. `trainer_state.epoch_complete` says whether that epoch had finished.

**Format 1** (everything written before this change) is still read:
`model_state` → `model_state_dict`, `optimizer_state` → `optimizer_state_dict`,
`extra.tokenizer` → `tokenizer`, `saved_at` → `created_at`, `loss` → the
validation loss. Format 1 files load for evaluation, inference, serving and as
a warm start. They cannot be *resumed* exactly (they never recorded RNG or loop
position), and `training.resume: live` says so.

### Compatibility checks

Before any weight is copied, `check_compatible` and `load_model_state` compare
the checkpoint with the model the current config builds, and fail in words:

```
checkpoints/ored_v2/best.pt is not compatible with this model.
Checkpoint format: 2
Expected format: 2
Model architecture mismatch: ored_v2 is Transformer(vocab_size=87, block_size=256, d_model=128, n_layer=4, ...),
this config builds Transformer(vocab_size=87, block_size=256, d_model=256, n_layer=4, ...)
```

An unknown format reads `Checkpoint format: 99 / Expected format: 2`. A missing
or mis-shaped tensor names the tensor and both shapes instead of PyTorch's
`size mismatch for ...`. A tokenizer with a different vocabulary is refused. A
truncated file is "not a readable checkpoint".

## When each role is written

`configs/*.yaml`, section `checkpoint:` (all optional; these are the defaults):

```yaml
checkpoint:
  best_metric: val_loss          # the one rule for "best"
  best_mode: min                 # min = lower is better, max = higher is better
  save_base: true
  save_live_every_epochs: 1      # 0 = off
  save_live_every_steps: 0       # 0 = off
  keep_history: false
  save_history_every_epochs: 1   # with keep_history: every N epochs
  save_history_every_steps: 0    # with keep_history: every N steps
  export_on_finish: false
  upload: false                  # also publish every file to Supabase
  keep_superseded_live: false    # keep older live rows/objects in Supabase
```

Order inside an epoch: train → validate → **best** (if better) → **history** (if
due) → **live** (if due). Live is written last, so a live never claims a
best or history snapshot that was not written. A final live is written when
training ends if the last step has none yet.

For the language model, `val_bpc` is `val_loss / ln 2`: both pick the same
checkpoint. `val_loss` is the default and is what every existing best row was
chosen by. The rule is stored in the config (and so in every checkpoint and any
training session's `config`), in each payload's `promotion`, and in each best
row's `promotion_metric` / `promotion_mode`.

## Promotion

```
live / history snapshot
        ↓
evaluate (validation metrics are already in its metrics)
        ↓
PromotionRule.is_better(new, current best)?    ← the only comparison in the codebase
        ↓ yes
write best (local) → upload → verify → one transaction: new row current, old best not current
```

`PromotionRule` lives in `utils/checkpoint.py`. The trainer, `publish`,
`promote_best` and `promote-best` all call it. A tie is not an improvement (it
must beat the current value by more than `1e-6`, the trainer's old threshold).
A best that is not better raises `NotBetterError` / prints "not promoted" and
changes nothing. `--force` exists for deliberate rollbacks and is never used
automatically.

If Supabase already holds a better best for the same run (from an earlier
attempt), an upload of a worse local best is declined and the log says so.

## Publishing and verification

`publish()` in `learning/checkpoints.py`, used for every role:

1. Save the `.pt` (atomic rename) and read its metadata from the file.
2. Compute sha256 and size.
3. Choose the object path. If a row already records that path with the same
   hash, stop: it is already published.
4. For best: compare with the current best under the rule. For base: refuse if
   one exists.
5. Upload without overwrite. An existing object that no row records (left by
   an interrupted upload) may be replaced; a recorded one never is.
6. Ask Storage for the object's size and compare.
7. Download it and compare its sha256.
8. One transaction (`ored_checkpoint_register`): insert the row and, for
   base/live/best/export, make it current and retire the previous one,
   provided the current row is still the one compared against.
9. Any failure in 5–8 removes the unreferenced object and leaves the previous
   current checkpoint untouched. A damaged upload can never become live, best
   or export.
10. For live, older live rows of the run are then removed — row first, object
    second — unless `keep_superseded_live` is on.

Deleting always goes row first, then object, so the table never points at a
missing object; the worst case is an orphan object, which `orphans` lists.

## Resume

```bash
python scripts/train.py --config configs/char_transformer.yaml --set training.resume=live
# or
python scripts/checkpoints.py resume-live --config configs/char_transformer.yaml
```

1. Open `checkpoints/<run>/live.pt`. If it is missing and `checkpoint.upload`
   is on, download the run's current live from Supabase and verify its sha256.
2. No live anywhere → `There is no live checkpoint for run 'ored_v2': ... Leave
   training.resume empty to start a fresh run.` It never falls back to best.
3. The file must say `checkpoint_kind: live` (a best copied into the live slot
   is refused), must be format 2 with optimizer and trainer state, and must
   match the model and tokenizer.
4. Restore model, optimizer, epoch, global step (so the cosine schedule
   continues where it was), history, best so far, early-stopping count, and
   RNG. Settings that differ from the checkpoint's config are logged.
5. If the live was taken mid-epoch, replay that epoch's shuffle, skip the
   batches already trained on, and restore the RNG at the exact batch.

The tests check that crash-and-resume produces bit-identical weights and
losses to an uninterrupted run, at an epoch boundary, mid-epoch, and on the
last batch of an epoch.

`training.resume: <path>` is the old warm start: weights and optimizer from any
compatible checkpoint, epochs counted from 1.

## From the command prompt

Run from `ored/model`. Add `--upload` to any of them to publish to Supabase as well.

```bash
# New run from scratch (base, best and live are saved automatically)
python scripts/train.py --config configs/char_transformer.yaml

# ...keeping a history snapshot every 10 epochs, and live every 500 steps
python scripts/train.py --config configs/char_transformer.yaml --history-every 10 --live-every-steps 500

# New run that starts from another checkpoint's weights (epochs count from 1)
python scripts/train.py --config configs/char_transformer.yaml --set run_name=ored_v3 \
    --init-from checkpoints/ored_v2/best.pt

# Continue a run exactly where live.pt stopped (raise epochs to train longer)
python scripts/train.py --config configs/char_transformer.yaml --resume-live --set training.epochs=60

# Put any checkpoint file into a run's role by hand
python scripts/checkpoints.py save FILE.pt --as history --config configs/char_transformer.yaml
python scripts/checkpoints.py save FILE.pt --as best    --config configs/char_transformer.yaml
python scripts/checkpoints.py save FILE.pt --as live    --config configs/char_transformer.yaml

# Make the online (serve.py) session's live.pt the best, if it validates better
python scripts/checkpoints.py merge-live --config configs/char_transformer.yaml
python scripts/checkpoints.py merge-live --config configs/char_transformer.yaml --live checkpoints/live/live.pt
```

`--config` (plus any `--set`) picks the run: files go to
`<paths.checkpoint_dir>/<run_name>/`.

`save --as best` and `merge-live` evaluate **both** the file and the current
`best.pt` on the run's validation split, with the same code the trainer uses,
and replace `best.pt` only if `PromotionRule` says the file is better. The
online session's own numbers are not trusted: its `last_loss` is from single
messages, not the validation set. The replaced best is kept as
`history/epoch_EEEE_step_SSSSSSSS.pt`, never deleted. `--force` replaces even
when not better. A file that is not better leaves everything untouched:

```
promoted to best: val_loss 3.07018 vs current best 3.37613; previous best kept as checkpoints/lm/history/epoch_0002_step_00000074.pt
not promoted: val_loss 3.07018 vs current best 3.07018; val_loss (lower is better). best.pt is unchanged.
```

`save --as live` refuses a file without optimizer and loop state (a best from
format 1, a base, an export or the online session's live), because the run
could not resume from it; use `--init-from` to start a new run from it. The
previous `live.pt` is kept in `history/`. `save --as history` adds a snapshot
(`-2`, `-3` if the name is taken).

## Commands

`python scripts/checkpoints.py <command>` (also `python -m ored.learning.checkpoint_cli`
and the installed `ored-checkpoints`). Commands that touch Supabase read `ORED_SB_URL` and
`ORED_SB_SERVICE_KEY`.

| Command | Does |
|---|---|
| `list [--run R] [--kind K] [--current]` | table of rows; `*` marks current |
| `show-live --run R` / `show-best --run R` | the card below; without `--run`, every run |
| `show <id\|role\|file.pt> [--verify]` | any checkpoint |
| `history --run R` | the run's snapshots in step order |
| `verify <id\|role\|file.pt>` | Storage: exists, size, sha256, loads, then records `verified_at`. Local file: loads and validates. |
| `promote-best <id\|file.pt> [--run R] [--metric M --mode min\|max] [--force]` | evaluate and promote |
| `resume-live --config C [--set k=v]` | train with `training.resume=live` |
| `save FILE --as live\|best\|history --config C [--force] [--upload]` | put a file into the run's role; best only if better |
| `merge-live --config C [--live PATH] [--force] [--upload]` | the online session's live → best, if it validates better |
| `export --run R [--source best\|live]` / `export --path file.pt [--out o.pt]` | inference-only artifact |
| `duplicates [--apply]` | report identical files; `--apply` removes the non-canonical rows and objects |
| `cleanup-history --run R --keep N [--apply]` | keep the newest N snapshots |
| `delete <id> [--allow-current] --yes` | one row and its object |
| `orphans` | objects no row records |
| `push FILE --kind K --run-name R` / `pull FILE --kind K --run-name R` | the original two commands |

```
Ored Checkpoint

Role:            BEST (current)
Model:           ored_v2
Run:             ored_v2
Session:         -
Model version:   -
Epoch:           100
Global step:     0

Validation loss: 0.32660
BPC:             0.47119
PPL:             1.38665
Train loss:      -
Promoted by:     val_loss (lower is better)

Size:            10.10 MB (10,097,567 bytes)
SHA-256:         29ee68ae2028bce99b7b30b646cd5900bf04caeddb949a0b952a9fe90bbf37ea
Format:          1
PyTorch:         2.11.0+cu128
Storage path:    ored-checkpoints/best/ored_v2/dfa3ab26-bfe6-4aad-bb6c-44e1606f81e2.pt
Derived from:    -
Created:         2026-09-24T10:57:02+00:00
Uploaded by:     -
Verified:        not yet (run: verify dfa3ab26-bfe6-4aad-bb6c-44e1606f81e2)
Id:              dfa3ab26-bfe6-4aad-bb6c-44e1606f81e2
```

## Cleanup

Nothing is deleted automatically except superseded **live** checkpoints (the
live role means "the latest", and `keep_superseded_live: true` turns even that
off). Every other removal is a command that prints its plan and does nothing
until `--apply` / `--yes`:

- `duplicates --apply` removes rows whose file is byte-identical to a canonical
  row (the current one, else the earliest upload). Current rows are never
  removed here.
- `cleanup-history --keep N --apply` removes the oldest history snapshots and
  never touches base, live, best or export.
- `delete <id> --yes` removes one row; a current one also needs
  `--allow-current`.

### State found when this was introduced (24 Sep 2026)

| Finding | Action taken |
|---|---|
| 10 rows, all format 1, no session or version links | kept; `is_current` set per run (newest live; lowest validation loss for best, earliest copy on a tie) |
| `ored_v2` had two best rows (epoch 50, loss 0.4319; epoch 100, loss 0.3266) | epoch 100 current, epoch 50 kept as a former best |
| `cap50`, `cap100`, `cap200` each uploaded twice with identical sha256 | reported by `ored_checkpoint_duplicates`; canonical = first upload (`05315ffe…`, `8a41a9ff…`, `2ab6b2c2…`); extras `6e8bfa27…`, `74c7501e…`, `9faa2947…` left in place for `duplicates --apply` |
| Storage object `live/live/2dfc1480-091e-42f5-a47c-ac6ca4790dc7.pt` has no row (an earlier live whose row was replaced) | listed by `orphans`; not deleted |

## Worked example

`checkpoint: {keep_history: true, save_history_every_epochs: 10, upload: true}`,
2,457 steps per epoch, run `ored_v2`, trained to epoch 30. Validation loss is
lowest at epoch 20.

| After epoch | Local files | Supabase rows for `ored_v2` |
|---|---|---|
| start | `base.pt` | base `base/base.pt` (current) |
| 1 | + `best.pt`(1), `live.pt`(1) | + best e1 (current), live e1 (current) |
| 2–9 | `best.pt` replaced whenever val loss improves; `live.pt` every epoch | each better best becomes current, the old one stays not current; each live replaces the previous |
| 10 | + `history/epoch_0010_step_00024570.pt` | + history e10 |
| 20 | `best.pt` = epoch 20, + `history/epoch_0020_step_00049140.pt` | best e20 current; + history e20 |
| 21–30 | `best.pt` unchanged (worse); `live.pt` every epoch | best stays e20; live moves to e30 |
| 30 | + `history/epoch_0030_step_00073710.pt`; final `live.pt` = epoch 30 | + history e30; live e30 current |

Then in `ored_checkpoint_current`:

| role | epoch | global_step | object_path |
|---|---|---|---|
| base | 0 | 0 | `ored_v2/base/base.pt` |
| best | 20 | 49,140 | `ored_v2/best/epoch_0020_step_00049140.pt` |
| live | 30 | 73,710 | `ored_v2/live/epoch_0030_step_00073710.pt` |

and `history --run ored_v2` lists epochs 10, 20 and 30. Resuming continues at
epoch 31, step 73,711. `export --run ored_v2` makes
`ored_v2/export/epoch_0020_step_00049140.pt` from the epoch 20 best with
`parent_checkpoint_id` pointing at it. Rolling back to epoch 10:
`promote-best <history e10 id> --force`.

## Tests

| File | Covers |
|---|---|
| `tests/test_checkpoint_lifecycle.py` | roles on disk and their contents, best = lowest val loss, max-mode metric, worse epochs never overwrite best, history intervals (epochs, steps, off), resume (boundary, mid-epoch, last batch) bit-identical to one run, no live → clear error, never falls back to best, best in live slot refused, extending a run, unknown format, architecture mismatch, truncated file, tuple payload refused, format 1 still loads, format 1 cannot be resumed, export loads for inference, tokenizer in every LM checkpoint |
| `tests/test_checkpoint_store.py` | object paths, publish records size/hash/verification, idempotent publish, damaged (corrupt or truncated) upload never recorded and never replaces best, role mismatch refused, fetch round trip, corrupted object refused, missing object reported, verify, live replacement and keeping, one live per run, name collisions, best promote / reject worse / force / max mode, promote-best from file and from history, rollback needs force, stale compare-and-swap refused, best without metric refused, history append-only, base immutable, export from best, duplicates reported then removed only with apply, canonical choice, current delete needs allow, history pruning, orphans, CLI output |
| `tests/test_checkpoint_schema.py` | applies the migration to a throwaway Postgres loaded with the pre-migration schema and rows, then runs `checkpoint_invariants.sql` (skipped when PostgreSQL is not installed) |
| `../supabase/tests/checkpoint_invariants.sql` | run against the real project too; everything inside is rolled back |

## Which data produced a checkpoint

A run on `data.source: supabase` records its training data without changing
any rule above. Every row it uploads carries the run's `session_id`; the
session carries `dataset_id`, the `ored_datasets` snapshot (tag, version,
sha256, counts, selection); and every payload carries the same facts in
`extra.dataset`, with `config.data.supabase.snapshot`. The payload format is
still 2, and checkpoints from before have no dataset and load unchanged.
`python scripts/training_data.py lineage <id or file>` and the view
`ored_checkpoint_lineage` answer the question. Details:
[`docs/training-data.md`](docs/training-data.md).
