// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase Pivot-2 -- Skill Package Format
 *
 * Zod schema for `skill.json` manifests. Aligns with MCP Registry
 * conventions and npm patterns.
 *
 * COEXISTS with skill-registry.ts (Phase 20):
 * - skill-registry.ts: Plugin prompt templates (PluginSkillDef)
 * - skill-package.ts: Packaged tool bundles with MCP transport
 *
 * LLD: phase-pivot2-tool-skill-registry-lld.md Section 2.6
 */

import { z } from 'zod';

// Inline the category enum to avoid import-order issues with Zod v4
const SkillCategorySchema = z.enum([
  'web-data', 'code-dev', 'communication',
  'knowledge', 'creative', 'enterprise',
]);

// ---------------------------------------------------------------------------
// Tool Annotations Schema (matches internal ToolAnnotations)
// ---------------------------------------------------------------------------

const ToolAnnotationsSchema = z.object({
  readOnly: z.boolean().optional(),
  destructive: z.boolean().optional(),
  idempotent: z.boolean().optional(),
  openWorld: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Sub-schemas (defined separately for Zod v4 .default() compatibility)
// ---------------------------------------------------------------------------

const PricingSchema = z.object({
  model: z.enum(['free', 'paid', 'freemium']).default('free'),
});

const CompatibilitySchema = z.object({
  qos: z.string().default('>=2.0.0'),
  node: z.string().default('>=20.0.0'),
});

// ---------------------------------------------------------------------------
// Skill Manifest Schema
// ---------------------------------------------------------------------------

export const SkillManifestSchema = z.object({
  /** Scoped package name: @scope/name or org/name */
  name: z.string().refine(
    (v) => /^@?[a-z0-9-]+\/[a-z0-9-]+$/.test(v),
    { message: 'Name must be scoped: @scope/name or org/name' },
  ),

  /** Semantic version */
  version: z.string().refine(
    (v) => /^\d+\.\d+\.\d+/.test(v),
    { message: 'Version must be semver: X.Y.Z' },
  ),

  /** Short description (max 200 chars) */
  description: z.string().max(200),

  /** Author information */
  author: z.object({
    name: z.string(),
    url: z.string().optional(),
  }),

  /** License identifier */
  license: z.string().default('MIT'),

  /** Tool category — one of the 6 genres */
  category: SkillCategorySchema,

  /** Freeform tags for search (max 10) */
  tags: z.array(z.string()).max(10).default([]),

  /** Path to icon file (SVG/PNG) */
  icon: z.string().optional(),

  /** Screenshots for marketplace display */
  screenshots: z.array(z.string()).default([]),

  /** Pricing model for future marketplace */
  pricing: PricingSchema.default(PricingSchema.parse({})),

  /** Tools exposed by this skill (min 1) */
  tools: z.array(z.object({
    name: z.string().min(1),
    description: z.string().max(200),
    inputSchema: z.record(z.string(), z.unknown()),
    annotations: ToolAnnotationsSchema.optional(),
  })).min(1),

  /** MCP transport configuration */
  transport: z.object({
    type: z.enum(['stdio', 'streamable-http']),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().optional(),
    env: z.record(z.string(), z.unknown()).optional(),
  }),

  /** Version compatibility requirements */
  compatibility: CompatibilitySchema.default(CompatibilitySchema.parse({})),

  /** Package dependencies (semver ranges) */
  dependencies: z.record(z.string(), z.string()).default({}),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scope a tool name to prevent collisions between skill packages.
 * If already scoped (contains the package prefix), return as-is.
 */
export function scopeToolName(packageName: string, toolName: string): string {
  const prefix = `${packageName}/`;
  if (toolName.startsWith(prefix)) return toolName;
  return `${prefix}${toolName}`;
}
