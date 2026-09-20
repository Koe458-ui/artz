"""Configuration system.

Why a config system at all?
---------------------------
A neural network is defined by a few dozen numbers (layer widths, learning
rate, batch size, seed...). If those numbers are scattered through the source
code, you cannot answer "what exactly produced this checkpoint?". Here every
knob lives in a YAML file, the whole config is saved *inside* each checkpoint,
and any value can be overridden from the command line.

Usage
-----
    cfg = load_config("configs/bit_adder_mlp.yaml")
    cfg = load_config("configs/bit_adder_mlp.yaml",
                      overrides=["training.epochs=50"])
    print(cfg.training.learning_rate)
"""

from __future__ import annotations

import ast
import copy
from dataclasses import asdict, dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any, Dict, List, Sequence, get_type_hints

import yaml

# ---------------------------------------------------------------------------
# The config schema, expressed as dataclasses.
#
# Using dataclasses instead of raw dictionaries means a typo like
# `training.lerning_rate` raises an error at load time instead of silently
# doing nothing.
# ---------------------------------------------------------------------------


@dataclass
class SplitConfig:
    """Fractions of the dataset used for training / validation / testing."""

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
class DataConfig:
    n_bits: int = 4
    raw_path: str = "data/raw/bit_addition.csv"
    split: SplitConfig = field(default_factory=SplitConfig)
    batch_size: int = 16
    shuffle_train: bool = True

    def validate(self) -> None:
        if self.n_bits < 1:
            raise ValueError("data.n_bits must be >= 1")
        if self.batch_size < 1:
            raise ValueError("data.batch_size must be >= 1")
        self.split.validate()

    # Derived quantities -- computed, never configured, so they can never
    # disagree with n_bits.
    @property
    def input_size(self) -> int:
        """Two numbers of n_bits each are concatenated into one input vector."""
        return 2 * self.n_bits

    @property
    def output_size(self) -> int:
        """Their sum needs one extra bit for the final carry."""
        return self.n_bits + 1


@dataclass
class ModelConfig:
    name: str = "mlp"
    hidden_sizes: List[int] = field(default_factory=lambda: [32, 32])
    activation: str = "relu"
    dropout: float = 0.0

    def validate(self) -> None:
        if not self.hidden_sizes:
            raise ValueError(
                "model.hidden_sizes must contain at least one layer -- with no "
                "hidden layer the network is a single linear map and cannot "
                "learn carry propagation."
            )
        if any(h < 1 for h in self.hidden_sizes):
            raise ValueError("every entry of model.hidden_sizes must be >= 1")
        if not 0.0 <= self.dropout < 1.0:
            raise ValueError("model.dropout must be in [0, 1)")


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

    def validate(self) -> None:
        if self.epochs < 1:
            raise ValueError("training.epochs must be >= 1")
        if self.learning_rate <= 0:
            raise ValueError("training.learning_rate must be > 0")
        if self.log_every < 1:
            raise ValueError("training.log_every must be >= 1")
        if self.device not in ("auto", "cpu", "cuda"):
            raise ValueError("training.device must be one of: auto, cpu, cuda")


@dataclass
class PathsConfig:
    checkpoint_dir: str = "checkpoints"


@dataclass
class Config:
    """The full experiment description."""

    run_name: str = "bit_adder_mlp"
    seed: int = 1337
    deterministic: bool = True
    data: DataConfig = field(default_factory=DataConfig)
    model: ModelConfig = field(default_factory=ModelConfig)
    training: TrainingConfig = field(default_factory=TrainingConfig)
    paths: PathsConfig = field(default_factory=PathsConfig)

    def validate(self) -> "Config":
        self.data.validate()
        self.model.validate()
        self.training.validate()
        return self

    def to_dict(self) -> Dict[str, Any]:
        """Plain dictionary -- what gets stored inside a checkpoint."""
        return asdict(self)

    @property
    def checkpoint_dir(self) -> Path:
        """Directory holding this run's checkpoints."""
        return Path(self.paths.checkpoint_dir) / self.run_name

    def pretty(self) -> str:
        return yaml.safe_dump(self.to_dict(), sort_keys=False, default_flow_style=False)


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


def _from_dict(cls: type, data: Dict[str, Any], path: str = "") -> Any:
    """Recursively build a dataclass from a dictionary, rejecting unknown keys."""
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

    # This module uses `from __future__ import annotations`, so f.type is the
    # *string* "DataConfig", not the class. get_type_hints resolves the strings
    # back into real classes so nested sections are built correctly.
    hints = get_type_hints(cls)

    kwargs: Dict[str, Any] = {}
    for name in known:
        if name not in data:
            continue  # dataclass default applies
        value = data[name]
        child_path = f"{path}.{name}" if path else name
        field_type = hints.get(name)
        if isinstance(field_type, type) and is_dataclass(field_type):
            kwargs[name] = _from_dict(field_type, value, child_path)
        else:
            kwargs[name] = value
    return cls(**kwargs)


def _coerce(value: str) -> Any:
    """Turn a command-line string into a Python value.

    '3' -> 3, '0.01' -> 0.01, 'true' -> True, '[64,64]' -> [64, 64],
    'relu' -> 'relu'.
    """
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
    """Apply a single 'dotted.key=value' override in place."""
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
    """Read a YAML config file, apply overrides, validate, and return it."""
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
    """Rebuild a Config from the dictionary stored inside a checkpoint."""
    return _from_dict(Config, copy.deepcopy(data)).validate()
