"""Tests for LangChain adapter (H-06)."""

import pytest
from unittest.mock import MagicMock, patch
from client import QosClient, TaskOptions, TaskResult


class TestCreateQosTool:
    """Tests for the LangChain tool factory."""

    def test_import_guard_without_langchain(self):
        """Factory raises ImportError when langchain-core is not installed."""
        from langchain_adapter import HAS_LANGCHAIN, create_qos_tool

        if not HAS_LANGCHAIN:
            with pytest.raises(ImportError, match="langchain-core required"):
                create_qos_tool()

    def test_module_loads_without_error(self):
        """Module can be imported regardless of langchain availability."""
        import langchain_adapter
        assert hasattr(langchain_adapter, "create_qos_tool")
        assert hasattr(langchain_adapter, "HAS_LANGCHAIN")

    def test_has_langchain_is_bool(self):
        from langchain_adapter import HAS_LANGCHAIN
        assert isinstance(HAS_LANGCHAIN, bool)


class TestQosToolWithMock:
    """Tests for QosTool behavior with mocked client (if langchain is available)."""

    def test_tool_attributes_exist_when_langchain_available(self):
        """Verify QosTool class is defined when langchain-core is installed."""
        from langchain_adapter import HAS_LANGCHAIN

        if HAS_LANGCHAIN:
            from langchain_adapter import QosTool, QosInput  # type: ignore[attr-defined]
            assert QosTool is not None
            assert QosInput is not None
            # Check tool class attributes
            tool = QosTool(client=MagicMock())
            assert tool.name == "qos"
            assert "Qualixar OS" in tool.description
