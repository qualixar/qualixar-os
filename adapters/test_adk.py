"""Tests for Google ADK adapter (H-06)."""

import pytest
from unittest.mock import MagicMock, patch
from client import QosClient, TaskOptions, TaskResult


class TestRunQosTask:
    """Tests for the standalone run_qos_task function."""

    def test_function_exists(self):
        from adk_adapter import run_qos_task
        assert callable(run_qos_task)

    @patch("adk_adapter.QosClient")
    def test_function_calls_client(self, mock_client_cls):
        """Function creates a client, runs task, and closes."""
        mock_instance = MagicMock()
        mock_instance.run_task.return_value = TaskResult(
            task_id="t1", status="completed", output="adk result"
        )
        mock_client_cls.return_value = mock_instance

        from adk_adapter import run_qos_task
        result = run_qos_task("test prompt", task_type="analysis")

        assert result == "adk result"
        mock_instance.run_task.assert_called_once()
        mock_instance.close.assert_called_once()

    @patch("adk_adapter.QosClient")
    def test_function_closes_on_error(self, mock_client_cls):
        """Client is closed even when run_task raises."""
        mock_instance = MagicMock()
        mock_instance.run_task.side_effect = Exception("API down")
        mock_client_cls.return_value = mock_instance

        from adk_adapter import run_qos_task
        with pytest.raises(Exception, match="API down"):
            run_qos_task("test")

        mock_instance.close.assert_called_once()


class TestCreateAdkTool:
    """Tests for the ADK tool factory."""

    def test_import_guard_without_adk(self):
        """Factory raises ImportError when google-adk is not installed."""
        from adk_adapter import HAS_ADK, create_adk_tool

        if not HAS_ADK:
            with pytest.raises(ImportError, match="google-adk required"):
                create_adk_tool()

    def test_module_loads_without_error(self):
        """Module can be imported regardless of google-adk availability."""
        import adk_adapter
        assert hasattr(adk_adapter, "create_adk_tool")
        assert hasattr(adk_adapter, "HAS_ADK")
        assert hasattr(adk_adapter, "run_qos_task")

    def test_has_adk_is_bool(self):
        from adk_adapter import HAS_ADK
        assert isinstance(HAS_ADK, bool)
