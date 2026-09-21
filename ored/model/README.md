# Ored.ai

An AI built from scratch — no pretrained models, no external AI APIs, no
borrowed weights. Everything this model knows, it learned from data we
generated ourselves, using a training loop we wrote ourselves.

> **This repository started completely empty.** No source code, no folders, no
> configuration, no dataset, no model, no ML framework, no training pipeline.
> Everything below was built from zero.

---

# Step 1 — the foundation

## What Step 1 is (and what it is not)

**Step 1 builds the foundation: a complete, working, end-to-end machine
learning pipeline.** Every stage exists, runs, and is verified:

```
INPUT → DATASET → PREPROCESSING → NEURAL NETWORK → PREDICTION → LOSS
      → BACKPROPAGATION → WEIGHT UPDATE → TRAINED MODEL → INFERENCE
```

To prove the pipeline genuinely works rather than merely executing, the model
learns a real, checkable task: **adding two 4-bit binary numbers**.

**This is not a general-purpose AI.** It is not a chatbot, it does not
understand the world, and it cannot answer a question. It is a 5,061-number
network that has learned exactly one thing. Saying so plainly is the point:
Step 1's value is the *infrastructure*, proven correct by a task small enough
to verify by hand. (Step 2, below, adds a language model — still not a chatbot.)

### The result

| Split | Examples | Loss | Bit accuracy | **Exact-match accuracy** |
|---|---|---|---|---|
| train | 179 | 0.0001 | 100.0% | **100.0%** |
| validation | 38 | 0.0010 | 100.0% | **100.0%** |
| **test (never seen in training)** | **39** | **0.0018** | **100.0%** | **100.0%** |

The model is shown 179 of the 256 possible additions. It answers the other 77
— which it has never seen in any form — with perfect accuracy. That is only
possible by learning how binary addition *works*, including carry propagation.
A memorised lookup table would score near zero on those.

Verified across 6 different random seeds: 100% test accuracy every time.

---

## Why this task?

Addition sounds trivial, and choosing it was deliberate:

1. **A linear model cannot do it.** In binary, each output bit depends on
   carries rippling up from lower bits — an XOR-like, non-linear relationship.
   A single linear layer provably cannot represent it. So a good score is
   *proof* that the hidden layers and backpropagation are genuinely working,
   not that the task was easy.
2. **You can check every answer by hand.** `9 + 6 = 15`. No ambiguity, no
   subjective quality judgement, no benchmark to interpret.
3. **Generalisation is measurable and honest.** With a held-out split, "did it
   learn or did it memorise?" has a numeric answer.
4. **It is small.** 5,061 parameters, ~5 seconds of CPU training. You can run
   an experiment, change one number, and re-run immediately.

---

## Installation

Requires **Python 3.10+**. No GPU needed.

```bash
git clone https://github.com/albaze777/Ored.ai.git
cd Ored.ai

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install --upgrade pip
pip install -r requirements.txt
```

<details>
<summary><b>Laptop tip: install the CPU-only build of PyTorch (much smaller)</b></summary>

On Linux, plain `pip install torch` pulls in CUDA GPU libraries — several
gigabytes you do not need for this project. The CPU-only build is ~200 MB:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```
</details>

Optionally install the package itself so `ored` is importable from anywhere:

```bash
pip install -e .
```

This is optional — every script works without it.

---

## Running the pipeline

### 1. Generate the dataset

```bash
python scripts/generate_dataset.py
```

Writes `data/raw/bit_addition.csv`: all 256 possible additions, split into
train/validation/test. Deterministic — the same seed always produces the same
split.

### 2. Train

```bash
python scripts/train.py
```

Takes about 5 seconds on a laptop CPU. Checkpoints are written to
`checkpoints/bit_adder_mlp/`.

Override any setting without editing files:

```bash
python scripts/train.py --set training.epochs=50
python scripts/train.py --set model.hidden_sizes=[128,128] --set training.learning_rate=0.003
python scripts/train.py --set model.activation=relu        # watch it overfit
python scripts/train.py --set seed=7                       # a different random start
```

### 3. Evaluate

```bash
python scripts/evaluate.py
```

Scores the best checkpoint on all three splits, lists any mistakes, and breaks
accuracy down per output bit.

### 4. Run inference

```bash
python scripts/infer.py --a 9 --b 6
python scripts/infer.py --pairs 3+4 13+13 15+15
python scripts/infer.py --interactive
```

`infer.py` never imports the trainer, the optimizer or the loss function. It
loads a checkpoint and runs a forward pass — that is all deployment is.

It reads `task` out of the checkpoint and picks the matching predictor, so the
same script also serves a Step 2 character language model — there it rebuilds
the tokenizer saved alongside the weights and completes text instead of bits:

```bash
python scripts/infer.py --checkpoint checkpoints/char_transformer/best.pt --text "17 + 9 = "
python scripts/infer.py --checkpoint checkpoints/char_transformer/best.pt --pairs 3+4 9+6
python scripts/infer.py --checkpoint checkpoints/char_transformer/best.pt --text "the " --sample --tokens 200
```

### 5. Understand backpropagation

```bash
python scripts/explain_backprop.py
```

A guided walkthrough on a single neuron: the gradient derived by hand with the
chain rule, the same gradient from `.backward()`, a finite-difference check,
and one weight update that visibly lowers the loss. Start here if the maths is
new to you.

### 6. Run the tests

```bash
pip install -r requirements-dev.txt
pytest
```

124 tests covering encoding round-trips, split disjointness, gradient flow,
loss decrease, checkpoint reloading, reproducibility, causal masking, tokenizer
round-trips, sampling filters and the LR schedule.

---

## Example training output

```
==============================================================================
TRAINING RUN: bit_adder_mlp
==============================================================================
device            : cpu
seed              : 1337 (deterministic=True)

DATA
  train split: 179 examples | inputs (179, 8) | targets (179, 5)
  val   split:  38 examples | inputs (38, 8) | targets (38, 5)
  test  split:  39 examples | inputs (39, 8) | targets (39, 5)
  batch size    : 16 (12 weight updates per epoch)

MODEL
  architecture  : MLP 8 -> 64 -> 64 -> 5
  activation    : tanh
  parameters    : 5,061 trainable numbers

OPTIMISATION
  loss          : bce_with_logits
  optimizer     : adam (lr=0.01, weight_decay=0.0)
  epochs        : 400 (early stopping patience 150)

Legend: bit-acc = individual output bits correct; exact = all 5 bits correct.
------------------------------------------------------------------------------
Epoch    1/400 | train loss 0.7454 | val loss 0.8287 | val bit-acc  48.4% | val exact   0.0%  <- best so far
Epoch   20/400 | train loss 0.1119 | val loss 0.1677 | val bit-acc  96.8% | val exact  84.2%  <- best so far
Epoch   40/400 | train loss 0.0128 | val loss 0.0412 | val bit-acc  99.5% | val exact  97.4%  <- best so far
Epoch   60/400 | train loss 0.0046 | val loss 0.0217 | val bit-acc 100.0% | val exact 100.0%  <- best so far
Epoch  100/400 | train loss 0.0015 | val loss 0.0109 | val bit-acc 100.0% | val exact 100.0%
Epoch  200/400 | train loss 0.0003 | val loss 0.0038 | val bit-acc 100.0% | val exact 100.0%  <- best so far
Epoch  300/400 | train loss 0.0001 | val loss 0.0019 | val bit-acc 100.0% | val exact 100.0%  <- best so far
Epoch  400/400 | train loss 0.0001 | val loss 0.0011 | val bit-acc 100.0% | val exact 100.0%

==============================================================================
TRAINING COMPLETE
==============================================================================
epochs run        : 400
wall clock        : 4.9s
best val loss     : 0.001044 (epoch 398)

DID IT LEARN?  (first epoch  ->  last epoch)
  train loss      : 0.7454  ->  0.0001
  val   loss      : 0.8287  ->  0.0011
  val   bit-acc   : 48.4%  ->  100.0%
  val   exact-acc : 0.0%  ->  100.0%

HOW THE WEIGHTS CHANGED  (|w| = length of the parameter tensor)
parameter                    shape       #  |w| before   |w| after     moved      rel
-------------------------------------------------------------------------------------
net.0.weight               (64, 8)     512     11.3474     17.1405    9.1597   80.7%
net.0.bias                   (64,)      64      0.0000      4.9586    4.9586     n/a
net.2.weight              (64, 64)    4096     11.3138     24.6979   20.4802  181.0%
net.2.bias                   (64,)      64      0.0000      2.1962    2.1962     n/a
net.4.weight               (5, 64)     320      3.2254     13.2473   11.3994  353.4%
net.4.bias                    (5,)       5      0.0000      0.3549    0.3549     n/a
```

And inference:

```
  0 + 0   = 0    [OK  ] expected 0   (bits 00000, confidence 100.0%)
  3 + 4   = 7    [OK  ] expected 7   (bits 00111, confidence  99.6%)
  9 + 6   = 15   [OK  ] expected 15  (bits 01111, confidence 100.0%)
 15 + 15  = 30   [OK  ] expected 30  (bits 11110, confidence  99.8%)
```

---

## How the neural network works

### The shape of it

```
input: 8 numbers  (the bits of a, then the bits of b)
   │
   │  Linear   h = x·W₁ᵀ + b₁        W₁: (64, 8)    b₁: (64,)
   │  tanh     squash into (-1, 1)
   ▼
hidden: 64 numbers
   │
   │  Linear + tanh                  W₂: (64, 64)   b₂: (64,)
   ▼
hidden: 64 numbers
   │
   │  Linear   (no activation)       W₃: (5, 64)    b₃: (5,)
   ▼
output: 5 logits  (one per bit of the sum)
```

Every arrow is multiply-and-add. The model's entire knowledge is the contents
of W₁, b₁, W₂, b₂, W₃, b₃ — 5,061 numbers.

### The vocabulary, concretely

**Tensor** — a grid of numbers. Our inputs are shape `(batch, 8)`: 16 examples
of 8 bits each. Everything in a network is tensors.

**Weight** — `W[i][j]` says how strongly input *j* pushes neuron *i* up or
down. A weight near zero means "this input is irrelevant to me".

**Bias** — `b[i]` shifts a neuron's output regardless of its inputs. It sets
how easily the neuron fires. Without it, a neuron fed all zeros could only ever
output zero — which matters here, since `0 + 0` is a real example.

**Forward propagation** — feeding input through the layers to get an output.
For one neuron: `out = Σⱼ W[i][j]·inⱼ + b[i]`, then the activation. This is
`model.forward()`, and it is the only thing inference needs.

**Activation function** — the non-linearity between layers. Without it, two
stacked linear layers collapse into one (`(xA)B = x(AB)`) and depth buys
nothing. We use `tanh`, which squashes any number into (-1, 1).

**Logit** — a raw output score, before being turned into a probability.
Negative means "probably 0", positive means "probably 1". `sigmoid(logit)`
converts it into a probability; `logit > 0` is the same test as
`probability > 0.5`.

**Loss** — one number saying how wrong the model was. We use binary
cross-entropy on each of the 5 output bits: near zero when confident and right,
growing sharply when confident and wrong. Training is the search for weights
that make this number small.

**Gradient** — for each individual weight, the slope `dLoss/dw`: "if this
weight grew slightly, the loss would change by this much, in this direction."

**Backpropagation** — the algorithm that computes all 5,061 slopes efficiently
by applying the chain rule backwards through the network. PyTorch records each
forward operation into a graph; `loss.backward()` walks it in reverse and fills
in `w.grad` for every parameter. Nothing has changed yet — this step only
measures slopes.

**Optimizer** — turns slopes into an actual change. The simplest rule is
`w ← w − learning_rate · dLoss/dw`: step *against* the slope, because we want
the loss to go down. We use Adam, which additionally keeps running averages of
recent gradients so each weight gets its own effective step size.

**Epoch vs batch** — a batch is one weight update (16 examples here). An epoch
is one full pass over the training data — 12 batches, so 12 updates per epoch.

**Training vs inference** — training runs forward *and* backward and changes
weights. Inference runs forward only, under `torch.no_grad()`, with
`model.eval()` set, and changes nothing. Mixing these up is a classic bug,
which is why they live in separate files here.

### The five lines that are the entire principle

From `src/ored/training/trainer.py`:

```python
self.optimizer.zero_grad(set_to_none=True)
loss, extra, batch_size = self.task.compute_loss(self.model, batch, self.device)
loss.backward()
nn.utils.clip_grad_norm_(self.model.parameters(), self.cfg.training.grad_clip)
self.optimizer.step()
```

Line by line:

1. `zero_grad` — forget the previous batch's gradients. PyTorch *accumulates*
   into `.grad` by default, so without this they pile up and the updates are
   nonsense. The most common beginner bug.
2. `compute_loss` — the forward pass and the loss together. One scalar comes
   back, still attached to the autograd graph.
3. `backward()` — backpropagation. Fills in `.grad` for every parameter. **No
   weight has changed yet**; this step only computes slopes.
4. `clip_grad_norm_` — a safety rail so one bad batch cannot wreck the weights.
5. `step()` — the only line that changes the model.

Everything else in the project is infrastructure around those five lines.

---

## What the model learned, and how the weights changed

### What it learned

Not a table of 179 memorised answers — it cannot be, because it answers the 77
withheld pairs perfectly too. It learned the **structure of binary addition**:

* the least-significant output bit is the XOR of the two least-significant
  input bits,
* every higher bit is an XOR of its two input bits *and* the carry generated
  below it,
* a carry is generated when two bits are both 1, and propagated when exactly
  one is.

The 64 hidden neurons encode these carry-detection patterns; the output layer
combines them into 5 bit decisions. The model was never told any of this. It
was told only "here are 179 correct answers, and here is how wrong you are" —
and gradient descent found weights implementing the logic.

The per-bit accuracy breakdown in `evaluate.py` shows the shape of the problem:
the last bit is easy (pure XOR, no carry), while the higher bits require carries
propagating through everything below them — and those are the bits that stay
wrong longest during training.

### How the weights changed

Every run prints the table shown above. Reading it:

* **`|w| before`** — the length of each parameter tensor at initialisation.
  Weights start as small random numbers (Kaiming initialisation, scaled by the
  number of inputs to each neuron so the signal neither explodes nor vanishes
  as it passes through layers). They *must* be random: if every weight started
  equal, every neuron in a layer would compute the same thing and receive the
  same gradient forever, and the network could never differentiate its neurons.
  Biases start at exactly `0.0` — hence `|w| before = 0.0000` on those rows —
  because there is no symmetry to break for them.

* **`moved`** — the distance each tensor travelled through weight space:
  `‖after − before‖`. Every row is well above zero, which is the numerical
  proof that learning happened. `tests/test_training.py::test_weights_actually_change`
  asserts exactly this.

* **`rel`** — that distance relative to where the tensor started. The trend is
  the interesting part:

  | Layer | Relative change |
  |---|---|
  | input layer `net.0.weight` | 80.7% |
  | hidden layer `net.2.weight` | 181.0% |
  | output layer `net.4.weight` | 353.4% |

  The output layer moves furthest. It sits closest to the loss, so it receives
  the largest, most direct gradients — it must learn to map internal features
  onto 5 confident bit decisions. The input layer moves least: it only needs to
  spread 8 input bits into useful combinations, and its gradients arrive
  attenuated after passing back through two layers.

* **Biases went from 0 to non-zero** (4.96, 2.20, 0.35). The network chose
  activation thresholds for its neurons — learning *when* each neuron should
  fire, not just what it responds to.

The loss curve tells the same story from the outside: `0.7454 → 0.0001`. A
loss of ~0.69 is what you get from guessing every bit at 50/50 — epoch 1 is
literally a coin flip. By epoch 60 the model is perfect on data it never
trained on.

---

## Project structure

```
Ored.ai/
├── README.md
├── pyproject.toml              # package metadata, entry points, pytest config
├── requirements.txt            # torch, numpy, pyyaml
├── requirements-dev.txt        # + pytest
├── .gitignore
│
├── configs/
│   └── bit_adder_mlp.yaml      # every hyperparameter, heavily commented
│
├── data/
│   ├── README.md               # dataset documentation
│   ├── raw/                    # generated CSV lands here (git-ignored)
│   └── processed/              # reserved for Step 2 (tokenised/cached data)
│
├── checkpoints/                # trained weights land here (git-ignored)
│   └── bit_adder_mlp/
│       ├── best.pt             # lowest validation loss
│       ├── last.pt             # final epoch, for resuming
│       └── history.json        # per-epoch metrics
│
├── .github/workflows/ci.yml    # runs the test suite on every push
│
├── scripts/                    # thin CLI entry points
│   ├── _bootstrap.py           # lets scripts run without `pip install`
│   ├── generate_dataset.py     # Step 1 data
│   ├── generate_corpus.py      # Step 2 text corpus
│   ├── train.py                # both steps, selected by --config
│   ├── evaluate.py             # both steps, routed by the checkpoint
│   ├── infer.py                # Step 1 prediction
│   ├── generate.py             # Step 2 text generation
│   └── explain_backprop.py     # the maths, by hand, verified
│
├── src/ored/
│   ├── config.py               # YAML → validated dataclasses, CLI overrides
│   ├── data/
│   │   ├── generate.py         # bit-addition dataset + splits
│   │   ├── preprocessing.py    # int ↔ bit-vector encoding
│   │   ├── dataset.py          # Dataset + DataLoader (batching)
│   │   ├── corpus.py           # text corpus, disjoint operand splits
│   │   ├── tokenizer.py        # char tokenizer + registry
│   │   └── text_dataset.py     # sequence windows, shift-by-one targets
│   ├── models/
│   │   ├── base.py             # the interface every model implements
│   │   ├── mlp.py              # Step 1 network
│   │   ├── transformer.py      # Step 2 network, attention from scratch
│   │   ├── bigram.py           # the baseline
│   │   └── registry.py         # name → class
│   ├── training/
│   │   ├── trainer.py          # the training loop (task-agnostic)
│   │   ├── tasks.py            # what the model is asked to do
│   │   ├── schedules.py        # cosine LR with warmup
│   │   └── metrics.py          # bit accuracy, exact-match accuracy
│   ├── evaluation/
│   │   ├── evaluator.py        # Step 1 scoring + error analysis
│   │   ├── lm_evaluator.py     # Step 2 bpc, samples, held-out arithmetic
│   │   └── text_metrics.py     # grammaticality, arithmetic grading
│   ├── inference/
│   │   ├── predictor.py        # checkpoint → prediction
│   │   ├── generator.py        # sampling: temperature, top-k, top-p
│   │   └── generate_cli.py     # the generation command line
│   └── utils/
│       ├── seed.py             # reproducibility
│       ├── logging_utils.py    # console output
│       ├── checkpoint.py       # save/load
│       └── weight_stats.py     # measuring how far weights moved
│
└── tests/                      # 124 tests
    ├── conftest.py
    ├── test_config.py
    ├── test_preprocessing.py
    ├── test_dataset.py
    ├── test_model.py
    ├── test_training.py
    ├── test_inference.py
    ├── test_tokenizer.py
    ├── test_text_dataset.py
    ├── test_transformer.py
    ├── test_generation.py
    ├── test_schedules.py
    └── test_tasks.py
```

### Where checkpoints are stored

`checkpoints/<run_name>/` — by default `checkpoints/bit_adder_mlp/`.

| File | What it is |
|---|---|
| `best.pt` | The weights from the epoch with the **lowest validation loss**. Use this one. |
| `last.pt` | The weights from the final epoch, plus optimizer state, for resuming. |
| `history.json` | Per-epoch losses and accuracies, plus the full config. |

Each `.pt` contains the model weights, the optimizer state, **the complete
config**, the epoch number and its metrics. Storing the config is what lets
`infer.py` rebuild the identical architecture before loading weights — weights
only make sense in the network they were trained in.

Checkpoints are **git-ignored**. They are regenerable in 5 seconds, and model
weights do not belong in a repository.

---

## Configuration

Everything lives in `configs/bit_adder_mlp.yaml`. Nothing that affects a result
is hard-coded.

```yaml
seed: 1337
data:
  n_bits: 4
  batch_size: 16
  split: { train: 0.70, val: 0.15, test: 0.15 }
model:
  name: mlp
  hidden_sizes: [64, 64]
  activation: tanh
training:
  epochs: 400
  learning_rate: 0.01
  optimizer: adam
  loss: bce_with_logits
```

Override from the command line with `--set key.path=value`. Unknown keys are
**rejected**, so `--set training.lerning_rate=0.1` raises an error instead of
silently doing nothing.

### Things worth trying

| Experiment | Command | What you should see |
|---|---|---|
| Remove the non-linearity's benefit | `--set model.hidden_sizes=[4]` | Accuracy collapses — too little capacity for carries |
| Use ReLU instead of tanh | `--set model.activation=relu` | Training loss → 0 but validation loss stalls: **overfitting**, visible live |
| Learning rate far too high | `--set training.learning_rate=1.0` | Loss bounces and refuses to settle |
| Learning rate far too low | `--set training.learning_rate=0.0001` | Loss crawls; 400 epochs is not enough |
| A different random start | `--set seed=7` | Different curve, same final result |
| Harder task | `--set data.n_bits=6` + regenerate dataset | 4,096 examples, 12-bit input |

Each takes seconds. Running these is the fastest way to build intuition for
what each hyperparameter actually does.

---

## Reproducibility

`seed: 1337` fixes Python's RNG, NumPy's, and PyTorch's — covering both weight
initialisation and data shuffling. Two runs of the same config produce
identical losses, and `tests/test_training.py` asserts it. Without this you can
never tell whether a change helped or you simply got lucky.

Corpus generation seeds each split from its index, not from `hash(split)`:
Python randomises string hashing per process, so the earlier code produced a
different corpus on every run despite the fixed seed. Only the generated
sentences varied — the train/val/test pair split was always deterministic, so
held-out pairs were never leaked. `tests/test_corpus_reproducible.py` runs
generation in two processes under different `PYTHONHASHSEED` values and
compares the bytes.

---

## What this model can and cannot do

**Can:**
- Add any two numbers in 0–15 and return the correct answer, with calibrated
  per-bit confidence
- Generalise to input pairs it never saw during training (100% on held-out data)
- Train from scratch in ~5 seconds on a laptop CPU
- Save, reload and run independently of the training code

**Cannot:**
- Handle numbers outside 0–15 (it raises a clear error rather than guessing) —
  the input layer is physically 8 bits wide
- Do subtraction, multiplication, or any other operation
- Process text, images, audio, or sequences of any kind
- Answer a question, hold a conversation, or generate anything
- Explain its reasoning, or do anything at all beyond the single task above

It is a proof that the *pipeline* is correct. That is Step 1's entire job.

---

## The Step 1 / Step 2 boundary

### Step 1 — done, working, verified

| Built | Status |
|---|---|
| Project structure, packaging, `.gitignore` | ✅ |
| Configuration system (YAML + validation + CLI overrides) | ✅ |
| Dataset generation with disjoint, on-disk splits | ✅ |
| Preprocessing with tested round-trip encode/decode | ✅ |
| Batching via `Dataset`/`DataLoader` | ✅ |
| A neural network (forward pass, weights, biases, activations) | ✅ |
| Loss, backpropagation, optimizer, weight updates | ✅ |
| Training loop with validation and early stopping | ✅ |
| Checkpoint saving and loading | ✅ |
| Reproducible seeding | ✅ |
| Evaluation with held-out test set and error analysis | ✅ |
| Inference, independent of the training code | ✅ |
| Model registry, so new architectures plug in | ✅ |
| 48 automated tests | ✅ |
| A model that measurably learns (0% → 100% exact-match) | ✅ |

### Step 2 — built (see below)

Step 1's seams held: Step 2 added a language model by writing a new dataset, a
new model class and a new task, and the trainer itself did not need to change.

---

# Step 2 — a character-level language model

Step 1 handled **fixed-size vectors → classification**. Step 2 generalises
every seam to **variable-length sequences → next-token prediction**, and adds a
decoder-only Transformer written from scratch — self-attention included, no
`nn.Transformer`.

## The corpus

Generated by us (`scripts/generate_corpus.py`), nothing downloaded. Its line
kinds, split policy and samples live in Supabase, table `ored_datasets`, read
through `ored.learning.SupabaseStore.datasets()`.

The sentences come from a fixed grammar. The arithmetic ties back to Step 1 —
but where Step 1 learned addition from bit vectors, Step 2 must learn it **as
text, one character at a time**, with no notion of a number.

## Results

| Measure | Uninformed | Bigram baseline | **Transformer** |
|---|---|---|---|
| Bits per character (val) | 5.36 | 2.56 | **0.607** |
| Parameters | — | 1,681 | 814,976 |

| Generated-text quality | Result |
|---|---|
| Well-formed lines | **92.9%** |
| Valid sentences | 24 / 56 |
| Spelling errors | 0 |
| **Arithmetic on held-out pairs** | **5.6%** (4.9% on re-run; fixed below) |

Training: 8 epochs, ~5 minutes on a laptop CPU.

### What worked

The **language structure was learned**. From nothing but characters, the model
learned to spell every word in the vocabulary correctly, to place articles and
adjectives in valid positions, to end lines with ` .` and a newline, and to use
plural verbs after "and". 92.9% of generated lines parse against the grammar.

Sample output:

```
the blue house hears the young bird .
finn hears the young dog .
dan and cora want the house .
11 + 17 = 21
iris gives the big box to hugo .
```

### What did not work — and why it matters

**The arithmetic failed: 5.6% on held-out pairs.** Look at the sample above —
`11 + 17 = 21` is wrong. The model writes sums in the right *format*, with a
plausible *magnitude*, and the wrong *answer*.

The diagnostic that explains it: accuracy on pairs the model **did** see during
training, ten times each, is **1.7%** — lower than on held-out pairs. So this
is not a generalisation failure. The model never fit the arithmetic at all.

That points at the cause. In the training corpus, sentences are ~83% of the
characters, and the genuinely unpredictable part of a sum (its answer digits)
is only ~3–4% of all tokens. Cross-entropy averages over every position
equally, so the optimiser buys far more loss reduction by perfecting sentences
than by learning to carry. The model is doing exactly what it was asked to do;
the objective simply does not care much about arithmetic.

A second, compounding reason: generating `35` left-to-right means emitting the
tens digit **first**, which requires already knowing the carry out of the units.
The model must compute the whole sum before writing a single character of it.

This is a real, reproducible finding rather than a bug, and it is the honest
Step 2 result: **the pipeline learns language structure well and arithmetic
badly.** Fixing it is the first piece of Step 3 work, not a patch to hide.

### The four hypotheses, measured

All four were run. Each changes one thing against the baseline, trains from
scratch, and is scored on **train pairs and held-out pairs separately** —
that pair of numbers is what separates underfitting from failure to
generalise.

| Run | Changed | val bits/char | Train-pair | Held-out |
|---|---|---|---|---|
| baseline | — | 0.6053 | 4.5% (30/673) | **4.9%** (7/144) |
| **H1 rebalance** | `arithmetic_repeats: 60`, `sentence_lines: 3000` | 0.7393 | 64.9% (437/673) | **72.9%** (105/144) |
| H2 more pairs | `max_operand: 50` | 0.6515 | 23.4% (426/1821) | **23.1%** (90/390) |
| **H3 capacity** | 6 layers, `d_model` 192, `d_ff` 768, 14 epochs | 0.5924 | 53.9% (363/673) | **60.4%** (87/144) |
| H4 reversed digits | `reverse_answer: true` | 0.6037 | 4.3% (29/673) | **4.9%** (7/144) |

**Read the bits/char column with care.** Each row generates its own corpus, so
the validation text differs between rows and the numbers are not racing each
other. Held-out accuracy *is* comparable for baseline/H1/H3/H4 — same pair
split, same seed. H2 changes `max_operand`, so its pairs are a different
population.

Reproduce any row:

```bash
python scripts/generate_corpus.py --force --set data.corpus.dir=data/raw/corpus_h1 \
    --set data.corpus.arithmetic_repeats=60 --set data.corpus.sentence_lines=3000
python scripts/train.py --config configs/char_transformer.yaml --set run_name=h1 \
    --set data.corpus.dir=data/raw/corpus_h1 \
    --set data.corpus.arithmetic_repeats=60 --set data.corpus.sentence_lines=3000
python scripts/evaluate.py --checkpoint checkpoints/h1/best.pt
```

**H1 works best: 4.9% → 72.9%.** Sums become 40,380 of 43,380 lines, so the
answer digits finally carry weight in the loss. Well-formed line rate *rose*
to 97.8% on a quarter as many sentences, so the language did not pay for it.

**H3 works too: 60.4%** — with the corpus untouched. That refutes the
single-cause story in the section above: if loss weighting were the whole
explanation, more capacity could not have helped. The baseline was also
capacity- and epoch-starved. This run changes two things at once (model size
*and* 14 epochs vs 8), so it does not separate them. Separated below, neither
change does anything on its own: the gain needs both together.

**H2 helps moderately: 23.1%**, and its pairs run to `50 + 50 = 100`, a harder
three-digit population than the other rows. Train-pair 23.4% versus held-out
23.1% means it is still underfitting: more evidence for the rule does not help
a model that is not fitting the rule.

**H4 alone does nothing: 4.9%, identical to the baseline.** Reversed digits fix
the order of writing — you cannot emit the tens digit before you know the
carry — but that only binds once a model is trying to compute the sum. The
baseline is not: it answers `33` to everything (`2 + 18 = 33`, `10 + 13 = 33`,
`5 + 19 = 33`). H4 does the same in mirror image (`2 + 18 = 63`, `10 + 13 =
03`). Fixing the write order of a computation that never happens buys nothing.

Every run that *does* learn fails the same way on what is left: the units digit
is right and the tens digit is off by exactly the carry — H1 gives
`2 + 18 = 40`, H3 gives `5 + 19 = 35`. H4 is aimed at precisely that residue,
so the untested question is whether it helps **on top of** H1, not instead of
it.

### The follow-up runs, measured

The three open questions above were run. Every row trains from scratch and is
scored on train pairs and held-out pairs separately, with greedy (argmax)
decoding, so scoring itself is deterministic.

| Run | Changed | val bits/char | Train-pair | Held-out |
|---|---|---|---|---|
| baseline | — | 0.6053 | 4.5% (30/673) | 4.9% (7/144) |
| H1 at 16 epochs | `arithmetic_repeats: 60`, `sentence_lines: 3000` | 0.7194 | 77.0% (518/673) | **81.9%** (118/144) |
| H1 + H4 | H1, plus `reverse_answer: true` | 0.7192 | 70.0% (471/673) | **78.5%** (113/144) |
| **H1 + H2 + H4** | H1, plus `max_operand: 50`, `reverse_answer: true` | 0.8273 | 83.1% (1514/1821) | **83.1%** (324/390) |
| epochs only | 14 epochs, baseline model and corpus | 0.5989 | 4.9% (33/673) | **1.4%** (2/144) |
| capacity only | 6 layers, `d_model` 192, `d_ff` 768, 8 epochs | 0.5993 | 5.8% (39/673) | **4.9%** (7/144) |
| H3 re-run | capacity *and* 14 epochs | 0.5915 | 53.3% (359/673) | **49.3%** (71/144) |

#### Capacity and epochs only work together

H3 changed two things at once. Separated, neither does anything on its own:
14 epochs at baseline capacity scores 1.4%, and the larger model at 8 epochs
scores 4.9% — both indistinguishable from the 4.9% baseline. Together they
score 49.3%. The gain is an interaction, not a main effect of either, so the
earlier reading that "the baseline was capacity- and epoch-starved" is right
only in the sense that it was starved of *both at once*.

Note also that the epochs-only and capacity-only runs land at almost identical
bits/char (0.5989 and 0.5993) while H3's arithmetic is ten times higher at a
bits/char of 0.5915. **Bits per character barely predicts whether the model
learned to add.** It is dominated by sentence characters; answer digits are a
few percent of the tokens.

#### More epochs are not what fixed H1

H1 at a 16-epoch budget reaches 81.9% held out, up from 72.9%. But it stopped
early at epoch 12 and its best checkpoint is **epoch 8** — the same epoch count
as the original run. Training longer is therefore not the cause. Train loss
kept falling while validation loss flattened after epoch 8, which is mild
overfitting rather than continued learning.

What differs is the **cosine learning-rate schedule**, which is stretched over
the whole epoch budget. Under a 16-epoch budget the learning rate at epoch 8 is
still well above its floor, and that trajectory reaches a better model than an
8-epoch cosine that has already annealed. The earlier claim that 72.9% was "a
floor" because H1 was still improving at 8/8 does not hold: on validation loss
H1 plateaus at epoch 8.

#### H4 does not help on top of H1

This was the open question, and the answer is no. Compared at the same operand
range, the same epoch budget and the same everything else, adding reversed
answer digits to H1 scores **78.5% against H1's 81.9%** held out, and 70.0%
against 77.0% on train pairs. Reversing the write order does not fix the carry
residue once a model is already computing the sum.

The combined H1 + H2 + H4 run scores 83.1%, but that is **not** a like-for-like
win over H1's 81.9%: it uses `max_operand: 50`, so it is scored on a different
and harder pair population whose answers run to three digits. Its edge comes
from H2 supplying more operand pairs, not from H4. Measured honestly:
**the combination does not beat H1 alone.**

Its one unambiguous result is that train-pair and held-out accuracy are equal
(83.1% and 83.1%). Whatever it learned, it generalises perfectly to pairs it
never read.

#### Three seeds, and how much a single run is worth

The best configuration was re-run on three seeds. Changing the seed regenerates
the corpus as well as the weights, so each row is a full replication of the
procedure — a fresh operand split *and* a fresh initialisation, not just a
re-roll of the weights.

| Seed | Train-pair | Held-out |
|---|---|---|
| 1337 | 83.1% (1514/1821) | 83.1% (324/390) |
| 7 | 81.0% (1475/1821) | 80.8% (315/390) |
| 2024 | 90.3% (1645/1821) | 89.0% (347/390) |
| **mean** | **84.8%** | **84.3%** (sd 4.2) |

Held-out accuracy ranges from 80.8% to 89.0% — an **8.2-point spread** from
nothing but the seed.

A second measurement points the same way. Re-running H3 under its own config
and its own seed reproduced its bits/char (0.5924 → 0.5915) and its train-pair
accuracy (53.9% → 53.3%) almost exactly, but its held-out accuracy came out
**49.3% against the 60.4% recorded above** — 71 correct pairs instead of 87.
`set_seed` seeds Python, NumPy and Torch, but it does not call
`torch.use_deterministic_algorithms()` and does not pin the thread count, and
CPU float reductions change order with the number of threads. That is enough to
move a 144-pair score by eleven points.

So: **a single held-out number in this project carries an error bar of roughly
±10 points**, and the held-out sets are small enough (144 and 390 pairs) that
one pair is 0.7% or 0.26%. Differences smaller than that band — including the
81.9% versus 78.5% gap above — are not evidence of anything. The H4 conclusion
is stated as "no benefit" rather than "harmful" for exactly this reason.

### Still not measured

- **Whether H2 alone, at 16 epochs, matches the combined run.** H2 is the part
  of the combination that appears to be carrying it, and it has not been
  isolated at the longer budget.
- **Seeds for every other row.** Only the combined configuration has three.
- **A deterministic training path.** Until `set_seed` pins thread count and
  deterministic algorithms, re-running a row is not guaranteed to reproduce it.

## Running Step 2

```bash
python scripts/generate_corpus.py
python scripts/train.py --config configs/char_transformer.yaml
python scripts/evaluate.py --checkpoint checkpoints/char_transformer/best.pt

python scripts/generate.py --prompt "the "
python scripts/generate.py --complete "17 + 9 = "
python scripts/generate.py --arithmetic
python scripts/generate.py --temperature 1.2 --top-k 10 --tokens 600
```

The baseline, for comparison:

```bash
python scripts/train.py --config configs/char_bigram.yaml
```

## How the Transformer works

```
ids            (B, T)              token ids
  |  token embedding + position embedding
x              (B, T, 128)
  |  4 x TransformerBlock
x              (B, T, 128)
  |  LayerNorm + linear head
logits         (B, T, vocab_size)  one score per possible next character,
                                   at every position
```

**Query, Key, Value.** Each token produces three vectors: a query ("what am I
looking for"), a key ("what do I contain") and a value ("what I pass on").
Position `i` compares its query against every earlier key by dot product,
softmaxes those scores into weights that sum to 1, and outputs the weighted
average of the values. Attention is a **content-addressed lookup**, learned
rather than programmed.

**Scaling by √d_head.** A dot product of `d_head` random numbers grows with
`d_head`. Unscaled, scores get large, softmax saturates into a spike, and its
gradient nearly vanishes — learning stalls.

**Causal masking is the whole game.** The model predicts the next token at
*every* position at once. If position 5 could see position 6 it would read the
answer off its own input: training loss would collapse and the model would
generate nonsense, because at generation time the future does not exist. Scores
at `j > i` are set to `-inf` before the softmax, making their weight exactly
zero. `tests/test_transformer.py` verifies this numerically — change a token at
position *t*, and every output before *t* must be bit-identical.

**Residuals and pre-norm.** `x = x + sublayer(x)` means each block learns a
*correction*, giving gradients a direct path backwards. LayerNorm goes *before*
the sublayer, leaving the residual path clean.

**One window = many training signals.** Input and target are the same tokens
shifted by one, so a 128-token window is 128 separate prediction problems
solved in one forward pass.

## Step 2 / Step 3 boundary

### Step 2 — built and working

| Built | Status |
|---|---|
| Corpus generator with disjoint operand splits | ✅ |
| Character tokenizer, registry, exact round-trip, saved in checkpoints | ✅ |
| Sequence dataset with shift-by-one targets, stride windows | ✅ |
| Decoder-only Transformer written from scratch | ✅ |
| Causal masking, verified numerically | ✅ |
| Bigram baseline for comparison | ✅ |
| `Task` abstraction — one trainer serves both steps | ✅ |
| Cosine LR schedule with warmup | ✅ |
| Resume from checkpoint (weights + optimizer state) | ✅ |
| Sampling: temperature, top-k, top-p, greedy | ✅ |
| Grammar, spelling and arithmetic metrics | ✅ |
| CI workflow | ✅ |
| 124 tests | ✅ |
| Language structure learned (0.607 bpc, 92.9% well-formed) | ✅ |
| Arithmetic learned | ⚠️ **4.9% baseline → 84.3% rebalanced** (3 seeds, sd 4.2) |

### Step 3 — not built

1. **Finish the arithmetic.** The best measured configuration reaches 84.3%
   held out across three seeds. H4 was ruled out as a contributor; H2 is the
   part that has not been isolated at a long epoch budget.
2. **Subword tokenization (BPE)** — the tokenizer interface is ready for it.
3. **Real text** — a larger corpus that does not fit in memory, streaming, and
   caching in `data/processed/`.
4. **Evaluation during training** — sample and score every N epochs, so quality
   is visible on the loss curve rather than only at the end.
5. **Efficiency** — gradient accumulation, mixed precision, `torch.compile`.
6. **KV caching for generation** — right now every new token re-runs the whole
   context, which is O(n²) work for O(n) output.

---

## Supabase — Ored's own project

Ored runs against its own Supabase project, separate from any other site. Nothing
here reads a table belonging to another product, and the only schema outside
`public` that Ored's tables reference is `auth`.

### Environment

| Variable | Used by | Secret |
|---|---|---|
| `ORED_SB_URL` | trainer, exporter, checkpoint CLI, serving | no |
| `ORED_SB_SERVICE_KEY` | trainer, exporter, checkpoint CLI, serving | **yes — server only** |
| `ORED_SB_CHECKPOINT_BUCKET` | checkpoint storage, default `ored-checkpoints` | no |
| `ORED_API_URL` | the web backend, pointing at `scripts/serve.py` | no |
| `ORED_API_KEY` | the web backend and the serving process | **yes — server only** |

The browser never sees any of these. The Ored page reads `ored/config.js`, which
carries only the project URL and the publishable key.

### Tables

`ored_staff`, `ored_conversations`, `ored_messages`, `ored_learning_candidates`,
`ored_training_examples`, `ored_training_sessions`, `ored_model_versions`,
`ored_datasets`, `ored_checkpoints`, `ored_rate_hits`.

Row level security is on for every one of them. A signed-in member reads and
writes only their own conversations and messages. The training tables are
readable by a row in `ored_staff` and writable by nothing but the service key.
`anon` holds no grant on any table.

### Checkpoints

Local checkpoints under `checkpoints/` stay the working copy, but they are not
where a checkpoint lives. `ored_checkpoints` records every stored artefact and
the bytes go to the private `ored-checkpoints` bucket, which has no storage
policy for `anon` or `authenticated`: only the service key can read or write it.

```bash
python scripts/checkpoints.py push checkpoints/char_transformer/best.pt --kind best --run-name char_transformer
python scripts/checkpoints.py pull checkpoints/char_transformer/best.pt --kind best --run-name char_transformer
python scripts/checkpoints.py list
```

Every push records the size and a sha256, and `pull` refuses a file whose digest
does not match what was recorded. `serve.py --remote-checkpoints` pulls the live
checkpoint on boot when there is no local one and pushes it on every save, so a
restart on a fresh machine does not lose what the model learned online.

## Code style — no comments, no docstrings

**Do not add comments or docstrings to this code.** Not to new code, not to
code you are editing, not "just this once, it is subtle". The rule has no
exceptions, and it is a deliberate choice rather than an oversight:

- An explanation sitting next to code is written once and then rots. Nobody
  updates it when the code changes, so it quietly turns into a confident lie.
- Explanations belong here, in the README, where they can be written as prose,
  with diagrams and measured numbers, and where a reader who wants to
  understand the project will actually look for them.
- Code that needs a comment to be followed usually needs a better name or a
  smaller function instead. Banning the comment forces that fix.

So the code carries none. Every file in `src/`, `scripts/` and `tests/` is
written to be read on its own: explicit names, small functions, no cleverness.
If something genuinely needs explaining, explain it in this README and name
the file it applies to.

Check it at any time:

```bash
python - <<'PY'
import ast, io, subprocess, tokenize

files = subprocess.check_output(["git", "ls-files", "*.py"], text=True).split()
comments = docstrings = 0
for path in files:
    source = open(path, encoding="utf-8").read()
    comments += sum(1 for token in tokenize.generate_tokens(io.StringIO(source).readline)
                    if token.type == tokenize.COMMENT)
    docstrings += sum(
        1 for node in ast.walk(ast.parse(source))
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
        and ast.get_docstring(node) is not None
    )
print(f"{len(files)} files: comments={comments} docstrings={docstrings}")
PY
```

Measured on the current tree: **56 files, 0 comments, 0 docstrings.**

---

## Principles

1. **No pretrained weights, no external AI APIs.** PyTorch provides tensors,
   autograd and optimizers — mathematics, not knowledge. Every number in every
   checkpoint here was produced by our own training loop on our own data.
2. **Nothing hidden behind abstractions.** The training loop is a readable
   `for` loop. You can put a breakpoint anywhere and inspect real tensors.
3. **The code carries no comments and no docstrings, ever.** Explanations
   live here, in the README, where they can be read as prose and kept true.
   This is a rule for anyone touching the code, not a description of how it
   happens to look today — see *Code style* above.
4. **Honest measurement.** Held-out data, disjoint splits enforced on disk, a
   metric that is unforgiving (all 5 bits or nothing), and mistakes printed
   rather than hidden behind an average.

---

## License

MIT
