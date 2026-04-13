# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability in Qualixar OS, please report it responsibly.

**Email:** security@qualixar.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Impact assessment (if known)

**Do not** open a public GitHub issue for security vulnerabilities.

## What Constitutes a Security Issue

- Authentication or authorization bypass
- Remote code execution
- SQL injection or command injection
- Credential or secret exposure
- Sandbox escape (e.g., bypassing the 51 denied shell commands)
- Cross-site scripting (XSS) in the dashboard
- Privilege escalation in RBAC
- MCP/A2A protocol vulnerabilities that allow unauthorized access
- Memory system data leakage between tenants

## Response Timeline

| Stage | Timeline |
|-------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix for critical issues | Within 7 days |
| Fix for high issues | Within 14 days |
| Fix for medium/low issues | Next scheduled release |

## Scope

**In scope:**
- QOS core runtime (`src/`)
- Dashboard (`src/dashboard/`)
- CLI (`src/channels/cli.ts`, `bin/qos.js`)
- MCP server (`src/channels/mcp-server.ts`)
- A2A server (`src/channels/a2a-server.ts`)
- HTTP API (`src/channels/http-server.ts`)
- Credential vault and RBAC (`src/security/`)
- Sandbox and command filtering

**Out of scope:**
- Self-hosted configuration issues (e.g., exposing the dashboard port to the internet without authentication)
- Third-party plugins or community marketplace skills
- Vulnerabilities in upstream dependencies (report those to the respective maintainers)
- Social engineering attacks
- Denial of service via expected high-volume usage

## Disclosure Policy

We follow coordinated disclosure. We will:
1. Confirm the vulnerability and determine its impact
2. Develop and test a fix
3. Release the fix and publish a security advisory
4. Credit the reporter (unless they prefer anonymity)

We ask that you give us reasonable time to address the issue before any public disclosure.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.1.x | Yes |
| < 2.0 | No |
