---
title: "Google ADK Integration"
description: "Use Qualixar OS with Google's Agent Development Kit (ADK) as a FunctionTool"
category: "frameworks"
tags: ["google-adk", "adk", "integration", "function-tool", "adapter"]
last_updated: "2026-04-13"
---

# Google ADK Integration

The ADK adapter wraps Qualixar OS as a Google ADK `FunctionTool`. It exposes a plain Python function (`run_qos_task`) that ADK agents can call. Each invocation creates a short-lived HTTP client, submits the task, and returns the output string.

**Source:** `adapters/adk_adapter.py`

## Install

```bash
pip install google-adk httpx
```

The adapter imports `google.adk.tools.FunctionTool` lazily. If `google-adk` is not installed, `create_adk_tool()` raises `ImportError`.

## Quick Start

```python
from adapters.adk_adapter import create_adk_tool

# Create a FunctionTool wrapping Qualixar OS
tool = create_adk_tool("http://localhost:3000")

# The tool is now a google.adk.tools.FunctionTool
# Use it with any ADK agent
```

## The Wrapped Function

The adapter wraps this function as a `FunctionTool`:

```python
def run_qos_task(
    prompt: str,
    task_type: str = "custom",
    budget_usd: float | None = None,
) -> str:
    """Submit a task to Qualixar OS agent operating system."""
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `str` | required | Task description |
| `task_type` | `str` | `"custom"` | One of: `code`, `research`, `analysis`, `creative`, `custom` |
| `budget_usd` | `float` | `None` | Maximum spend for this task in USD |

The function returns the output string from Qualixar OS.

## Use with an ADK Agent

```python
from google.adk import Agent
from adapters.adk_adapter import create_adk_tool

qos_tool = create_adk_tool("http://localhost:3000")

agent = Agent(
    name="developer",
    model="gemini-2.0-flash",
    instruction="You are a developer. Use the run_qos_task tool for complex tasks.",
    tools=[qos_tool],
)
```

## Direct Function Call

You can also call the underlying function directly without ADK:

```python
from adapters.adk_adapter import run_qos_task

output = run_qos_task(
    prompt="Write a Python function to parse CSV files with error handling",
    task_type="code",
    budget_usd=1.0,
)
print(output)
```

Each call creates and closes its own `QosClient`, so there is no state to manage.

## Factory Function

```python
create_adk_tool(
    base_url: str = "http://localhost:3000",
) -> FunctionTool
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `base_url` | `http://localhost:3000` | Qualixar OS server URL |

Returns a `google.adk.tools.FunctionTool`. Raises `ImportError` if `google-adk` is not installed.

## Stateless Design

Unlike the LangChain and CrewAI adapters, which hold a persistent `QosClient`, the ADK adapter creates a new HTTP client per invocation and closes it in a `finally` block. This matches ADK's stateless function tool model. The trade-off is slightly higher latency per call due to connection setup.

If you need persistent connections or access to the full `TaskResult` (cost, duration, metadata), use the [Python client](custom-integration.md) directly.

## Error Handling

The function propagates HTTP errors from `httpx` and does not catch `RuntimeError` internally. Wrap calls in try/except if your ADK agent needs graceful error handling:

```python
try:
    output = run_qos_task("Risky analysis", task_type="analysis")
except Exception as e:
    output = f"Task failed: {e}"
```

## What is Next

- [Custom Integration](custom-integration.md) -- Use the REST API from any framework
- [LangChain Integration](langchain.md) -- Use Qualixar OS as a LangChain tool
- [API Endpoints Reference](../reference/api-endpoints.md) -- Full endpoint documentation
