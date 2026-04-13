// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 8a -- AgentConverter
 * LLD Section 2.5
 *
 * Universal converter: auto-detects format via reader.canRead(),
 * validates against AgentSpec Zod schema, and optionally invokes
 * SkillScanner on imported tool names and system prompts.
 */

import { z } from 'zod';
import { existsSync } from 'node:fs';
import type { AgentSpec, ClawReader } from '../types/common.js';
import { OpenClawReader } from './openclaw-reader.js';
import { DeerFlowReader } from './deerflow-reader.js';
import { NemoClawReader } from './nemoclaw-reader.js';
import { GitAgentReader } from './gitagent-reader.js';

// ---------------------------------------------------------------------------
// Zod Schemas (LLD Section 2.5 -- AgentSpecSchema)
// ---------------------------------------------------------------------------

const ToolSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
});

const AgentRoleSchema = z.object({
  role: z.string().min(1),
  model: z.string(),
  systemPrompt: z.string(),
  tools: z.array(z.string()).optional(),
  dependsOn: z.array(z.string()).optional(),
});

const AgentSpecSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  description: z.string(),
  roles: z.array(AgentRoleSchema).min(1),
  tools: z.array(ToolSpecSchema),
  config: z.record(z.string(), z.unknown()),
  source: z.object({
    format: z.enum(['openclaw', 'deerflow', 'nemoclaw', 'gitagent', 'qos']),
    originalPath: z.string().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// SkillScanner interface (Phase 2 -- optional dependency)
// ---------------------------------------------------------------------------

interface ScanIssue {
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly pattern: string;
  readonly location: string;
  readonly description: string;
}

interface ScanResult {
  readonly safe: boolean;
  readonly issues: readonly ScanIssue[];
  readonly riskScore: number;
}

interface SkillScanner {
  scan(skillPath: string): ScanResult;
  scanContent(content: string): ScanResult;
}

// ---------------------------------------------------------------------------
// Warnings builder
// ---------------------------------------------------------------------------

function buildWarnings(spec: AgentSpec): string[] {
  const warnings: string[] = [];

  for (const role of spec.roles) {
    if (role.model === '') {
      warnings.push(`Role "${role.role}" has empty model — will use default routing`);
    }
  }

  if (spec.tools.length === 0) {
    warnings.push('No tools defined — agent will have no tool access');
  }

  if (spec.description === '') {
    warnings.push('Empty description — consider adding one for discoverability');
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// AgentConverter
// ---------------------------------------------------------------------------

export class AgentConverter {
  private readonly readers: readonly ClawReader[];
  private readonly skillScanner: SkillScanner | undefined;

  constructor(skillScanner?: SkillScanner) {
    this.readers = [
      new OpenClawReader(),
      new DeerFlowReader(),
      new NemoClawReader(),
      new GitAgentReader(),
    ];
    this.skillScanner = skillScanner;
  }

  /** Auto-detect format from path, read, validate, and optionally scan. */
  async detectAndConvert(path: string): Promise<AgentSpec> {
    // Check file existence BEFORE trying format detection
    if (!existsSync(path)) {
      throw new Error(`AgentConverter: File not found: ${path}`);
    }

    // Find matching reader
    let matchedReader: ClawReader | undefined;
    for (const reader of this.readers) {
      if (reader.canRead(path)) {
        matchedReader = reader;
        break;
      }
    }

    if (!matchedReader) {
      throw new Error(
        `AgentConverter: No reader found for: ${path}. Supported formats: ${this.listSupportedFormats().join(', ')}`,
      );
    }

    // Read and parse
    const raw = await matchedReader.read(path);

    // Validate
    const result = this.validate(raw);
    if (!result.valid) {
      throw new Error(`AgentConverter: Validation failed: ${result.errors.join('; ')}`);
    }

    // Security scan if scanner is available
    if (this.skillScanner) {
      this.scanImportedTools(raw);
    }

    return raw;
  }

  /** Convert a raw object into a validated AgentSpec. */
  convert(input: unknown, format: string): AgentSpec {
    if (input === null || typeof input !== 'object') {
      throw new Error('AgentConverter: Input must be an object');
    }

    const mutable = input as Record<string, unknown>;

    // Ensure version is 1
    if (mutable.version === undefined) {
      mutable.version = 1;
    }

    // Ensure source.format matches
    if (mutable.source && typeof mutable.source === 'object') {
      (mutable.source as Record<string, unknown>).format = format;
    }

    // Parse through Zod
    const parseResult = AgentSpecSchema.safeParse(mutable);
    if (!parseResult.success) {
      const messages = parseResult.error.issues.map((iss) => iss.message);
      throw new Error(`AgentConverter: Validation failed: ${messages.join('; ')}`);
    }

    return parseResult.data as AgentSpec;
  }

  /** Validate an AgentSpec against the schema, returning errors and warnings. */
  validate(spec: AgentSpec): ValidationResult {
    const parseResult = AgentSpecSchema.safeParse(spec);

    if (parseResult.success) {
      return {
        valid: true,
        errors: [],
        warnings: buildWarnings(spec),
      };
    }

    const errors = parseResult.error.issues.map(
      (iss) => `${iss.path.join('.')}: ${iss.message}`,
    );

    return {
      valid: false,
      errors,
      warnings: [],
    };
  }

  /** Return all supported format identifiers. */
  listSupportedFormats(): readonly string[] {
    return this.readers.map((r) => r.getFormat());
  }

  /** Scan imported tool names and system prompts for dangerous patterns. */
  private scanImportedTools(spec: AgentSpec): void {
    /* v8 ignore next 3 -- defensive guard; caller already checks this.skillScanner before invoking */
    if (!this.skillScanner) {
      return;
    }

    // Scan tool names
    for (const tool of spec.tools) {
      this.skillScanner.scanContent(tool.name);
    }

    // Scan role system prompts
    for (const role of spec.roles) {
      if (role.systemPrompt.length > 0) {
        const result = this.skillScanner.scanContent(role.systemPrompt);
        if (!result.safe) {
          const hasCritical = result.issues.some((i) => i.severity === 'critical');
          if (hasCritical) {
            const descriptions = result.issues.map((i) => i.description).join(', ');
            throw new Error(
              `AgentConverter: Security scan failed for role "${role.role}": ${descriptions}`,
            );
          }
          // Non-critical issues: log warning (no throw)
        }
      }
    }
  }
}
