---
name: qos-task
description: Submit a task to the running Qualixar OS server. Forge designs the agent team and executes it.
user-invocable: true
---

# /qos-task

Submit a task to the running Qualixar OS server.

## Usage
```
/qos-task <prompt>
```

## What Happens
1. Connects to the QOS server at `http://localhost:3001`
2. Posts the task to `POST /api/tasks`
3. Forge auto-designs an agent team (topology, roles, tools)
4. Agents execute and return results
5. Shows task ID, status, and output

## Example
```
/qos-task Review the authentication module for security vulnerabilities
/qos-task Write unit tests for src/utils/parser.ts with 90% coverage
```

## Implementation
```bash
# Submit task to running QOS server
curl -s -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "{{args}}", "mode": "power"}'
```

## Requirements
- Qualixar OS server must be running (`qos serve --dashboard`)
- Default port: 3001
