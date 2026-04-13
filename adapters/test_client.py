"""Tests for Qualixar OS Python client (H-06)."""

import pytest
from unittest.mock import MagicMock, patch
from client import QosClient, TaskOptions, TaskResult


class TestTaskOptions:
    """Tests for the TaskOptions dataclass."""

    def test_create_with_defaults(self):
        opts = TaskOptions(prompt="test prompt")
        assert opts.prompt == "test prompt"
        assert opts.type == "custom"
        assert opts.mode == "companion"
        assert opts.budget_usd is None
        assert opts.topology is None
        assert opts.simulate is False

    def test_create_with_all_fields(self):
        opts = TaskOptions(
            prompt="build a CLI",
            type="code",
            mode="power",
            budget_usd=5.0,
            topology="sequential",
            simulate=True,
        )
        assert opts.prompt == "build a CLI"
        assert opts.type == "code"
        assert opts.mode == "power"
        assert opts.budget_usd == 5.0
        assert opts.topology == "sequential"
        assert opts.simulate is True

    def test_frozen_immutability(self):
        opts = TaskOptions(prompt="test")
        with pytest.raises(AttributeError):
            opts.prompt = "modified"  # type: ignore[misc]


class TestTaskResult:
    """Tests for the TaskResult dataclass."""

    def test_create_with_defaults(self):
        result = TaskResult(task_id="t1", status="completed")
        assert result.task_id == "t1"
        assert result.status == "completed"
        assert result.output == ""
        assert result.cost_usd == 0.0
        assert result.duration_ms == 0
        assert result.metadata == {}

    def test_create_with_all_fields(self):
        result = TaskResult(
            task_id="t2",
            status="failed",
            output="error occurred",
            cost_usd=0.05,
            duration_ms=1234,
            metadata={"key": "value"},
        )
        assert result.output == "error occurred"
        assert result.cost_usd == 0.05

    def test_frozen_immutability(self):
        result = TaskResult(task_id="t1", status="completed")
        with pytest.raises(AttributeError):
            result.status = "failed"  # type: ignore[misc]


class TestQosClient:
    """Tests for QosClient with mocked HTTP client."""

    def setup_method(self):
        self.mock_client = MagicMock()
        self.client = QosClient(_client=self.mock_client)

    def test_health_check(self):
        self.mock_client.get.return_value = MagicMock(
            json=lambda: {"status": "ok"},
            raise_for_status=MagicMock(),
        )
        result = self.client.health()
        assert result["status"] == "ok"
        self.mock_client.get.assert_called_with("/api/health")

    def test_run_task(self):
        self.mock_client.post.return_value = MagicMock(
            json=lambda: {
                "task_id": "abc-123",
                "status": "completed",
                "output": "done",
                "cost_usd": 0.01,
                "duration_ms": 500,
            },
            raise_for_status=MagicMock(),
        )
        opts = TaskOptions(prompt="build it")
        result = self.client.run_task(opts)
        assert isinstance(result, TaskResult)
        assert result.task_id == "abc-123"
        assert result.status == "completed"
        assert result.output == "done"

    def test_get_status(self):
        self.mock_client.get.return_value = MagicMock(
            json=lambda: {"task": {"id": "t1", "status": "running"}},
            raise_for_status=MagicMock(),
        )
        result = self.client.get_status("t1")
        assert result["task"]["status"] == "running"

    def test_list_tasks(self):
        self.mock_client.get.return_value = MagicMock(
            json=lambda: [{"id": "t1"}, {"id": "t2"}],
            raise_for_status=MagicMock(),
        )
        result = self.client.list_tasks(limit=10)
        assert len(result) == 2

    def test_pause_task(self):
        self.mock_client.post.return_value = MagicMock(
            raise_for_status=MagicMock(),
        )
        self.client.pause_task("t1")
        self.mock_client.post.assert_called_with("/api/tasks/t1/pause")

    def test_resume_task(self):
        self.mock_client.post.return_value = MagicMock(
            raise_for_status=MagicMock(),
        )
        self.client.resume_task("t1")
        self.mock_client.post.assert_called_with("/api/tasks/t1/resume")

    def test_cancel_task(self):
        self.mock_client.post.return_value = MagicMock(
            raise_for_status=MagicMock(),
        )
        self.client.cancel_task("t1")
        self.mock_client.post.assert_called_with("/api/tasks/t1/cancel")

    def test_get_cost(self):
        self.mock_client.get.return_value = MagicMock(
            json=lambda: {"cost": {"total_usd": 0.5}},
            raise_for_status=MagicMock(),
        )
        result = self.client.get_cost()
        assert result["cost"]["total_usd"] == 0.5

    def test_search_memory(self):
        self.mock_client.get.return_value = MagicMock(
            json=lambda: [{"content": "test"}],
            raise_for_status=MagicMock(),
        )
        result = self.client.search_memory("test query")
        assert len(result) == 1

    def test_context_manager(self):
        with QosClient(_client=self.mock_client) as client:
            assert client is not None
        self.mock_client.close.assert_called_once()

    def test_close(self):
        self.client.close()
        self.mock_client.close.assert_called_once()
