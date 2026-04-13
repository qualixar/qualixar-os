# Qualixar OS Python Adapters

Python client and framework adapters for the Qualixar OS agent operating system.

## Quick Start

```bash
pip install httpx
```

```python
from adapters.client import QosClient, TaskOptions

with QosClient("http://localhost:3000") as client:
    result = client.run_task(TaskOptions(prompt="Analyze this codebase", type="code"))
    print(result.output)
    print(f"Cost: ${result.cost_usd:.4f}")
```

## Adapters

| Adapter | Framework | Install | Status |
|---------|-----------|---------|--------|
| `client.py` | Direct HTTP client | `pip install httpx` | Ready |
| `langchain_adapter.py` | LangChain | `pip install langchain-core httpx` | Ready |
| `crewai_adapter.py` | CrewAI | `pip install crewai httpx` | Ready |
| `autogen_adapter.py` | AutoGen | `pip install httpx` | Ready |
| `adk_adapter.py` | Google ADK | `pip install httpx` | Ready |

## LangChain

```python
from adapters.langchain_adapter import create_qos_tool

tool = create_qos_tool("http://localhost:3000")

# Use with a LangChain agent
from langchain.agents import AgentExecutor, create_tool_calling_agent
agent = create_tool_calling_agent(llm, [tool], prompt)
executor = AgentExecutor(agent=agent, tools=[tool])
result = executor.invoke({"input": "Write unit tests for auth.py"})
```

## CrewAI

```python
from adapters.crewai_adapter import create_crewai_tool
from crewai import Agent, Task, Crew

tool = create_crewai_tool("http://localhost:3000", default_budget_usd=5.0)

agent = Agent(
    role="Developer",
    goal="Build features using Qualixar OS",
    tools=[tool],
)

task = Task(description="Implement the login page", agent=agent)
crew = Crew(agents=[agent], tasks=[task])
crew.kickoff()
```

## AutoGen

```python
from adapters.autogen_adapter import create_autogen_tool

tool = create_autogen_tool("http://localhost:3000")

# Direct usage
output = tool("Analyze security vulnerabilities", task_type="analysis")

# Full result with metadata
result = tool.get_result("Optimize database queries", type="code")
print(f"Duration: {result.duration_ms}ms, Cost: ${result.cost_usd:.4f}")

# Cleanup
tool.close()
```

## Requirements

- Python 3.10+
- `httpx` for HTTP client
- Framework-specific dependencies (optional, imported only when used)

## Features

All adapters support:
- Task type selection (code, research, analysis, creative, custom)
- Budget caps (per-task or default)
- Topology override (pipeline, debate, ensemble, etc.)
- Error handling with RuntimeError on task failure
- Immutable data classes for type safety
