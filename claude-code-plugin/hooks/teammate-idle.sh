#!/bin/bash
set -euo pipefail
# Qualixar OS — TeammateIdle hook
# Assigns pending QOS tasks to idle teammates
# License: Elastic-2.0
# Exit 0 = no action, Exit 2 = send feedback to teammate

# Fail-open trap: any unhandled error exits 0 (allow)
trap 'exit 0' ERR

TEAMMATE="${CLAUDE_TEAMMATE_NAME:-unknown}"
QOS_URL="${QOS_SERVER_URL:-http://localhost:3001}"

# H-03: Validate QOS_URL — only allow localhost or HTTPS
case "$QOS_URL" in
  http://localhost*|http://127.0.0.1*|https://*) ;;
  *)
    echo "ERROR: QOS_SERVER_URL must be localhost or HTTPS. Refusing to connect." >&2
    exit 0
    ;;
esac

# Check QOS server is running (timeout 2s)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "${QOS_URL}/api/health" 2>/dev/null) || HTTP_CODE="000"
if [ "$HTTP_CODE" != "200" ]; then
  exit 0
fi

# Query for tasks
RESPONSE=$(curl -s --max-time 3 "${QOS_URL}/api/tasks" 2>/dev/null) || RESPONSE=""

# Parse JSON safely using python3 (no jq dependency)
TASK_INFO=$(python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    tasks = data.get('tasks', data) if isinstance(data, dict) else data
    if not isinstance(tasks, list):
        tasks = []
    pending = [t for t in tasks if t.get('status') == 'pending']
    if pending:
        t = pending[0]
        print(t.get('id', ''))
        print(t.get('prompt', t.get('description', '')))
    else:
        print('')
except Exception:
    print('')
" <<< "$RESPONSE" 2>/dev/null) || TASK_INFO=""

TASK_ID=$(echo "$TASK_INFO" | head -1)
TASK_PROMPT=$(echo "$TASK_INFO" | tail -n +2 | head -1)

if [ -z "$TASK_ID" ]; then
  exit 0
fi

# C-02 FIX: Construct safe output using python3 — no shell interpolation of task data
# Instead of echoing a raw curl command with injectable content,
# present the task ID and a safe accept command
SAFE_OUTPUT=$(python3 -c "
import json, sys
task_id = sys.argv[1]
task_prompt = sys.argv[2][:200]
# Sanitize for display only — no shell-executable commands with user data
lines = []
lines.append('Qualixar OS has a pending task for you:')
lines.append('Task ID: ' + task_id)
lines.append('Description: ' + task_prompt)
lines.append('To accept: qos task accept ' + task_id)
print('\n'.join(lines))
" "$TASK_ID" "$TASK_PROMPT" 2>/dev/null) || SAFE_OUTPUT="Qualixar OS has a pending task (ID: ${TASK_ID}). Run: qos task accept ${TASK_ID}"

echo "$SAFE_OUTPUT"

exit 2
