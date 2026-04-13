---
name: qos-agent-teams
description: Design and manage multi-agent teams using Qualixar OS capabilities within Claude Code Agent Teams. Guides topology selection, agent role assignment, cost estimation, and quality gating. Use when planning or optimizing an Agent Teams workflow.
user-invocable: true
allowed-tools: ["Bash", "Read", "Write"]
---

# Qualixar OS Agent Teams Designer

You are guiding the user to design and optimize a multi-agent team using Qualixar OS within Claude Code Agent Teams.

## What This Skill Does
Combines Qualixar OS's 13 topologies, 19 providers, and cost/quality engines with Claude Code Agent Teams' peer-to-peer collaboration model.

## Step-by-Step Workflow

### Step 1: Understand the Task
Ask the user:
- What is the overall goal?
- How many subtasks can you identify?
- Are subtasks independent or interdependent?
- What's the budget (if any)?
- What quality level is needed? (speed vs thoroughness)

### Step 2: Select Topology
Based on the answers, recommend a topology from Qualixar OS's 12 options:

| If... | Use |
|-------|-----|
| Linear pipeline | Sequential |
| Independent tasks | Parallel |
| Manager + workers | Hierarchical |
| Complex deps | DAG |
| Need consensus | MoA or Debate |
| Full collab | Mesh |
| Hub + specialists | Star |
| Build + verify | Maker |

### Step 3: Assign Teammates
Map each agent role to a Qualixar OS subagent definition:

Available teammate types (from this plugin):
- `qos-forge-architect` — Team design
- `qos-code-reviewer` — Multi-judge review
- `qos-cost-optimizer` — Budget routing
- `qos-topology-designer` — Topology selection
- `qos-research-agent` — Deep research
- `qos-quality-judge` — Quality gating

Or design custom agents with specific system prompts.

### Step 4: Estimate Cost
If Qualixar OS is running:
```bash
curl -s http://localhost:3001/api/cost
```

If not: Estimate based on model pricing x estimated tokens x agent count.

### Step 5: Configure Quality Gates
The plugin's hooks automatically handle (when the QOS server is running and hook types are supported):
- **TeammateIdle** — Auto-suggests pending QOS tasks
- **TaskCreated** — Validates against budget
- **TaskCompleted** — Runs quality judgment

### Step 6: Launch
Instruct the team lead to spawn teammates:
"Create a team with teammates: qos-code-reviewer, qos-quality-judge, and a custom data-engineer agent. Use parallel topology for the reviews, then sequential for the final report."

## Tips
- Start with 3-5 teammates (optimal for most workflows)
- Assign 5-6 tasks per teammate
- Avoid having multiple teammates edit the same file
- Use qos-quality-judge as the final gate before merging
- Set budget BEFORE starting to enable the TaskCreated hook
