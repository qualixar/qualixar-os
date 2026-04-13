---
title: "Skill Manifest Reference"
description: "Format and fields for qualixar-manifest.json skill definitions"
category: "reference"
tags: ["skills", "manifest", "plugins", "packaging", "reference"]
last_updated: "2026-04-05"
---

# Skill Manifest Reference

Every Qualixar OS plugin or skill package includes a `qualixar-manifest.json` file that describes its capabilities, requirements, and metadata.

## Manifest Structure

```json
{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "A skill that does something useful",
  "author": "Your Name",
  "license": "MIT",
  "category": "knowledge",
  "tags": ["search", "analysis"],

  "entry": "./dist/index.js",

  "tools": [
    {
      "name": "my-search",
      "description": "Search for relevant documents",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The search query"
          },
          "limit": {
            "type": "number",
            "description": "Maximum results to return",
            "default": 10
          }
        },
        "required": ["query"]
      }
    }
  ],

  "requires": {
    "qualixar-os": ">=1.0.0",
    "node": ">=20.0.0"
  },

  "config": {
    "api_key_env": {
      "type": "string",
      "description": "Environment variable for the API key",
      "required": false
    }
  },

  "mcp": {
    "transport": "stdio",
    "command": "node",
    "args": ["./dist/server.js"]
  }
}
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique package name (lowercase, hyphens) |
| `version` | string | Semantic version (e.g., 1.0.0) |
| `description` | string | One-line description |
| `entry` | string | Main JavaScript entry point |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `author` | string | Author name or organization |
| `license` | string | SPDX license identifier |
| `category` | string | One of the 6 tool categories |
| `tags` | string[] | Search tags for marketplace discovery |
| `tools` | object[] | Tool definitions (name, description, parameters) |
| `requires` | object | Version requirements for Qualixar OS and Node.js |
| `config` | object | User-configurable settings |
| `mcp` | object | MCP server configuration (if the skill is an MCP server) |

## Tool Parameters

Tool parameters follow JSON Schema format:

```json
{
  "name": "analyze-code",
  "description": "Analyze code for potential issues",
  "parameters": {
    "type": "object",
    "properties": {
      "code": {
        "type": "string",
        "description": "The code to analyze"
      },
      "language": {
        "type": "string",
        "enum": ["typescript", "python", "go", "rust"],
        "description": "Programming language"
      }
    },
    "required": ["code", "language"]
  }
}
```

## MCP Server Skills

If your skill runs as an MCP server, include the `mcp` section:

```json
{
  "mcp": {
    "transport": "stdio",
    "command": "node",
    "args": ["./dist/server.js"]
  }
}
```

Qualixar OS will launch the MCP server and register its tools automatically.

## Publishing

1. Create your skill with a `qualixar-manifest.json`
2. Test locally by placing it in `~/.qualixar-os/plugins/`
3. Publish to the marketplace:

```bash
qos marketplace publish ./my-skill
```

## Validation

Validate your manifest before publishing:

```bash
qos manifest validate ./qualixar-manifest.json
```

## Related

- [Marketplace Tab](../dashboard/marketplace.md) — Browse and install skills
- [MCP Integration Guide](../guides/mcp-integration.md) — Build MCP-based skills
- [Tool Categories](tool-categories.md) — Category definitions
