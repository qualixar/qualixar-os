# Contributing to Qualixar OS

Thank you for considering contributing to Qualixar OS! This guide will help you get started.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Development Setup

**Prerequisites:** Node.js 22+, npm 10+

```bash
git clone https://github.com/qualixar/qualixar-os.git
cd qualixar-os
npm install
npm run build
npm test
```

For local development with hot reload:
```bash
npx tsx src/channels/cli.ts serve --dashboard --port 3000
```

## Architecture Overview

Qualixar OS is built with **32 dependency-injected components** bootstrapped in strict order. Key design principles:

- **Immutability** — new objects, never mutate
- **TypeScript strict mode** — no `any`, explicit return types
- **DI over globals** — all components receive dependencies via constructor
- **Zod validation** — at all system boundaries
- **SQLite + WAL** — single-file database, no external dependencies

### Module Map

| Directory | Purpose |
|-----------|---------|
| `src/engine/` | Orchestrator pipeline, steering, degradation, checkpoints |
| `src/agents/` | Forge (AI team designer), SwarmEngine, 13 topology implementations |
| `src/quality/` | Judge pipeline, consensus, anti-fabrication, strategy scorer, drift detection |
| `src/memory/` | SLM-Lite 4-layer memory store, belief graph, learning engine |
| `src/router/` | Model routing, 5 strategies (cascade/cheapest/quality/balanced/POMDP), Q-learning |
| `src/channels/` | HTTP server, MCP server, CLI, WebSocket, route handlers |
| `src/security/` | Inference guard, filesystem sandbox, security engine |
| `src/tools/` | Built-in tools (web_search, file_read, file_write, shell_exec), tool registry |
| `src/marketplace/` | Skill registry, plugin installer, sandbox |
| `src/dashboard/` | React 19 dashboard with 24 tabs |
| `src/enterprise/` | RBAC, credential vault, SSO, audit logging |
| `src/compatibility/` | A2A server/client, MCP consumer, framework readers |
| `src/db/` | Database layer, migrations, schema |

## Coding Conventions

- **TypeScript strict mode** — `strict: true` in tsconfig.json
- **Immutability** — prefer `readonly`, `Object.freeze()`, spread operators
- **File size** — 800-line hard cap per file
- **Functions** — under 50 lines, single responsibility
- **Validation** — Zod schemas at all API boundaries
- **Error handling** — never silently swallow errors, always log with context
- **Constants** — no magic numbers, use named constants
- **Naming** — camelCase for variables/functions, PascalCase for types/classes

## Testing

We use **vitest** with in-memory SQLite for integration tests.

```bash
npm test              # Run all tests
npm run test:coverage # Run with coverage report
npx tsc --noEmit     # Type check without emitting
```

**Testing philosophy:**
- Real in-memory databases, not mocks (except for LLM calls)
- DI-based test helpers (`createMockOrchestrator`, `createMockStrategyScorer`)
- Coverage target: 80%+ lines, meaningful branch coverage
- Test behavior, not implementation details

## Pull Request Process

1. **Fork** the repository and create a feature branch: `git checkout -b feature/my-feature`
2. **Write tests first** — TDD is preferred (RED → GREEN → REFACTOR)
3. **Make your changes** — follow the coding conventions above
4. **Verify:**
   ```bash
   npm test           # All tests pass
   npx tsc --noEmit   # Zero type errors
   ```
5. **Submit a PR** with a clear description of what changed and why
6. **Respond to review feedback** within 7 days

### PR Guidelines

- Keep PRs focused — one feature or fix per PR
- Include test coverage for new functionality
- Update docs if you change user-facing behavior
- Reference related issues with `Fixes #123` or `Relates to #123`

## Good First Issues

Look for issues labeled [`good first issue`](https://github.com/qualixar/qualixar-os/labels/good%20first%20issue). These are curated for newcomers and include enough context to get started.

Great areas for first contributions:
- Adding new built-in tools in `src/tools/`
- Improving error messages with actionable guidance
- Adding tests for undertested modules (`src/channels/`, `src/cli/`)
- Documentation improvements

## Governance

See [GOVERNANCE.md](GOVERNANCE.md) for how decisions are made.

## License

By contributing, you agree that your contributions will be licensed under the FSL-1.1-ALv2 license.
