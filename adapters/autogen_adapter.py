"""AutoGen integration — callable tool wrapping Qualixar OS.

Implements the callable protocol expected by AutoGen's tool system.
Connects to the Qualixar OS HTTP API, submits tasks, polls for results,
and returns output strings.

Usage:
    pip install httpx

    from adapters.autogen_adapter import create_autogen_tool

    tool = create_autogen_tool("http://localhost:3000")
    result = tool("Analyze this codebase", task_type="code")
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .client import QosClient, TaskOptions, TaskResult


@dataclass
class QosAutoGenTool:
    """AutoGen-compatible tool that delegates tasks to Qualixar OS agent OS.

    Implements the callable protocol expected by AutoGen's tool system.
    Can be registered with an AutoGen agent via ``register_for_llm``
    or used directly as a function tool.

    Attributes:
        client: The QosClient instance for HTTP communication.
        name: Tool name for AutoGen registration.
        description: Human-readable tool description.
        default_budget_usd: Optional default budget cap.
    """

    client: QosClient
    name: str = "qos_task_runner"
    description: str = (
        "Submit tasks to Qualixar OS agent OS for execution. "
        "Qualixar OS orchestrates multi-agent teams to complete tasks."
    )
    default_budget_usd: float | None = None

    def __call__(
        self,
        prompt: str,
        task_type: str = "custom",
        budget_usd: float | None = None,
        topology: str | None = None,
    ) -> str:
        """Run a task through Qualixar OS and return the output string.

        Args:
            prompt: The task description for Qualixar OS.
            task_type: Type of task (code, research, analysis, creative, custom).
            budget_usd: Optional budget cap in USD (overrides default).
            topology: Optional topology override.

        Returns:
            The task output string from Qualixar OS.

        Raises:
            RuntimeError: If the task fails.
        """
        effective_budget = budget_usd or self.default_budget_usd
        result = self.client.run_task(
            TaskOptions(
                prompt=prompt,
                type=task_type,
                budget_usd=effective_budget,
                topology=topology,
            )
        )
        if result.status == "failed":
            raise RuntimeError(
                f"Qualixar OS task {result.task_id} failed: {result.output}"
            )
        return result.output

    def get_result(self, prompt: str, **kwargs: Any) -> TaskResult:
        """Run a task and return the full TaskResult (not just output).

        Args:
            prompt: The task description.
            **kwargs: Additional options passed to TaskOptions.

        Returns:
            The complete TaskResult with cost, duration, metadata.
        """
        options = TaskOptions(prompt=prompt, **kwargs)
        return self.client.run_task(options)

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self.client.close()


def create_autogen_tool(
    base_url: str = "http://localhost:3000",
    default_budget_usd: float | None = None,
) -> QosAutoGenTool:
    """Factory: create a QosAutoGenTool for AutoGen agents.

    Args:
        base_url: Qualixar OS server URL.
        default_budget_usd: Optional default budget cap.

    Returns:
        A QosAutoGenTool instance.
    """
    client = QosClient(base_url=base_url)
    return QosAutoGenTool(
        client=client,
        default_budget_usd=default_budget_usd,
    )
