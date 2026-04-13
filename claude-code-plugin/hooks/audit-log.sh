#!/bin/bash
# Qualixar OS — Audit logging hook for Claude Code
# Logs all tool uses for compliance and debugging
# Hook type: PostToolUse

# Only log if Qualixar OS server is running
if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
  exit 0
fi

TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

curl -s -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"security:audit_logged\",\"payload\":{\"event_type\":\"tool_use\",\"tool\":\"${TOOL_NAME}\",\"timestamp\":\"${TIMESTAMP}\",\"source\":\"claude-code-hook\"}}" \
  > /dev/null 2>&1

exit 0
