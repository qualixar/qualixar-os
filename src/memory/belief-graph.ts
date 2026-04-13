// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 5 -- Belief Graph
 * LLD Section 2.8
 *
 * Causal Belief Graph: beliefs with confidence, causal edges, decay.
 * Exponential decay: confidence * exp(-rate * days)
 * 2-hop graph expansion for topic queries.
 *
 * Uses belief_nodes and belief_edges tables (Phase 5 migration).
 * LIKE search on belief_nodes (not FTS5 -- separate table from memory_entries).
 */

import type { QosDatabase } from '../db/database.js';
import type { ModelRouter } from '../router/model-router.js';
import type { EventBus } from '../events/event-bus.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types (from REWRITE-SPEC Section 6)
// ---------------------------------------------------------------------------

export interface BeliefInput {
  readonly content: string;
  readonly confidence: number;
  readonly source: string;
  readonly causalEdges?: readonly CausalEdge[];
}

export interface CausalEdge {
  readonly toId: string;
  readonly relation: 'causes' | 'contradicts' | 'supports' | 'requires';
  readonly strength?: number;
  readonly evidence?: string;
}

export interface BeliefNode {
  readonly id: string;
  readonly content: string;
  readonly confidence: number;
  readonly decayRate: number;
  readonly createdAt: string;
}

export interface BeliefEdgeRecord {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly relation: string;
  readonly strength: number;
  readonly evidence: string | null;
  readonly createdAt: string;
}

export interface BeliefGraph {
  readonly nodes: readonly BeliefNode[];
  readonly edges: readonly BeliefEdgeRecord[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DECAY_RATE = 0.01;
const MIN_CONFIDENCE = 0.05;
const MAX_HOP_DEPTH = 2;

// ---------------------------------------------------------------------------
// DB Row Types
// ---------------------------------------------------------------------------

interface BeliefNodeRow {
  readonly id: string;
  readonly content: string;
  readonly confidence: number;
  readonly source: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly decay_rate: number;
}

interface BeliefEdgeRow {
  readonly id: string;
  readonly from_id: string;
  readonly to_id: string;
  readonly relation: string;
  readonly strength: number;
  readonly evidence: string | null;
  readonly created_at: string;
}

// ---------------------------------------------------------------------------
// Prompt Template
// ---------------------------------------------------------------------------

const BELIEF_RELATION_PROMPT = (
  newBelief: string,
  existingBelief: string,
): string =>
  `Compare these two beliefs and determine their relationship.

Belief A (new): ${newBelief}
Belief B (existing): ${existingBelief}

Respond with exactly one word: "supports", "contradicts", or "unrelated"`;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface BeliefGraphService {
  addBelief(belief: BeliefInput): Promise<string>;
  getBeliefGraph(topic: string): Promise<BeliefGraph>;
  updateConfidence(nodeId: string, newConfidence: number): void;
  adjustDecayRate(nodeId: string): void;
  getBeliefStats(): { nodeCount: number; edgeCount: number; avgConfidence: number };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class BeliefGraphImpl implements BeliefGraphService {
  private readonly db: QosDatabase;
  private readonly modelRouter: ModelRouter;
  private readonly eventBus: EventBus;

  constructor(db: QosDatabase, modelRouter: ModelRouter, eventBus: EventBus) {
    this.db = db;
    this.modelRouter = modelRouter;
    this.eventBus = eventBus;
  }

  async addBelief(belief: BeliefInput): Promise<string> {
    let adjustedConfidence = Math.max(
      MIN_CONFIDENCE,
      Math.min(1.0, belief.confidence),
    );

    // Step 1: Check for existing similar beliefs
    const keyTerms = this._extractKeyTerms(belief.content);
    const existingNodes = this.db.query<BeliefNodeRow>(
      'SELECT * FROM belief_nodes WHERE content LIKE ? LIMIT 5',
      [`%${keyTerms}%`],
    );

    if (existingNodes.length > 0) {
      for (const existing of existingNodes) {
        try {
          const response = await this.modelRouter.route({
            prompt: BELIEF_RELATION_PROMPT(belief.content, existing.content),
            maxTokens: 50,
            quality: 'low',
          });

          const relation = response.content.trim().toLowerCase();
          if (relation === 'supports') {
            // Boost existing confidence
            const boosted = Math.min(1.0, existing.confidence + 0.05);
            this.updateConfidence(existing.id, boosted);
          } else if (relation === 'contradicts') {
            // Reduce both confidences
            const reducedExisting = Math.max(
              MIN_CONFIDENCE,
              existing.confidence - 0.1,
            );
            this.updateConfidence(existing.id, reducedExisting);
            adjustedConfidence = Math.max(
              MIN_CONFIDENCE,
              adjustedConfidence - 0.1,
            );
          }
        } catch {
          // LLM failure: treat as unrelated
        }
      }
    }

    // Step 2: Create new belief node
    const nodeId = generateId();
    const timestamp = now();

    this.db.insert('belief_nodes', {
      id: nodeId,
      content: belief.content,
      confidence: adjustedConfidence,
      source: belief.source,
      created_at: timestamp,
      updated_at: timestamp,
      decay_rate: DEFAULT_DECAY_RATE,
    });

    // Step 2b (H-04): Auto-create 'related' edges based on word overlap
    const newWords = this._significantWords(belief.content);
    if (newWords.size >= 3) {
      const candidates = this.db.query<BeliefNodeRow>(
        'SELECT * FROM belief_nodes WHERE id != ? LIMIT 50',
        [nodeId],
      );
      for (const candidate of candidates) {
        const candidateWords = this._significantWords(candidate.content);
        let overlap = 0;
        for (const w of newWords) {
          if (candidateWords.has(w)) overlap++;
        }
        if (overlap >= 3) {
          // Create bidirectional 'related' edges
          const fwdId = generateId();
          const revId = generateId();
          this.db.insert('belief_edges', {
            id: fwdId,
            from_id: nodeId,
            to_id: candidate.id,
            relation: 'related',
            strength: Math.min(1.0, overlap * 0.2),
            evidence: null,
            created_at: timestamp,
          });
          this.db.insert('belief_edges', {
            id: revId,
            from_id: candidate.id,
            to_id: nodeId,
            relation: 'related',
            strength: Math.min(1.0, overlap * 0.2),
            evidence: null,
            created_at: timestamp,
          });
          this.eventBus.emit({
            type: 'memory:belief_edge_added',
            payload: { fromId: nodeId, toId: candidate.id, relation: 'related', strength: Math.min(1.0, overlap * 0.2) },
            source: 'BeliefGraph',
          });
        }
      }
    }

    // Step 3: Create causal edges
    for (const edge of belief.causalEdges ?? []) {
      // Validate edge.toId exists
      const targetExists = this.db.get<{ id: string }>(
        'SELECT id FROM belief_nodes WHERE id = ?',
        [edge.toId],
      );
      if (!targetExists) continue;

      const edgeId = generateId();
      const strength = edge.strength ?? 0.5;

      this.db.insert('belief_edges', {
        id: edgeId,
        from_id: nodeId,
        to_id: edge.toId,
        relation: edge.relation,
        strength,
        evidence: edge.evidence ?? null,
        created_at: timestamp,
      });

      // Bidirectional edges for contradicts/supports
      if (edge.relation === 'contradicts' || edge.relation === 'supports') {
        const reverseId = generateId();
        this.db.insert('belief_edges', {
          id: reverseId,
          from_id: edge.toId,
          to_id: nodeId,
          relation: edge.relation,
          strength,
          evidence: edge.evidence ?? null,
          created_at: timestamp,
        });
      }

      this.eventBus.emit({
        type: 'memory:belief_edge_added',
        payload: { fromId: nodeId, toId: edge.toId, relation: edge.relation, strength },
        source: 'BeliefGraph',
      });
    }

    // Step 4: Emit event
    this.eventBus.emit({
      type: 'memory:belief_updated',
      payload: { nodeId, content: belief.content, confidence: adjustedConfidence },
      source: 'BeliefGraph',
    });

    return nodeId;
  }

  async getBeliefGraph(topic: string): Promise<BeliefGraph> {
    // Step 1: Find matching belief nodes
    const matchingNodes = this.db.query<BeliefNodeRow>(
      'SELECT * FROM belief_nodes WHERE content LIKE ?',
      [`%${topic}%`],
    );

    const visitedIds = new Set(matchingNodes.map((n) => n.id));
    const allEdges: BeliefEdgeRow[] = [];
    let frontier = matchingNodes.map((n) => n.id);

    // Step 2-3: Expand up to MAX_HOP_DEPTH hops
    for (let hop = 0; hop < MAX_HOP_DEPTH; hop++) {
      const nextFrontier: string[] = [];
      for (const nodeId of frontier) {
        const edges = this.db.query<BeliefEdgeRow>(
          'SELECT * FROM belief_edges WHERE from_id = ? OR to_id = ?',
          [nodeId, nodeId],
        );
        for (const edge of edges) {
          allEdges.push(edge);
          const neighbor =
            edge.from_id === nodeId ? edge.to_id : edge.from_id;
          if (!visitedIds.has(neighbor)) {
            visitedIds.add(neighbor);
            nextFrontier.push(neighbor);
          }
        }
      }
      frontier = nextFrontier;
    }

    // Step 4: Fetch all visited nodes and apply decay
    const allNodes: BeliefNode[] = [];
    for (const nodeId of visitedIds) {
      const row = this.db.get<BeliefNodeRow>(
        'SELECT * FROM belief_nodes WHERE id = ?',
        [nodeId],
      );
      if (row) {
        allNodes.push(this._applyDecay(row));
      }
    }

    // Step 5: Deduplicate edges
    const seenEdgeIds = new Set<string>();
    const uniqueEdges: BeliefEdgeRecord[] = [];
    for (const edge of allEdges) {
      if (!seenEdgeIds.has(edge.id)) {
        seenEdgeIds.add(edge.id);
        uniqueEdges.push(this._parseEdgeRow(edge));
      }
    }

    return { nodes: allNodes, edges: uniqueEdges };
  }

  updateConfidence(nodeId: string, newConfidence: number): void {
    const clamped = Math.max(MIN_CONFIDENCE, Math.min(1.0, newConfidence));
    this.db.db
      .prepare('UPDATE belief_nodes SET confidence = ?, updated_at = ? WHERE id = ?')
      .run(clamped, now(), nodeId);
  }

  adjustDecayRate(nodeId: string): void {
    const supportCount = this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM belief_edges WHERE to_id = ? AND relation = 'supports'",
      [nodeId],
    );
    const contradictCount = this.db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM belief_edges WHERE to_id = ? AND relation = 'contradicts'",
      [nodeId],
    );

    const supports = supportCount?.count ?? 0;
    const contradicts = contradictCount?.count ?? 0;

    const newRate = Math.max(
      0.001,
      Math.min(0.1, DEFAULT_DECAY_RATE - supports * 0.002 + contradicts * 0.005),
    );

    this.db.db
      .prepare('UPDATE belief_nodes SET decay_rate = ? WHERE id = ?')
      .run(newRate, nodeId);
  }

  getBeliefStats(): {
    nodeCount: number;
    edgeCount: number;
    avgConfidence: number;
  } {
    const nodeResult = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM belief_nodes',
    );
    const edgeResult = this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM belief_edges',
    );
    const avgResult = this.db.get<{ avg: number | null }>(
      'SELECT AVG(confidence) as avg FROM belief_nodes',
    );

    return {
      nodeCount: nodeResult?.count ?? 0,
      edgeCount: edgeResult?.count ?? 0,
      avgConfidence: avgResult?.avg ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  // H-04: Extract significant words (excluding stopwords) for overlap comparison
  private _significantWords(content: string): ReadonlySet<string> {
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may',
      'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'and', 'but',
      'or', 'not', 'no', 'that', 'this', 'it',
    ]);
    const words = new Set<string>();
    for (const w of content.toLowerCase().split(/\s+/)) {
      if (w.length > 3 && !stopwords.has(w)) {
        words.add(w);
      }
    }
    return words;
  }

  private _extractKeyTerms(content: string): string {
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'did', 'will', 'would', 'could', 'should', 'may',
      'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into',
      'through', 'during', 'before', 'after', 'and', 'but',
      'or', 'not', 'no', 'that', 'this', 'it',
    ]);

    return content
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopwords.has(w))
      .slice(0, 4)
      .join(' ');
  }

  private _applyDecay(node: BeliefNodeRow): BeliefNode {
    const nowMs = Date.now();
    const updatedMs = new Date(node.updated_at).getTime();
    const daysSinceUpdate = (nowMs - updatedMs) / (1000 * 60 * 60 * 24);

    const decayedConfidence = Math.max(
      MIN_CONFIDENCE,
      node.confidence * Math.exp(-node.decay_rate * daysSinceUpdate),
    );

    return {
      id: node.id,
      content: node.content,
      confidence: decayedConfidence,
      decayRate: node.decay_rate,
      createdAt: node.created_at,
    };
  }

  private _parseEdgeRow(row: BeliefEdgeRow): BeliefEdgeRecord {
    return {
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      relation: row.relation,
      strength: row.strength,
      evidence: row.evidence,
      createdAt: row.created_at,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBeliefGraph(
  db: QosDatabase,
  modelRouter: ModelRouter,
  eventBus: EventBus,
): BeliefGraphService {
  return new BeliefGraphImpl(db, modelRouter, eventBus);
}
