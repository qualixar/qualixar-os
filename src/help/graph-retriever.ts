// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Graph-Aware Retriever (LightRAG-inspired)
 *
 * Implements dual-level retrieval from the code-review-graph knowledge graph:
 *
 * Level 1 (Local): Entity search → find code entities matching query →
 *   retrieve their graph neighborhoods (callers, callees, imports)
 *
 * Level 2 (Global): Community search → find code communities matching query →
 *   retrieve community descriptions with member lists
 *
 * Based on LightRAG's dual-level paradigm:
 *   - Local mode: entity-focused graph neighborhood retrieval
 *   - Global mode: community-level knowledge retrieval
 *   - Hybrid mode: merge both with score-based ranking
 *
 * Data source: .code-review-graph/graph.db (SQLite, built by tree-sitter AST)
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphChunk {
  readonly content: string;
  readonly source: string;
  readonly score: number;
  readonly level: 'local' | 'global';
}

export interface GraphRetrieverOptions {
  readonly maxLocalResults?: number;
  readonly maxGlobalResults?: number;
  readonly maxNeighborHops?: number;
}

interface NodeRow {
  readonly id: number;
  readonly kind: string;
  readonly name: string;
  readonly qualified_name: string;
  readonly file_path: string;
  readonly line_start: number;
  readonly line_end: number;
  readonly params: string | null;
  readonly return_type: string | null;
  readonly signature: string | null;
  readonly community_id: number | null;
}

interface EdgeRow {
  readonly kind: string;
  readonly source_qualified: string;
  readonly target_qualified: string;
}

interface CommunityRow {
  readonly id: number;
  readonly name: string;
  readonly size: number;
  readonly description: string | null;
  readonly dominant_language: string | null;
}

// ---------------------------------------------------------------------------
// Graph Retriever
// ---------------------------------------------------------------------------

export class GraphRetriever {
  private readonly db: Database.Database | null;

  constructor(projectRoot: string) {
    const dbPath = join(projectRoot, '.code-review-graph', 'graph.db');
    if (existsSync(dbPath)) {
      try {
        this.db = new Database(dbPath, { readonly: true });
      } catch {
        this.db = null;
      }
    } else {
      this.db = null;
    }
  }

  isAvailable(): boolean {
    return this.db !== null;
  }

  /**
   * LightRAG Local Mode: Entity-focused neighborhood retrieval.
   * Find code entities matching the query, then get their graph context.
   */
  searchLocal(query: string, limit = 5): readonly GraphChunk[] {
    if (!this.db) return [];

    const keywords = query
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (keywords.length === 0) return [];

    // Search nodes via FTS5
    const ftsQuery = keywords.join(' OR ');
    let nodes: NodeRow[];
    try {
      nodes = this.db.prepare(`
        SELECT n.* FROM nodes n
        WHERE n.rowid IN (
          SELECT rowid FROM nodes_fts WHERE nodes_fts MATCH ?
        )
        AND n.kind IN ('Function', 'Class')
        ORDER BY n.kind ASC
        LIMIT ?
      `).all(ftsQuery, limit * 3) as NodeRow[];
    } catch {
      // FTS5 query failed — try LIKE fallback
      const likePattern = `%${keywords[0]}%`;
      nodes = this.db.prepare(`
        SELECT * FROM nodes
        WHERE (name LIKE ? OR qualified_name LIKE ?)
        AND kind IN ('Function', 'Class')
        LIMIT ?
      `).all(likePattern, likePattern, limit * 3) as NodeRow[];
    }

    const chunks: GraphChunk[] = [];
    const seen = new Set<string>();

    for (const node of nodes.slice(0, limit)) {
      if (seen.has(node.qualified_name)) continue;
      seen.add(node.qualified_name);

      // Get 1-hop neighbors (callers + callees)
      const neighbors = this.db.prepare(`
        SELECT kind, source_qualified, target_qualified FROM edges
        WHERE source_qualified = ? OR target_qualified = ?
        LIMIT 20
      `).all(node.qualified_name, node.qualified_name) as EdgeRow[];

      const callers = neighbors
        .filter((e) => e.target_qualified === node.qualified_name && e.kind === 'CALLS')
        .map((e) => e.source_qualified.split('::').pop() ?? e.source_qualified)
        .slice(0, 5);

      const callees = neighbors
        .filter((e) => e.source_qualified === node.qualified_name && e.kind === 'CALLS')
        .map((e) => e.target_qualified.split('::').pop() ?? e.target_qualified)
        .slice(0, 5);

      const imports = neighbors
        .filter((e) => e.kind === 'IMPORTS_FROM')
        .map((e) => e.target_qualified)
        .slice(0, 5);

      const relativePath = node.file_path.replace(/.*qualixar-os\//, '');

      const content = [
        `## ${node.kind}: ${node.name}`,
        `**File:** ${relativePath}:${node.line_start}-${node.line_end}`,
        node.signature ? `**Signature:** \`${node.signature}\`` : null,
        node.params ? `**Parameters:** ${node.params}` : null,
        node.return_type ? `**Returns:** ${node.return_type}` : null,
        callers.length > 0 ? `**Called by:** ${callers.join(', ')}` : null,
        callees.length > 0 ? `**Calls:** ${callees.join(', ')}` : null,
        imports.length > 0 ? `**Imports:** ${imports.join(', ')}` : null,
      ].filter(Boolean).join('\n');

      chunks.push({
        content,
        source: `graph:${relativePath}`,
        score: 0.8, // Graph results get high base score
        level: 'local',
      });
    }

    return chunks;
  }

  /**
   * LightRAG Global Mode: Community-level knowledge retrieval.
   * Find code communities matching the query, return their descriptions.
   */
  searchGlobal(query: string, limit = 3): readonly GraphChunk[] {
    if (!this.db) return [];

    const keywords = query
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (keywords.length === 0) return [];

    // Search communities by name
    const likePattern = `%${keywords[0]}%`;
    const communities = this.db.prepare(`
      SELECT * FROM communities
      WHERE name LIKE ? AND size > 3
      ORDER BY size DESC
      LIMIT ?
    `).all(likePattern, limit * 2) as CommunityRow[];

    const chunks: GraphChunk[] = [];

    for (const community of communities.slice(0, limit)) {
      // Get members of this community
      const members = this.db.prepare(`
        SELECT name, kind, file_path, line_start, line_end, signature
        FROM nodes WHERE community_id = ?
        AND kind IN ('Function', 'Class')
        ORDER BY kind ASC, name ASC
        LIMIT 15
      `).all(community.id) as NodeRow[];

      const memberList = members
        .map((m) => {
          const rel = m.file_path.replace(/.*qualixar-os\//, '');
          return `  - ${m.kind} \`${m.name}\` (${rel}:${m.line_start})`;
        })
        .join('\n');

      const content = [
        `## Code Community: ${community.name}`,
        community.description ? `**Description:** ${community.description}` : null,
        `**Size:** ${community.size} nodes | **Language:** ${community.dominant_language ?? 'mixed'}`,
        `**Members:**`,
        memberList,
      ].filter(Boolean).join('\n');

      chunks.push({
        content,
        source: `community:${community.name}`,
        score: 0.7, // Community results get moderate score
        level: 'global',
      });
    }

    return chunks;
  }

  /**
   * LightRAG Hybrid Mode: Merge local + global results, ranked by score.
   */
  searchHybrid(query: string, options?: GraphRetrieverOptions): readonly GraphChunk[] {
    const localResults = this.searchLocal(query, options?.maxLocalResults ?? 3);
    const globalResults = this.searchGlobal(query, options?.maxGlobalResults ?? 2);

    const merged = [...localResults, ...globalResults];
    merged.sort((a, b) => b.score - a.score);

    return merged;
  }

  close(): void {
    this.db?.close();
  }
}

/**
 * Create a graph retriever for the given project root.
 * Returns null if graph DB doesn't exist.
 */
export function createGraphRetriever(projectRoot: string): GraphRetriever | null {
  const retriever = new GraphRetriever(projectRoot);
  return retriever.isAvailable() ? retriever : null;
}
