from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import yaml

from dist_helpers import free_port

SRC = Path(__file__).resolve().parent.parent / "src"


def launch_nodes(nodes, command, config, session, extra=(), sets=()):
    port = free_port()
    env = dict(os.environ, PYTHONPATH=str(SRC), OMP_NUM_THREADS="1")
    args = [sys.executable, "-m", "ored.distributed", "launch", command, "--config", str(config),
            "--session", session, "--nnodes", str(nodes), "--master-addr", "127.0.0.1",
            "--master-port", str(port)]
    for item in sets:
        args += ["--set", item]
    if extra:
        args += ["--", *extra]
    agents = [subprocess.Popen(args, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
              for _ in range(nodes)]
    outputs = [agent.communicate(timeout=300)[0] for agent in agents]
    return [agent.returncode for agent in agents], "\n".join(outputs)


def test_three_nodes_find_each_other_train_and_resume_on_two(tiny_dataset, tmp_path):
    config = tmp_path / "run.yaml"
    config.write_text(yaml.safe_dump(tiny_dataset.to_dict()))
    ck = tmp_path / "ck"

    codes, out = launch_nodes(3, "test", config, "pytest-mn-test")
    assert codes == [0, 0, 0], out
    assert "VERIFIED: every worker can train together" in out
    assert "all ranks discovered 3 of 3" in out

    sets = [f"paths.checkpoint_dir={ck}", "training.epochs=3"]
    codes, out = launch_nodes(3, "train", config, "pytest-mn-train", sets=sets)
    assert codes == [0, 0, 0], out
    assert "3 workers on 3 node(s)" in out

    run = ck / tiny_dataset.run_name
    live = json.loads((run / "live.json").read_text())
    assert live["world_size"] == 3 and live["epoch"] == 3

    sets = [f"paths.checkpoint_dir={ck}", "training.epochs=4"]
    codes, out = launch_nodes(2, "train", config, "pytest-mn-train-2", extra=["--resume-live"], sets=sets)
    assert codes == [0, 0], out
    assert "saved by 3 workers" in out and "worker count changed (3 -> 2)" in out
    live = json.loads((run / "live.json").read_text())
    assert live["world_size"] == 2 and live["epoch"] == 4

    verify = subprocess.run(
        [sys.executable, "-m", "ored.distributed", "verify", str(run / "live" / live["label"]),
         "--config", str(config)],
        env=dict(os.environ, PYTHONPATH=str(SRC)), capture_output=True, text=True,
    )
    assert verify.returncode == 0 and verify.stdout.rstrip().endswith("VERIFIED"), verify.stdout
