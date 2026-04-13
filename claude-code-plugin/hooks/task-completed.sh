#!/bin/bash
set -euo pipefail
# Qualixar OS — TaskCompleted hook
# Quality gate for completed tasks
# License: Elastic-2.0
# Exit 0 = allow completion, Exit 2 = block (quality too low)

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

# Parse task fields using python3 with fallbacks
PARSED=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    desc = d.get('description', '') or d.get('task', '') or d.get('prompt', '')
    if not desc and isinstance(d.get('data'), dict):
        desc = d['data'].get('description', '')
    result = d.get('result', '') or d.get('output', '') or d.get('summary', '')
    print(desc)
    print(result)
except Exception:
    print('')
    print('')
" <<< "$TASK_DATA" 2>/dev/null) || PARSED=""

TASK_DESC=$(echo "$PARSED" | head -1)
TASK_RESULT=$(echo "$PARSED" | tail -n +2 | head -1)

# H-07: Log only status, not task content (no secrets/PII on disk)
if [ -z "$TASK_DESC" ]; then
  echo "WARNING: TaskCompleted hook received empty task description." >&2
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WARN: empty task desc in TaskCompleted hook" >> "$LOG_DIR/hook-diagnostics.log" 2>/dev/null || true
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
desc = sys.argv[1][:500]
result = sys.argv[2][:500]
print(json.dumps({'task': desc, 'result': result}))
" "$TASK_DESC" "$TASK_RESULT" 2>/dev/null) || JSON_BODY=""

if [ -z "$JSON_BODY" ]; then
  exit 0
fi

# M-07 FIX: Single curl call captures both body and HTTP code
RAW_RESPONSE=$(curl -s -w "\n%{http_code}" --max-time 5 -X POST "${QOS_URL}/api/tasks/judge" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY" 2>/dev/null) || RAW_RESPONSE=""

if [ -z "$RAW_RESPONSE" ]; then
  exit 0
fi

# Parse HTTP code from last line, body from everything else
JUDGE_HTTP=$(echo "$RAW_RESPONSE" | tail -1)
JUDGE_RESPONSE=$(echo "$RAW_RESPONSE" | sed '$d')

if [ "$JUDGE_HTTP" != "200" ]; then
  # Endpoint doesn't exist yet or errored — fail-open
  exit 0
fi

# If judge failed or timed out, fail-open
if [ -z "$JUDGE_RESPONSE" ]; then
  exit 0
fi

# Parse judge response using python3
JUDGE_PARSED=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    verdict = d.get('verdict', 'UNKNOWN')
    score = d.get('score', 0)
    feedback = d.get('feedback', '')
    print(verdict)
    print(score)
    print(feedback)
except Exception:
    print('UNKNOWN')
    print('0')
    print('')
" <<< "$JUDGE_RESPONSE" 2>/dev/null) || JUDGE_PARSED="UNKNOWN"

VERDICT=$(echo "$JUDGE_PARSED" | head -1)
SCORE=$(echo "$JUDGE_PARSED" | sed -n '2p')
FEEDBACK=$(echo "$JUDGE_PARSED" | tail -n +3 | head -1)

if [ "$VERDICT" = "FAIL" ]; then
  echo "Qualixar OS quality gate: FAIL (score: ${SCORE}/10)"
  echo "Issues: ${FEEDBACK}"
  echo "Please address the issues and resubmit."
  exit 2
fi

# H-07: Log only verdict and score — no task content on disk
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] task_completed: verdict=${VERDICT} score=${SCORE}" >> "$LOG_DIR/team-events.log" 2>/dev/null || true

exit 0
