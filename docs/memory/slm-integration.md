---
title: "SLM Integration Guide"
description: "How to use QOS memory: auto-invoke, behavioral capture, the learning engine, and the belief graph"
category: "memory"
tags: ["slm-lite", "auto-invoke", "behavioral-capture", "learning-engine", "belief-graph"]
last_updated: "2026-04-13"
---

# SLM Integration Guide

This page covers how to use the SLM-Lite memory system in Qualixar OS. For an architectural overview, see the [Memory Overview](./overview.md).

## Storing Memories

Store a memory entry in any of the four layers:

```typescript
const entryId = await orchestrator.slmLite.store({
  content: 'This project uses PostgreSQL 16 with pgvector for embeddings',
  layer: 'semantic',       // working | episodic | semantic | procedural
  source: 'user',          // user | system | agent | behavioral
  metadata: { project: 'my-app', tags: ['database', 'embeddings'] },
  teamId: 'team-alpha',    // optional: scope to a team
});
```

The entry receives an auto-generated ID, a default trust score of 0.5, and timestamps. Working layer entries stay in RAM only. All other layers persist to SQLite with FTS5 indexing.

## Recalling Memories

Explicitly search for relevant memories:

```typescript
const context = await orchestrator.slmLite.recall('database configuration', {
  layers: ['semantic', 'procedural'],  // optional: filter by layer
  maxResults: 10,                       // default: 20
  minTrustScore: 0.3,                  // default: 0.0
  teamId: 'team-alpha',               // optional: scope to team
});

// context.entries -- array of MemoryEntry objects
// context.summary -- human-readable summary string
// context.totalFound -- total matches before truncation
// context.layerCounts -- { working: 0, episodic: 0, semantic: 3, procedural: 1 }
```

## Auto-Invoke (Automatic Context Retrieval)

Auto-invoke is the proactive side of SLM-Lite. When a new task arrives, it automatically retrieves relevant memories without anyone explicitly calling `recall()`.

**How it fires:** The orchestrator calls `slmLite.autoInvoke(task)` at the start of every task. If `memory.enabled` and `memory.auto_invoke` are both true in the config, the auto-invoker runs its full pipeline.

**The pipeline in detail:**

1. **Concept extraction** -- Sends the task prompt to a lightweight LLM to extract 3-7 keywords. Falls back to splitting the prompt into words longer than 3 characters if the LLM call fails.

2. **Bandit arm selection** -- Uses an epsilon-greedy multi-armed bandit (epsilon = 0.1) to select:
   - **Trust threshold** -- from arms [0.2, 0.3, 0.4, 0.5]
   - **Top-K** -- from arms [5, 10, 15, 20]

3. **Four-layer search** -- Searches all layers simultaneously:
   - Working: scans in-memory entries for concept matches
   - Episodic: FTS5 search with `concept1 OR concept2 OR ...`
   - Semantic: same FTS5 search
   - Procedural: searches by task type

4. **Deduplicate and rank** -- Removes duplicates by entry ID, sorts by trust score descending, filters below the threshold, truncates to top-K.

5. **Summarize** -- Sends the top entries to an LLM for a 2-3 sentence contextual summary.

6. **Return** -- The `MemoryContext` is injected into the task's agent context.

**Source:** `src/memory/auto-invoker.ts`.

### Feedback Loop

After a task completes, call `recordFeedback()` to update the bandit policy:

```typescript
await autoInvoker.recordFeedback(
  true,   // taskApproved: was the task result accepted?
  true,   // memoryUsed: was the surfaced memory actually used?
);
```

The reward formula is: `reward = usageSignal * 0.6 + successSignal * 0.4`. This reward updates the selected bandit arms, improving threshold and top-K selection over time. The bandit state is persisted in the procedural memory layer under the key `__bandit_policy_state__`.

## Behavioral Capture

Behavioral capture records agent behavior patterns automatically. After each task, the system captures:

```typescript
orchestrator.slmLite.captureBehavior('agent-coder-01', {
  agentId: 'agent-coder-01',
  taskId: 'task-abc123',
  toolSelections: ['read_file', 'write_file', 'run_tests'],
  errorRecoveryStrategy: 'retry-with-backoff',
  communicationStyle: 'concise',
  successPatterns: ['wrote tests before implementation', 'used type checking'],
  timestamp: new Date().toISOString(),
});
```

This call returns immediately (non-blocking). The actual write to the procedural layer happens asynchronously. The captured data is stored as structured text:

```
Agent: agent-coder-01
Task: task-abc123
Tools: read_file, write_file, run_tests
Error Recovery: retry-with-backoff
Success: wrote tests before implementation, used type checking
```

Metadata includes all structured fields for later querying. Over time, the procedural layer accumulates patterns that the auto-invoker surfaces for similar future tasks.

**Source:** `src/memory/behavioral-capture.ts`.

## Learning Engine

The learning engine extracts reusable patterns from completed tasks using LLM analysis.

```typescript
await orchestrator.slmLite.extractPatterns(
  'task-abc123',  // taskId
  'code',         // taskType
  true,           // approved: was this a successful task?
);
```

The engine:
1. Retrieves recent episodic and procedural memories related to the task (up to 20)
2. Sends them to an LLM with the prompt "What worked well?" (or "What went wrong?" for failures)
3. Parses the response as 1-5 pattern strings
4. Stores each pattern in the procedural layer with metadata: `taskType`, `approved`, `extractedFrom`, `patternType`

These patterns become available to the auto-invoker for future tasks of the same type.

**Source:** `src/memory/learning-engine.ts`.

## Belief Graph

The belief graph tracks causal relationships between knowledge:

```typescript
// Add a belief
const beliefId = await orchestrator.slmLite.addBelief({
  content: 'TypeScript strict mode reduces runtime errors by 40%',
  confidence: 0.85,
  source: 'research',
  causalEdges: [
    { toId: 'belief-xyz', relation: 'supports', strength: 0.7 },
  ],
});

// Query beliefs on a topic (expands to 2 hops)
const graph = await orchestrator.slmLite.getBeliefGraph('typescript');
// graph.nodes -- BeliefNode[] with id, content, confidence, decayRate
// graph.edges -- BeliefEdgeRecord[] with fromId, toId, relation, strength
```

Belief confidence decays exponentially: `confidence * exp(-decayRate * daysSinceCreation)`. The minimum confidence before a belief is considered stale is 0.05. Edge relations are: `causes`, `contradicts`, `supports`, `requires`.

## Team Memory

Agents working together on a task can share memories:

```typescript
// Share a memory entry with a team
orchestrator.slmLite.shareWithTeam('entry-id', 'team-alpha');

// Retrieve all team memories
const teamContext = await orchestrator.slmLite.getTeamMemory('team-alpha');
```

Team memory is useful in swarm topologies where multiple agents collaborate. Shared memories are scoped by `teamId` so they don't pollute other teams' contexts.

## Memory Promotion

Memories can be promoted between layers as they prove their value:

```typescript
// Promote an episodic memory to the semantic layer
orchestrator.slmLite.promote('entry-id', 'semantic');
```

This creates a new entry in the target layer and archives the original. Automatic promotion runs via `runPromotion()`, which evaluates all entries against the promotion rules.

## Accessing Memory via MCP

The `search_memory` MCP tool exposes SLM-Lite to any MCP client:

```json
{
  "name": "search_memory",
  "arguments": {
    "query": "database configuration",
    "layer": "semantic",
    "limit": 5
  }
}
```

## Related

- [Memory Overview](./overview.md) -- Architecture and 4-layer model
- [SuperLocalMemory](./superlocalmemory.md) -- Full-featured version and upgrade path
