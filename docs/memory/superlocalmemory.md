---
title: "SuperLocalMemory"
description: "The full-featured memory system -- what SLM-Lite is based on, feature comparison, and upgrade path"
category: "memory"
tags: ["superlocalmemory", "slm", "upgrade", "comparison"]
last_updated: "2026-04-13"
---

# SuperLocalMemory

Qualixar OS includes **SLM-Lite**, a lightweight memory system built into the orchestrator. SLM-Lite is inspired by and compatible with **SuperLocalMemory** (SLM) -- a standalone, full-featured agent memory system available on npm and PyPI.

If you need more advanced memory capabilities, SuperLocalMemory is the upgrade path.

## What is SuperLocalMemory?

SuperLocalMemory is an infinite-memory system for AI agents. It runs entirely on your machine -- no cloud, no API keys, no data leaving your laptop. It uses techniques from differential geometry, algebraic topology, and stochastic analysis to replace the LLM calls that other memory systems need for core operations like similarity scoring, contradiction detection, and lifecycle management.

**Backed by 3 peer-reviewed research papers:**
- [arXiv:2603.02240](https://arxiv.org/abs/2603.02240) -- Core architecture
- [arXiv:2603.14588](https://arxiv.org/abs/2603.14588) -- Mathematical retrieval engine
- [arXiv:2604.04514](https://arxiv.org/abs/2604.04514) -- The Living Brain (lifecycle + consolidation)

**Performance:** On the [LoCoMo benchmark](https://arxiv.org/abs/2402.09714) (standard long-conversation memory evaluation), SLM Mode A scores 74.8% with zero cloud dependency -- outperforming Mem0 (64.2%) by 16 percentage points. Mode C reaches 87.7%.

**Works with:** Claude Code, Cursor, Windsurf, VS Code Copilot, ChatGPT Desktop, Gemini CLI, JetBrains, Zed, and 17+ AI tools via MCP.

## SLM-Lite vs SuperLocalMemory

| Feature | SLM-Lite (built into QOS) | SuperLocalMemory (standalone) |
|---------|---------------------------|-------------------------------|
| **4-layer memory** (working/episodic/semantic/procedural) | Yes | Yes |
| **Full-text search** (FTS5) | Yes | Yes |
| **Trust scoring** | Linear decay formula | Mathematical: Fisher-Rao + topology |
| **Auto-invoke** (proactive recall) | Bandit-tuned, LLM-assisted | 6-channel retrieval including Hopfield completion |
| **Behavioral capture** | Yes | Yes + pattern learning + soft prompts |
| **Belief graph** | Causal edges, 2-hop expansion | Full knowledge graph with contradiction detection |
| **Retrieval channels** | 3 (FTS5, LIKE, working scan) | 6 (FTS5, semantic, temporal, spreading activation, cross-encoder, Hopfield) |
| **Mathematical engine** | None (LLM-based scoring) | Fisher-Rao, PolarQuant, algebraic topology |
| **Adaptive lifecycle** | Manual cleanup | Auto-decay, smart compression, consolidation |
| **Embedding models** | None (text search only) | Local CPU embeddings (all-MiniLM-L6-v2) |
| **Cross-encoder reranking** | No | Yes (ONNX, local) |
| **Dashboard** | Via QOS dashboard | Standalone web dashboard (23 tabs) |
| **MCP tools** | 1 (`search_memory`) | 35 |
| **CLI commands** | Via QOS CLI | 26 standalone commands |
| **Modes** | Single mode | Mode A (zero cloud), Mode B (local LLM), Mode C (cloud-enhanced) |
| **EU AI Act compliance** | Inherits from QOS | Built-in compliance features |
| **License** | FSL-1.1-ALv2 (with QOS) | AGPL v3 |

## When to Upgrade

SLM-Lite is sufficient when:
- You primarily use QOS for task orchestration and need basic memory
- Your memory corpus is small (under a few thousand entries)
- Text-based search (FTS5) meets your retrieval needs

Upgrade to full SuperLocalMemory when:
- You need semantic retrieval (embedding-based similarity, not just keyword matching)
- You have a large memory corpus that benefits from mathematical scoring
- You want adaptive lifecycle (memories that strengthen with use and fade when neglected)
- You need 6-channel retrieval including Hopfield completion for vague queries
- You want the standalone dashboard with 23 tabs for memory visualization
- You need the full CLI for memory management (`slm remember`, `slm recall`, `slm decay`, etc.)

## Install SuperLocalMemory

### npm (recommended)

```bash
npm install -g superlocalmemory
slm setup     # Choose mode (A/B/C)
slm doctor    # Verify installation
```

### pip

```bash
pip install superlocalmemory
```

### MCP Integration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "superlocalmemory": {
      "command": "slm",
      "args": ["mcp"]
    }
  }
}
```

This gives you 35 MCP tools for memory operations, far beyond the single `search_memory` tool in SLM-Lite.

## Using Both Together

SLM-Lite and full SuperLocalMemory can coexist. QOS uses SLM-Lite for its internal orchestrator memory (task context, behavioral capture, belief graph). SuperLocalMemory runs as a separate MCP server for your broader agent memory needs.

They serve different scopes:
- **SLM-Lite** -- QOS-internal memory (task outcomes, agent behaviors, orchestration patterns)
- **SuperLocalMemory** -- Your complete agent memory (project knowledge, personal facts, cross-session context)

## Links

- **npm:** [npmjs.com/package/superlocalmemory](https://www.npmjs.com/package/superlocalmemory)
- **PyPI:** [pypi.org/project/superlocalmemory](https://pypi.org/project/superlocalmemory/)
- **Website:** [superlocalmemory.com](https://superlocalmemory.com)
- **GitHub:** [github.com/qualixar/superlocalmemory](https://github.com/qualixar/superlocalmemory)
- **Paper 1:** [arXiv:2603.02240](https://arxiv.org/abs/2603.02240)
- **Paper 2:** [arXiv:2603.14588](https://arxiv.org/abs/2603.14588)
- **Paper 3:** [arXiv:2604.04514](https://arxiv.org/abs/2604.04514)

## Related

- [Memory Overview](./overview.md) -- SLM-Lite architecture
- [SLM Integration Guide](./slm-integration.md) -- Using SLM-Lite in QOS
