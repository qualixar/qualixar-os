---
name: qos-code-review
description: Run a multi-agent code review using Qualixar OS. Uses debate topology — two agents argue about code quality, a judge reaches consensus. Finds bugs, security issues, and style violations.
user-invocable: true
allowed-tools: ["Bash", "Read"]
---

# Multi-Agent Code Review

Use Qualixar OS to review code with a debate topology — two agent perspectives, one judge verdict.

## How It Works

1. **Reviewer Agent:** Analyzes code for correctness, security, and style
2. **Devil's Advocate Agent:** Challenges the review, finds missed issues
3. **Judge Agent:** Weighs both perspectives, produces final verdict with scored findings

## Usage

```bash
# Review a file or diff
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Review this code for security and correctness:\n\n{{code_or_diff}}",
    "type": "code",
    "topology": "debate",
    "mode": "power"
  }'
```

## Output
Scored findings grouped by severity: Critical / High / Medium / Low.
Each finding includes: description, location, suggested fix.
