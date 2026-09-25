# Distributed Training

Train **one** Ored model on 2, 3, 10 or 20 PCs at the same time.

This is real data-parallel training with PyTorch's own tools: `torchrun`
starts the workers, `torch.distributed` connects them,
`DistributedDataParallel` (DDP) keeps one model in sync, and
`torch.distributed.checkpoint` (DCP) saves one checkpoint from all of them.
It is **not** "each PC trains its own model and the files are merged later".

```
                         ORED TRAINING SESSION  (session key, e.g. ored_v3-run1)
                                       │
                ┌──────────────────────┴───────────────────────┐
                │                                              │
       PyTorch distributed                              Supabase (control + storage)
   (torchrun + gloo/nccl, direct                ┌──────────────┼──────────────────┐
    PC-to-PC connections)                       │              │                  │
                │                     ored_training_sessions  ored_training_   ored_checkpoints
      ┌─────────┼─────────┬────────┐                          workers          + Storage bucket
      │         │         │        │                                              ▲
    PC 1      PC 2      PC 3  ...  PC N                                           │
   rank 0    rank 1    rank 2     rank N-1                                        │
      │         │         │        │                                              │
      │  forward + backward on its own slice of the data                          │
      └─────────┴────┬────┴────────┘                                              │
                     ▼                                                            │
         all-reduce: gradients averaged                                           │
                     ▼                                                            │
         the same optimizer step on every PC  →  one model                        │
                     ▼                                                            │
         distributed checkpoint: every rank writes its own shard at the same time │
      ┌─────────┬─────────┬────────┐                                              │
   __0_0.distcp __1_0.distcp __2_0.distcp ...  + rank-0000N.pt + .metadata        │
      └─────────┴────┬────┴────────┘                                              │
                     ▼                                                            │
     each rank uploads + verifies its own files ──────────────────────────────────┤
                     ▼                                                            │
     rank 0 writes manifest.json, checks every rank's shards are verified, ───────┘
     and promotes the checkpoint to live / best in one database transaction
```

## Words

| Word | Meaning |
|---|---|
| **worker** | One training process. Normally one per GPU, so one per PC for Ored. |
| **rank** | The worker's number in the job: 0 … world size − 1. Rank 0 is the coordinator. |
| **world size** | How many workers take part: nodes × processes per node. |
| **node** | One PC. **node rank** is its number (0 … nodes − 1). |
| **local rank** | The worker's number inside its PC, which picks its GPU (`cuda:LOCAL_RANK`). |
| **session key** | The name every worker joins with (`--session`). Workers with another key never train together. |
| **rendezvous** | How the workers find each other before training starts. |

Every worker reads the standard variables torchrun sets: `RANK`,
`LOCAL_RANK`, `WORLD_SIZE`, `LOCAL_WORLD_SIZE`, `MASTER_ADDR`, `MASTER_PORT`
(plus `GROUP_RANK` for the node rank). Ored adds no rank system of its own.
Each worker also has a `worker_id`, `<hostname>-<local rank>`, used only to
label its row in Supabase.

## How the PCs find each other

One PC is the **master**: its address is `MASTER_ADDR` and it listens on
`MASTER_PORT` (default 29500). Every PC runs the same command:

```
python -m ored.distributed launch train --config configs/char_transformer.yaml \
    --session ored_v3-run1 --nnodes 3 --master-addr 100.64.0.1
```

`launch` only builds and runs a `torchrun` command (printed first, so you can
see it). Two rendezvous styles:

| | `c10d` (default) | `static` |
|---|---|---|
| Node ranks | handed out as PCs join | you give each PC `--node-rank` (0 on the master) |
| Worker count | fixed (`--nnodes 3`) or a range (`--nnodes 2:5`, elastic) | fixed |
| Start order | any | any |
| Session isolation | `--rdzv-id` = session key | separate port per job, plus the check below |

| Rendezvous setting | Where it comes from |
|---|---|
| minimum workers | `--nnodes MIN:MAX` × `--nproc-per-node` (c10d only); a fixed `--nnodes N` means min = max = N |
| maximum workers | same |
| expected world size | nodes × processes per node, recorded in `ored_training_sessions.config.distributed.world_size` |
| rendezvous endpoint | `MASTER_ADDR:MASTER_PORT` |
| timeout | `distributed.timeout_seconds` (default 900 s) for joining **and** for every collective |

Values come from the flags, then environment variables (`NNODES`,
`NODE_RANK`, `MASTER_ADDR`, `MASTER_PORT`, `NPROC_PER_NODE`,
`ORED_SESSION`), then the config's `distributed:` section. Nothing is
hard-coded, so `NNODES=10` works without touching the code.

After connecting, every worker compares its session key, run name, config,
training-data sizes, tokenizer and backend with every other worker. If any
differ, all of them stop with a message naming the odd one out, so workers
from two sessions (or a PC with an old checkout) never average gradients
together.

### Check the network first

```
python -m ored.distributed launch test --config configs/char_transformer.yaml \
    --session net-check --nnodes 3 --master-addr 100.64.0.1
```

Every worker prints its rank, host, GPU, CUDA and PyTorch version and the
master address. Rank 0 then prints a table like this (an example for three
Windows PCs; the output format is the one the test produces):

```
rank  node  host                 device   gpu                      torch          os
   0     0  pc-harsh             cuda:0   NVIDIA GeForce RTX 5060  2.11.0+cu128   Windows 11
   1     1  pc-2                 cuda:0   NVIDIA GeForce RTX 3060  2.11.0+cu128   Windows 11
   2     2  pc-3                 cuda:0   NVIDIA GeForce RTX 4050  2.11.0+cu128   Windows 11
  OK   all ranks discovered 3 of 3
  OK   all ranks connected (all-gather)
  OK   all-reduce sum 6, expected 6
  OK   barrier
  all-reduce of 16 MB took 180 ms (178 MB/s per worker)
VERIFIED: every worker can train together
```

The last line before VERIFIED is a rough speed of the link between the PCs.

## Network

The workers talk to each other **directly**. Supabase is only the control
panel and the file store; it never carries gradients.

- Rank 0's PC must accept connections on `MASTER_PORT`.
- With `gloo`, every worker also opens connections to every other worker on
  ports the system picks. Allow `python` through the firewall **on the private
  network only**.
- PCs on different networks (different homes) need a private network between
  them: a mesh VPN such as Tailscale or ZeroTier gives every PC a stable
  private address (`100.x.y.z`). Use those addresses as `MASTER_ADDR`.
- If a PC has several network cards (Wi-Fi, Ethernet, VPN), tell gloo which to
  use: `set GLOO_SOCKET_IFNAME=Tailscale` on Windows,
  `export GLOO_SOCKET_IFNAME=tailscale0` on Linux (`NCCL_SOCKET_IFNAME` for nccl).
- Never forward these ports on your router or open them to the internet.

## Backend: gloo or nccl

| | gloo (default) | nccl |
|---|---|---|
| Windows | **yes** | no, PyTorch for Windows has no NCCL |
| Linux | yes | yes, NVIDIA GPUs only |
| CPU-only PCs | yes | no |
| Speed between GPUs | slower (copies through the CPU) | fastest |

Ored's PCs run Windows, so keep `backend: gloo`. Every PC in a job must use
the same backend; a mixed Windows/Linux job must use gloo. Asking for nccl
where it does not exist stops with an explanation instead of hanging. On
Windows, `launch` also sets `USE_LIBUV=0`, which Windows builds of PyTorch
need for rendezvous.

## Commands

On every PC, from `ored/model`, with the virtual environment active.

**3 PCs**, master `100.64.0.1`:

```bat
set MASTER_ADDR=100.64.0.1
set MASTER_PORT=29500
set NNODES=3
set NPROC_PER_NODE=1
python -m ored.distributed launch train --config configs\char_transformer.yaml --session ored_v3-run1
```

**5 PCs**: the same with `set NNODES=5`. **N PCs**: `set NNODES=N`.
Nothing else changes.

With `--rendezvous static` each PC also needs its own node rank:

```bat
set NODE_RANK=0      &:: on the master; 1, 2, 3 ... on the others
python -m ored.distributed launch train --config configs\char_transformer.yaml --session ored_v3-run1 --rendezvous static
```

Add training flags after `--`:

```bat
python -m ored.distributed launch train --config configs\char_transformer.yaml --session ored_v3-run1 -- --upload --report --history-every 10
```

| Flag after `--` | Effect |
|---|---|
| `--upload` | upload checkpoint shards to Supabase (needed to resume on PCs that do not share a folder) |
| `--report` | record the session and workers in Supabase, with heartbeats |
| `--resume-live` | continue from the live checkpoint |
| `--init-from FILE.pt` | start from another checkpoint's weights (the file must exist on every PC) |
| `--history-every N`, `--history-every-steps N`, `--live-every-steps N` | as for single-PC training |

`--upload` and `--report` need `ORED_SB_URL` and `ORED_SB_SERVICE_KEY` on
every PC. Training PCs are trusted machines; the service key must never go
into the repository, the website or a phone app.

`scripts\distributed.py` is the same program as `python -m ored.distributed`.

## How the data is divided

`DistributedSampler` splits the training set into one shard per worker, and
`set_epoch` reshuffles it identically on every worker each epoch:

```
training set ── shuffled with seed + epoch ──┬── rank 0: examples 0, 3, 6, ...
                                              ├── rank 1: examples 1, 4, 7, ...
                                              └── rank 2: examples 2, 5, 8, ...
```

If the set does not divide evenly, a few examples are repeated so that every
worker takes the same number of steps (DDP needs that). Validation and test
are split exactly, with no repeats.

**Batch size.** With `batch_size_mode: per_worker` (default) each worker uses
`data.batch_size`, so one optimizer step sees `batch_size × workers` examples
and an epoch has fewer steps. With `batch_size_mode: global`, `data.batch_size`
is the total per step and is divided among the workers, which keeps training
identical to one PC; it needs the batch size to divide by the worker count
(32 fits 1, 2, 4, 8, 16 or 32 workers). The run header states which.

Every PC needs the training data. Each PC generates the corpus from the
config if it is missing; the same config gives the same corpus, and the
startup check refuses PCs whose data differs.

## How the gradients are synchronized

`DistributedDataParallel` wraps the model once. Every step:

```
rank 0 forward/backward ┐
rank 1 forward/backward ├── all-reduce: every gradient averaged over all workers
rank N forward/backward ┘
          ▼
the same optimizer step on every worker → every worker holds the same weights
```

DDP makes all workers start from rank 0's weights. The tests check that 3
workers finish with bit-identical weights, and that one synchronized step
equals one step on the whole batch on one machine.

## Global metrics

Each worker adds up its validation loss **weighted by the number of
examples** it saw. The sums and the counts are then added across workers, and
only then divided:

```
PC1: 13 examples, loss sum 5.2  ┐
PC2: 13 examples, loss sum 6.1  ├── sum → 38 examples, loss sum 16.3 → global val_loss 0.429
PC3: 12 examples, loss sum 5.0  ┘
```

It is never an average of averages. For the language model every example is a
`block_size`-token window, so this is also token-weighted, and `val_tokens`
records the count. `val_bpc` is the global loss / ln 2, and `val_ppl` is
exp(global loss), not an average of per-batch perplexities. Every worker gets
the same global numbers. **best**, early stopping and the logs use them, never
rank 0's share alone.

## How checkpoints are saved

The five roles (`base`, `live`, `best`, `history`, `export`) keep their
meaning; see [`../CHECKPOINTS.md`](../CHECKPOINTS.md). A distributed
checkpoint is one **group** of files:

```
checkpoints/<run_name>/
  live.json   best.json   base.json          ← which group is current (written by rank 0 only when complete)
  best.pt                                    ← single-file copy of the current best, for infer.py / serve.py
  live/checkpoint_epoch_0040_step_00098280_1a2b3c4d/
      manifest.json         ← what the group is (rank 0, written last)
      .metadata             ← DCP's index (rank 0)
      __0_0.distcp          ← rank 0's shard
      __1_0.distcp          ← rank 1's shard
      __2_0.distcp          ← rank 2's shard
      rank-00000.pt         ← rank 0's random state and position in the epoch
      rank-00001.pt
      rank-00002.pt
  best/checkpoint_.../      (same layout)
  history/checkpoint_.../   (same layout, one folder per snapshot)
  base/checkpoint_.../      (model only)
  export/checkpoint_.../model.pt + manifest.json   (single file, inference only)
```

1. Rank 0 picks a new group id and every worker learns it (broadcast).
2. **All workers save at the same time**: `dcp.save` writes each worker's
   shard in parallel. DCP spreads the tensors across the workers, so nothing
   funnels through rank 0.
3. Each worker writes its own `rank-XXXXX.pt`, computes size and SHA-256 of its
   own files, and, with `--upload`, uploads and verifies them itself.
4. Rank 0 collects every worker's report. Only if every rank 0 … N−1 reported
   verified files does it write `manifest.json` (`"complete": true`), record
   the group in Supabase and move `live.json` / `best.json`.
5. Rank 0 tells everyone the outcome. If a live replaced an older one, the
   older group is removed (row first, then files).

A group with a missing or failed shard never gets a `manifest.json` (it gets
`INCOMPLETE.json` with the reasons), never becomes live or best, and the
previous live stays in use.

The manifest describes the whole checkpoint:

```json
{
  "format_version": 3,
  "checkpoint_group_id": "1a2b3c4d-…",
  "kind": "live",
  "session_key": "ored_v3-run1",
  "run_name": "ored_v3",
  "world_size": 3,
  "epoch": 40,
  "global_step": 98280,
  "metrics": {"val_loss": 0.43, "val_bpc": 0.62, "val_examples": 3120, "val_tokens": 798720, "...": 0},
  "contents": ["model", "optimizer"],
  "architecture": {"type": "Transformer", "d_model": 128, "...": 0},
  "tokenizer": {"...": 0},
  "config": {"...": 0},
  "trainer_state": {"history": [], "epoch_complete": true, "...": 0},
  "shards": [
    {"rank": 0, "name": "__0_0.distcp", "object_path": "ored_v3/live/checkpoint_…/__0_0.distcp", "size_bytes": 9123456, "sha256": "…"},
    {"rank": 1, "name": "__1_0.distcp", "…": "…"},
    {"rank": 2, "name": "__2_0.distcp", "…": "…"}
  ],
  "complete": true
}
```

## How Supabase stores the shards

Bucket `ored-checkpoints`, path `<run_name>/<role>/<group folder>/<file>`.
`ored_checkpoints` has one row **per file**, and the rows of one checkpoint
share a `checkpoint_group_id`:

| part | rank | What it is | Can be current live/best? |
|---|---|---|---|
| `file` | – | a single-PC checkpoint (all rows from before) | yes |
| `shard` | 0 … N−1 | one file written by one rank | never |
| `manifest` | – | the logical checkpoint: `manifest.json` | yes, once complete |

A shard row is created as `uploading` by the rank that owns it, becomes
`verified` or `failed`, and becomes `is_complete` only when
`ored_checkpoint_finalize_group()` has checked that every rank has verified
shards. That same transaction inserts the manifest row and, for live/best,
makes it current. The database enforces this; see
`ored/supabase/migrations/20260924170000_ored_distributed_training.sql`.

Dashboard views (SQL editor or Table editor, on a phone too):

| View | Shows |
|---|---|
| `ored_training_run_overview` | per session: status, world size, workers alive / silent / failed, current live and best epoch and loss |
| `ored_training_worker_status` | every worker: rank, host, GPU, status, seconds since its last heartbeat, health |
| `ored_checkpoint_groups` | every distributed checkpoint: ranks verified out of world size, complete, current, val loss |
| `ored_checkpoint_current` | the current base / live / best / export of each run |

```sql
select * from ored_training_run_overview where session_key = 'ored_v3-run1';
select rank, hostname, gpu_name, status, health, seconds_since_heartbeat
  from ored_training_worker_status where session_key = 'ored_v3-run1' order by rank;
select role, epoch, val_loss, world_size, ranks_verified, is_complete, is_current
  from ored_checkpoint_groups where run_name = 'ored_v3' order by started_at desc;
```

`ored_training_sessions.config` holds the whole training config, with
`distributed.world_size`, `expected_nodes`, `backend`, `batch_per_worker` and
`global_batch`. `ored_training_sessions.metrics` gets the final global numbers
when the run ends.

## How best is selected

Rank 0 compares the **global** validation metric (`checkpoint.best_metric`,
default `val_loss`, lower is better) with the best so far, and broadcasts the
decision. All workers then save the best group together. No other rank ever
decides.

```
epoch 20 → global val loss 0.45   best
epoch 30 → global val loss 0.43   best  ← new best
epoch 40 → global val loss 0.44   not better: best stays epoch 30, live is epoch 40
```

## Resume

```bat
python -m ored.distributed launch train --config configs\char_transformer.yaml --session ored_v3-run2 -- --resume-live --upload
```

- Rank 0 finds the current live (in Supabase with `--upload`, otherwise
  `live.json`) and tells every worker.
- Each worker makes sure it has **every** file of that group. Missing or
  damaged files are downloaded from Supabase and re-hashed. Without Supabase
  they must already be there (same PC, or a shared folder); otherwise the
  worker says which files are missing and every worker stops before loading
  anything.
- The model and tokenizer are checked against the manifest.
- `dcp.load` restores the model and optimizer on every worker. Epoch, global
  step (so the learning-rate schedule continues), history, best so far and
  early-stopping count come from the manifest; each worker's random state and
  position in the epoch come from its `rank-XXXXX.pt`.

With the same number of workers, data order and random numbers continue
exactly. The tests compare a stop-and-resume run with an uninterrupted one:
identical up to the stop, then equal to float32 rounding (about 1e-8). The
remaining difference is DDP regrouping its gradient buckets on the first step
after a restart, which changes the order in which floats are added.

**A different number of PCs.** DCP re-shards on load and every worker holds
the whole model and optimizer (DDP), so a checkpoint saved by 3 workers loads
into 2, 5 or 10. Each worker's random stream is reseeded, which the log says.
This works from a live saved at the **end of an epoch**, which is the default.
A live saved in the middle of an epoch (`--live-every-steps`) records how far
each worker got through its own shard, which only means something with the
same worker count, so resuming it with a different count stops with a clear
message.

When `torchrun` restarts workers itself (`distributed.max_restarts` > 0),
they resume from live automatically.

## What happens when…

**One PC crashes.** Its connections close, the others fail on the next
all-reduce (or at `timeout_seconds` if the network just goes silent), torchrun
stops the job, and every surviving worker marks itself `failed` in Supabase
(with `--report`); rank 0 marks the session failed. The crashed PC's row keeps
its last heartbeat, and after three missed intervals the dashboard shows "no
heartbeat (unknown)". That means "not heard from", not "definitely dead". The
last complete live is untouched. Start the job again with `--resume-live`.
This was run for real: three nodes, one killed with `kill -9` mid-training,
the other two stopped, and the restart continued from the last live (epoch
147) to the end.

**Training is stopped by hand** (Ctrl+C): workers are marked `disconnected`,
the session `cancelled`, and the last live stays. Resume later with
`--resume-live`, with the same or a different number of PCs.

**A checkpoint upload fails.** That worker marks its shard `failed`, rank 0
sees it, writes `INCOMPLETE.json`, does not write a manifest, and does not
move live or best. Training carries on. The next checkpoint tries again. The
failed rows stay visible in `ored_checkpoint_groups` until you remove them.

**A worker reconnects.** Workers do not rejoin a running job in the middle.
With a fixed size, restart the job and it resumes from live. With
`--nnodes MIN:MAX` and `distributed.max_restarts`, torchrun re-runs
rendezvous and restarts all workers, which resume from live.

**Adding another PC.** Stop the job (or let it reach a live at the end of an
epoch), install Ored on the new PC exactly like the others, and start
everyone again with `NNODES` one higher and `--resume-live`.

## Different GPUs

Synchronous DDP moves at the pace of the slowest worker, because every step
waits for every gradient. An RTX 3050 next to an RTX 5090 will hold the 5090
back. Nothing tries to balance this automatically; correctness and
repeatability come first. Leave out PCs that are much slower than the rest.

## Commands for checking and converting

```bat
python -m ored.distributed verify checkpoints\ored_v3\live\checkpoint_epoch_0040_step_00098280_1a2b3c4d --config configs\char_transformer.yaml
python -m ored.distributed verify 1a2b3c4d-....           &:: a checkpoint_group_id, checked in Supabase
python scripts\checkpoints.py verify 1a2b3c4d-....        &:: the same, from the checkpoint tool
python -m ored.distributed consolidate checkpoints\ored_v3\best\checkpoint_... --out ored_v3.pt
```

`verify` checks that the manifest exists and is complete, that every rank
0 … N−1 has its files, that every file exists with the recorded size and
SHA-256, that the world size matches, that the format is supported, and (with
`--config`) that the model config fits. It prints `VERIFIED` or `FAILED` and
every reason. `consolidate` writes one ordinary `.pt` that `infer.py`,
`evaluate.py` and `serve.py` load.

## Who does what

| All workers | Rank 0 only |
|---|---|
| load their data shard | claim the session in Supabase |
| train, and take part in every gradient all-reduce | decide whether a checkpoint is the new best |
| compute their share of the metrics, and take part in the reduction | write the manifest and finalize the checkpoint |
| save their checkpoint shard at the same time as the others | move `live.json` / `best.json`; promote in Supabase |
| upload and verify their own shard | write `best.pt`, `history.json`, the run summary and the logs |
| send heartbeats | mark the session finished or failed |

Collectives (broadcast, all-gather, all-reduce, barrier, `dcp.save`,
`dcp.load`) are always called by every worker in the same order. Errors that
one worker finds while preparing a checkpoint or a resume are gathered first,
so that all workers stop together instead of some waiting forever. Barriers
are used only around checkpoints, resume and removal of old groups.

## Tested here, and not

Tested (`tests/test_distributed.py`, `tests/test_multi_node.py`,
`ored/supabase/tests/checkpoint_invariants.sql`):

- training with 1, 2 and 3 workers, where every worker finishes with identical weights
- one synchronized step equals one step on the whole batch
- data sharding and exact validation split
- global metrics weighted by examples, including uneven shards
- DCP save by 3 workers, the manifest, `.metadata`, and shard/rank files
- history and best on the global metric
- stop and resume, same count: exact state, and matches an uninterrupted run
- resume on fewer workers (3 → 2)
- mid-epoch live with a different worker count is refused
- no live gives a clear error
- corrupt and missing shards detected by `verify` and by resume
- model-config mismatch
- concurrent shard uploads, then finalize, promote and prune
- a failed upload never becomes live
- resume on a PC with no local files downloads them
- heartbeats and worker and session status
- workers from another session are refused
- `launch` builds c10d and static commands
- three separate `torchrun` agents, each one node, meet through c10d rendezvous, train, then resume on two nodes and verify
- by hand: kill one of three nodes during training, then restart and resume from the last live

Not tested here, because this machine has no GPU and no second computer:
separate physical PCs over a real network or VPN, CUDA devices, nccl, Windows
PCs talking to each other, and uploads to the real Supabase bucket (the
Storage calls are the same ones single-PC checkpoints already use; the
database side was tested against the real project inside rolled-back
transactions). Run `launch test` on your PCs first, then a short
`launch train` with a few epochs, before a long run.
