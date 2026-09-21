from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn.functional as F

from ored.config import Config
from ored.data.tokenizer import Tokenizer
from ored.evaluation.lm_evaluator import load_language_model
from ored.inference.generator import generate_text
from ored.learning.checkpoints import CheckpointStore, fetch, publish
from ored.learning.records import CheckpointKind
from ored.learning.store import StoreError
from ored.utils.checkpoint import save_checkpoint
from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)

DEFAULT_CHECKPOINT = "checkpoints/char_transformer/best.pt"
DEFAULT_LIVE_DIR = "checkpoints/live"
UNK_ID = 0


@dataclass
class OnlinePolicy:

    learning_rate: float = 1e-5
    max_grad_norm: float = 1.0
    steps_per_message: int = 1
    min_chars: int = 8
    max_chars: int = 2000
    min_known_ratio: float = 0.9
    save_every: int = 25

    def validate(self) -> None:
        if self.learning_rate <= 0:
            raise ValueError("learning_rate must be > 0")
        if self.steps_per_message < 1:
            raise ValueError("steps_per_message must be >= 1")
        if not 0 < self.min_known_ratio <= 1:
            raise ValueError("min_known_ratio must be in (0, 1]")
        if self.min_chars < 2:
            raise ValueError("min_chars must be >= 2")


@dataclass
class RemoteCheckpoints:

    store: Any
    files: CheckpointStore
    run_name: str = "live"

    def push(self, path: Path, stats: Dict[str, Any]) -> None:
        publish(
            store=self.store,
            files=self.files,
            path=path,
            kind=CheckpointKind.LIVE,
            run_name=self.run_name,
        )

    def pull(self, path: Path) -> bool:
        return fetch(
            store=self.store,
            files=self.files,
            path=path,
            kind=CheckpointKind.LIVE,
            run_name=self.run_name,
        ) is not None


@dataclass
class OnlineResult:

    learned: bool
    reason: str = ""
    loss: Optional[float] = None
    tokens: int = 0


@dataclass
class OnlineStats:

    seen: int = 0
    learned: int = 0
    skipped: int = 0
    steps: int = 0
    last_loss: Optional[float] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "seen": self.seen,
            "learned": self.learned,
            "skipped": self.skipped,
            "steps": self.steps,
            "last_loss": self.last_loss,
        }


class OnlineLearner:

    def __init__(
        self,
        model: torch.nn.Module,
        tokenizer: Tokenizer,
        cfg: Config,
        device: torch.device,
        policy: Optional[OnlinePolicy] = None,
        live_dir: str | Path = DEFAULT_LIVE_DIR,
        version: str = "live",
        remote: Optional[RemoteCheckpoints] = None,
    ) -> None:
        self.policy = policy or OnlinePolicy()
        self.policy.validate()
        self.model = model
        self.tokenizer = tokenizer
        self.cfg = cfg
        self.device = device
        self.block_size = cfg.data.block_size
        self.live_dir = Path(live_dir)
        self.version = version
        self.remote = remote
        self.stats = OnlineStats()
        self.optimizer = torch.optim.AdamW(
            self.model.parameters(), lr=self.policy.learning_rate
        )
        self.model.eval()

    @classmethod
    def from_checkpoint(
        cls,
        path: str | Path = DEFAULT_CHECKPOINT,
        device: str = "auto",
        policy: Optional[OnlinePolicy] = None,
        live_dir: str | Path = DEFAULT_LIVE_DIR,
        remote: Optional[RemoteCheckpoints] = None,
    ) -> "OnlineLearner":
        model, tokenizer, cfg, info = load_language_model(path, device)
        return cls(
            model=model,
            tokenizer=tokenizer,
            cfg=cfg,
            device=info["device"],
            policy=policy,
            live_dir=live_dir,
            remote=remote,
        )

    def _encode(self, text: str) -> Tuple[List[int], float]:
        ids = self.tokenizer.encode(text)
        if not ids:
            return [], 0.0
        known = sum(1 for i in ids if i != UNK_ID)
        return ids, known / len(ids)

    def _window(self, ids: List[int]) -> List[int]:
        limit = self.block_size + 1
        return ids[-limit:] if len(ids) > limit else ids

    def _step(self, ids: List[int]) -> float:
        batch = torch.tensor([ids], dtype=torch.long, device=self.device)
        x, y = batch[:, :-1], batch[:, 1:]

        self.model.train()
        logits = self.model(x)
        loss = F.cross_entropy(
            logits.reshape(-1, logits.size(-1)), y.reshape(-1)
        )

        self.optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), self.policy.max_grad_norm)
        self.optimizer.step()
        self.model.eval()

        return float(loss.detach())

    def learn(self, text: str) -> OnlineResult:
        self.stats.seen += 1
        cleaned = (text or "").strip()

        if len(cleaned) < self.policy.min_chars:
            self.stats.skipped += 1
            return OnlineResult(False, "too short")

        cleaned = cleaned[: self.policy.max_chars]
        ids, known_ratio = self._encode(cleaned)

        if known_ratio < self.policy.min_known_ratio:
            self.stats.skipped += 1
            return OnlineResult(False, "outside the vocabulary")

        ids = self._window(ids)
        if len(ids) < 2:
            self.stats.skipped += 1
            return OnlineResult(False, "too few tokens")

        loss = 0.0
        for _ in range(self.policy.steps_per_message):
            loss = self._step(ids)
            self.stats.steps += 1

        self.stats.learned += 1
        self.stats.last_loss = loss

        if self.policy.save_every and self.stats.learned % self.policy.save_every == 0:
            self.save()

        return OnlineResult(True, "", loss, len(ids))

    @torch.no_grad()
    def reply(self, prompt: str, max_new_tokens: int = 160, temperature: float = 0.8) -> str:
        written = generate_text(
            model=self.model,
            tokenizer=self.tokenizer,
            prompt=prompt,
            max_new_tokens=max_new_tokens,
            block_size=self.block_size,
            device=self.device,
            temperature=temperature,
            stop_on_newline=True,
        )
        return written[len(prompt):].strip() if written.startswith(prompt) else written.strip()

    def respond(self, message: str) -> Tuple[str, OnlineResult]:
        answer = self.reply(message)
        learned = self.learn(message if not answer else message + "\n" + answer)
        return answer, learned

    def save(self) -> Path:
        self.live_dir.mkdir(parents=True, exist_ok=True)
        path = save_checkpoint(
            path=self.live_dir / "live.pt",
            model=self.model,
            config=self.cfg.to_dict(),
            epoch=self.stats.steps,
            metrics={"last_loss": self.stats.last_loss or 0.0},
            optimizer=self.optimizer,
            extra={"tokenizer": self.tokenizer.to_dict(), "online": self.stats.as_dict()},
        )
        if self.remote is not None:
            try:
                self.remote.push(path, self.stats.as_dict())
            except StoreError as exc:
                logger.error("live checkpoint not pushed: %s", exc)
        return path
