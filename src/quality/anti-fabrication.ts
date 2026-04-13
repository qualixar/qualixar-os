// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Anti-Fabrication
 * LLD Section 2.4
 *
 * VerifiedRegistry pattern for factual claims.
 * 1. Extract factual claims from output via LLM
 * 2. Check against verified_facts table
 * 3. Flag unverifiable claims with confidence score
 * 4. JudgePipeline calls this BEFORE consensus (HARD RULE 7)
 */

import type { JudgeIssue, ModelRequest, ModelResponse } from '../types/common.js';
import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface AntiFabrication {
  verify(output: string, taskId: string): Promise<JudgeIssue[]>;
}

// ---------------------------------------------------------------------------
// ModelRouter subset
// ---------------------------------------------------------------------------

export interface AntiFabricationModelRouter {
  route(request: ModelRequest): Promise<ModelResponse>;
}

// ---------------------------------------------------------------------------
// Claim type (internal)
// ---------------------------------------------------------------------------

interface ExtractedClaim {
  readonly text: string;
  readonly category: string;
  readonly confidence: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class AntiFabricationImpl implements AntiFabrication {
  private readonly modelRouter: AntiFabricationModelRouter;
  private readonly db: QosDatabase;
  private readonly eventBus: EventBus;

  constructor(
    modelRouter: AntiFabricationModelRouter,
    db: QosDatabase,
    eventBus: EventBus,
  ) {
    this.modelRouter = modelRouter;
    this.db = db;
    this.eventBus = eventBus;
  }

  async verify(output: string, taskId: string): Promise<JudgeIssue[]> {
    // Step 1: Extract factual claims from output via LLM
    const extractionPrompt = `Extract all factual claims from the following output.
Return a JSON array where each element has:
- "text": the exact claim text
- "category": one of "fact", "statistic", "date", "attribution", "technical"
- "confidence": 0.0 to 1.0 how confident you are this IS a factual claim (vs opinion)

Only include claims that are stated as facts, not opinions or hedged statements.

Output to analyze:
${output}`;

    let claims: ExtractedClaim[];
    try {
      const extractionResponse = await this.modelRouter.route({
        prompt: extractionPrompt,
        systemPrompt: 'You are a claim extraction system. Return only valid JSON.',
        temperature: 0.0,
        maxTokens: 2000,
        taskType: 'judge',
      });
      claims = JSON.parse(extractionResponse.content) as ExtractedClaim[];
    } catch {
      // LLM returned non-JSON or failed: no claims extracted
      return [];
    }

    if (!Array.isArray(claims) || claims.length === 0) {
      return [];
    }

    // Step 2: Check each claim against verified_facts table
    const issues: JudgeIssue[] = [];
    let unverifiableCount = 0;

    for (const claim of claims) {
      const searchText = claim.text.substring(0, 50);
      let verified: { status: string; verified_text: string | null } | undefined;

      try {
        verified = this.db.get<{ status: string; verified_text: string | null }>(
          'SELECT status, verified_text FROM verified_facts WHERE task_context = ? AND claim_text LIKE ? LIMIT 1',
          [taskId, `%${searchText}%`],
        );
      } catch {
        // verified_facts table may not exist yet; treat all as unverifiable
        verified = undefined;
      }

      if (verified !== undefined) {
        if (verified.status === 'contradicted') {
          issues.push({
            severity: 'critical',
            category: 'fabrication',
            description: `Contradicted claim: "${claim.text}" contradicts verified fact: "${verified.verified_text ?? ''}"`,
            suggestedFix: `Replace with verified information: ${verified.verified_text ?? ''}`,
          });
          this.eventBus.emit({
            type: 'fabrication:detected',
            payload: { taskId, claim: claim.text, type: 'contradicted' },
            source: 'anti-fabrication',
            taskId,
          });
        }
        // If verified.status === 'confirmed': claim is verified, no issue
      } else {
        // Claim not in registry
        unverifiableCount++;
        if (claim.confidence > 0.8) {
          issues.push({
            severity: 'medium',
            category: 'unverifiable_claim',
            description: `Unverifiable claim: "${claim.text}" -- no matching entry in verified facts registry`,
          });
        }
      }
    }

    // Step 3: Aggregate warning if too many unverifiable
    if (claims.length > 0 && unverifiableCount / claims.length > 0.5) {
      issues.push({
        severity: 'medium',
        category: 'high_unverifiable_ratio',
        description: `${unverifiableCount} of ${claims.length} factual claims (${Math.round((unverifiableCount / claims.length) * 100)}%) are unverifiable`,
      });
    }

    return issues;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAntiFabrication(
  modelRouter: AntiFabricationModelRouter,
  db: QosDatabase,
  eventBus: EventBus,
): AntiFabrication {
  return new AntiFabricationImpl(modelRouter, db, eventBus);
}
