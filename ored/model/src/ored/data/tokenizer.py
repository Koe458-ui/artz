from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Sequence, Type

UNK_TOKEN = "<unk>"

TOKENIZER_REGISTRY: Dict[str, Type["Tokenizer"]] = {}


def register_tokenizer(name: str) -> Callable[[Type["Tokenizer"]], Type["Tokenizer"]]:
    def decorator(cls: Type["Tokenizer"]) -> Type["Tokenizer"]:
        key = name.lower()
        if key in TOKENIZER_REGISTRY:
            raise ValueError(f"tokenizer {name!r} is already registered")
        TOKENIZER_REGISTRY[key] = cls
        cls.name = key
        return cls

    return decorator


class Tokenizer:

    name: str = "base"

    @property
    def vocab_size(self) -> int:
        raise NotImplementedError

    def encode(self, text: str) -> List[int]:
        raise NotImplementedError

    def decode(self, ids: Sequence[int]) -> str:
        raise NotImplementedError

    def to_dict(self) -> Dict[str, Any]:
        raise NotImplementedError

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Tokenizer":
        key = data["name"].lower()
        if key not in TOKENIZER_REGISTRY:
            raise ValueError(f"unknown tokenizer {key!r}; have {sorted(TOKENIZER_REGISTRY)}")
        return TOKENIZER_REGISTRY[key]._from_dict(data)

    @classmethod
    def _from_dict(cls, data: Dict[str, Any]) -> "Tokenizer":
        raise NotImplementedError

    def save(self, path: str | Path) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self.to_dict(), indent=2, ensure_ascii=False),
                        encoding="utf-8")
        return path

    @classmethod
    def load(cls, path: str | Path) -> "Tokenizer":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))


@register_tokenizer("char")
class CharTokenizer(Tokenizer):

    def __init__(self, characters: Iterable[str]) -> None:
        unique = sorted(set(characters))
        if UNK_TOKEN in unique:
            unique.remove(UNK_TOKEN)

        self.itos: List[str] = [UNK_TOKEN] + unique
        self.stoi: Dict[str, int] = {s: i for i, s in enumerate(self.itos)}

    @classmethod
    def from_text(cls, text: str) -> "CharTokenizer":
        return cls(text)

    @property
    def vocab_size(self) -> int:
        return len(self.itos)

    def encode(self, text: str) -> List[int]:
        unk = 0
        return [self.stoi.get(character, unk) for character in text]

    def decode(self, ids: Sequence[int]) -> str:
        pieces = []
        for token_id in ids:
            index = int(token_id)
            if not 0 <= index < len(self.itos):
                raise ValueError(
                    f"token id {index} is outside this tokenizer's vocabulary "
                    f"(0..{len(self.itos) - 1})"
                )
            pieces.append(self.itos[index])
        return "".join(p for p in pieces if p != UNK_TOKEN)

    def to_dict(self) -> Dict[str, Any]:
        return {"name": "char", "itos": self.itos}

    @classmethod
    def _from_dict(cls, data: Dict[str, Any]) -> "CharTokenizer":
        tokenizer = cls("")
        tokenizer.itos = list(data["itos"])
        tokenizer.stoi = {s: i for i, s in enumerate(tokenizer.itos)}
        return tokenizer

    def describe(self) -> str:
        visible = "".join(c for c in self.itos[1:] if c not in "\n\t")
        return f"CharTokenizer | vocab_size={self.vocab_size} | symbols: {visible!r} + newline"


def build_tokenizer(name: str, text: str) -> Tokenizer:
    key = name.lower()
    if key not in TOKENIZER_REGISTRY:
        raise ValueError(f"unknown tokenizer {name!r}; have {sorted(TOKENIZER_REGISTRY)}")
    return TOKENIZER_REGISTRY[key].from_text(text)
