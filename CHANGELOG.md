# Changelog

All notable changes to Qualixar OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **License:** Changed from Elastic-2.0 to FSL-1.1-ALv2 (Functional Source License) for stronger IP protection

### Added
- **Model Discovery**: Dynamic multi-provider model discovery at startup (Azure, OpenAI, Anthropic, OpenRouter, Ollama, Groq, Together, DeepSeek, LM Studio)
- **Routing Strategies**: quality/balanced/cost routing with config.yaml `routing` field
- **OpenRouter Integration**: Real pricing data from 200+ models
- **Goodhart Detector**: Cross-model entropy tracking for judge quality monitoring, wired to EventBus
- **Drift Monitor**: Patent-formula drift bounds (JSD, theta=0.877) wired to judge pipeline
- **Trilemma Guard**: Wang et al. impossibility navigation with 4 escape hatches, wired to orchestrator
- **Behavioral Contracts**: Design-by-Contract for Forge teams with 4 default invariants
- **Forge Contracts Integration**: Pre/post redesign verification via behavioral contracts
- **Loop Benchmark Harness**: Convergence proof with paired t-test for Forge-Judge-RL loop
- **GAIA Benchmark Harness**: Comparison with AIOS published baselines
- **Universal Command Protocol**: 25 commands across 4 transports (HTTP, CLI, WebSocket, MCP)
- **A2A Message Hub**: Protocol-unified agent communication
- **Forge Memory Guard**: Pattern preservation before radical redesigns
- **SSO Real Token Exchange**: OAuth2 via fetch() replacing synthetic stubs
- **Simulation Predictor**: Historical data prediction from forge designs
- **Reliability Theory**: 6-dimension axiom framework (C, S, R, E, H, G)
- **14 new event types** for quality, transport, commands, and discovery

### Changed
- EventBus type union extended (217 event types)
- `shannonEntropy` deduplicated to `src/utils/math.ts` (log2 and ln variants)
- SSO interface properties made readonly (M-01 audit fix)
- E2E tests updated to use gpt-5.4-mini on Azure GTIC

### Fixed
- WebSocket error logging (M-11)
- GAIA empty catch block documented (M-07)
- All 12 Medium + 6 Low audit findings resolved

### Stats
- Tests: 2,821 (up from 2,597 baseline)
- TypeScript errors: 0
- New source files: 20+
- New test files: 12+

## [2.1.1] - 2026-04-12

### Fixed
- License corrected to FSL-1.1-ALv2 across all registry listings (server.json, Smithery, Glama, MCP Marketplace)
- Topology count updated from 12 to 13 (Hybrid topology) across all docs and registry listings
- Dockerfile image version updated to 2.1.1
- Docker volume paths updated from `~/.qos` to `~/.qualixar-os`
- CHANGELOG merged duplicate `[Unreleased]` sections
- Added `qclaw` (renamed to qualixar-os) backward-compat alias in package.json bin

### Added
- CONTRIBUTING.md with development setup and code standards

## [2.1.0] - 2026-04-07

Internal version bump for Pivot 2 development.

## [2.0.0] - 2026-04-03

### Added
- 12-step orchestrator pipeline with 13 topology executors
- BFT judge consensus framework (weighted_majority, bft_inspired, raft_inspired)
- Q-Learning meta-router with epsilon-greedy strategy selection
- LP budget optimizer with per-task cost tracking
- 4-layer memory system (working, episodic, semantic, procedural)
- 25 universal commands across 4 transports (CLI, HTTP, MCP, WebSocket)
- 21-tab glassmorphism dashboard with real-time WebSocket updates
- A2A v0.3 protocol server and client
- MCP server with 15+ tools
- Agent interop (OpenClaw, DeerFlow, NemoClaw, GitAgent readers)
- Filesystem sandbox with policy engine
- Docker container isolation (optional)
- Config-driven Azure AI Foundry provider support
- Interactive chat with streaming responses
- POMDP-based cost-aware routing strategy

### Security
- Column name validation in SQL insert/update (prevents SQL injection)
- Bearer token authentication middleware (configurable)
- Filesystem denylist/allowlist policy enforcement
