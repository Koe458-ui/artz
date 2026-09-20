#!/usr/bin/env python3
"""Entry point: see ored.data.generate for the implementation and the explanations."""

import _bootstrap  # noqa: F401  (adds src/ to sys.path)

from ored.data.generate import main

if __name__ == "__main__":
    raise SystemExit(main())
