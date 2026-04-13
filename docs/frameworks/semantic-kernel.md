---
title: "Semantic Kernel Integration (Planned)"
description: "Using Qualixar OS with Microsoft Semantic Kernel via the REST API"
category: "frameworks"
tags: ["semantic-kernel", "microsoft", "integration", "rest-api", "planned"]
last_updated: "2026-04-13"
---

# Semantic Kernel Integration

Qualixar OS does not yet ship a dedicated Semantic Kernel adapter. However, the Qualixar OS REST API works with any HTTP-capable framework. This page shows how to integrate Qualixar OS into a Semantic Kernel application using the HTTP API directly.

## Architecture

```
Semantic Kernel Plugin
    |
    HTTP POST /api/tasks
    |
    v
Qualixar OS Server
    |
    v
JSON Response { task_id, status, output, cost_usd, duration_ms }
```

Semantic Kernel's plugin system supports HTTP-based tools natively. You create a plugin that wraps the Qualixar OS `/api/tasks` endpoint.

## Python: Using Semantic Kernel with httpx

```python
import httpx
from semantic_kernel import Kernel
from semantic_kernel.functions import kernel_function

class QualixarOSPlugin:
    """Semantic Kernel plugin that delegates tasks to Qualixar OS."""

    def __init__(self, base_url: str = "http://localhost:3000"):
        self._base_url = base_url

    @kernel_function(
        name="run_task",
        description="Submit a task to Qualixar OS for multi-agent execution",
    )
    def run_task(
        self,
        prompt: str,
        task_type: str = "custom",
        budget_usd: float = 5.0,
    ) -> str:
        with httpx.Client(base_url=self._base_url, timeout=120.0) as client:
            resp = client.post("/api/tasks", json={
                "prompt": prompt,
                "type": task_type,
                "mode": "companion",
                "budget_usd": budget_usd,
            })
            resp.raise_for_status()
            return resp.json().get("output", "")


# Register the plugin
kernel = Kernel()
kernel.add_plugin(QualixarOSPlugin("http://localhost:3000"), plugin_name="qualixar")
```

## C#: Using Semantic Kernel with HttpClient

```csharp
using Microsoft.SemanticKernel;
using System.Net.Http.Json;

public class QualixarOSPlugin
{
    private readonly HttpClient _http;

    public QualixarOSPlugin(string baseUrl = "http://localhost:3000")
    {
        _http = new HttpClient { BaseAddress = new Uri(baseUrl) };
    }

    [KernelFunction("run_task")]
    [Description("Submit a task to Qualixar OS for multi-agent execution")]
    public async Task<string> RunTaskAsync(
        string prompt,
        string taskType = "custom",
        double budgetUsd = 5.0)
    {
        var payload = new { prompt, type = taskType, mode = "companion", budget_usd = budgetUsd };
        var resp = await _http.PostAsJsonAsync("/api/tasks", payload);
        resp.EnsureSuccessStatusCode();
        var result = await resp.Content.ReadFromJsonAsync<JsonElement>();
        return result.GetProperty("output").GetString() ?? "";
    }
}
```

## REST API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/tasks` | Submit a task for execution |
| GET | `/api/tasks/:id` | Check task status and get output |
| GET | `/api/cost` | Retrieve cumulative cost data |
| GET | `/api/health` | Health check |

See [API Endpoints Reference](../reference/api-endpoints.md) for the full endpoint list.

## Request Format

```json
{
  "prompt": "Analyze the codebase for performance bottlenecks",
  "type": "analysis",
  "mode": "companion",
  "budget_usd": 3.0,
  "topology": "pipeline"
}
```

## Response Format

```json
{
  "task_id": "tsk_abc123",
  "status": "completed",
  "output": "Found 3 performance bottlenecks...",
  "cost_usd": 0.0234,
  "duration_ms": 8500,
  "metadata": {}
}
```

## What is Next

- [Custom Integration](custom-integration.md) -- Python client and curl examples for any framework
- [API Endpoints Reference](../reference/api-endpoints.md) -- Full endpoint documentation
- [Execution Topologies](../reference/topologies.md) -- All 13 topologies
