from __future__ import annotations

import logging
import sys

_CONFIGURED = False


def get_logger(name: str = "ored") -> logging.Logger:
    global _CONFIGURED
    logger = logging.getLogger(name)
    if not _CONFIGURED:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        root = logging.getLogger("ored")
        root.handlers.clear()
        root.addHandler(handler)
        root.setLevel(logging.INFO)
        root.propagate = False
        _CONFIGURED = True
    return logger


def section(title: str, width: int = 78) -> str:
    return f"\n{'=' * width}\n{title}\n{'=' * width}"
