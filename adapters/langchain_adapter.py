"""LangChain integration — wraps QosClient as a LangChain Tool.

Connects to the Qualixar OS HTTP API, submits tasks, polls for results,
and returns output in LangChain's expected format.

Usage:
    pip install langchain-core httpx

    from adapters.langchain_adapter import create_qos_tool

    tool = create_qos_tool("http://localhost:3000")
    result = tool.invoke({"prompt": "Analyze this code", "task_type": "code"})
"""

from __future__ import annotations

import time
from typing import Any, Optional, Type

from .client import QosClient, TaskOptions, TaskResult

try:
    from langchain_core.tools import BaseTool
    from pydantic import BaseModel, Field

    HAS_LANGCHAIN = True
except ImportError:
    HAS_LANGCHAIN = False


if HAS_LANGCHAIN:

    class QosInput(BaseModel):  # type: ignore[misc]
        """Input schema for Qualixar OS LangChain tool."""

        prompt: str = Field(description="Task prompt to execute")
        task_type: str = Field(default="custom", description="Task type: code, research, analysis, creative, custom")
        budget_usd: Optional[float] = Field(  # noqa: UP007
            default=None, description="Budget cap in USD"
        )
        topology: Optional[str] = Field(  # noqa: UP007
            default=None, description="Topology override (e.g. pipeline, debate)"
        )

    class QosTool(BaseTool):  # type: ignore[misc]
        """LangChain tool that delegates tasks to Qualixar OS agent OS.

        Submits a task to the Qualixar OS HTTP API, polls for completion,
        and returns the output string. Supports budget caps and topology selection.

        Attributes:
            name: Tool name for the LangChain agent.
            description: Human-readable description.
            args_schema: Pydantic model defining input parameters.
            client: QosClient instance (injected via constructor).
            poll_interval: Seconds between status polls (default 2.0).
            max_poll_attempts: Maximum poll attempts before timeout (default 120).
        """

        name: str = "qos"
        description: str = (
            "Submit a task to Qualixar OS agent operating system. "
            "Qualixar OS will orchestrate AI agents to complete the task."
        )
        args_schema: Type[Any] = QosInput  # type: ignore[assignment]
        client: Any = None  # Set via constructor; typed as Any for Pydantic compat
        poll_interval: float = 2.0
        max_poll_attempts: int = 120

        def _run(
            self,
            prompt: str,
            task_type: str = "custom",
            budget_usd: float | None = None,
            topology: str | None = None,
        ) -> str:
            """Execute the tool synchronously.

            Args:
                prompt: The task description.
                task_type: Type of task (code, research, etc.).
                budget_usd: Optional budget cap in USD.
                topology: Optional topology override.

            Returns:
                The task output string from Qualixar OS.

            Raises:
                RuntimeError: If the task fails or times out.
            """
            options = TaskOptions(
                prompt=prompt,
                type=task_type,
                budget_usd=budget_usd,
                topology=topology,
            )
            result = self.client.run_task(options)
            if result.status == "failed":
                raise RuntimeError(
                    f"Qualixar OS task {result.task_id} failed: {result.output}"
                )
            return result.output

        async def _arun(self, *args: Any, **kwargs: Any) -> str:
            """Async execution — not yet supported."""
            raise NotImplementedError("Async not yet supported")


def create_qos_tool(
    base_url: str = "http://localhost:3000",
    poll_interval: float = 2.0,
    max_poll_attempts: int = 120,
) -> Any:
    """Factory: create a QosTool for LangChain agents.

    Args:
        base_url: Qualixar OS server URL.
        poll_interval: Seconds between status polls.
        max_poll_attempts: Maximum number of poll attempts.

    Returns:
        A QosTool instance ready for use with LangChain agents.

    Raises:
        ImportError: If langchain-core is not installed.
    """
    if not HAS_LANGCHAIN:
        raise ImportError(
            "langchain-core required: pip install langchain-core"
        )
    client = QosClient(base_url=base_url)
    return QosTool(  # type: ignore[name-defined]
        client=client,
        poll_interval=poll_interval,
        max_poll_attempts=max_poll_attempts,
    )
