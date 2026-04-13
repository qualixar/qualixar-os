---
title: "Settings Tab"
description: "Configure Qualixar OS system settings via the dashboard"
category: "dashboard"
tags: ["settings", "configuration", "preferences", "dashboard"]
last_updated: "2026-04-05"
---

# Settings Tab

The Settings tab provides a UI for managing system configuration. Changes made here are written to `~/.qualixar-os/config.yaml` and take effect immediately (no restart required).

## Sections

### General
- **Mode** — Switch between `companion` (guided) and `power` (advanced) modes
- **Port** — Server port (default: 3000)
- **Log level** — debug, info, warn, error

### Providers
- Add, edit, and remove provider configurations
- Test provider connectivity with one click
- View available models per provider

### Models
- Set primary and fallback models
- Configure embedding model for memory/RAG
- Override model parameters (temperature, max tokens)

### Budget
- Set total spending limit
- Configure warning threshold
- Set budget reset period (daily, weekly, monthly)
- Per-provider budget limits

### Security
- API key management (view which env vars are set)
- CORS settings
- Authentication for the dashboard

### Advanced
- Database path
- Plugin directory
- Event retention period
- Memory settings (embedding dimensions, similarity threshold)

## API Access

Read and update configuration via the REST API:

```bash
# Get current config
curl http://localhost:3000/api/config

# Update config
curl -X PUT http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{"budget": {"max_usd": 200, "warn_pct": 0.75}}'
```

## Config File Location

All settings are stored in:

```
~/.qualixar-os/config.yaml
```

The dashboard UI and the config file are kept in sync. Editing either one updates the other.

## Resetting to Defaults

To reset all settings to defaults:

```bash
qos config reset
```

This creates a backup of your current config before resetting.

## Related

- [Config Schema Reference](../reference/config-schema.md) — Full config.yaml documentation
- [Security Setup Guide](../guides/security-setup.md) — Securing your installation
- [Provider Overview](../providers/overview.md) — Provider configuration details
