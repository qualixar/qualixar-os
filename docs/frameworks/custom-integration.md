---
title: "Custom Integration"
description: "Integrate Qualixar OS with any framework using the Python client or REST API"
category: "frameworks"
tags: ["custom", "integration", "rest-api", "python-client", "curl", "adapter"]
last_updated: "2026-04-13"
---

# Custom Integration

Qualixar OS exposes a REST API that works from any language or framework. This guide covers three approaches: the Python client, direct HTTP with curl, and building your own adapter.

## Approach 1: Python Client

The `QosClient` in `adapters/client.py` is a synchronous HTTP client wrapping every Qualixar OS endpoint. All framework adapters (LangChain, CrewAI, AutoGen, ADK) use this client internally.

**Source:** `adapters/client.py`

### Install

```bash
pip install httpx
```

### Submit a Task

```python
from adapters.client import QosClient, TaskOptions

with QosClient("http://localhost:3000") as client:
    result = client.run_task(TaskOptions(
        prompt="Analyze this codebase for security vulnerabilities",
        type="analysis",
        budget_usd=2.0,
        topology="pipeline",
    ))

    print(f"Task ID: {result.task_id}")
    print(f"Status: {result.status}")
    print(f"Output: {result.output}")
    print(f"Cost: ${result.cost_usd:.4f}")
    print(f"Duration: {result.duration_ms}ms")
```

### TaskOptions Fields

```python
@dataclass(frozen=True)
class TaskOptions:
    prompt: str
    type: str = "custom"         # code, research, analysis, creative, custom
    mode: str = "companion"
    budget_usd: float | None = None
    topology: str | None = None  # pipeline, debate, parallel, etc.
    simulate: bool = False       # dry-run mode
```

### TaskResult Fields

```python
@dataclass(frozen=True)
class TaskResult:
    task_id: str
    status: str                  # completed, failed, cancelled
    output: str = ""
    cost_usd: float = 0.0
    duration_ms: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)
```

### Task Management

```python
from adapters.client import QosClient

client = QosClient("http://localhost:3000")

# Check task status
status = client.get_status("tsk_abc123")

# List recent tasks
tasks = client.list_tasks(status="completed", limit=10)

# Pause, resume, cancel
client.pause_task("tsk_abc123")
client.resume_task("tsk_abc123")
client.cancel_task("tsk_abc123")

# Cost tracking
cost_data = client.get_cost()

# Memory search
results = client.search_memory("authentication module")

# Health check
health = client.health()

client.close()
```

## Approach 2: curl / Direct HTTP

Use the REST API from any language or tool.

### Submit a Task

Task submission is **asynchronous**. The server returns HTTP 202 immediately with a `taskId` and `status: "pending"`. The task executes in the background.

```bash
# Step 1: Submit the task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write unit tests for the user service",
    "type": "code",
    "mode": "companion",
    "budget_usd": 3.0,
    "topology": "sequential"
  }'
```

Response (HTTP 202 Accepted):

```json
{
  "taskId": "uuid-here",
  "status": "pending"
}
```

### Poll Task Status

After submitting, poll the task endpoint to check when execution completes:

```bash
# Step 2: Poll until status is "completed" or "failed"
curl http://localhost:3000/api/tasks/<taskId>
```

The task object includes `status`, `result`, `cost_usd`, and timing fields once complete.

### List Tasks

```bash
curl "http://localhost:3000/api/tasks?status=completed&limit=10"
```

### Cost Tracking

```bash
curl http://localhost:3000/api/cost
```

### Health Check

```bash
curl http://localhost:3000/api/health
```

## Approach 3: Build Your Own Adapter

All built-in adapters follow this pattern. Here is a minimal adapter for any framework:

```python
from adapters.client import QosClient, TaskOptions, TaskResult


class MyFrameworkTool:
    """Adapter for MyFramework that delegates to Qualixar OS."""

    def __init__(self, base_url: str = "http://localhost:3000"):
        self._client = QosClient(base_url=base_url)

    def run(self, prompt: str, task_type: str = "custom") -> str:
        result = self._client.run_task(TaskOptions(
            prompt=prompt,
            type=task_type,
        ))
        if result.status == "failed":
            raise RuntimeError(f"Task {result.task_id} failed: {result.output}")
        return result.output

    def run_with_metadata(self, prompt: str, **kwargs) -> TaskResult:
        return self._client.run_task(TaskOptions(prompt=prompt, **kwargs))

    def close(self):
        self._client.close()
```

Key points when building an adapter:

1. **Use `QosClient`** -- Do not call `httpx` directly. The client handles URL construction, error parsing, and response mapping.
2. **Return `TaskResult` or `str`** -- Most frameworks expect a string. Expose `TaskResult` for callers that need cost and duration.
3. **Handle failures** -- Check `result.status == "failed"` and raise an appropriate error for your framework.
4. **Clean up** -- Call `client.close()` or use the context manager protocol.
5. **Immutable data classes** -- `TaskOptions` and `TaskResult` are frozen dataclasses. Create new instances instead of mutating.

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tasks` | Submit a task |
| GET | `/api/tasks/:id` | Get task details |
| GET | `/api/tasks` | List tasks (supports `?status=` and `?limit=`) |
| POST | `/api/tasks/:id/pause` | Pause a running task |
| POST | `/api/tasks/:id/resume` | Resume a paused task |
| POST | `/api/tasks/:id/cancel` | Cancel a task |
| GET | `/api/cost` | Cumulative cost tracking |
| GET | `/api/memory/search` | Search agent memory (supports `?q=`) |
| GET | `/api/health` | System health check |

See [API Endpoints Reference](../reference/api-endpoints.md) for the full list of 27+ endpoints.

## What is Next

- [Framework Overview](overview.md) -- All supported frameworks at a glance
- [LangChain Integration](langchain.md) -- Ready-made LangChain adapter
- [Execution Topologies](../reference/topologies.md) -- All 13 topologies explained
