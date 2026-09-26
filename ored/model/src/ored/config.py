from __future__ import annotations

import ast
import copy
from dataclasses import asdict, dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any, Dict, List, Sequence, get_type_hints

import yaml


@dataclass
class SplitConfig:

    train: float = 0.70
    val: float = 0.15
    test: float = 0.15

    def validate(self) -> None:
        total = self.train + self.val + self.test
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"data.split fractions must sum to 1.0, got {total}")
        for name in ("train", "val", "test"):
            if getattr(self, name) <= 0:
                raise ValueError(f"data.split.{name} must be > 0")


@dataclass
class CorpusConfig:

    dir: str = "data/raw/corpus"

    sentence_lines: int = 12000

    max_operand: int = 30

    arithmetic_repeats: int = 10

    reverse_answer: bool = False

    pair_split: SplitConfig = field(default_factory=SplitConfig)

    val_test_fraction: float = 0.15

    def validate(self) -> None:
        if self.sentence_lines < 1:
            raise ValueError("data.corpus.sentence_lines must be >= 1")
        if self.max_operand < 1:
            raise ValueError("data.corpus.max_operand must be >= 1")
        if self.arithmetic_repeats < 1:
            raise ValueError("data.corpus.arithmetic_repeats must be >= 1")
        if not 0 < self.val_test_fraction < 1:
            raise ValueError("data.corpus.val_test_fraction must be in (0, 1)")
        self.pair_split.validate()


@dataclass
class SupabaseDataConfig:

    dataset_tag: str = ""

    types: List[str] = field(default_factory=list)
    categories: List[str] = field(default_factory=list)
    subjects: List[str] = field(default_factory=list)
    languages: List[str] = field(default_factory=list)

    include_unverified: bool = False

    split_seed: int = 1337

    snapshot: str = ""

    snapshot_dir: str = "data/snapshots"

    on_invalid: str = "fail"

    notes: str = ""

    def validate(self) -> None:
        if self.on_invalid not in ("fail", "skip"):
            raise ValueError("data.supabase.on_invalid must be fail (stop on a bad row) or skip")
        if self.snapshot and not (12 <= len(self.snapshot) <= 64
                                  and all(c in "0123456789abcdef" for c in self.snapshot)):
            raise ValueError("data.supabase.snapshot must be a snapshot hash (at least 12 hex characters)")
        for name in ("types", "categories", "subjects", "languages"):
            if not isinstance(getattr(self, name), list):
                raise ValueError(f"data.supabase.{name} must be a list")


DATA_SOURCES = ("generated", "supabase")


@dataclass
class DataConfig:
    split: SplitConfig = field(default_factory=SplitConfig)
    batch_size: int = 16
    shuffle_train: bool = True

    n_bits: int = 4
    raw_path: str = "data/raw/bit_addition.csv"

    corpus: CorpusConfig = field(default_factory=CorpusConfig)

    block_size: int = 128

    tokenizer: str = "char"

    stride: int = 64

    source: str = "generated"

    supabase: SupabaseDataConfig = field(default_factory=SupabaseDataConfig)

    def validate(self) -> None:
        if self.source not in DATA_SOURCES:
            raise ValueError(f"data.source must be one of {', '.join(DATA_SOURCES)}")
        if self.source == "supabase" and not self.supabase.dataset_tag:
            raise ValueError("data.source is supabase, so data.supabase.dataset_tag must name the "
                             "dataset (a tag, or 'all' for every row)")
        self.supabase.validate()
        if self.n_bits < 1:
            raise ValueError("data.n_bits must be >= 1")
        if self.batch_size < 1:
            raise ValueError("data.batch_size must be >= 1")
        if self.block_size < 2:
            raise ValueError("data.block_size must be >= 2")
        if self.stride < 1:
            raise ValueError("data.stride must be >= 1")
        self.split.validate()
        self.corpus.validate()

    @property
    def input_size(self) -> int:
        return 2 * self.n_bits

    @property
    def output_size(self) -> int:
        return self.n_bits + 1


@dataclass
class ModelConfig:
    name: str = "mlp"

    dropout: float = 0.0

    hidden_sizes: List[int] = field(default_factory=lambda: [32, 32])
    activation: str = "relu"

    d_model: int = 128
    n_layer: int = 4
    n_head: int = 4
    d_ff: int = 512
    tie_weights: bool = True

    def validate(self) -> None:
        if not 0.0 <= self.dropout < 1.0:
            raise ValueError("model.dropout must be in [0, 1)")

        if self.name.lower() == "mlp":
            if not self.hidden_sizes:
                raise ValueError(
                    "model.hidden_sizes must contain at least one layer -- with no "
                    "hidden layer the network is a single linear map and cannot "
                    "learn carry propagation."
                )
            if any(h < 1 for h in self.hidden_sizes):
                raise ValueError("every entry of model.hidden_sizes must be >= 1")

        if self.name.lower() == "transformer":
            if self.d_model < 1 or self.n_layer < 1 or self.n_head < 1:
                raise ValueError("transformer d_model / n_layer / n_head must be >= 1")
            if self.d_model % self.n_head != 0:
                raise ValueError(
                    f"model.d_model ({self.d_model}) must divide evenly into "
                    f"model.n_head ({self.n_head}): each head gets d_model/n_head "
                    f"dimensions to work in."
                )


@dataclass
class TrainingConfig:
    epochs: int = 200
    learning_rate: float = 0.01
    optimizer: str = "adam"
    weight_decay: float = 0.0
    loss: str = "bce_with_logits"
    grad_clip: float = 1.0
    early_stopping_patience: int = 40
    log_every: int = 10
    device: str = "auto"

    scheduler: str = "none"
    warmup_steps: int = 0
    min_lr_ratio: float = 0.1

    resume: str = ""

    def validate(self) -> None:
        if self.epochs < 1:
            raise ValueError("training.epochs must be >= 1")
        if self.learning_rate <= 0:
            raise ValueError("training.learning_rate must be > 0")
        if self.log_every < 1:
            raise ValueError("training.log_every must be >= 1")
        if self.device not in ("auto", "cpu", "cuda"):
            raise ValueError("training.device must be one of: auto, cpu, cuda")
        if self.scheduler not in ("none", "cosine"):
            raise ValueError("training.scheduler must be one of: none, cosine")
        if self.warmup_steps < 0:
            raise ValueError("training.warmup_steps must be >= 0")
        if not 0.0 <= self.min_lr_ratio <= 1.0:
            raise ValueError("training.min_lr_ratio must be in [0, 1]")


@dataclass
class GenerationConfig:

    max_new_tokens: int = 300

    temperature: float = 0.8

    top_k: int = 0

    top_p: float = 0.0

    prompt: str = ""

    def validate(self) -> None:
        if self.max_new_tokens < 1:
            raise ValueError("generation.max_new_tokens must be >= 1")
        if self.temperature <= 0:
            raise ValueError("generation.temperature must be > 0")
        if self.top_k < 0:
            raise ValueError("generation.top_k must be >= 0")
        if not 0.0 <= self.top_p <= 1.0:
            raise ValueError("generation.top_p must be in [0, 1]")


@dataclass
class CheckpointConfig:

    best_metric: str = "val_loss"
    best_mode: str = "min"

    save_base: bool = True

    save_live_every_epochs: int = 1
    save_live_every_steps: int = 0

    keep_history: bool = False
    save_history_every_epochs: int = 1
    save_history_every_steps: int = 0

    export_on_finish: bool = False

    upload: bool = False
    keep_superseded_live: bool = False

    def validate(self) -> None:
        if self.best_mode not in ("min", "max"):
            raise ValueError("checkpoint.best_mode must be 'min' (lower is better) or 'max'")
        if not self.best_metric:
            raise ValueError("checkpoint.best_metric must name a metric, e.g. val_loss")
        for name in ("save_live_every_epochs", "save_live_every_steps",
                     "save_history_every_epochs", "save_history_every_steps"):
            if getattr(self, name) < 0:
                raise ValueError(f"checkpoint.{name} must be >= 0 (0 = off)")
        if self.keep_history and not (self.save_history_every_epochs or self.save_history_every_steps):
            raise ValueError(
                "checkpoint.keep_history is on but no interval is set: set "
                "save_history_every_epochs or save_history_every_steps"
            )


@dataclass
class DistributedConfig:

    enabled: bool = False
    backend: str = "gloo"
    nnodes: str = "1"
    nproc_per_node: int = 1
    rendezvous_backend: str = "c10d"
    master_port: int = 29500
    timeout_seconds: int = 900
    max_restarts: int = 0
    batch_size_mode: str = "per_worker"
    heartbeat_seconds: int = 30
    report_to_supabase: bool = False

    def validate(self) -> None:
        if self.backend not in ("gloo", "nccl"):
            raise ValueError("distributed.backend must be gloo (any OS, CPU or GPU) or nccl (Linux + NVIDIA GPUs)")
        if self.rendezvous_backend not in ("c10d", "static"):
            raise ValueError("distributed.rendezvous_backend must be c10d or static")
        parts = str(self.nnodes).split(":")
        if len(parts) > 2 or not all(p.isdigit() and int(p) >= 1 for p in parts):
            raise ValueError("distributed.nnodes must be a count like 3, or MIN:MAX like 2:5")
        if len(parts) == 2 and int(parts[0]) > int(parts[1]):
            raise ValueError("distributed.nnodes MIN:MAX needs MIN <= MAX")
        if self.nproc_per_node < 1:
            raise ValueError("distributed.nproc_per_node must be >= 1")
        if not 1 <= self.master_port <= 65535:
            raise ValueError("distributed.master_port must be a TCP port")
        if self.timeout_seconds < 30:
            raise ValueError("distributed.timeout_seconds must be >= 30")
        if self.batch_size_mode not in ("per_worker", "global"):
            raise ValueError("distributed.batch_size_mode must be per_worker or global")
        if self.heartbeat_seconds < 5:
            raise ValueError("distributed.heartbeat_seconds must be >= 5")


@dataclass
class PathsConfig:
    checkpoint_dir: str = "checkpoints"


@dataclass
class Config:

    run_name: str = "bit_adder_mlp"

    task: str = "bit_addition"

    seed: int = 1337
    deterministic: bool = True
    data: DataConfig = field(default_factory=DataConfig)
    model: ModelConfig = field(default_factory=ModelConfig)
    training: TrainingConfig = field(default_factory=TrainingConfig)
    generation: GenerationConfig = field(default_factory=GenerationConfig)
    checkpoint: CheckpointConfig = field(default_factory=CheckpointConfig)
    distributed: DistributedConfig = field(default_factory=DistributedConfig)
    paths: PathsConfig = field(default_factory=PathsConfig)

    def validate(self) -> "Config":
        if self.data.source == "supabase" and self.task != "language_model":
            raise ValueError("data.source: supabase feeds the language_model task only")
        self.data.validate()
        self.model.validate()
        self.training.validate()
        self.generation.validate()
        self.checkpoint.validate()
        self.distributed.validate()
        return self

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @property
    def checkpoint_dir(self) -> Path:
        return Path(self.paths.checkpoint_dir) / self.run_name

    def pretty(self) -> str:
        return yaml.safe_dump(self.to_dict(), sort_keys=False, default_flow_style=False)


def _from_dict(cls: type, data: Dict[str, Any], path: str = "") -> Any:
    if not is_dataclass(cls):
        return data
    if not isinstance(data, dict):
        raise TypeError(f"expected a mapping at '{path or 'root'}', got {type(data).__name__}")

    known = {f.name: f for f in fields(cls)}
    unknown = set(data) - set(known)
    if unknown:
        where = path or "root"
        raise ValueError(
            f"unknown configuration key(s) {sorted(unknown)} at '{where}'. "
            f"Valid keys here: {sorted(known)}"
        )

    hints = get_type_hints(cls)

    kwargs: Dict[str, Any] = {}
    for name in known:
        if name not in data:
            continue
        value = data[name]
        child_path = f"{path}.{name}" if path else name
        field_type = hints.get(name)
        if isinstance(field_type, type) and is_dataclass(field_type):
            kwargs[name] = _from_dict(field_type, value, child_path)
        else:
            kwargs[name] = value
    return cls(**kwargs)


def _coerce(value: str) -> Any:
    lowered = value.strip().lower()
    if lowered in ("true", "yes", "on"):
        return True
    if lowered in ("false", "no", "off"):
        return False
    if lowered in ("none", "null"):
        return None
    try:
        return ast.literal_eval(value)
    except (ValueError, SyntaxError):
        return value


def _apply_override(cfg: Config, assignment: str) -> None:
    if "=" not in assignment:
        raise ValueError(f"override must look like key.path=value, got: {assignment!r}")
    dotted, raw_value = assignment.split("=", 1)
    parts = [p for p in dotted.strip().split(".") if p]
    if not parts:
        raise ValueError(f"empty key in override: {assignment!r}")

    target: Any = cfg
    for part in parts[:-1]:
        if not hasattr(target, part):
            raise ValueError(f"unknown config section '{part}' in override {assignment!r}")
        target = getattr(target, part)

    leaf = parts[-1]
    if not hasattr(target, leaf):
        raise ValueError(f"unknown config key '{dotted}' in override {assignment!r}")
    setattr(target, leaf, _coerce(raw_value))


def load_config(
    path: str | Path,
    overrides: Sequence[str] | None = None,
) -> Config:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(
            f"config file not found: {path}\n"
            f"Available configs: {sorted(p.name for p in Path('configs').glob('*.yaml'))}"
        )
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}

    cfg = _from_dict(Config, raw)
    for assignment in overrides or []:
        _apply_override(cfg, assignment)
    return cfg.validate()


def config_from_dict(data: Dict[str, Any]) -> Config:
    return _from_dict(Config, copy.deepcopy(data)).validate()
