# Ored.ai

An AI built from scratch — no pretrained models, no external AI APIs, no
borrowed weights. Everything this model knows, it learned from data we
generated ourselves, using a training loop we wrote ourselves.

> **This repository started completely empty.** No source code, no folders, no
> configuration, no dataset, no model, no ML framework, no training pipeline.
> Everything below was built from zero.

---

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
understand language, and it has no knowledge of the world. It is a 5,061-number
network that has learned exactly one thing. Saying so plainly is the point:
Step 1's value is the *infrastructure*, proven correct by a task small enough
to verify by hand.

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

48 tests covering encoding round-trips, split disjointness, gradient flow,
loss decrease, checkpoint reloading and reproducibility.

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
self.optimizer.zero_grad(set_to_none=True)   # forget the previous batch's gradients
logits = self.model(inputs)                  # FORWARD PASS  → a prediction
loss = self.criterion(logits, targets)       # LOSS          → one number: how wrong
loss.backward()                              # BACKPROP      → slope for every weight
self.optimizer.step()                        # UPDATE        → nudge each weight downhill
```

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
├── scripts/                    # thin CLI entry points
│   ├── _bootstrap.py           # lets scripts run without `pip install`
│   ├── generate_dataset.py
│   ├── train.py
│   ├── evaluate.py
│   ├── infer.py
│   └── explain_backprop.py     # the maths, by hand, verified
│
├── src/ored/
│   ├── config.py               # YAML → validated dataclasses, CLI overrides
│   ├── data/
│   │   ├── generate.py         # builds the dataset + assigns splits
│   │   ├── preprocessing.py    # int ↔ bit-vector encoding
│   │   └── dataset.py          # Dataset + DataLoader (batching)
│   ├── models/
│   │   ├── base.py             # the interface every model implements
│   │   ├── mlp.py              # the network
│   │   └── registry.py         # name → class, so Step 2 just registers more
│   ├── training/
│   │   ├── trainer.py          # the training loop
│   │   └── metrics.py          # bit accuracy, exact-match accuracy
│   ├── evaluation/
│   │   └── evaluator.py        # held-out scoring + error analysis
│   ├── inference/
│   │   └── predictor.py        # checkpoint → prediction (no trainer imports)
│   └── utils/
│       ├── seed.py             # reproducibility
│       ├── logging_utils.py    # console output
│       ├── checkpoint.py       # save/load
│       └── weight_stats.py     # measuring how far weights moved
│
└── tests/                      # 48 tests
    ├── conftest.py
    ├── test_config.py
    ├── test_preprocessing.py
    ├── test_dataset.py
    ├── test_model.py
    ├── test_training.py
    └── test_inference.py
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

### Step 2 — not built yet

Deliberately out of scope. The seams are ready for each of these:

1. **Sequences instead of fixed-size vectors.** Every real AI task — text,
   audio, time series — has variable length. This means padding, masking, and a
   model that processes one step at a time. The current `Dataset` returns fixed
   `(8,)` vectors; that is the first thing to generalise.
2. **A tokenizer.** Before a model can read text it needs a vocabulary:
   characters first (simple, ~100 symbols), then subwords. This is a new
   `src/ored/data/tokenizer.py` and the reason `data/processed/` exists.
3. **A character-level language model.** Start with an RNN or a small
   Transformer trained on a plain text file to predict the next character.
   Register it in `models/registry.py` — the trainer will not need to change.
4. **Generation.** Language models do not classify, they sample. This means
   temperature, top-k sampling, and a generation loop in `inference/`.
5. **Real training infrastructure.** Learning-rate schedules, gradient
   accumulation, mixed precision, resuming from `last.pt`, and TensorBoard
   or Weights & Biases logging.
6. **Larger datasets.** Streaming data that does not fit in memory, proper
   caching in `data/processed/`, and dataset versioning.
7. **CI.** Run `pytest` on every push, so a refactor cannot silently break the
   pipeline.

**What deliberately stays the same:** the config system, the model registry,
the checkpoint format, the seeding, the train/validate/checkpoint loop, and the
separation between training and inference. Those were the point of Step 1 —
Step 2 should be able to add a language model by writing a new dataset and a
new model class, and touching almost nothing else.

---

## Principles

1. **No pretrained weights, no external AI APIs.** PyTorch provides tensors,
   autograd and optimizers — mathematics, not knowledge. Every number in every
   checkpoint here was produced by our own training loop on our own data.
2. **Nothing hidden behind abstractions.** The training loop is a readable
   `for` loop. You can put a breakpoint anywhere and inspect real tensors.
3. **Comments explain *why*, not *what*.** `optimizer.zero_grad()` is obvious;
   *why gradients accumulate by default and what breaks without that line* is
   not, so that is what the comment says.
4. **Honest measurement.** Held-out data, disjoint splits enforced on disk, a
   metric that is unforgiving (all 5 bits or nothing), and mistakes printed
   rather than hidden behind an average.

---

## License

MIT
