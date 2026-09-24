from __future__ import annotations

import hashlib
import json
import os
import platform
import socket
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, Dict, List

import torch
import torch.distributed as dist

from ored.config import Config, DistributedConfig
from ored.utils.logging_utils import get_logger

logger = get_logger(__name__)

TORCHRUN_VARIABLES = ("RANK", "LOCAL_RANK", "WORLD_SIZE", "LOCAL_WORLD_SIZE", "MASTER_ADDR", "MASTER_PORT")


class DistributedError(RuntimeError):
    pass


def _int(name: str, default: int) -> int:
    value = os.environ.get(name, "")
    return int(value) if value.strip().lstrip("-").isdigit() else default


def session_key_from_environ(explicit: str = "") -> str:
    if explicit:
        return explicit
    for name in ("ORED_SESSION", "TORCHELASTIC_RUN_ID"):
        value = os.environ.get(name, "").strip()
        if value and value != "none":
            return value
    return ""


@dataclass
class DistEnv:

    rank: int
    local_rank: int
    world_size: int
    local_world_size: int
    node_rank: int
    nnodes: int
    master_addr: str
    master_port: int
    session_key: str
    worker_id: str
    hostname: str
    backend: str
    timeout_seconds: int
    restart_count: int = 0
    device: torch.device = field(default_factory=lambda: torch.device("cpu"))

    @classmethod
    def from_environ(cls, settings: DistributedConfig, session_key: str = "") -> "DistEnv":
        missing = [name for name in TORCHRUN_VARIABLES if name not in os.environ]
        if missing:
            raise DistributedError(
                f"{', '.join(missing)} not set: start this through torchrun "
                f"(python -m ored.distributed launch ... prints the command)"
            )
        hostname = socket.gethostname()
        local_rank = _int("LOCAL_RANK", 0)
        return cls(
            rank=_int("RANK", 0),
            local_rank=local_rank,
            world_size=_int("WORLD_SIZE", 1),
            local_world_size=_int("LOCAL_WORLD_SIZE", 1),
            node_rank=_int("GROUP_RANK", _int("NODE_RANK", 0)),
            nnodes=_int("GROUP_WORLD_SIZE", _int("NNODES", 1)),
            master_addr=os.environ["MASTER_ADDR"],
            master_port=_int("MASTER_PORT", settings.master_port),
            session_key=session_key_from_environ(session_key),
            worker_id=os.environ.get("ORED_WORKER_ID") or f"{hostname}-{local_rank}",
            hostname=hostname,
            backend=settings.backend,
            timeout_seconds=settings.timeout_seconds,
            restart_count=_int("TORCHELASTIC_RESTART_COUNT", 0),
        )

    @property
    def is_coordinator(self) -> bool:
        return self.rank == 0

    @property
    def comm_device(self) -> torch.device:
        return self.device if self.backend == "nccl" else torch.device("cpu")

    def select_device(self, requested: str) -> torch.device:
        use_cuda = requested != "cpu" and torch.cuda.is_available()
        if requested == "cuda" and not torch.cuda.is_available():
            raise DistributedError(f"rank {self.rank} on {self.hostname}: training.device is cuda but no CUDA GPU is visible")
        if self.backend == "nccl" and not use_cuda:
            raise DistributedError(f"rank {self.rank} on {self.hostname}: the nccl backend needs a CUDA GPU; use backend gloo")
        if use_cuda:
            if self.local_rank >= torch.cuda.device_count():
                raise DistributedError(
                    f"rank {self.rank} on {self.hostname}: LOCAL_RANK {self.local_rank} but only "
                    f"{torch.cuda.device_count()} GPU(s); lower --nproc-per-node"
                )
            torch.cuda.set_device(self.local_rank)
            self.device = torch.device("cuda", self.local_rank)
        else:
            self.device = torch.device("cpu")
        return self.device

    def init(self) -> None:
        if self.backend == "nccl" and not dist.is_nccl_available():
            raise DistributedError(
                f"{self.hostname}: this PyTorch build has no NCCL (Windows and macOS never do). "
                f"Set distributed.backend: gloo on every machine."
            )
        if not dist.is_initialized():
            dist.init_process_group(backend=self.backend, timeout=timedelta(seconds=self.timeout_seconds))
        if dist.get_rank() != self.rank or dist.get_world_size() != self.world_size:
            raise DistributedError("RANK / WORLD_SIZE do not match the process group")

    def close(self) -> None:
        if dist.is_initialized():
            dist.destroy_process_group()

    def barrier(self) -> None:
        if self.backend == "nccl":
            dist.barrier(device_ids=[self.local_rank])
        else:
            dist.barrier()

    def broadcast_object(self, value: Any = None) -> Any:
        box = [value if self.is_coordinator else None]
        dist.broadcast_object_list(box, src=0, device=self.comm_device)
        return box[0]

    def all_gather_object(self, value: Any) -> List[Any]:
        gathered: List[Any] = [None] * self.world_size
        dist.all_gather_object(gathered, value)
        return gathered

    def all_reduce_sum(self, values: List[float]) -> List[float]:
        tensor = torch.tensor(values, dtype=torch.float64, device=self.comm_device)
        dist.all_reduce(tensor, op=dist.ReduceOp.SUM)
        return tensor.cpu().tolist()

    def describe(self) -> Dict[str, Any]:
        gpu = torch.cuda.get_device_name(self.device) if self.device.type == "cuda" else ""
        return {
            "rank": self.rank,
            "local_rank": self.local_rank,
            "node_rank": self.node_rank,
            "world_size": self.world_size,
            "hostname": self.hostname,
            "worker_id": self.worker_id,
            "device": str(self.device),
            "gpu": gpu,
            "cuda": (torch.version.cuda or "") if self.device.type == "cuda" else "",
            "torch": torch.__version__,
            "os": f"{platform.system()} {platform.release()}",
            "python": platform.python_version(),
            "master": f"{self.master_addr}:{self.master_port}",
            "backend": self.backend,
            "session": self.session_key,
        }


def config_fingerprint(cfg: Config) -> str:
    data = cfg.to_dict()
    data["training"] = {k: v for k, v in data["training"].items() if k not in ("resume", "device")}
    data.pop("paths", None)
    data["checkpoint"] = {k: v for k, v in data["checkpoint"].items() if k != "upload"}
    data["distributed"] = {k: v for k, v in data["distributed"].items() if k != "report_to_supabase"}
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()[:16]


def check_membership(env: DistEnv, cfg: Config, data_signature: Dict[str, Any]) -> None:
    mine = {
        "rank": env.rank,
        "host": env.hostname,
        "session": env.session_key,
        "run_name": cfg.run_name,
        "config": config_fingerprint(cfg),
        "data": data_signature,
        "backend": env.backend,
        "torch": torch.__version__.split("+")[0],
    }
    everyone = env.all_gather_object(mine)
    problems = []
    for key, label in (("session", "session"), ("run_name", "run_name"), ("config", "config"),
                       ("data", "training data"), ("backend", "backend")):
        values = {json.dumps(p[key], sort_keys=True) for p in everyone}
        if len(values) > 1:
            detail = ", ".join(f"rank {p['rank']} ({p['host']}): {p[key]}" for p in everyone)
            problems.append(f"workers disagree on {label}: {detail}")
    if problems:
        raise DistributedError(
            "These workers do not belong to one training run, so they must not train together:\n  "
            + "\n  ".join(problems)
        )
    versions = {p["torch"] for p in everyone}
    if len(versions) > 1 and env.is_coordinator:
        logger.warning(f"workers run different PyTorch versions: {sorted(versions)}")
