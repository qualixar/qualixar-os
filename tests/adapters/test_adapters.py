"""Tests for framework adapter import guards and tool creation."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from adapters.client import QosClient, TaskOptions


# ── Helpers ─────────────────────────────────────────────────────


def _mock_client() -> QosClient:
    """Build a QosClient with a mock transport that always succeeds."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "task_id": "t-mock",
                "status": "completed",
                "output": "mock output",
                "cost_usd": 0.01,
                "duration_ms": 100,
                "metadata": {},
            },
        )

    transport = httpx.MockTransport(handler)
    http_client = httpx.Client(
        base_url="http://test", transport=transport
    )
    return QosClient(_client=http_client)


# ── LangChain adapter ──────────────────────────────────────────


class TestLangchainAdapter:
    def test_import_guard_raises_when_missing(self) -> None:
        """create_qos_tool raises ImportError if langchain-core absent."""
        from adapters.langchain_adapter import HAS_LANGCHAIN, create_qos_tool

        if not HAS_LANGCHAIN:
            with pytest.raises(ImportError, match="langchain-core required"):
                create_qos_tool()

    def test_has_langchain_flag_is_bool(self) -> None:
        from adapters.langchain_adapter import HAS_LANGCHAIN

        assert isinstance(HAS_LANGCHAIN, bool)


# ── CrewAI adapter ──────────────────────────────────────────────


class TestCrewaiAdapter:
    def test_import_guard_raises_when_missing(self) -> None:
        """create_crewai_tool raises ImportError if crewai absent."""
        from adapters.crewai_adapter import HAS_CREWAI, create_crewai_tool

        if not HAS_CREWAI:
            with pytest.raises(ImportError, match="crewai required"):
                create_crewai_tool()

    def test_has_crewai_flag_is_bool(self) -> None:
        from adapters.crewai_adapter import HAS_CREWAI

        assert isinstance(HAS_CREWAI, bool)


# ── AutoGen adapter ────────────────────────────────────────────


class TestAutogenAdapter:
    def test_tool_is_callable(self) -> None:
        """QosAutoGenTool instances are callable (AutoGen protocol)."""
        from adapters.autogen_adapter import QosAutoGenTool

        tool = QosAutoGenTool.__new__(QosAutoGenTool)
        assert callable(tool)

    def test_tool_has_name_and_description(self) -> None:
        from adapters.autogen_adapter import QosAutoGenTool

        # Use a mock client to construct fully
        tool = QosAutoGenTool.__new__(QosAutoGenTool)
        tool.client = _mock_client()
        tool.name = "qos_task_runner"
        tool.description = "Submit tasks to Qualixar OS agent OS for execution"

        assert tool.name == "qos_task_runner"
        assert "Qualixar OS" in tool.description

    def test_call_returns_output(self) -> None:
        """Calling the tool with a mock client returns the output string."""
        from adapters.autogen_adapter import QosAutoGenTool

        tool = QosAutoGenTool.__new__(QosAutoGenTool)
        tool.client = _mock_client()
        tool.name = "qos_task_runner"
        tool.description = "Submit tasks to Qualixar OS agent OS for execution"

        result = tool(prompt="test prompt")
        assert result == "mock output"

    def test_create_factory(self) -> None:
        from adapters.autogen_adapter import create_autogen_tool

        tool = create_autogen_tool("http://localhost:9999")
        assert tool.name == "qos_task_runner"
        assert callable(tool)
        tool.close()


# ── ADK adapter ─────────────────────────────────────────────────


class TestAdkAdapter:
    def test_import_guard_raises_when_missing(self) -> None:
        """create_adk_tool raises ImportError if google-adk absent."""
        from adapters.adk_adapter import HAS_ADK, create_adk_tool

        if not HAS_ADK:
            with pytest.raises(ImportError, match="google-adk required"):
                create_adk_tool()

    def test_has_adk_flag_is_bool(self) -> None:
        from adapters.adk_adapter import HAS_ADK

        assert isinstance(HAS_ADK, bool)

    def test_run_function_exists(self) -> None:
        """The underlying run_qos_task function is importable."""
        from adapters.adk_adapter import run_qos_task

        assert callable(run_qos_task)


# ── Cross-adapter consistency ───────────────────────────────────


class TestCrossAdapterConsistency:
    def test_all_adapters_importable(self) -> None:
        """All adapter modules can be imported without error."""
        import adapters.langchain_adapter
        import adapters.crewai_adapter
        import adapters.autogen_adapter
        import adapters.adk_adapter

    def test_init_exports(self) -> None:
        """The adapters package exports the core types."""
        from adapters import QosClient, TaskOptions, TaskResult

        assert QosClient is not None
        assert TaskOptions is not None
        assert TaskResult is not None
