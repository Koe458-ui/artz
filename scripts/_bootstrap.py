"""Make `python scripts/<name>.py` work without installing the package.

The real code lives in src/ored/. Python only searches the directories on
sys.path, and src/ is not one of them by default. This adds it.

If you run `pip install -e .` instead, this shim becomes a harmless no-op.
"""

from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
if SRC.exists() and str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))
