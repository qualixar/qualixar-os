[![License: FSL-1.1](https://img.shields.io/badge/License-FSL--1.1-blue.svg)](https://fsl.software)
[![Tests: 2,868 passing](https://img.shields.io/badge/Tests-2%2C868_passing-brightgreen)](https://github.com/qualixar/qualixar-os)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![arXiv](https://img.shields.io/badge/arXiv-2604.06392-b31b1b)](https://arxiv.org/abs/2604.06392)
[![DOI](https://img.shields.io/badge/DOI-10.5281%2Fzenodo.19454219-blue)](https://doi.org/10.5281/zenodo.19454219)

# Qualixar OS

**The Universal OS for AI Agents**

One platform. Every model. Every framework. Every transport.

Qualixar OS is the operating system that runs AI agents — yours and everyone else's. It doesn't replace your agent framework. It powers it. Import agents from OpenClaw, NemoClaw, DeerFlow, CrewAI, LangGraph, or build native. Run them all through one dashboard, one config, one runtime.

## What Makes This Unique

To our knowledge, no other agent platform combines all of these:

| Capability | Why It Matters |
|---|---|
| **Forge AI** auto-designs agent teams | Describe what you need in one sentence. Forge picks the agents, tools, topology, and budget. No manual team assembly. |
| **Judge pipeline** with consensus | Adversarial quality assurance — agents don't just run, they get evaluated. Multi-judge consensus protocols catch bad output. |
| **13 topologies** including Hybrid | PII-safe local/cloud split. Your sensitive data stays on your machine while cloud handles the rest. |
| **Native A2A protocol** | Agents talk to agents — internally and externally. Agent card discovery at `/.well-known/agent-card`. Among the first agent runtimes to support both MCP and A2A natively. |
| **25 CLI commands** | Full native CLI, not just a wrapper. Task execution, marketplace, diagnostics, config, server management — all from your terminal. |
| **SLM-Lite memory** | Learns from every task. 4-layer memory store powered by SuperLocalMemory. Context retrieval is automatic. |
| **Real file output** | Agents create runnable code on disk, not just text in a chat window. Universal Type-C protocol writes real artifacts. |
| **Marketplace** with one-click install | Browse, search, install tools. Forge auto-discovers new tools the moment you install them. |
| **Universal compatibility** | Import agents from OpenClaw, NemoClaw, DeerFlow, and GitAgent natively. LangChain, CrewAI, and AutoGen integrate via the HTTP API. |

## Demo

[![Qualixar OS Demo](https://img.youtube.com/vi/tfwS4B-g4q4/maxresdefault.jpg)](https://www.youtube.com/watch?v=tfwS4B-g4q4)

> **[Watch the full dashboard demo (1:48)](https://www.youtube.com/watch?v=tfwS4B-g4q4)** — 24 tabs, task execution, topology selection, cost tracking, Forge AI, marketplace, and more.

## Install in 30 Seconds

```bash
npx qualixar-os
```

That's it. Dashboard opens. Start chatting with AI, or design a multi-agent team.

```bash
# Or install globally
npm install -g qualixar-os

# Start the server with dashboard
qos serve --dashboard --port 3000

# Open your browser
open http://localhost:3000/dashboard/
```

## Why an OS?

Agent frameworks give you building blocks. Qualixar OS gives you the **complete runtime**:

| What You Need | Framework Approach | Qualixar OS |
|---|---|---|
| Route to the right model | Write custom logic | Built-in (15 providers, cost/quality/latency routing) |
| Run multi-agent teams | Build from scratch | 13 topologies, auto-designed by Forge AI |
| Quality assurance | Hope for the best | Judge pipeline with consensus protocols |
| Persistent memory | Add a vector DB | 4-layer memory store powered by SuperLocalMemory Lite (local) |
| Monitor costs | Check your bill later | Real-time budget tracking per agent |
| Manage tools | Hardcode per agent | Marketplace with categories, one-click install |
| Dashboard | Build your own | 24 tabs, production-ready |
| Security | DIY | Hardened sandbox (51 denied commands), RBAC, credential vault, Docker isolation |
| Human Review Gate | Build your own | Dashboard workflow for human approval of agent output, integrated with the 4-tier degradation engine |
| Token-level streaming | Varies | Real-time AsyncIterable streaming for all 6 LLM providers (Anthropic, OpenAI, Google, Ollama, Azure OpenAI, Bedrock) |
| File execution | Text only | **Real files on disk** — agents create runnable code via Universal Type-C |

## The Soul — How Qualixar OS Works

Every task follows this pipeline. No shortcuts. No half-measures.

```
                          ┌──────────────────────────────────┐
                          │                                  │
  User Prompt ──→ Memory ──→ Forge (designs agent team)     │
                              │                              │
                              ▼                              │
                          Agents Execute                     │
                          (real files on disk)                │
                              │                              │
                              ▼                              │
                          Judge Evaluates                    │
                              │                              │
                    ┌─────────┴─────────┐                    │
                    │                   │                    │
                Approved            Rejected                 │
                    │                   │                    │
                    ▼                   ▼                    │
                Output           Forge Redesigns ────────────┘
                (done)           (new team, retry)
                                 Up to 5 rounds
```

1. **Memory** — Recalls relevant context from previous tasks
2. **Forge** — AI meta-agent designs the optimal team (roles, models, tools, topology)
3. **Agents** — Execute the task, creating **real files** in the workspace directory
4. **Judge** — Adversarial evaluation with consensus protocols
5. **If rejected** — Forge redesigns the team and agents retry with the judge's feedback
6. **If approved** — Output saved, task complete

The judge doesn't just say pass/fail. It provides structured feedback — specific issues, severity ratings, improvement suggestions. The next team gets this feedback in their prompt. Each redesign cycle gets smarter.

**Safeguards:** 5 redesign max, 3x budget cap, human escalation if stuck.

## Universal Compatibility — The Claw Bridge

Qualixar OS doesn't compete with agent frameworks. It **runs them**.

```bash
# Import agents from any framework
qos import ./my-openclaw-agent.yaml       # OpenClaw
qos import ./nemoclaw-config.json          # NemoClaw (NVIDIA)
qos import ./deerflow-workflow.json         # DeerFlow (ByteDance)
qos import ./gitagent-spec.yaml             # GitAgent (Microsoft)

# Or use native Qualixar agents — designed by Forge AI
qos run "Build me a code review pipeline"
# → Forge auto-designs a team of 4 agents with the right tools
```

| Framework | Import | Run | Manage from Dashboard |
|-----------|--------|-----|----------------------|
| **OpenClaw** | Yes | Yes | Yes |
| **NemoClaw** (NVIDIA) | Yes | Yes | Yes |
| **DeerFlow** (ByteDance) | Yes | Yes | Yes |
| **GitAgent** (Microsoft) | Yes | Yes | Yes |
| **LangChain / LangGraph** | Via HTTP API ([guide](docs/frameworks/langchain.md)) | Yes | Yes |
| **CrewAI** | Via HTTP API ([guide](docs/frameworks/crewai.md)) | Yes | Yes |
| **AutoGen** | Via HTTP API ([guide](docs/frameworks/autogen.md)) | Yes | Yes |
| **MCP Servers** | Native | Yes | Yes |
| **A2A Protocol** | Native | Yes | Yes |
| **Custom Agents** | skill.json manifest | Yes | Yes |

## Protocols — MCP + A2A

Qualixar OS speaks two standard protocols natively. No plugins, no adapters — built into the core.

### MCP (Model Context Protocol)

25 MCP tools expose the full Qualixar OS API to any MCP-compatible client. Your IDE becomes the dashboard.

| Client | Integration |
|--------|-------------|
| **Claude Code** | Auto-discovered via `~/.claude.json` config |
| **VS Code** | MCP extension with tool palette |
| **Cursor** | Native MCP support |
| **Windsurf** | Native MCP support |

```bash
# Add Qualixar OS as an MCP server in your IDE
qos serve --mcp
# → 25 tools available: task execution, agent management, marketplace, memory, cost tracking
```

### A2A (Agent-to-Agent Protocol)

v0.3 implementation with agent card discovery. Internal agents communicate via A2A. External agents federate via A2A. Among the first agent runtimes to support both MCP and A2A natively.

```
GET /.well-known/agent-card
→ Returns capabilities, supported tasks, authentication methods

POST /a2a/tasks
→ External agents submit tasks directly to Qualixar OS agents
```

**What this enables:** Your Qualixar OS agents can discover and collaborate with any A2A-compatible agent on the network — Google's agent ecosystem, other Qualixar OS instances, or custom A2A servers.

## Memory System — SLM-Lite

Powered by SLM-Lite (SuperLocalMemory Lite). Every task makes Qualixar OS smarter.

| Layer | What It Does |
|-------|-------------|
| **Episodic** | Stores task history — what was asked, what worked, what failed |
| **Semantic** | Stores knowledge from task outputs with full-text search (FTS5) |
| **Procedural** | Learns patterns — which topologies work best for which task types |
| **Behavioral** | Captures outcomes — Forge uses this to design better teams over time |

**Auto-invoke** retrieves relevant context before every task. No manual search needed — agents start with the right context.

**Compatible with full [SuperLocalMemory](https://github.com/qualixar/superlocalmemory)** for cross-session, cross-product memory sharing.

## The Dashboard — Everything in Your Browser

24 interactive tabs. No CLI required for daily use.

| Tab | What It Does |
|-----|-------------|
| **Chat** | Talk to AI with streaming, file upload, model selection |
| **Forge** | AI auto-designs specialized agent teams from your prompt |
| **Builder** | Visual workflow editor — drag, connect, run |
| **Marketplace** | Browse, search, install skills and tools with one click |
| **Agents** | Monitor running agents, view stats, kill/restart |
| **Swarms** | Watch multi-agent execution in real-time |
| **Judges** | Quality verdicts, consensus scores, approval/rejection |
| **Cost** | Per-model, per-agent, per-task cost breakdown |
| **Memory** | Persistent agent memory — search, inspect, manage |
| **Pipelines** | Multi-step task orchestration with checkpoints |
| **Tools** | Tool palette with 6 categories, drag onto agents |
| **Traces** | OpenTelemetry spans for every agent action |
| **Settings** | Providers, models, budget, security, connectors |
| ...and 11 more | Flows, Connectors, Logs, Gate, Datasets, Vectors, Blueprints, Brain, Audit, Lab, Marketplace |

## Forge — AI Designs Your Agent Teams

Tell Forge what you need. It designs the team.

```bash
qos run "Review my GitHub PRs for security issues"
```

Forge responds:
- Creates 3 agents: Security Analyst, Code Reviewer, Report Writer
- Assigns tools: `github_pr_read`, `code_search`, `file_write`
- Picks topology: Sequential (analyze → review → report)
- Sets budget: $0.05 estimated cost
- Runs the team. Returns results.

No manual configuration. No YAML files. One sentence, full team.

## Marketplace — One-Click Tool Installation

Browse the global skill registry from your dashboard. Install with one click. Forge auto-discovers new tools.

```
Dashboard → Marketplace → Search "GitHub" → Install → Done
Your agents now have GitHub tools. Forge uses them automatically.
```

**6 Tool Categories:**

| Category | Tools |
|----------|-------|
| **Web & Data** | Web search, crawl, scrape, RSS, API connectors |
| **Code & Dev** | GitHub, file I/O, shell, linter, test runner |
| **Communication** | Slack, email, Discord, webhook |
| **Knowledge** | Vector search, document reader, database, RAG |
| **Creative** | Image gen, video gen, TTS, diagrams |
| **Enterprise** | CRM, project management, analytics, cloud |

**18 built-in plugins** (agents, skills, tools, and topologies) ship with the product. Community plugins available via the [global registry](https://github.com/qualixar/qos-registry).

### Self-Evolving Skills (Roadmap)

Planned capabilities for a future release. Not yet implemented.

| Capability | What It Will Do |
|-----------|-------------|
| **SkillEvolver** | Judge verdict triggers automatic skill mutation — failed skills evolve into better versions |
| **Blind Verification** | Information-isolated verification — generator and verifier can't see each other's work, eliminating confirmation bias |
| **Skill Lineage** | Full version history — trace how any skill evolved, what triggered each mutation, rollback to any ancestor |
| **Living Marketplace** | Evolved skills auto-publish to marketplace with lineage metadata. Community skills improve across all users |

## 13 Execution Topologies

| Topology | Pattern | Use Case |
|----------|---------|----------|
| Sequential | A → B → C | Pipelines, step-by-step tasks |
| Parallel | A ‖ B ‖ C → merge | Independent analysis, speed |
| Hierarchical | Boss → Workers | Task decomposition |
| DAG | Directed graph | Complex dependencies |
| Debate | Pro vs Con → Judge | Quality decisions |
| Mesh | All-to-all | Collaboration |
| Star | Hub ↔ Spokes | Central coordinator |
| Grid | Matrix communication | Structured teams |
| Forest | Multiple trees | Parallel hierarchies |
| Circular | Round-robin | Iterative refinement |
| Mixture-of-Agents | Ensemble → Synthesize | Best-of-N outputs |
| Maker | Build → Test → Ship | Engineering workflows |
| **Hybrid** | Local ↔ Cloud split | PII-safe cloud offloading |

## Claude Management Integration

Qualixar OS ships with first-class support for Claude's agent ecosystem — managed agents, agent teams, and quality gate hooks.

### Hybrid Topology (13th topology)

Splits agent execution between local and cloud. A 7-phase algorithm with keyword + regex PII detection routes sensitive work to local models and offloads the rest to cloud providers. To our knowledge, among the first agent runtimes with built-in PII-aware local/cloud routing.

```bash
qos run "Analyze customer data" --topology hybrid
# → PII detected in 2 fields → routed to local Ollama
# → Summary + report → routed to Claude cloud
```

### Claude Managed Agents Adapter

Python and TypeScript adapter for Claude's Managed Agents API. SSE streaming, dual cost tracking (local + cloud), drop-in provider integration.

```yaml
providers:
  claude-managed:
    type: claude-managed
    api_key_env: ANTHROPIC_API_KEY
```

### Claude Agent Teams Subagents

6 pre-built agent definitions optimized for Claude Code Agent Teams:

| Agent | Model | Role |
|-------|-------|------|
| `qos-forge-architect` | opus | Team design and orchestration |
| `qos-code-reviewer` | sonnet | Multi-judge code review |
| `qos-cost-optimizer` | haiku | Budget-aware model routing |
| `qos-topology-designer` | sonnet | Topology selection for tasks |
| `qos-research-agent` | opus | Deep research with full arsenal |
| `qos-quality-judge` | opus | Quality gating and consensus |

### Quality Gate Hooks

3 hooks for Claude Code Agent Teams that enforce quality at every stage:

- **TeammateIdle** — detects idle teammates and reassigns or escalates
- **TaskCreated** — validates task structure, budget, and topology before execution
- **TaskCompleted** — runs judge pipeline on output before marking done

### Agent Teams Skill

Interactive design guide for assembling optimal agent teams. Invoke with:

```bash
/agent-teams
```

Walks through team composition, model selection, topology, and budget — then generates the full configuration.

## Configuration

**Zero-config start:** Qualixar OS works out of the box with [Ollama](https://ollama.com) (free, local, private).

```bash
# 1. Install Ollama (if you haven't already)
brew install ollama && ollama pull llama3.1

# 2. Start Qualixar OS — it auto-detects Ollama
npx qualixar-os
```

That's it. No API keys, no YAML editing, no cloud accounts. Your data stays on your machine.

**Add a cloud provider** when you want more power:

1. Open the Dashboard → **Settings** tab → **Providers**
2. Click **Add Provider** → pick OpenRouter, Anthropic, OpenAI, Azure, or any of the 15 supported providers
3. Paste your API key → Save

All provider configuration happens in the Settings UI. No config files to edit.

> **15 providers supported:** Ollama, OpenRouter, Anthropic, OpenAI, Azure OpenAI, Google AI, AWS Bedrock, Groq, Together AI, Fireworks AI, Mistral AI, Cohere, DeepSeek, Cerebras, and custom OpenAI-compatible endpoints.

## CLI — 25 Commands

Full native CLI. Every feature accessible from your terminal.

| Category | Commands |
|----------|----------|
| **Server** | `qos serve`, `qos dashboard`, `qos mcp` |
| **Tasks** | `qos run <prompt>`, `qos status <id>`, `qos output <id>`, `qos pause <id>`, `qos resume <id>`, `qos cancel <id>` |
| **Design** | `qos forge [taskType]`, `qos models` |
| **Agents** | `qos agents [taskId]`, `qos judges [taskId]` |
| **Import/Export** | `qos import <path>`, `qos export <agentId>` |
| **Config** | `qos config [key] [value]` |
| **Memory** | `qos memory <query>` |
| **Diagnostics** | `qos cost [taskId]`, `qos doctor`, `qos version` |
| **Setup** | `qos init`, `qos new <project>` |
| **Universal Commands** | `qos cmd <command>`, `qos cmd-list`, `qos dispatch <command>` |

```bash
# Quick examples
qos serve --dashboard --port 3000        # Start server + dashboard
qos run "Build a REST API for todos"    # Forge designs team, agents execute
qos dashboard                            # Open the web dashboard
qos cmd marketplace.install -i '{"id":"github-tools"}'  # Install a tool
qos cost                                 # See what you've spent
```

Full reference: [docs/cli/overview.md](docs/cli/overview.md)

## API

27+ REST endpoints. Full OpenAPI documentation at `/api/docs`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | Submit a task (Forge auto-designs team) |
| GET | `/api/tasks` | List tasks with status |
| GET | `/api/agents` | Active agents |
| GET | `/api/cost` | Cost breakdown |
| GET | `/api/tools` | Tool catalog with categories |
| GET | `/api/skill-store/browse` | Browse marketplace |
| POST | `/api/chat/conversations/:id/messages` | Chat (streams via WebSocket) |
| GET | `/.well-known/agent-card` | A2A discovery |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22+ (ESM) |
| Language | TypeScript 5.7 |
| HTTP | Hono |
| Database | better-sqlite3 (49 tables) |
| Dashboard | React 19 + Vite |
| AI SDKs | Anthropic (incl. Managed Agents), OpenAI, Azure, Ollama |
| Testing | Vitest (2,868 tests, 203 files) |
| Protocols | MCP, A2A, HTTP, WebSocket, CLI |

## Development

```bash
git clone https://github.com/qualixar/qualixar-os.git
cd qualixar-os
npm install
npm run build
npm test              # 2,868 tests
npm run typecheck     # 0 errors
```

## Paper

"Qualixar OS: A Protocol-Unified Operating System for AI Agent Orchestration"

arXiv: [2604.06392](https://arxiv.org/abs/2604.06392)
DOI: [10.5281/zenodo.19454219](https://doi.org/10.5281/zenodo.19454219)

20 pages, 7 figures, formal topology semantics, empirical evaluation. Part of the Qualixar research ecosystem — 7 published papers on AI agent reliability.

If you use Qualixar OS in your research, please cite:

```bibtex
@article{bhardwaj2026qualixaros,
  title={Qualixar OS: A Protocol-Unified Operating System for AI Agent Orchestration},
  author={Bhardwaj, Varun Pratap},
  year={2026},
  eprint={2604.06392},
  archivePrefix={arXiv},
  primaryClass={cs.AI},
  doi={10.5281/zenodo.19454219}
}
```

## Documentation

| Topic | Path |
|-------|------|
| **Getting Started** | [docs/getting-started.md](docs/getting-started.md) |
| **Dashboard** (24 tabs) | [docs/dashboard/](docs/dashboard/) |
| **CLI Reference** (25 commands) | [docs/cli/](docs/cli/) |
| **Protocols** (MCP + A2A) | [docs/protocols/](docs/protocols/) |
| **Providers** (15 providers) | [docs/providers/](docs/providers/) |
| **Frameworks** (4 native readers + adapters) | [docs/frameworks/](docs/frameworks/) |
| **Claude CLI Integration** | [docs/claude-cli/](docs/claude-cli/) |
| **IDE Integration** | [docs/ide-integration/](docs/ide-integration/) |
| **Memory System** | [docs/memory/](docs/memory/) |
| **Guides** | [docs/guides/](docs/guides/) |
| **API Reference** | [docs/reference/](docs/reference/) |

## License

Functional Source License, Version 1.1, ALv2 Future License (FSL-1.1-ALv2). See [LICENSE](LICENSE).

This means you can use, modify, and redistribute Qualixar OS for any purpose except creating a competing product or service. After two years from each release, the code converts to Apache License 2.0.

For commercial licensing, see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) or contact varun.pratap.bhardwaj@gmail.com.

Copyright (c) 2026 Varun Pratap Bhardwaj / Qualixar.

## Built By

[Qualixar](https://qualixar.com) — AI Agent Reliability Engineering.

7 published papers. 4 live tools. One mission: make AI agents trustworthy.
