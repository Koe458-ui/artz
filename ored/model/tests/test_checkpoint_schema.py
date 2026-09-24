from __future__ import annotations

import glob
import os
import shutil
import subprocess
from pathlib import Path

import pytest

SUPABASE = Path(__file__).resolve().parents[2] / "supabase"
MIGRATION = SUPABASE / "migrations" / "20260924150000_ored_checkpoint_roles.sql"


def _pg_bin():
    for candidate in sorted(glob.glob("/usr/lib/postgresql/*/bin"), reverse=True):
        if Path(candidate, "initdb").exists():
            return Path(candidate)
    found = shutil.which("initdb")
    return Path(found).parent if found else None


PG_BIN = _pg_bin()

pytestmark = pytest.mark.skipif(
    PG_BIN is None or shutil.which("psql") is None or os.geteuid() == 0,
    reason="needs PostgreSQL server binaries and a non-root user",
)


@pytest.fixture(scope="module")
def database(tmp_path_factory):
    root = tmp_path_factory.mktemp("pg")
    data, sock = root / "data", root
    subprocess.run([PG_BIN / "initdb", "-D", data, "-A", "trust", "-U", "postgres"],
                   check=True, capture_output=True)
    subprocess.run([PG_BIN / "pg_ctl", "-D", data, "-l", root / "log", "-w",
                    "-o", f"-k {sock} -c listen_addresses= -p 55439", "start"],
                   check=True, capture_output=True)
    try:
        yield ["psql", "-h", str(sock), "-p", "55439", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"]
    finally:
        subprocess.run([PG_BIN / "pg_ctl", "-D", data, "-m", "immediate", "stop"], capture_output=True)


def psql(database, *args):
    result = subprocess.run([*database, *args], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return result.stdout


def test_migration_applies_to_the_pre_migration_schema_and_keeps_every_row(database):
    psql(database, "-f", str(SUPABASE / "tests" / "baseline.sql"))
    before = psql(database, "-At", "-c", "select count(*) from public.ored_checkpoints")
    psql(database, "-1", "-f", str(MIGRATION))
    after = psql(database, "-At", "-c", "select count(*) from public.ored_checkpoints")
    assert before == after


def test_checkpoint_invariants_hold(database):
    out = psql(database, "-f", str(SUPABASE / "tests" / "checkpoint_invariants.sql"))
    assert "all checks passed" in out
