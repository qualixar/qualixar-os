---
title: "Security Setup Guide"
description: "Secure your Qualixar OS installation with API keys, sandboxing, and network controls"
category: "guides"
tags: ["security", "authentication", "sandbox", "cors", "production"]
last_updated: "2026-04-13"
---

# Security Setup Guide

Qualixar OS runs a web server with API endpoints and executes agent-generated commands. This guide covers API authentication, the filesystem sandbox, command validation, and network controls.

## 1. API Authentication

Set the `QOS_API_KEY` environment variable to enable Bearer token authentication on all `/api/*` endpoints (except `/api/health` and `/api/ready`):

```bash
export QOS_API_KEY=your-secret-key-here
```

All API requests must include the header:

```
Authorization: Bearer your-secret-key-here
```

The key comparison uses `timingSafeEqual` to prevent timing attacks. WebSocket connections authenticate via a `?token=` query parameter.

> **Note:** WebSocket connections pass the API key as a query parameter (`?token=...`) since WebSocket upgrade requests don't support custom headers. For production, consider using short-lived tokens.

If `QOS_API_KEY` is not set, the API is open. A console warning is printed on startup.

## 2. Filesystem Sandbox

The `FilesystemSandbox` validates every file path agents try to access. It enforces:

**Denylist (always wins):** Sensitive paths that are never accessible:
- `~/` (home directory root), `/etc/`, `/usr/`, `/private/etc/`, `/private/var/`
- `**/.env`, `**/*.pem`, `**/*.key`, `**/.git/config`

**Allowlist:** Paths agents can access (default: `./` and `~/.qualixar-os/workspaces`).

**Evaluation order:** Glob denylist first (sensitive files), then allowlist check, then directory denylist. Anything not explicitly allowed is denied by default.

**Symlink escape prevention:** All paths are resolved to their real path via `realpathSync.native` before evaluation. Path traversal (`..` and null bytes) is blocked.

Configure allowed paths in `config.yaml`:

```yaml
security:
  allowed_paths:
    - ./
    - /Users/me/projects
  denied_commands:
    - rm -rf
    - sudo
```

## 3. Hardened Command Validation

The sandbox blocks dangerous commands with 50+ hardened patterns across 11 categories:

| Category | Examples Blocked |
|----------|-----------------|
| Destructive filesystem | `rm -rf /`, `rm -rf ~`, `rmdir /` |
| Disk destruction | `dd if=`, `mkfs`, `fdisk`, `wipefs` |
| Permission escalation | `chmod 777`, `chown root`, `setuid` |
| Remote code execution | `curl \| sh`, `wget \| bash` |
| Shell injection | `eval`, `exec`, `$(curl`, `` `wget `` |
| Privilege escalation | `sudo`, `su`, `doas`, `pkexec` |
| Reverse shell | `nc -l`, `ncat`, `/dev/tcp/` |
| Network exfiltration | `ssh`, `scp`, `sftp`, `rsync` |
| Process killing | `kill -9`, `killall`, `pkill` |
| Environment manipulation | `export`, `unset`, `source /etc/` |
| Path traversal | `../` in commands |

Critical patterns use word-boundary regex to avoid false positives (e.g., "inform" does not match "rm"). User-configured `denied_commands` are additive on top of the hardened list.

## 4. CORS and CSRF Protection

CORS is restricted to the serving origin (e.g., `http://localhost:3000`). Override with:

```bash
export QOS_CORS_ORIGIN=https://your-app.example.com
```

CSRF protection is enforced on all state-changing `/api/*` requests. The server checks Origin/Referer headers and allows requests from localhost or those with an Authorization header.

## 5. Rate Limiting

Built-in IP-based rate limiter: 2000 requests per 60-second window per IP. Rate limit headers are included in every API response:

- `X-RateLimit-Limit` -- max requests per window
- `X-RateLimit-Remaining` -- requests left
- `X-RateLimit-Reset` -- window reset timestamp

## 6. Body Size Limit

Request bodies are capped at 1 MB to prevent DoS. Requests exceeding this receive HTTP 413.

## 7. Content Security Policy

Dashboard pages include a CSP header restricting scripts, styles, images, and WebSocket connections to same-origin.

## Production Checklist

- [ ] `QOS_API_KEY` environment variable set
- [ ] Provider API keys in env vars (not config files)
- [ ] CORS origin restricted to your domain
- [ ] Server bound to localhost or behind a reverse proxy
- [ ] TLS/HTTPS via reverse proxy (nginx, Caddy)
- [ ] `security.allowed_paths` restricted to project directories
- [ ] Shell execution disabled unless needed (`execution.enable_shell: false`)

## Related

- [Deploy with Docker](deploy-docker.md) -- Containerized deployment
- [Settings Tab](../dashboard/settings.md) -- Configure security via UI
- [Config Schema](../reference/config-schema.md) -- All security config options
