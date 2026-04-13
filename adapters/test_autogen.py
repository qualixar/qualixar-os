"""Tests for AutoGen adapter (H-06)."""

import pytest
from unittest.mock import MagicMock
from client import QosClient, TaskOptions, TaskResult
from autogen_adapter import QosAutoGenTool, create_autogen_tool


class TestQosAutoGenTool:
    """Tests for the AutoGen tool wrapper."""

    def _make_tool(self) -> QosAutoGenTool:
        """Create a tool with a mock client."""
        mock_client = MagicMock(spec=QosClient)
        tool = QosAutoGenTool.__new__(QosAutoGenTool)
        tool.client = mock_client
        tool.name = "qos_task_runner"
        tool.description = "Submit tasks to Qualixar OS agent OS for execution"
        return tool

    def test_attributes(self):
        """Tool has correct name and description."""
        tool = self._make_tool()
        assert tool.name == "qos_task_runner"
        assert "Qualixar OS" in tool.description

    def test_callable_protocol(self):
        """Tool implements callable protocol for AutoGen."""
        tool = self._make_tool()
        tool.client.run_task.return_value = TaskResult(
            task_id="t1", status="completed", output="result text"
        )
        result = tool("test prompt", task_type="code")
        assert result == "result text"
        tool.client.run_task.assert_called_once()

    def test_callable_with_budget(self):
        """Tool passes budget_usd to TaskOptions."""
        tool = self._make_tool()
        tool.client.run_task.return_value = TaskResult(
            task_id="t2", status="completed", output="done"
        )
        tool("prompt", budget_usd=2.5)
        call_args = tool.client.run_task.call_args[0][0]
        assert call_args.budget_usd == 2.5

    def test_close(self):
        """Close delegates to client."""
        tool = self._make_tool()
        tool.close()
        tool.client.close.assert_called_once()


class TestCreateAutogenToolFactory:
    """Tests for the factory function."""

    def test_factory_is_callable(self):
        """Factory function exists and is callable."""
        assert callable(create_autogen_tool)

    def test_factory_returns_tool(self):
        """Factory creates a QosAutoGenTool instance."""
        tool = create_autogen_tool()
        assert isinstance(tool, QosAutoGenTool)
        tool.close()
