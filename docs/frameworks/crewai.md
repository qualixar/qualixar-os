---
title: "CrewAI Integration"
description: "Use Qualixar OS as a CrewAI tool to add Forge team design, topologies, and cost tracking to your crews"
category: "frameworks"
tags: ["crewai", "integration", "tool", "crew", "adapter"]
last_updated: "2026-04-13"
---

# CrewAI Integration

The CrewAI adapter wraps Qualixar OS as a `CrewAIBaseTool` that any CrewAI agent can use. When a crew member invokes the tool, Qualixar OS orchestrates a sub-team behind the scenes -- selecting models, topologies, and tools -- and returns the output to your crew pipeline.

**Source:** `adapters/crewai_adapter.py`

## Install

```bash
pip install crewai httpx
```

The adapter imports `crewai.tools.BaseTool` lazily. If `crewai` is not installed, the factory function raises `ImportError` with install instructions.

## Quick Start

```python
from adapters.crewai_adapter import create_crewai_tool
from crewai import Agent, Task, Crew

# Create the Qualixar OS tool with a default budget
tool = create_crewai_tool("http://localhost:3000", default_budget_usd=5.0)

# Give it to a CrewAI agent
developer = Agent(
    role="Developer",
    goal="Build features using Qualixar OS multi-agent teams",
    backstory="You delegate complex tasks to Qualixar OS for orchestration.",
    tools=[tool],
)

task = Task(
    description="Implement a rate limiter for the API gateway",
    agent=developer,
)

crew = Crew(agents=[developer], tasks=[task])
result = crew.kickoff()
print(result)
```

## Factory Function

```python
create_crewai_tool(
    base_url: str = "http://localhost:3000",
    default_budget_usd: float | None = None,
) -> QosCrewTool
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `base_url` | `http://localhost:3000` | Qualixar OS server URL |
| `default_budget_usd` | `None` | Default budget cap applied to every task unless overridden |

Returns a `QosCrewTool` instance. Raises `ImportError` if `crewai` is not installed.

## Tool Parameters

When the CrewAI agent calls the tool, it can pass:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `str` | required | Task description |
| `task_type` | `str` | `"custom"` | One of: `code`, `research`, `analysis`, `creative`, `custom` |
| `budget_usd` | `float` | `None` | Per-task budget override (takes precedence over default) |
| `topology` | `str` | `None` | Topology override (e.g. `pipeline`, `debate`) |

## Default Budget

The `default_budget_usd` parameter sets a spending ceiling for all tasks routed through this tool. Individual calls can override it:

```python
# Default: $5.00 per task
tool = create_crewai_tool("http://localhost:3000", default_budget_usd=5.0)

# This task uses the $5.00 default
tool._run(prompt="Analyze codebase architecture", task_type="analysis")

# This task overrides to $10.00
tool._run(prompt="Deep research on distributed systems", budget_usd=10.0)
```

## Using Forge with CrewAI

You can combine Qualixar OS Forge with your CrewAI workflow. Let Forge design the agent team, then have your crew execute it:

```python
from adapters.client import QosClient, TaskOptions

# Step 1: Use the Qualixar OS client to call Forge for team design
client = QosClient("http://localhost:3000")

# Step 2: Submit a task with a specific topology
result = client.run_task(TaskOptions(
    prompt="Research AI safety, write a report, and peer-review it",
    type="research",
    topology="pipeline",
    budget_usd=3.0,
))

print(f"Output: {result.output}")
print(f"Cost: ${result.cost_usd:.4f}")
print(f"Duration: {result.duration_ms}ms")
client.close()
```

## Multi-Tool Crew Example

Give different Qualixar OS tools to different crew members, each with distinct budgets:

```python
from adapters.crewai_adapter import create_crewai_tool
from crewai import Agent, Task, Crew

# Research tool: higher budget, research type
research_tool = create_crewai_tool("http://localhost:3000", default_budget_usd=8.0)

# Code tool: lower budget, code type
code_tool = create_crewai_tool("http://localhost:3000", default_budget_usd=3.0)

researcher = Agent(
    role="Researcher",
    goal="Gather comprehensive information on the topic",
    tools=[research_tool],
)

developer = Agent(
    role="Developer",
    goal="Implement the solution based on research findings",
    tools=[code_tool],
)

research_task = Task(
    description="Research best practices for API rate limiting",
    agent=researcher,
)

code_task = Task(
    description="Implement the rate limiter based on the research",
    agent=developer,
)

crew = Crew(agents=[researcher, developer], tasks=[research_task, code_task])
crew.kickoff()
```

## Error Handling

The tool raises `RuntimeError` when a Qualixar OS task fails:

```python
try:
    crew.kickoff()
except RuntimeError as e:
    print(f"Qualixar OS task failed: {e}")
```

## How It Works Internally

1. `create_crewai_tool()` creates a `QosClient` and injects it into `QosCrewTool`
2. CrewAI calls `_run(prompt, ...)` when an agent decides to use the tool
3. The tool resolves the effective budget (`budget_usd` argument or `default_budget_usd`)
4. `QosClient.run_task()` sends `POST /api/tasks` with the prompt, type, budget, and topology
5. The server returns HTTP 202 with a `taskId` and `status: "pending"` -- the task executes asynchronously
6. The client polls `GET /api/tasks/:id` until the task completes or fails
7. The tool extracts `result.output` and passes it back to CrewAI

## What is Next

- [AutoGen Integration](autogen.md) -- Use Qualixar OS with Microsoft AutoGen
- [LangChain Integration](langchain.md) -- Use Qualixar OS as a LangChain tool
- [Execution Topologies](../reference/topologies.md) -- All 13 topologies explained
