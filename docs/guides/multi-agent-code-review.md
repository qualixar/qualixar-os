---
title: "Automated Code Review with Multi-Agent Teams"
description: "Use Qualixar OS to run a code review with multiple agent perspectives using the debate topology."
category: "guides"
tags: ["tutorial", "code-review", "debate", "topology", "multi-agent", "judge"]
last_updated: "2026-04-14"
---

# Automated Code Review with Multi-Agent Teams

This tutorial shows how to run a code review where multiple agents analyze code from different perspectives (bugs, security, performance) using the debate topology. A judge evaluates the competing assessments and produces a final verdict.

## Prerequisites

- Qualixar OS installed (`npm install -g qualixar-os`)
- At least one provider configured (run `qos doctor` to verify)

## Step 1: Configure a Provider

If you have not run `qos init` yet, do so now:

```bash
ollama pull llama3.3
qos init --provider ollama --model llama3.3 --no-interactive
```

For cloud models, use OpenRouter instead:

```bash
qos init --provider openrouter --api-key-env OPENROUTER_API_KEY --no-interactive
```

Verify your setup:

```bash
qos models
```

## Step 2: Submit a Code Review Task

Use the `qos run` command with the `--topology debate` flag. The debate topology creates a proposer agent and a critic agent that argue over the code, then a judge picks the best assessment.

```bash
qos run "Review this Python function for bugs, security issues, and performance problems:

def get_user(user_id):
    import sqlite3
    conn = sqlite3.connect('users.db')
    cursor = conn.execute(f'SELECT * FROM users WHERE id = {user_id}')
    row = cursor.fetchone()
    conn.close()
    return {'id': row[0], 'name': row[1], 'email': row[2]}" --topology debate
```

Forge receives this prompt and designs a debate team:

- **Proposer** -- Analyzes the code and presents findings (SQL injection, missing error handling, no connection pooling, f-string interpolation)
- **Critic** -- Challenges the proposer's findings, adds missed issues, ranks severity
- **Judge** -- Evaluates both perspectives and produces the final structured review

The command returns a task ID immediately:

```
Task submitted: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

## Step 3: Monitor Progress

Check the task status:

```bash
qos status a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Or list all recent tasks:

```bash
qos status
```

Output looks like:

```
  Task ID                                Status       Prompt                                   Created
  ────────────────────────────────────── ──────────── ──────────────────────────────────────── ────────────────────
  a1b2c3d4-e5f6-7890-abcd-ef1234567890  running      Review this Python function for bugs...  2026-04-14T10:30:00
```

## Step 4: View the Results

Once the status shows `completed`:

```bash
qos output a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

The output contains the structured code review with findings from both the proposer and critic, merged by the judge. Expect findings like:

- **CRITICAL: SQL Injection** -- f-string interpolation in SQL query
- **HIGH: No error handling** -- `row` could be `None` if user not found
- **MEDIUM: Resource leak** -- connection not closed on exception
- **LOW: No connection pooling** -- new connection per call

## Step 5: View Judge Verdicts

To see how the judge scored the debate:

```bash
qos judges a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Output:

```
  ollama/llama3.3: approved (score: 0.85)
```

The score reflects the judge's confidence in the final review quality. If the score falls below the configured threshold, Forge automatically redesigns the team and retries (up to 5 rounds).

## Other Topologies for Code Review

| Topology | Command | When to Use |
|----------|---------|-------------|
| `debate` | `--topology debate` | Best for thorough review with competing perspectives |
| `parallel` | `--topology parallel` | Fast: multiple agents review independently, results merged |
| `sequential` | `--topology sequential` | Pipeline: lint, then security scan, then report |
| `hierarchical` | `--topology hierarchical` | Manager delegates bug/security/perf to specialist agents |

Example with parallel topology:

```bash
qos run "Review this codebase for security vulnerabilities" --topology parallel
```

## Check Costs

```bash
qos cost a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

This shows per-model and per-agent token usage and cost for the task. With Ollama, cost is always $0.00.

## Related

- [Quickstart](quickstart-5-minutes.md) -- First 5 minutes with Qualixar OS
- [Topologies Reference](../reference/topologies.md) -- All 13 topologies explained
- [Judge Pipeline](../dashboard/judges.md) -- Configure judge thresholds and custom judges
- [Cost Optimization](cost-optimization.md) -- Reduce token spend
