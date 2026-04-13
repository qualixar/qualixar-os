---
title: "AutoGen Integration"
description: "Use Qualixar OS with Microsoft AutoGen for agent orchestration and cost-tracked task execution"
category: "frameworks"
tags: ["autogen", "microsoft", "integration", "tool", "adapter"]
last_updated: "2026-04-13"
---

# AutoGen Integration

The AutoGen adapter wraps Qualixar OS as a callable tool compatible with AutoGen's function-calling protocol. The adapter is a plain Python dataclass -- no framework dependency required. It implements `__call__` so AutoGen can invoke it directly as a function tool.

**Source:** `adapters/autogen_adapter.py`

## Install

```bash
pip install httpx
```

No AutoGen-specific package is required for the adapter itself. It uses Python's callable protocol, which AutoGen recognizes natively.

## Quick Start

```python
from adapters.autogen_adapter import create_autogen_tool

tool = create_autogen_tool("http://localhost:3000")

# Call directly -- returns the output string
output = tool("Analyze this codebase for security vulnerabilities", task_type="analysis")
print(output)

# Clean up
tool.close()
```

## Full Result with Metadata

Use `get_result()` when you need cost, duration, and task metadata beyond the output string:

```python
from adapters.autogen_adapter import create_autogen_tool

tool = create_autogen_tool("http://localhost:3000")

result = tool.get_result(
    "Optimize database queries for the user service",
    type="code",
    budget_usd=2.0,
)

print(f"Output: {result.output}")
print(f"Cost: ${result.cost_usd:.4f}")
print(f"Duration: {result.duration_ms}ms")
print(f"Task ID: {result.task_id}")
print(f"Status: {result.status}")

tool.close()
```

## Factory Function

```python
create_autogen_tool(
    base_url: str = "http://localhost:3000",
    default_budget_usd: float | None = None,
) -> QosAutoGenTool
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `base_url` | `http://localhost:3000` | Qualixar OS server URL |
| `default_budget_usd` | `None` | Default budget cap applied unless overridden per call |

## Callable Parameters

When calling the tool as a function:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `str` | required | Task description |
| `task_type` | `str` | `"custom"` | One of: `code`, `research`, `analysis`, `creative`, `custom` |
| `budget_usd` | `float` | `None` | Per-call budget override |
| `topology` | `str` | `None` | Topology override |

## Register with AutoGen Agents

```python
from autogen import ConversableAgent
from adapters.autogen_adapter import create_autogen_tool

qos_tool = create_autogen_tool("http://localhost:3000", default_budget_usd=5.0)

assistant = ConversableAgent(
    name="assistant",
    llm_config={"config_list": [{"model": "gpt-4o"}]},
)

# Register the tool for the assistant to call
assistant.register_for_llm(
    name=qos_tool.name,
    description=qos_tool.description,
)(qos_tool)
```

## Topology Routing

Route tasks to specific multi-agent topologies inside Qualixar OS:

```python
# Debate topology: three agents argue, a judge picks the best answer
output = tool(
    "What is the best caching strategy for a high-traffic API?",
    task_type="analysis",
    topology="debate",
)

# Pipeline topology: sequential processing stages
output = tool(
    "Research OAuth 2.1, draft an implementation plan, then review it",
    task_type="research",
    topology="pipeline",
)
```

## Error Handling

Both `__call__` and `get_result` raise `RuntimeError` on task failure:

```python
try:
    output = tool("Do something risky", task_type="code")
except RuntimeError as e:
    print(f"Task failed: {e}")
finally:
    tool.close()
```

## Lifecycle

The adapter holds an open `httpx.Client`. Call `close()` when finished:

```python
tool = create_autogen_tool("http://localhost:3000")
try:
    output = tool("Analyze the auth module")
finally:
    tool.close()
```

## What is Next

- [LangChain Integration](langchain.md) -- Use Qualixar OS as a LangChain tool
- [CrewAI Integration](crewai.md) -- Use Qualixar OS in CrewAI crews
- [Custom Integration](custom-integration.md) -- Build your own adapter
