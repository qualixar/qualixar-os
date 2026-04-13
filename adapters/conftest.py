"""Pytest conftest for adapter tests.

Adds the adapters directory to sys.path so adapter modules can be
imported directly (e.g., `from client import QosClient`).

For adapter modules that use relative imports (from .client import ...),
tests import from the pre-loaded versions below.
"""

import sys
import os
import importlib
import importlib.util

adapter_dir = os.path.dirname(os.path.abspath(__file__))
if adapter_dir not in sys.path:
    sys.path.insert(0, adapter_dir)


def _load_module_absolute(name: str, filepath: str) -> None:
    """Load a module from file, replacing relative imports."""
    if name in sys.modules:
        return
    spec = importlib.util.spec_from_file_location(name, filepath)
    if spec is None or spec.loader is None:
        return
    mod = importlib.util.module_from_spec(spec)
    mod.__package__ = ""  # Prevent relative import resolution
    sys.modules[name] = mod
    # Read source code and patch relative imports
    with open(filepath) as f:
        source = f.read()
    source = source.replace("from .client import", "from client import")
    code = compile(source, filepath, "exec")
    exec(code, mod.__dict__)


# Load client first (no relative imports needed)
_load_module_absolute("client", os.path.join(adapter_dir, "client.py"))

# Load adapters with patched imports
for adapter_name in ["langchain_adapter", "crewai_adapter", "autogen_adapter", "adk_adapter"]:
    filepath = os.path.join(adapter_dir, f"{adapter_name}.py")
    if os.path.exists(filepath):
        _load_module_absolute(adapter_name, filepath)
