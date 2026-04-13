---
title: "LangChain Integration"
description: "Use Qualixar OS as a LangChain tool for agent orchestration, cost tracking, and multi-agent topologies"
category: "frameworks"
tags: ["langchain", "integration", "tool", "agent", "adapter"]
last_updated: "2026-04-13"
---

# LangChain Integration

The LangChain adapter wraps Qualixar OS as a `BaseTool` that any LangChain agent can invoke. Your agent describes a task in natural language, and Qualixar OS handles orchestration, model routing, cost tracking, and output delivery.

**Source:** `adapters/langchain_adapter.py`

## Install

```bash
pip install langchain-core httpx
```

`langchain-core` provides `BaseTool` and Pydantic support. The adapter imports it lazily, so it will not break if you install `httpx` alone for other adapters.

## Quick Start

```python
from adapters.langchain_adapter import create_qos_tool

# Connect to a running Qualixar OS server
tool = create_qos_tool("http://localhost:3000")

# Invoke directly
result = tool.invoke({
    "prompt": "Analyze auth.py for security vulnerabilities",
    "task_type": "analysis",
})
print(result)  # Output string from Qualixar OS
```

## Use with a LangChain Agent

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_openai import ChatOpenAI
from adapters.langchain_adapter import create_qos_tool

# Create the Qualixar OS tool
qos_tool = create_qos_tool("http://localhost:3000")

# Build a LangChain agent that can call Qualixar OS
llm = ChatOpenAI(model="gpt-4o")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant. Use the qos tool for complex tasks."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, [qos_tool], prompt)
executor = AgentExecutor(agent=agent, tools=[qos_tool])

result = executor.invoke({
    "input": "Write unit tests for the authentication module"
})
print(result["output"])
```

## Factory Function

```python
create_qos_tool(
    base_url: str = "http://localhost:3000",
) -> QosTool
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `base_url` | `http://localhost:3000` | Qualixar OS server URL |

Returns a `QosTool` instance. Raises `ImportError` if `langchain-core` is not installed.

## Input Schema

The tool registers a Pydantic `QosInput` schema so LangChain agents can discover parameters via tool calling:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prompt` | `str` | required | Task description |
| `task_type` | `str` | `"custom"` | One of: `code`, `research`, `analysis`, `creative`, `custom` |
| `budget_usd` | `float` | `None` | Maximum spend for this task in USD |
| `topology` | `str` | `None` | Topology override (e.g. `pipeline`, `debate`, `mixture_of_agents`) |

## Topology Override

Route your task to a specific multi-agent topology:

```python
result = tool.invoke({
    "prompt": "Compare three approaches to caching and pick the best one",
    "task_type": "analysis",
    "topology": "debate",
})
```

See [Execution Topologies](../reference/topologies.md) for all 13 supported topologies.

## Budget Caps

Prevent runaway costs by setting a per-task budget:

```python
result = tool.invoke({
    "prompt": "Research the latest trends in LLM fine-tuning",
    "task_type": "research",
    "budget_usd": 1.50,
})
```

If the task would exceed the budget, Qualixar OS stops execution and returns a partial result.

## Error Handling

The tool raises `RuntimeError` if a task fails:

```python
try:
    result = tool.invoke({"prompt": "Do something risky"})
except RuntimeError as e:
    print(f"Task failed: {e}")
```

## Async Support

Async execution (`_arun`) is not yet supported. The tool runs synchronously inside `_run`, blocking until the Qualixar OS task completes. Internally, the `QosClient.run_task()` method submits the task asynchronously (HTTP 202) and polls for completion. If you need non-blocking behavior, call the REST API directly using `httpx.AsyncClient` (see [Custom Integration](custom-integration.md)).

## How It Works Internally

1. `create_qos_tool()` creates a `QosClient` and injects it into a `QosTool` instance
2. When LangChain calls `_run()`, the tool builds a `TaskOptions` dataclass from the input
3. `QosClient.run_task()` sends `POST /api/tasks` to the Qualixar OS server
4. The server returns HTTP 202 with a `taskId` and `status: "pending"` -- the task executes asynchronously
5. The client polls `GET /api/tasks/:id` until the task completes or fails
6. The tool extracts `result.output` and returns it as a string to LangChain

## What is Next

- [CrewAI Integration](crewai.md) -- Use Qualixar OS in CrewAI crews
- [Custom Integration](custom-integration.md) -- Build your own adapter using the REST API
- [API Endpoints Reference](../reference/api-endpoints.md) -- Full endpoint documentation
