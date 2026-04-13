"""CrewAI integration — wraps QosClient as a CrewAI Tool.

Connects to the Qualixar OS HTTP API, submits tasks, and returns
results in CrewAI's expected format.

Usage:
    pip install crewai httpx

    from adapters.crewai_adapter import create_crewai_tool

    tool = create_crewai_tool("http://localhost:3000")
    # Use in a CrewAI agent:
    agent = Agent(tools=[tool], ...)
"""

from __future__ import annotations

from typing import Any

from .client import QosClient, TaskOptions


try:
    from crewai.tools import BaseTool as CrewAIBaseTool

    HAS_CREWAI = True
except ImportError:
    HAS_CREWAI = False


if HAS_CREWAI:

    class QosCrewTool(CrewAIBaseTool):  # type: ignore[misc]
        """CrewAI tool that delegates tasks to Qualixar OS agent OS.

        Submits tasks via the Qualixar OS HTTP API. Supports task type selection
        and budget caps. Returns the output string from Qualixar OS.

        Attributes:
            name: Tool name for CrewAI.
            description: Human-readable description.
            client: QosClient instance (injected via constructor).
            default_budget_usd: Optional default budget cap.
        """

        name: str = "Qualixar OS Task Runner"
        description: str = (
            "Submit tasks to Qualixar OS agent OS for execution. "
            "Qualixar OS orchestrates multi-agent teams to complete tasks."
        )
        client: Any = None  # Set via constructor; typed as Any for Pydantic compat
        default_budget_usd: float | None = None

        def _run(
            self,
            prompt: str,
            task_type: str = "custom",
            budget_usd: float | None = None,
            topology: str | None = None,
        ) -> str:
            """Execute the tool synchronously.

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


def create_crewai_tool(
    base_url: str = "http://localhost:3000",
    default_budget_usd: float | None = None,
) -> Any:
    """Factory: create a QosCrewTool for CrewAI agents.

    Args:
        base_url: Qualixar OS server URL.
        default_budget_usd: Optional default budget cap for all tasks.

    Returns:
        A QosCrewTool instance ready for use with CrewAI agents.

    Raises:
        ImportError: If crewai is not installed.
    """
    if not HAS_CREWAI:
        raise ImportError("crewai required: pip install crewai")
    client = QosClient(base_url=base_url)
    return QosCrewTool(  # type: ignore[name-defined]
        client=client,
        default_budget_usd=default_budget_usd,
    )
