---
name: qos-task-orchestrator
description: Submit, monitor, and manage Qualixar OS tasks from within Claude Code. Handles task submission, status polling, workspace browsing, and log viewing.
user-invocable: true
allowed-tools: ["Bash", "Read", "Glob"]
---

# QOS Task Orchestrator

You are managing Qualixar OS tasks from within Claude Code.

## Capabilities

### Submit a Task
```bash
curl -s -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "{{task_description}}", "mode": "power"}'
```

### Check Task Status
```bash
curl -s http://localhost:3001/api/tasks/{{taskId}} | jq '.'
```

### Get Detailed Task Info
```bash
curl -s http://localhost:3001/api/tasks/{{taskId}}/detail | jq '.'
```

### View Agent Logs
```bash
# Team timeline (all agents)
curl -s http://localhost:3001/api/tasks/{{taskId}}/logs | jq '.logs'

# Browse workspace files
ls -la ~/.qualixar-os/workspaces/{{taskId}}/
```

### List All Tasks
```bash
curl -s http://localhost:3001/api/tasks | jq '.tasks'
```

## Workflow

1. **Submit:** POST the task to /api/tasks
2. **Poll:** Check /api/tasks/:id until status is `completed` or `failed`
3. **Review:** Read the workspace output and agent logs
4. **Iterate:** Submit follow-up tasks referencing previous workspace

## Error Handling
- If server is not running: `qos serve --dashboard --port 3001 &`
- If task fails: Check agent logs at `/api/tasks/:id/logs` for error entries
- If workspace is empty: Task may still be running, poll status first
