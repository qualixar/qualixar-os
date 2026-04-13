#!/bin/bash
# Qualixar OS — Cost tracking hook for Claude Code
# Runs after each tool use to log cost data
# Hook type: PostToolUse

# Only track if Qualixar OS server is running
if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
  exit 0
fi

# Log tool usage for cost analysis
TOOL_NAME="${CLAUDE_TOOL_NAME:-unknown}"
curl -s -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"chat:tool_call_completed\",\"payload\":{\"tool\":\"${TOOL_NAME}\",\"source\":\"claude-code-hook\"}}" \
  > /dev/null 2>&1

exit 0
