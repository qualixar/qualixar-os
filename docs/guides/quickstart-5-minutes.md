---
title: "Build Your First AI Agent Team in 5 Minutes"
description: "Install Qualixar OS, launch the dashboard, and run your first multi-agent task in under 5 minutes."
category: "guides"
tags: ["quickstart", "tutorial", "first-run", "dashboard", "forge", "judge"]
last_updated: "2026-04-14"
---

# Build Your First AI Agent Team in 5 Minutes

This tutorial takes you from zero to a running multi-agent team. You will install Qualixar OS, start the dashboard, submit a task, and see how Forge designs an agent team and the Judge evaluates the output.

## Prerequisites

- **Node.js 22+** (required for ESM top-level await)
- **Ollama** installed and running ([ollama.com](https://ollama.com))

Verify both are available:

```bash
node --version   # Must be v22.0.0 or higher
ollama --version
```

## Step 1: Install and Initialize

Install Qualixar OS globally and run the interactive setup wizard:

```bash
npm install -g qualixar-os
qos init
```

The `qos init` wizard walks you through provider selection, model configuration, and channel setup. For the fastest start, select **Ollama** as your provider and accept the defaults.

If you have not pulled a model yet:

```bash
ollama pull llama3.3
```

To verify the installation:

```bash
qos doctor
```

`doctor` checks Node.js version, Ollama connectivity, database state, and config validity.

## Step 2: Start the Server with Dashboard

```bash
qos serve --dashboard --port 3000
```

You will see output like:

```
Starting Qualixar OS HTTP server on port 3000...
  API:       http://localhost:3000/api/health
  Dashboard: http://localhost:3000/dashboard
Qualixar OS server is running. Press Ctrl+C to stop.
```

The `--dashboard` flag bundles the React dashboard with the API server. Without it, only the REST API and WebSocket endpoints are available.

## Step 3: Open the Dashboard

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) in your browser. The **Chat** tab handles interactive conversations. The **Forge** tab designs multi-agent teams.

## Step 4: Submit a Task

You can submit a task from the dashboard or the CLI. Let us use the CLI:

```bash
qos run "Write a Python function that validates email addresses, including edge cases. Include unit tests."
```

Here is what happens behind the scenes:

1. **Memory** -- SLM-Lite checks for relevant context from past tasks
2. **Forge** -- The AI meta-agent analyzes your prompt and designs a team. For this prompt, Forge typically creates 2-3 agents: a Code Writer, a Test Writer, and optionally a Code Reviewer
3. **Agents Execute** -- Each agent runs its part of the task, writing real files to the workspace directory at `~/.qualixar-os/workspaces/<task-id>/`
4. **Judge Evaluates** -- The judge pipeline scores the output on correctness, completeness, and safety. If the score is below threshold, Forge redesigns the team and agents retry (up to 5 rounds)
5. **Output** -- The verified result is saved

The CLI returns the task ID immediately. To watch progress:

```bash
qos status
```

Running `status` without an ID shows the 5 most recent tasks.

## Step 5: See the Results

Once the task status shows `completed`, view the output:

```bash
qos output <task-id>
```

This prints the agent output, including any generated code. If agents created files, they live in the workspace:

```
~/.qualixar-os/workspaces/<task-id>/
  src/         # Generated source code
  docs/        # Documentation artifacts
  artifacts/   # Other outputs
```

To see what the judge thought:

```bash
qos judges <task-id>
```

This shows each judge model's verdict (approved/rejected), numeric score, and feedback.

To see what it cost:

```bash
qos cost <task-id>
```

## What Just Happened

| Component | Role |
|-----------|------|
| **Forge** | AI meta-agent that reads your prompt and designs the optimal agent team -- roles, models, tools, topology, and budget. No manual team assembly required. |
| **Judge** | Adversarial quality gate. Evaluates agent output against structured criteria (correctness, completeness, safety). Returns a verdict with score and specific feedback. |
| **Topology** | The execution pattern for multi-agent collaboration. Forge picks the best one automatically. You can override with `--topology`. |

## Next Steps

- Try a different topology: `qos run "Compare Redis vs Memcached" --topology debate`
- Install marketplace tools: open the **Marketplace** tab in the dashboard
- Connect from Claude Code: see [Using Qualixar OS as an MCP Server](mcp-server-setup.md)
- Add a cloud provider: open **Settings > Providers** in the dashboard
