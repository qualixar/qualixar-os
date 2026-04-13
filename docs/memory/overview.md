---
title: "Memory System Overview"
description: "SLM-Lite: the built-in memory system in Qualixar OS, inspired by and compatible with SuperLocalMemory"
category: "memory"
tags: ["memory", "slm-lite", "cognitive", "trust", "auto-invoke", "belief-graph"]
last_updated: "2026-04-13"
---

# Memory System Overview

Qualixar OS includes a built-in memory system called **SLM-Lite** -- a lightweight version of [SuperLocalMemory](https://npmjs.com/package/superlocalmemory). SLM-Lite gives your agents persistent memory across tasks without requiring any external dependencies.

## What SLM-Lite Stores

SLM-Lite organizes memories into a **4-layer cognitive architecture**, inspired by how human memory works:

| Layer | Purpose | Storage | Example |
|-------|---------|---------|---------|
| **Working** | Short-term, current task context | In-memory `Map` | "The user wants Python, not JavaScript" |
| **Episodic** | Past events and task outcomes | SQLite + FTS5 | "Last code review found 3 security issues" |
| **Semantic** | General knowledge and facts | SQLite + FTS5 | "This project uses Next.js 15 with App Router" |
| **Procedural** | Learned patterns and behaviors | SQLite + FTS5 | "For this codebase, always run lint before tests" |

Working memory entries live only in RAM and are fast but volatile. The other three layers persist to SQLite with FTS5 (full-text search with porter stemming) for efficient retrieval.

**Source:** `src/memory/store.ts` -- `MemoryStoreImpl` class.

## How Retrieval Works

SLM-Lite retrieves memories through multiple channels simultaneously:

1. **Working memory scan** -- Substring match against all in-memory entries
2. **FTS5 search** -- Full-text search across persistent layers using porter stemming
3. **LIKE fallback** -- If FTS5 query syntax fails, falls back to SQL LIKE search
4. **Trust filtering** -- Results below the minimum trust score are excluded
5. **Team scoping** -- When a `teamId` is provided, results are scoped to that team's shared memories

All results are deduplicated, sorted by trust score descending, and truncated to `maxResults` (default 20). Each retrieved entry has its `access_count` incremented automatically.

**Source:** `src/memory/store.ts` -- `recall()` method.

## Auto-Invoke (Proactive Memory)

The most powerful feature of SLM-Lite is **auto-invoke** -- automatic context retrieval at the start of every task. Instead of waiting for an agent to explicitly search memory, SLM-Lite proactively surfaces relevant memories.

The auto-invoke pipeline:

1. **Concept extraction** -- An LLM call extracts 3-7 key concepts from the task prompt
2. **Bandit arm selection** -- An epsilon-greedy multi-armed bandit selects the trust threshold and top-K parameters (these improve over time)
3. **Multi-layer search** -- Working, episodic, semantic, and procedural layers are all searched in parallel
4. **Rank and filter** -- Results are deduplicated, ranked by trust score, filtered by the bandit-selected threshold
5. **Summary generation** -- An LLM call produces a 2-3 sentence summary of the relevant memories
6. **Feedback loop** -- After task completion, `recordFeedback()` updates the bandit policy based on whether the memory was useful

Auto-invoke is controlled by two config flags: `memory.enabled` and `memory.auto_invoke`. Both must be `true` for auto-invoke to fire.

**Source:** `src/memory/auto-invoker.ts` -- `AutoInvokerImpl` class.

## Trust Scoring

Every memory entry has a trust score between 0.1 and 1.0. The score is computed from four factors:

```
score = credibility * (1 - contradiction) * decay * cross_validation
```

| Factor | Formula | Description |
|--------|---------|-------------|
| **Credibility** | Source-based: user=1.0, system=0.9, agent=0.7, behavioral=0.6 | How reliable is the source? |
| **Contradiction** | `min(0.8, count * 0.2)` | How many contradicting memories exist? |
| **Temporal decay** | `max(0.1, 1.0 - days * rate)` | Older memories lose trust gradually |
| **Cross-validation** | Boost from `confirmedByOtherSources` | Multiple sources confirming = higher trust |

The final score is clamped to [0.1, 1.0]. User-provided information always starts at the highest credibility.

**Source:** `src/memory/trust-scorer.ts` -- `TrustScorerImpl` class.

## Behavioral Capture

SLM-Lite automatically records agent behavior profiles into the procedural memory layer. After each task, it captures:

- Which tools the agent selected
- Error recovery strategies used
- Communication style patterns
- Success patterns

This is **non-blocking** -- `captureBehavior()` returns immediately and writes asynchronously. Over time, the procedural layer accumulates patterns that inform future agent behavior.

**Source:** `src/memory/behavioral-capture.ts` -- `BehavioralCaptureImpl` class.

## Belief Graph

SLM-Lite includes a causal belief graph that tracks relationships between beliefs:

- **Nodes** are beliefs with content, confidence, and exponential decay (`confidence * exp(-rate * days)`)
- **Edges** represent causal relationships: `causes`, `contradicts`, `supports`, `requires`
- Queries expand to 2 hops to find related beliefs

The belief graph enables reasoning about cause-and-effect relationships in agent knowledge. For example, if the system learns that "TypeScript strict mode catches more bugs" (belief) and "This project has strict mode enabled" (belief), the `supports` edge strengthens confidence in both.

**Source:** `src/memory/belief-graph.ts` -- `BeliefGraphImpl` class.

## The SLMLite Interface

The full facade is in `src/memory/index.ts`. Key methods:

```typescript
interface SLMLite {
  store(entry: MemoryInput): Promise<string>;
  recall(query: string, options?: RecallOptions): Promise<MemoryContext>;
  autoInvoke(task: TaskOptions): Promise<MemoryContext>;
  search(query: string, options?: { layer?: string; limit?: number }): Promise<...>;
  captureBehavior(agentId: string, behavior: BehaviorRecord): void;
  addBelief(belief: BeliefInput): Promise<string>;
  getBeliefGraph(topic: string): Promise<BeliefGraph>;
  getTrustScore(entryId: string): number;
  promote(entryId: string, targetLayer: MemoryLayer): void;
  shareWithTeam(entryId: string, teamId: string): void;
  extractPatterns(taskId: string, taskType: string, approved: boolean): Promise<void>;
  runPromotion(): Promise<PromotionResult>;
  cleanExpired(): number;
  getStats(): MemoryStats;
}
```

## Immutability

Memory content is **never updated in place**. To update a memory, `createVersion()` creates a new entry and sets a `superseded_by` pointer on the original. This preserves the full history of how knowledge evolved.

**Source:** `src/memory/store.ts` -- `createVersion()` method.

## RAM Management

SLM-Lite enforces a RAM limit derived from `memory.max_ram_mb` in the config (default 50MB, approximately 1KB per entry = 51,200 entries). When the limit is exceeded, the oldest non-archived entries are automatically archived.

## Related

- [SLM Integration Guide](./slm-integration.md) -- Auto-invoke, behavioral capture, learning engine
- [SuperLocalMemory](./superlocalmemory.md) -- The full-featured version and upgrade path
