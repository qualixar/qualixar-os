"""Qualixar OS Python Adapters — Connect Python AI frameworks to Qualixar OS."""

from .client import QosClient, TaskOptions, TaskResult

__all__ = [
    "QosClient", "TaskOptions", "TaskResult",
    # Managed adapter (lazy import to avoid httpx[http2] dep at package level)
    "ClaudeManagedAdapter", "create_managed_adapter",
]


def __getattr__(name: str):  # type: ignore[override]
    """Lazy imports for optional adapters."""
    if name == "ClaudeManagedAdapter":
        from .claude_managed_adapter import ClaudeManagedAdapter
        return ClaudeManagedAdapter
    if name == "create_managed_adapter":
        from .claude_managed_adapter import create_managed_adapter
        return create_managed_adapter
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
