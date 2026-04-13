"""Tests for CrewAI adapter (H-06)."""

import pytest
from unittest.mock import MagicMock
from client import QosClient, TaskOptions, TaskResult


class TestCreateCrewaiTool:
    """Tests for the CrewAI tool factory."""

    def test_import_guard_without_crewai(self):
        """Factory raises ImportError when crewai is not installed."""
        from crewai_adapter import HAS_CREWAI, create_crewai_tool

        if not HAS_CREWAI:
            with pytest.raises(ImportError, match="crewai required"):
                create_crewai_tool()

    def test_module_loads_without_error(self):
        """Module can be imported regardless of crewai availability."""
        import crewai_adapter
        assert hasattr(crewai_adapter, "create_crewai_tool")
        assert hasattr(crewai_adapter, "HAS_CREWAI")

    def test_has_crewai_is_bool(self):
        from crewai_adapter import HAS_CREWAI
        assert isinstance(HAS_CREWAI, bool)


class TestQosCrewToolWithMock:
    """Tests for QosCrewTool behavior with mocked client (if crewai is available)."""

    def test_tool_class_exists_when_crewai_available(self):
        from crewai_adapter import HAS_CREWAI

        if HAS_CREWAI:
            from crewai_adapter import QosCrewTool  # type: ignore[attr-defined]
            tool = QosCrewTool(client=MagicMock())
            assert tool.name == "Qualixar OS Task Runner"
            assert "Qualixar OS" in tool.description
