---
name: qos-workspace
description: Browse the workspace files and agent logs of a completed QOS task.
user-invocable: true
---

# /qos-workspace

Browse the workspace files of a completed task.

## Usage
```
/qos-workspace <taskId>
```

## What Happens
1. Looks up the task workspace at `~/.qualixar-os/workspaces/<taskId>/`
2. Lists all output files (code, documents, artifacts)
3. Shows agent logs from `.qos-log/` directory
4. Displays the team execution timeline

## Example
```
/qos-workspace abc123
/qos-workspace abc123 --logs
```

## Implementation
```bash
# List workspace contents
ls -la ~/.qualixar-os/workspaces/{{taskId}}/

# View agent logs (team timeline)
cat ~/.qualixar-os/workspaces/{{taskId}}/.qos-log/team.jsonl | head -50

# View specific agent log
ls ~/.qualixar-os/workspaces/{{taskId}}/.qos-log/agent-*.jsonl
```

## API Alternative
```bash
# Get logs via API
curl -s http://localhost:3001/api/tasks/{{taskId}}/logs | jq '.logs | length'
```
