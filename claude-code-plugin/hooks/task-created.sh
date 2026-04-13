#!/bin/bash
set -euo pipefail
# Qualixar OS — TaskCreated hook
# Validates new tasks against budget
# License: Elastic-2.0
# Exit 0 = allow, Exit 2 = block (over budget)

# Fail-open trap: any unhandled error exits 0 (allow)
trap 'exit 0' ERR

QOS_URL="${QOS_SERVER_URL:-http://localhost:3001}"
LOG_DIR="${HOME}/.qualixar-os/logs"
mkdir -p "$LOG_DIR" 2>/dev/null || true

# H-03: Validate QOS_URL — only allow localhost or HTTPS
case "$QOS_URL" in
  http://localhost*|http://127.0.0.1*|https://*) ;;
  *)
    echo "ERROR: QOS_SERVER_URL must be localhost or HTTPS. Refusing to connect." >&2
    exit 0
    ;;
esac

# Read task data from stdin
TASK_DATA=$(cat)

# Parse task description using python3 with multiple field fallbacks
TASK_DESC=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    desc = d.get('description', '') or d.get('prompt', '') or d.get('task', '')
    if not desc and isinstance(d.get('data'), dict):
        desc = d['data'].get('description', '')
    print(desc)
except Exception:
    print('')
" <<< "$TASK_DATA" 2>/dev/null) || TASK_DESC=""

# Diagnostic log when description is empty
# H-07: Log only status, not task content (no secrets/PII on disk)
if [ -z "$TASK_DESC" ]; then
  echo "WARNING: TaskCreated hook received empty task description. Stdin may have unexpected format." >&2
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WARN: empty task desc in TaskCreated hook" >> "$LOG_DIR/hook-diagnostics.log" 2>/dev/null || true
  exit 0
fi

# Check QOS server (2s timeout)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "${QOS_URL}/api/health" 2>/dev/null) || HTTP_CODE="000"
if [ "$HTTP_CODE" != "200" ]; then
  exit 0
fi

# C-01 FIX: Construct JSON body safely using python3 — no shell interpolation
JSON_BODY=$(python3 -c "
import json, sys
desc = sys.stdin.read()[:500]
print(json.dumps({'prompt': desc}))
" <<< "$TASK_DESC" 2>/dev/null) || JSON_BODY=""

if [ -z "$JSON_BODY" ]; then
  exit 0
fi

# M-07 FIX: Single curl call captures both body and HTTP code
# Append HTTP code on a new line after the body
RAW_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 3 -X POST "${QOS_URL}/api/cost/estimate" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY" 2>/dev/null) || RAW_RESPONSE=""

if [ -z "$RAW_RESPONSE" ]; then
  exit 0
fi

# Parse HTTP code from last line, body from everything else
COST_HTTP_CODE=$(echo "$RAW_RESPONSE" | tail -1)
COST_BODY=$(echo "$RAW_RESPONSE" | sed '$d')

if [ "$COST_HTTP_CODE" != "200" ]; then
  # Endpoint doesn't exist or errored — fail-open
  exit 0
fi

# Parse cost response using python3
BUDGET_CHECK=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    est = float(d.get('estimated_cost_usd', 0))
    remaining = float(d.get('budget_remaining_usd', 999999))
    over = 1 if est > remaining else 0
    print(f'{est},{remaining},{over}')
except Exception:
    print('0,0,0')
" <<< "$COST_BODY" 2>/dev/null) || BUDGET_CHECK="0,0,0"

EST_COST=$(echo "$BUDGET_CHECK" | cut -d, -f1)
BUDGET_LEFT=$(echo "$BUDGET_CHECK" | cut -d, -f2)
OVER_BUDGET=$(echo "$BUDGET_CHECK" | cut -d, -f3)

if [ "$OVER_BUDGET" = "1" ]; then
  echo "BLOCKED by Qualixar OS budget gate."
  echo "Estimated cost: \$${EST_COST}"
  echo "Budget remaining: \$${BUDGET_LEFT}"
  echo "Reduce scope or increase budget: qos config set budget <amount>"
  exit 2
fi

# H-07: Log only status and cost — no task content on disk
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] task_created: est_cost=${EST_COST}" >> "$LOG_DIR/team-events.log" 2>/dev/null || true

exit 0
