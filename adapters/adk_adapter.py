"""Google ADK integration — function tool wrapping Qualixar OS."""

from __future__ import annotations

from typing import Any

from .client import QosClient, TaskOptions

try:
    from google.adk.tools import FunctionTool  # type: ignore[import-untyped]

    HAS_ADK = True
except ImportError:
    HAS_ADK = False


def run_qos_task(
    prompt: str,
    task_type: str = "custom",
    budget_usd: float | None = None,
) -> str:
    """Submit a task to Qualixar OS agent operating system.

    This function is designed to be wrapped by Google ADK's FunctionTool.
    It creates a short-lived client per invocation for stateless execution.
    """
    client = QosClient()
    try:
        result = client.run_task(
            TaskOptions(prompt=prompt, type=task_type, budget_usd=budget_usd)
        )
        return result.output
    finally:
        client.close()


def create_adk_tool(base_url: str = "http://localhost:3000") -> Any:
    """Factory: create a Google ADK FunctionTool wrapping Qualixar OS.

    Raises ImportError if google-adk is not installed.
    """
    if not HAS_ADK:
        raise ImportError("google-adk required: pip install google-adk")
    # ADK FunctionTool wraps a plain Python function
    return FunctionTool(func=run_qos_task)  # type: ignore[name-defined]
