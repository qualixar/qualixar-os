---
title: "Getting Started with Qualixar OS"
description: "Install, configure, and run your first AI agent task in under 5 minutes. Comprehensive entry point for all Qualixar OS documentation."
category: "getting-started"
tags: ["install", "quickstart", "setup", "first-run", "documentation", "index"]
last_updated: "2026-04-13"
---

# Getting Started with Qualixar OS

Qualixar OS is the Universal OS for AI Agents. One control plane to orchestrate LLM agents across 15+ providers, 13 topologies, and every major IDE and framework.

## Quick Start

Three commands. Zero cost. Ollama runs locally on your machine.

```bash
# 1. Install Qualixar OS
npm install -g qualixar-os

# 2. Pull a free local model
ollama pull llama3.3

# 3. Launch the dashboard
qos dashboard
```

Open [http://localhost:3000](http://localhost:3000). You now have a full agent operating system running locally.

> **Note:** The default server port is 3000. Both `qos serve` and `qos dashboard` accept `--port` to override it.

### Submit Your First Task

**From the Dashboard:** Go to the **Chat** tab, select `llama3.3` from the model dropdown, type a prompt, and press Enter.

**From the CLI:**

```bash
qos run "Summarize the benefits of multi-agent systems in 3 bullet points"
qos status <task-id>    # Check task progress
qos output <task-id>    # View completed output
```

### Prerequisites

- **Node.js** 22+ (required for ESM top-level await; 22 LTS or later recommended)
- **Ollama** for local models, or an API key for any cloud provider

### Alternative Install

Run without a global install:

```bash
npx qualixar-os dashboard
```

Verify your installation:

```bash
qos --version
qos doctor
```

---

## Choose Your Provider

Qualixar OS connects to 15+ LLM providers through a single interface. Start with Ollama (free, local), then add cloud providers as needed.

| Provider | Models | Cost | Setup |
|----------|--------|------|-------|
| [**Ollama**](providers/ollama.md) | Llama 3.3, Mistral, Gemma, Phi, 100+ | Free | Local install |
| [**OpenRouter**](providers/openrouter.md) | 100+ models from every vendor | Pay-per-token | API key |
| [**Ollama Cloud**](providers/ollama-cloud.md) | 36+ hosted models | Free tier available | API key |
| [**OpenAI**](providers/openai.md) | GPT-4o, GPT-5, o3 | Pay-per-token | API key |
| [**Anthropic**](providers/anthropic.md) | Claude Opus, Sonnet, Haiku | Pay-per-token | API key |
| [**Azure**](providers/azure.md) | OpenAI models via Azure | Enterprise billing | Endpoint + key |
| [**LM Studio**](providers/lmstudio.md) | Any GGUF model | Free | Local install |
| [**Custom**](providers/custom.md) | Any OpenAI-compatible API | Varies | Base URL + key |

Add providers from the dashboard (**Settings > Providers**) or via `qos init`.

Full provider documentation: **[providers/overview.md](providers/overview.md)**

---

## Core Concepts

### The Pipeline

Every task in Qualixar OS flows through a five-stage pipeline:

```
Memory --> Forge --> Agents --> Judge --> Output
```

1. **Memory** retrieves relevant context from past tasks and external knowledge
2. **Forge AI** automatically designs the optimal agent team for the task
3. **Agents** execute the work across one of 13 topologies
4. **Judge Pipeline** evaluates output quality against configurable criteria
5. **Output** delivers the verified result

### Forge AI (Auto Team Design)

Forge analyzes your prompt and assembles the right agents, tools, and topology automatically. No manual configuration required for most tasks. You can override any decision.

Documentation: **[dashboard/forge.md](dashboard/forge.md)**

### Judge Pipeline (Quality Assurance)

Every task output passes through judges that score correctness, completeness, and safety. Configure judge thresholds, add custom judges, or bypass for speed.

Documentation: **[dashboard/judges.md](dashboard/judges.md)**

### 13 Topologies

Qualixar OS supports 13 execution topologies, from simple single-agent to complex multi-agent orchestrations:

| Topology | Code Name | Use Case |
|----------|-----------|----------|
| Sequential | `sequential` | Step-by-step chain of agents |
| Parallel | `parallel` | Independent agents, merged results |
| Hierarchical | `hierarchical` | Manager delegates to workers |
| DAG | `dag` | Directed acyclic graph with complex dependencies |
| Mixture of Agents | `mixture_of_agents` | Ensemble answers, synthesized output |
| Debate | `debate` | Agents argue, judge picks winner |
| Mesh | `mesh` | All-to-all collaboration |
| Star | `star` | Hub coordinates spokes |
| Circular | `circular` | Round-robin iterative refinement |
| Grid | `grid` | Matrix neighbor communication |
| Forest | `forest` | Multiple parallel hierarchies |
| Maker | `maker` | Build-test-ship engineering loop |
| Hybrid | `hybrid` | Local/cloud PII-safe split |

Documentation: **[reference/topologies.md](reference/topologies.md)**

### Memory System

Qualixar OS persists task history, agent decisions, and retrieved context across sessions. Integrates with SuperLocalMemory for cross-tool knowledge sharing.

Documentation: **[memory/overview.md](memory/overview.md)**

---

## Documentation Index

### Dashboard (24 Tabs)

The web dashboard provides full visual control over every aspect of agent orchestration. Default port: `3000` (configurable via `--port`).

| Tab | Description | Docs |
|-----|-------------|------|
| Overview | Dashboard home, system status | [dashboard/overview.md](dashboard/overview.md) |
| Chat | Interactive model chat | [dashboard/chat.md](dashboard/chat.md) |
| Agents | Agent configuration and management | [dashboard/agents.md](dashboard/agents.md) |
| Swarms | Multi-agent swarm orchestration | [dashboard/swarms.md](dashboard/swarms.md) |
| Forge | AI-powered team design | [dashboard/forge.md](dashboard/forge.md) |
| Judges | Quality assurance pipeline | [dashboard/judges.md](dashboard/judges.md) |
| Pipelines | Task pipeline builder | [dashboard/pipelines.md](dashboard/pipelines.md) |
| Flows | Visual workflow editor | [dashboard/flows.md](dashboard/flows.md) |
| Memory | Memory browser and search | [dashboard/memory.md](dashboard/memory.md) |
| Vectors | Vector store management | [dashboard/vectors.md](dashboard/vectors.md) |
| Brain | Knowledge graph visualization | [dashboard/brain.md](dashboard/brain.md) |
| Tools | Tool registry and configuration | [dashboard/tools.md](dashboard/tools.md) |
| Blueprints | Reusable task templates | [dashboard/blueprints.md](dashboard/blueprints.md) |
| Builder | Visual agent builder | [dashboard/builder.md](dashboard/builder.md) |
| Lab | Experimentation sandbox | [dashboard/lab.md](dashboard/lab.md) |
| Datasets | Dataset management for evaluation | [dashboard/datasets.md](dashboard/datasets.md) |
| Marketplace | Skill and plugin marketplace | [dashboard/marketplace.md](dashboard/marketplace.md) |
| Connectors | External service integrations | [dashboard/connectors.md](dashboard/connectors.md) |
| Gate | Access control and permissions | [dashboard/gate.md](dashboard/gate.md) |
| Audit | Audit log and compliance | [dashboard/audit.md](dashboard/audit.md) |
| Cost | Token usage and cost tracking | [dashboard/cost.md](dashboard/cost.md) |
| Logs | System and task logs | [dashboard/logs.md](dashboard/logs.md) |
| Traces | Execution trace viewer | [dashboard/traces.md](dashboard/traces.md) |
| Settings | Provider config, preferences | [dashboard/settings.md](dashboard/settings.md) |

### CLI (25 Commands)

Full command-line interface for headless and scripted workflows.

| Command | What It Does |
|---------|-------------|
| `qos init` | Interactive setup wizard |
| `qos serve` | Start HTTP/WebSocket server |
| `qos dashboard` | Start standalone dashboard (default port 3000, configurable via `--port`) |
| `qos run <prompt>` | Run a task |
| `qos status <id>` | Check task status |
| `qos output <id>` | View task output |
| `qos models` | List available models |
| `qos doctor` | Health check |
| `qos config <key> <val>` | Update configuration |

Full CLI reference: **[cli/overview.md](cli/overview.md)** | CLI vs MCP comparison: **[cli/cli-vs-mcp.md](cli/cli-vs-mcp.md)**

### Protocols

| Protocol | Description | Docs |
|----------|-------------|------|
| MCP | Model Context Protocol server/client | [protocols/mcp.md](protocols/mcp.md) |
| A2A | Agent-to-Agent protocol support | [protocols/a2a.md](protocols/a2a.md) |
| Overview | Protocol architecture | [protocols/overview.md](protocols/overview.md) |

### Frameworks

Integrate Qualixar OS as a backend for popular agent frameworks.

| Framework | Docs |
|-----------|------|
| LangChain | [frameworks/langchain.md](frameworks/langchain.md) |
| CrewAI | [frameworks/crewai.md](frameworks/crewai.md) |
| AutoGen | [frameworks/autogen.md](frameworks/autogen.md) |
| OpenAI Agents | [frameworks/openai-agents.md](frameworks/openai-agents.md) |
| Semantic Kernel | [frameworks/semantic-kernel.md](frameworks/semantic-kernel.md) |
| Custom | [frameworks/custom-integration.md](frameworks/custom-integration.md) |
| Overview | [frameworks/overview.md](frameworks/overview.md) |

### Claude CLI Integration

Use Qualixar OS directly from Claude Code or any Claude CLI session.

| Topic | Docs |
|-------|------|
| Overview | [claude-cli/overview.md](claude-cli/overview.md) |
| MCP Setup | [claude-cli/mcp-setup.md](claude-cli/mcp-setup.md) |
| Plugin Install | [claude-cli/plugin-install.md](claude-cli/plugin-install.md) |
| Skills Guide | [claude-cli/skills-guide.md](claude-cli/skills-guide.md) |
| CLI Native Bridge | [claude-cli/cli-native-bridge.md](claude-cli/cli-native-bridge.md) |
| Power User | [claude-cli/power-user.md](claude-cli/power-user.md) |

### IDE Integration

| Topic | Docs |
|-------|------|
| Overview | [ide-integration/overview.md](ide-integration/overview.md) |
| MCP Protocol | [ide-integration/mcp-protocol.md](ide-integration/mcp-protocol.md) |

### Providers

| Provider | Docs |
|----------|------|
| Overview | [providers/overview.md](providers/overview.md) |
| Ollama | [providers/ollama.md](providers/ollama.md) |
| OpenRouter | [providers/openrouter.md](providers/openrouter.md) |
| Ollama Cloud | [providers/ollama-cloud.md](providers/ollama-cloud.md) |
| OpenAI | [providers/openai.md](providers/openai.md) |
| Anthropic | [providers/anthropic.md](providers/anthropic.md) |
| Azure | [providers/azure.md](providers/azure.md) |
| LM Studio | [providers/lmstudio.md](providers/lmstudio.md) |
| Custom | [providers/custom.md](providers/custom.md) |

### Memory

| Topic | Docs |
|-------|------|
| Overview | [memory/overview.md](memory/overview.md) |
| SuperLocalMemory | [memory/superlocalmemory.md](memory/superlocalmemory.md) |
| SLM Integration | [memory/slm-integration.md](memory/slm-integration.md) |

### Guides

| Guide | Description | Docs |
|-------|-------------|------|
| **Quickstart (5 Minutes)** | Install, launch dashboard, run your first agent team | [guides/quickstart-5-minutes.md](guides/quickstart-5-minutes.md) |
| **Multi-Agent Code Review** | Code review with debate topology and judge verdicts | [guides/multi-agent-code-review.md](guides/multi-agent-code-review.md) |
| **MCP Server Setup** | Use QOS from Claude Code, VS Code, or Cursor via MCP | [guides/mcp-server-setup.md](guides/mcp-server-setup.md) |
| First Multi-Agent Task | Run agents in parallel, pipeline, or debate | [guides/first-multi-agent-task.md](guides/first-multi-agent-task.md) |
| MCP Integration | Connect external MCP servers to Qualixar OS | [guides/mcp-integration.md](guides/mcp-integration.md) |
| Deploy with Docker | Containerized deployment | [guides/deploy-docker.md](guides/deploy-docker.md) |
| Security Setup | Auth, TLS, and access control | [guides/security-setup.md](guides/security-setup.md) |
| Cost Optimization | Reduce token spend across providers | [guides/cost-optimization.md](guides/cost-optimization.md) |
| Troubleshooting | Common issues and fixes | [guides/troubleshooting.md](guides/troubleshooting.md) |

### Reference

| Reference | Description | Docs |
|-----------|-------------|------|
| API Endpoints | All 27+ REST endpoints | [reference/api-endpoints.md](reference/api-endpoints.md) |
| Config Schema | Full config.yaml specification | [reference/config-schema.md](reference/config-schema.md) |
| Topologies | 13 execution topologies | [reference/topologies.md](reference/topologies.md) |
| Events | Event system and hooks | [reference/events.md](reference/events.md) |
| Skill Manifest | Skill package format | [reference/skill-manifest.md](reference/skill-manifest.md) |
| Tool Categories | Tool classification system | [reference/tool-categories.md](reference/tool-categories.md) |

---

## Key Paths

| Item | Location |
|------|----------|
| Config | `~/.qualixar-os/config.yaml` |
| Environment | `~/.qualixar-os/.env` |
| Database | `~/.qualixar-os/qos.db` |
| Logs | `~/.qualixar-os/logs/` |
| Plugins | `~/.qualixar-os/plugins/` |

---

## Next Steps

Once you have the dashboard running and your first task complete, here is where to go next:

1. **Try different topologies.** Run the same task as a debate, pipeline, or parallel execution. See how agent collaboration changes the output. Start with the [First Multi-Agent Task](guides/first-multi-agent-task.md) guide.

2. **Install marketplace skills.** Open the **Marketplace** tab in the dashboard and install pre-built skills for coding, research, writing, and more. See [dashboard/marketplace.md](dashboard/marketplace.md).

3. **Connect from Claude Code.** Add Qualixar OS as an MCP server in your Claude CLI config and orchestrate agents without leaving your terminal. See [claude-cli/mcp-setup.md](claude-cli/mcp-setup.md).

4. **Connect from VS Code.** Use the IDE integration to run agent tasks directly from your editor. See [ide-integration/overview.md](ide-integration/overview.md).

5. **Add a cloud provider.** Pair Ollama with a cloud model for hybrid local+cloud topologies. Open **Settings > Providers** or see [providers/overview.md](providers/overview.md).

6. **Deploy with Docker.** Run Qualixar OS as a persistent service. See [guides/deploy-docker.md](guides/deploy-docker.md).

7. **Read the paper.** The research behind Qualixar OS is published on arXiv: [2604.06392](https://arxiv.org/abs/2604.06392).
