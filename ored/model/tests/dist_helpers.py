from __future__ import annotations

import contextlib
import os
import pickle
import socket
import time
import traceback
from pathlib import Path
from typing import Any, Callable, Dict

import torch.multiprocessing as mp

from ored.learning.checkpoints import CheckpointStore, ObjectExistsError, digest
from ored.learning.store import InMemoryStore, StoreError


@contextlib.contextmanager
def exclusive(path: str):
    while True:
        try:
            handle = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            time.sleep(0.005)
    try:
        yield
    finally:
        os.close(handle)
        os.unlink(path)


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class SharedStore:

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        if not self.path.exists():
            self._save(InMemoryStore())

    def _load(self) -> InMemoryStore:
        store = pickle.loads(self.path.read_bytes())
        store._lock = __import__("threading").RLock()
        return store

    def _save(self, store: InMemoryStore) -> None:
        lock = store.__dict__.pop("_lock", None)
        self.path.write_bytes(pickle.dumps(store))
        if lock is not None:
            store._lock = lock

    def __getattr__(self, name: str) -> Callable[..., Any]:
        def call(*args: Any, **kwargs: Any) -> Any:
            with exclusive(str(self.path) + ".lock"):
                store = self._load()
                try:
                    return getattr(store, name)(*args, **kwargs)
                finally:
                    self._save(store)
        return call


class DirectoryBucket(CheckpointStore):

    def __init__(self, root: Path, bucket: str = "ored-checkpoints") -> None:
        self.root = Path(root)
        self.bucket = bucket
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, object_path: str) -> Path:
        return self.root / object_path

    def _damage(self) -> str:
        return os.environ.get(f"ORED_TEST_DAMAGE_RANK_{os.environ.get('RANK', '0')}", "")

    def upload(self, path: Any, object_path: str, upsert: bool = False) -> Dict[str, Any]:
        target = self._path(object_path)
        if target.exists() and not upsert:
            raise ObjectExistsError(f"{object_path} exists")
        data = Path(path).read_bytes()
        damage = self._damage()
        if damage == "corrupt" and not object_path.endswith("manifest.json"):
            data = data[:-1] + bytes([data[-1] ^ 0xFF])
        if damage == "unreachable":
            raise StoreError(f"POST {object_path} could not be reached: network is down")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {"object_path": object_path, "size_bytes": len(data), "sha256": digest(path)}

    def download(self, object_path: str, path: Any) -> Path:
        source = self._path(object_path)
        if not source.exists():
            raise StoreError(f"GET {object_path} -> 404 not found")
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(source.read_bytes())
        return Path(path)

    def remove(self, object_path: str) -> None:
        self._path(object_path).unlink(missing_ok=True)

    def stat(self, object_path: str) -> Any:
        path = self._path(object_path)
        return path.stat().st_size if path.exists() else None

    def list_objects(self, prefix: str = "") -> Dict[str, int]:
        found = {}
        for path in self.root.rglob("*"):
            if path.is_file():
                name = path.relative_to(self.root).as_posix()
                if name.startswith(prefix):
                    found[name] = path.stat().st_size
        return found


def _entry(rank: int, fn: Callable[..., Any], world_size: int, port: int, env: Dict[str, str], args: tuple) -> None:
    os.environ.update({
        "RANK": str(rank), "LOCAL_RANK": str(rank), "WORLD_SIZE": str(world_size),
        "LOCAL_WORLD_SIZE": str(world_size), "MASTER_ADDR": "127.0.0.1", "MASTER_PORT": str(port),
        "ORED_SESSION": "pytest-session", "OMP_NUM_THREADS": "1",
    })
    os.environ.update(env)
    try:
        fn(rank, world_size, *args)
    except BaseException:
        traceback.print_exc()
        raise


def run_workers(fn: Callable[..., Any], world_size: int, *args: Any, env: Dict[str, str] = None) -> None:
    mp.spawn(_entry, args=(fn, world_size, free_port(), env or {}, args), nprocs=world_size, join=True)
