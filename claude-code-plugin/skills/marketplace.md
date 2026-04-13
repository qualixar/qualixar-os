---
name: qos-marketplace
description: Browse and install skills from the Qualixar OS marketplace. Search by name, category, or tool. Install with one command. Tools become available to Forge immediately.
user-invocable: true
allowed-tools: ["Bash"]
---

# Qualixar OS Marketplace

Browse and install agent skills, tools, and plugins from the global registry.

## Browse

```bash
# Search by keyword
curl http://localhost:3001/api/skill-store/browse?query=github

# Filter by category
curl "http://localhost:3001/api/skill-store/browse?category=code-dev"

# Show installed only
curl "http://localhost:3001/api/skill-store/browse?installedOnly=true"
```

## Categories
- `web-data` — Search, crawl, scrape, API connectors
- `code-dev` — GitHub, file I/O, shell, test runner
- `communication` — Slack, email, Discord, webhook
- `knowledge` — Vector search, DB query, RAG
- `creative` — Image gen, video gen, TTS, diagrams
- `enterprise` — CRM, project mgmt, analytics

## Install / Uninstall
Install from the dashboard (browser) or API. Tools register in Forge automatically.

Or open the dashboard: `open http://localhost:3001/dashboard/` → Marketplace tab.
