"""Qualixar OS Python client — HTTP adapter for the Qualixar OS REST API."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass(frozen=True)
class TaskOptions:
    """Immutable options for submitting a task to Qualixar OS."""

    prompt: str
    type: str = "custom"
    mode: str = "companion"
    budget_usd: float | None = None
    topology: str | None = None
    simulate: bool = False


@dataclass(frozen=True)
class TaskResult:
    """Immutable result returned after a Qualixar OS task completes."""

    task_id: str
    status: str
    output: str = ""
    cost_usd: float = 0.0
    duration_ms: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


class QosClient:
    """Synchronous HTTP client for the Qualixar OS agent operating system API."""

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        timeout: float = 120.0,
        *,
        _client: httpx.Client | None = None,
    ) -> None:
        self._client = _client or httpx.Client(base_url=base_url, timeout=timeout)

    # ── Task lifecycle ──────────────────────────────────────────

    def run_task(self, options: TaskOptions) -> TaskResult:
        """POST /api/tasks — submit a task and return the result."""
        payload: dict[str, Any] = {
            "prompt": options.prompt,
            "type": options.type,
            "mode": options.mode,
            "simulate": options.simulate,
        }
        if options.budget_usd is not None:
            payload["budget_usd"] = options.budget_usd
        if options.topology is not None:
            payload["topology"] = options.topology

        resp = self._client.post("/api/tasks", json=payload)
        resp.raise_for_status()
        data = resp.json()

        return TaskResult(
            task_id=data.get("task_id", ""),
            status=data.get("status", "unknown"),
            output=data.get("output", ""),
            cost_usd=float(data.get("cost_usd", 0.0)),
            duration_ms=int(data.get("duration_ms", 0)),
            metadata=data.get("metadata", {}),
        )

    def get_status(self, task_id: str) -> dict[str, Any]:
        """GET /api/tasks/:id — fetch current task status."""
        resp = self._client.get(f"/api/tasks/{task_id}")
        resp.raise_for_status()
        return resp.json()

    def list_tasks(
        self, status: str | None = None, limit: int = 20
    ) -> list[dict[str, Any]]:
        """GET /api/tasks — list tasks with optional filters."""
        params: dict[str, Any] = {"limit": limit}
        if status is not None:
            params["status"] = status
        resp = self._client.get("/api/tasks", params=params)
        resp.raise_for_status()
        return resp.json()

    def pause_task(self, task_id: str) -> None:
        """POST /api/tasks/:id/pause — pause a running task."""
        resp = self._client.post(f"/api/tasks/{task_id}/pause")
        resp.raise_for_status()

    def resume_task(self, task_id: str) -> None:
        """POST /api/tasks/:id/resume — resume a paused task."""
        resp = self._client.post(f"/api/tasks/{task_id}/resume")
        resp.raise_for_status()

    def cancel_task(self, task_id: str) -> None:
        """POST /api/tasks/:id/cancel — cancel a task."""
        resp = self._client.post(f"/api/tasks/{task_id}/cancel")
        resp.raise_for_status()

    # ── Cost & memory ───────────────────────────────────────────

    def get_cost(self) -> dict[str, Any]:
        """GET /api/cost — retrieve cost tracking data."""
        resp = self._client.get("/api/cost")
        resp.raise_for_status()
        return resp.json()

    def search_memory(self, query: str, **kwargs: Any) -> list[dict[str, Any]]:
        """GET /api/memory/search — search agent memory."""
        params: dict[str, Any] = {"q": query, **kwargs}
        resp = self._client.get("/api/memory/search", params=params)
        resp.raise_for_status()
        return resp.json()

    # ── Health ──────────────────────────────────────────────────

    def health(self) -> dict[str, Any]:
        """GET /api/health — system health check."""
        resp = self._client.get("/api/health")
        resp.raise_for_status()
        return resp.json()

    # ── Lifecycle ───────────────────────────────────────────────

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> "QosClient":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()
