---
name: qos-forge-design
description: Design a multi-agent team using Qualixar OS Forge. Analyzes the task, selects the best topology, assigns specialized agents with tools, and estimates cost. Use when a task requires multiple AI agents working together.
user-invocable: true
allowed-tools: ["Bash", "Read", "Write"]
---

# Forge Agent Team Designer

You are using Qualixar OS Forge to design a multi-agent team.

## Steps

1. **Analyze the task:** Identify the task type (code, research, analysis, creative, custom)
2. **Connect to Qualixar OS:** Run `npx qualixar-os --mcp` or connect to a running instance
3. **Design the team:** Use the `qos_agents` MCP tool with action `forge_design`:

```bash
# Start Qualixar OS in background if not running
qos serve --dashboard --port 3001 &

# Submit the task to Forge
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "{{task_description}}", "type": "{{task_type}}", "mode": "power"}'
```

4. **Review the design:** Forge returns a team with:
   - Topology (sequential, parallel, debate, hierarchical, etc.)
   - Agent roles with system prompts
   - Tools assigned per agent (auto-selected from marketplace)
   - Estimated cost

5. **Execute or modify:** Accept the design to run, or adjust via the Builder tab.

## Topologies Available
- Sequential, Parallel, Hierarchical, DAG, Debate, Mesh, Star, Grid, Forest, Circular, Mixture-of-Agents, Maker

## Example
"Design a code review pipeline" → Forge creates: Reviewer (code_search, github_pr_read) → Fixer (file_write, shell_exec) → Tester (test_runner, shell_exec) in sequential topology.
