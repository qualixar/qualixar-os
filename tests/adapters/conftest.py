"""Conftest — ensure the adapters package is importable from project root."""

from __future__ import annotations

import sys
from pathlib import Path

# Insert project root so `import adapters` resolves to Qualixar OS/adapters/
_project_root = str(Path(__file__).resolve().parents[2])
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)
