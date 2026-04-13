---
title: "Framework Integrations"
description: "Use Qualixar OS from LangChain, CrewAI, AutoGen, Google ADK, or any Python framework"
category: "frameworks"
tags: ["frameworks", "langchain", "crewai", "autogen", "adk", "integration", "adapters"]
last_updated: "2026-04-13"
---

# Framework Integrations

Qualixar OS provides Python adapters that connect it to popular AI agent frameworks. Each adapter wraps the Qualixar OS REST API as a native tool for the target framework, so you can use Qualixar OS capabilities -- Forge team design, 13 execution topologies, cost tracking, judge pipelines, and the skill marketplace -- from within the framework you already use.

## Supported Frameworks

| Framework | Adapter | Import | Status |
|-----------|---------|--------|--------|
| **LangChain** | `langchain_adapter.py` | `from adapters.langchain_adapter import create_qos_tool` | Ready |
| **CrewAI** | `crewai_adapter.py` | `from adapters.crewai_adapter import create_crewai_tool` | Ready |
| **AutoGen** | `autogen_adapter.py` | `from adapters.autogen_adapter import create_autogen_tool` | Ready |
| **Google ADK** | `adk_adapter.py` | `from adapters.adk_adapter import create_adk_tool` | Ready |
| **Direct HTTP** | `client.py` | `from adapters.client import QosClient` | Ready |
| **Semantic Kernel** | REST API | Use `/api/tasks` directly | Planned |

## Why Use Qualixar OS with an Existing Framework

You already have agents in LangChain or CrewAI. Why add Qualixar OS?

1. **Forge team design** -- Describe a task in natural language and Qualixar OS auto-designs the agent team, selecting roles, models, tools, and topology. Your framework agent delegates the hard orchestration to Qualixar OS.
2. **13 execution topologies** -- Pipeline, debate, tournament, map-reduce, mesh, and more. Your single-agent framework call fans out into a multi-agent workflow inside Qualixar OS.
3. **Cost tracking** -- Every task returns `cost_usd` and `duration_ms`. Budget caps prevent runaway spending. The `/api/cost` endpoint gives cumulative spend.
4. **Judge pipelines** -- Built-in quality assurance. Qualixar OS can run a judge agent that evaluates output before returning it.
5. **Skill marketplace** -- Tasks can use skills from the Qualixar OS marketplace, giving your framework agents capabilities they do not have natively.
6. **Provider routing** -- Qualixar OS routes to 15+ providers (Ollama, OpenRouter, Anthropic, OpenAI, Azure, Google). Your adapter call does not need to know which provider is running.

## How Adapters Work

All adapters follow the same pattern:

1. Your framework agent calls the adapter tool with a prompt
2. The adapter sends an HTTP POST to `POST /api/tasks` on the Qualixar OS server
3. Qualixar OS orchestrates agents, tracks cost, and returns a result
4. The adapter extracts the output string and returns it to your framework

```
LangChain Agent
    |
    v
QosTool._run(prompt)
    |
    v
QosClient.run_task(TaskOptions)
    |
    HTTP POST /api/tasks
    |
    v
Qualixar OS Server
    |
    v
TaskResult { task_id, status, output, cost_usd, duration_ms }
```

## Requirements

- **Python 3.10+**
- `pip install httpx` (required by all adapters)
- Framework-specific packages are imported lazily -- install only what you need
- Qualixar OS server running (`qos serve`)

## Common Parameters

All adapters accept these parameters when submitting a task:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | `str` | required | The task description |
| `task_type` | `str` | `"custom"` | One of: `code`, `research`, `analysis`, `creative`, `custom` |
| `budget_usd` | `float` | `None` | Maximum spend for this task |
| `topology` | `str` | `None` | Topology override (e.g. `pipeline`, `debate`, `parallel`) |

## Choosing an Adapter

- **Already using LangChain?** Use the [LangChain adapter](langchain.md). It extends `BaseTool` with a Pydantic input schema.
- **Already using CrewAI?** Use the [CrewAI adapter](crewai.md). It extends `CrewAIBaseTool` with default budget support.
- **Already using AutoGen?** Use the [AutoGen adapter](autogen.md). It implements the callable protocol for tool registration.
- **Using Google ADK?** Use the [ADK adapter](openai-agents.md). It wraps a plain Python function as a `FunctionTool`.
- **Using something else?** Use the [custom integration guide](custom-integration.md). The REST API works from any language or framework.

## What is Next

- [LangChain Integration](langchain.md)
- [CrewAI Integration](crewai.md)
- [AutoGen Integration](autogen.md)
- [Google ADK Integration](openai-agents.md)
- [Semantic Kernel (Planned)](semantic-kernel.md)
- [Custom Integration via REST API](custom-integration.md)
