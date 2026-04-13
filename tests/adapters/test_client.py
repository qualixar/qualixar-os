"""Tests for QosClient using httpx.MockTransport."""

from __future__ import annotations

import json
from typing import Any

import httpx

from adapters.client import QosClient, TaskOptions, TaskResult


# ── Helpers ─────────────────────────────────────────────────────


def _make_mock_transport(
    responses: dict[str, Any],
) -> httpx.MockTransport:
    """Create a MockTransport that returns canned JSON by path."""

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method

        key = f"{method} {path}"
        if key in responses:
            body = responses[key]
        elif path in responses:
            body = responses[path]
        else:
            return httpx.Response(404, json={"error": "not found"})

        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


def _make_client(responses: dict[str, Any]) -> QosClient:
    """Build a QosClient backed by a mock transport."""
    transport = _make_mock_transport(responses)
    http_client = httpx.Client(
        base_url="http://test", transport=transport
    )
    return QosClient(_client=http_client)


# ── Tests ───────────────────────────────────────────────────────


class TestRunTask:
    def test_returns_task_result(self) -> None:
        responses = {
            "POST /api/tasks": {
                "task_id": "t-001",
                "status": "completed",
                "output": "Hello from Qualixar OS",
                "cost_usd": 0.05,
                "duration_ms": 1200,
                "metadata": {"model": "opus"},
            }
        }
        client = _make_client(responses)
        result = client.run_task(
            TaskOptions(prompt="Say hello", type="custom")
        )

        assert isinstance(result, TaskResult)
        assert result.task_id == "t-001"
        assert result.status == "completed"
        assert result.output == "Hello from Qualixar OS"
        assert result.cost_usd == 0.05
        assert result.duration_ms == 1200
        assert result.metadata == {"model": "opus"}
        client.close()

    def test_optional_fields_default(self) -> None:
        responses = {
            "POST /api/tasks": {
                "task_id": "t-002",
                "status": "queued",
            }
        }
        client = _make_client(responses)
        result = client.run_task(TaskOptions(prompt="test"))

        assert result.output == ""
        assert result.cost_usd == 0.0
        assert result.duration_ms == 0
        assert result.metadata == {}
        client.close()

    def test_budget_and_topology_sent(self) -> None:
        """Verify optional payload fields are forwarded."""
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["body"] = json.loads(request.content)
            return httpx.Response(
                200,
                json={"task_id": "t-003", "status": "running"},
            )

        transport = httpx.MockTransport(handler)
        http_client = httpx.Client(
            base_url="http://test", transport=transport
        )
        client = QosClient(_client=http_client)
        client.run_task(
            TaskOptions(
                prompt="analyze",
                budget_usd=1.0,
                topology="pipeline",
            )
        )

        assert captured["body"]["budget_usd"] == 1.0
        assert captured["body"]["topology"] == "pipeline"
        client.close()


class TestGetStatus:
    def test_returns_status_dict(self) -> None:
        responses = {
            "/api/tasks/t-100": {
                "task_id": "t-100",
                "status": "running",
                "progress": 42,
            }
        }
        client = _make_client(responses)
        status = client.get_status("t-100")

        assert status["task_id"] == "t-100"
        assert status["status"] == "running"
        assert status["progress"] == 42
        client.close()


class TestListTasks:
    def test_returns_list(self) -> None:
        responses = {
            "/api/tasks": [
                {"task_id": "t-1", "status": "completed"},
                {"task_id": "t-2", "status": "running"},
            ]
        }
        client = _make_client(responses)
        tasks = client.list_tasks()

        assert len(tasks) == 2
        assert tasks[0]["task_id"] == "t-1"
        client.close()


class TestTaskLifecycle:
    def test_pause_resume_cancel(self) -> None:
        """Pause, resume, and cancel all hit the right endpoints."""
        called: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            called.append(f"{request.method} {request.url.path}")
            return httpx.Response(200, json={"ok": True})

        transport = httpx.MockTransport(handler)
        http_client = httpx.Client(
            base_url="http://test", transport=transport
        )
        client = QosClient(_client=http_client)

        client.pause_task("t-50")
        client.resume_task("t-50")
        client.cancel_task("t-50")

        assert "POST /api/tasks/t-50/pause" in called
        assert "POST /api/tasks/t-50/resume" in called
        assert "POST /api/tasks/t-50/cancel" in called
        client.close()


class TestHealth:
    def test_returns_health_dict(self) -> None:
        responses = {
            "/api/health": {"status": "healthy", "uptime_ms": 99000}
        }
        client = _make_client(responses)
        h = client.health()

        assert h["status"] == "healthy"
        client.close()


class TestCost:
    def test_returns_cost_dict(self) -> None:
        responses = {
            "/api/cost": {"total_usd": 3.21, "tasks": 15}
        }
        client = _make_client(responses)
        cost = client.get_cost()

        assert cost["total_usd"] == 3.21
        assert cost["tasks"] == 15
        client.close()


class TestMemorySearch:
    def test_returns_results(self) -> None:
        responses = {
            "/api/memory/search": [
                {"id": "m-1", "content": "hello", "score": 0.95}
            ]
        }
        client = _make_client(responses)
        results = client.search_memory("hello")

        assert len(results) == 1
        assert results[0]["score"] == 0.95
        client.close()


class TestContextManager:
    def test_closes_on_exit(self) -> None:
        responses = {"/api/health": {"status": "ok"}}
        client = _make_client(responses)

        with client as c:
            h = c.health()
            assert h["status"] == "ok"

        # After exiting, the underlying client is closed.
        # Attempting another request should raise.
        closed = False
        try:
            client.health()
        except Exception:
            closed = True
        assert closed


class TestDataclassImmutability:
    def test_task_options_frozen(self) -> None:
        opts = TaskOptions(prompt="test")
        try:
            opts.prompt = "changed"  # type: ignore[misc]
            assert False, "Should have raised"
        except AttributeError:
            pass

    def test_task_result_frozen(self) -> None:
        result = TaskResult(task_id="t-1", status="done")
        try:
            result.status = "changed"  # type: ignore[misc]
            assert False, "Should have raised"
        except AttributeError:
            pass
