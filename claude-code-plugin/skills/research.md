---
name: qos-research
description: Deep research using Qualixar OS web-researcher agent. Searches the web, crawls sources, synthesizes findings into a structured report with citations. Use for market research, competitive analysis, or technical investigation.
user-invocable: true
allowed-tools: ["Bash", "Read", "Write"]
---

# Web Research Agent

Use Qualixar OS web-researcher agent to perform deep research with cited sources.

## Usage

```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Research: {{research_question}}",
    "type": "research",
    "mode": "power"
  }'
```

## What Happens
1. Forge designs a research team (web-researcher + data-analyst agents)
2. Web search and crawling tools activated automatically
3. Multiple sources read and cross-referenced
4. Structured report produced with inline citations

## Output
Markdown report with: Executive summary, key findings, evidence, source URLs.
