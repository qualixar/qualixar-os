---
title: "Marketplace Tab"
description: "Browse, install, and manage plugins and skills from the Qualixar marketplace"
category: "dashboard"
tags: ["marketplace", "plugins", "skills", "extensions", "dashboard"]
last_updated: "2026-04-05"
---

# Marketplace Tab

The Marketplace tab lets you extend Qualixar OS with community-built plugins, tools, and skills. Browse the catalog, install with one click, and manage installed extensions.

## Browsing

The marketplace organizes extensions into categories:
- **Tools** — Add new capabilities (web scraping, file processing, APIs)
- **Skills** — Reusable agent behaviors and workflows
- **Connectors** — Integrations with external services
- **Blueprints** — Pre-built agent team configurations

Each listing shows: name, description, author, install count, rating, and compatibility info.

## Installing

### Via Dashboard

1. Browse or search for an extension
2. Click **Install**
3. The extension downloads and registers automatically
4. Restart is not required — hot reload applies changes

### Via API

```bash
# Browse marketplace (supports ?query=, ?type=, ?verified=, ?sort= params)
curl http://localhost:3000/api/marketplace/browse?type=tool

# Browse unified skill store (marketplace + local skills combined)
curl http://localhost:3000/api/skill-store/browse

# Get detail for a specific plugin
curl http://localhost:3000/api/marketplace/my-plugin-id

# Install a plugin
curl -X POST http://localhost:3000/api/marketplace/install \
  -H "Content-Type: application/json" \
  -d '{"pluginId": "my-plugin-id"}'

# Refresh registry from remote
curl -X POST http://localhost:3000/api/marketplace/refresh
```

## Skill Store

The unified skill store at `/api/skill-store/browse` combines plugins from the marketplace with locally defined skills:

```bash
# Browse all available skills (local + remote)
curl http://localhost:3000/api/skill-store/browse

# Get details for a specific skill
curl http://localhost:3000/api/skill-store/my-skill-id

# List installed skills
curl http://localhost:3000/api/skill-store/installed

# Install a skill
curl -X POST http://localhost:3000/api/skill-store/install \
  -H "Content-Type: application/json" \
  -d '{"pluginId": "my-skill-id"}'

# Uninstall a skill
curl -X POST http://localhost:3000/api/skill-store/my-skill-id/uninstall
```

## Managing Installed Extensions

The **Installed** tab shows all active extensions with options to:
- **Update** — Pull the latest version
- **Disable** — Temporarily turn off without uninstalling
- **Remove** — Uninstall completely
- **Configure** — Set extension-specific options

## Publishing

To publish your own extension to the marketplace:

1. Create a plugin following the [MCP Integration guide](../guides/mcp-integration.md)
2. Add a `qualixar-manifest.json` with metadata
3. Publish to the registry:

```bash
qos marketplace publish ./my-plugin
```

## Related

- [Tools Tab](tools.md) — Manage all registered tools
- [MCP Integration Guide](../guides/mcp-integration.md) — Build custom integrations
- [Skill Manifest Reference](../reference/skill-manifest.md) — Manifest file format
