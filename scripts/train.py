#!/usr/bin/env python3
"""Entry point: see ored.training.trainer for the implementation and the explanations."""

import _bootstrap  # noqa: F401  (adds src/ to sys.path)

from ored.training.trainer import main

if __name__ == "__main__":
    raise SystemExit(main())
