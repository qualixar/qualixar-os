// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 20 -- Plugin Manifest Zod Schema
 *
 * Validates qos-plugin.yaml manifests per LLD Section 2.7.
 * All string patterns are tested before parse time; no mutation of input.
 *
 * Hard Rule: Use only parameterized Zod refinements — no raw regex exec.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

const semverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Must be semver x.y.z');

const pluginNameSchema = z
  .string()
  .min(3, 'Name must be at least 3 chars')
  .max(64, 'Name must be at most 64 chars')
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    'Name must be lowercase alphanumeric + hyphens, no leading/trailing hyphens',
  );

// ---------------------------------------------------------------------------
// Config field schema (discriminated on `type`)
// ---------------------------------------------------------------------------

const ConfigFieldBaseSchema = z.object({
  description: z.string().min(1),
  default: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
});

const StringConfigSchema = ConfigFieldBaseSchema.extend({
  type: z.literal('string'),
  pattern: z.string().optional(),
});

const NumberConfigSchema = ConfigFieldBaseSchema.extend({
  type: z.literal('number'),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
});

const BooleanConfigSchema = ConfigFieldBaseSchema.extend({
  type: z.literal('boolean'),
});

const SelectConfigSchema = ConfigFieldBaseSchema.extend({
  type: z.literal('select'),
  enum: z.array(z.string()).min(1),
});

const MultiSelectConfigSchema = ConfigFieldBaseSchema.extend({
  type: z.literal('multiselect'),
  enum: z.array(z.string()).min(1),
});

const PluginConfigFieldSchema = z.discriminatedUnion('type', [
  StringConfigSchema,
  NumberConfigSchema,
  BooleanConfigSchema,
  SelectConfigSchema,
  MultiSelectConfigSchema,
]);

// ---------------------------------------------------------------------------
// Tool implementation (discriminated on `type`)
// ---------------------------------------------------------------------------

const BuiltinImplSchema = z.object({
  type: z.literal('builtin'),
  handler: z.string().min(1),
});

const HttpImplSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  method: z.enum(['GET', 'POST']),
  headers: z.record(z.string(), z.string()),
});

const ShellImplSchema = z.object({
  type: z.literal('shell'),
  command: z.string().min(1),
  timeout: z.number().int().positive(),
});

const PluginToolImplSchema = z.discriminatedUnion('type', [
  BuiltinImplSchema,
  HttpImplSchema,
  ShellImplSchema,
]);

// ---------------------------------------------------------------------------
// Provides schemas
// ---------------------------------------------------------------------------

const PluginSkillParamSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean']),
  required: z.boolean(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  description: z.string().min(1),
});

const PluginSkillDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  promptTemplate: z.string().min(1),
  parameters: z.array(PluginSkillParamSchema),
});

const PluginToolDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()),
  implementation: PluginToolImplSchema,
});

const PluginAgentDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  model: z.string().min(1),
  tools: z.array(z.string()),
  systemPrompt: z.string().min(1),
  role: z.string().min(1),
});

const PluginTopologyDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  topologyType: z.string().min(1),
  agents: z.array(z.string()),
  params: z.record(z.string(), z.unknown()),
});

const PluginProvidesSchema = z.object({
  agents: z.array(PluginAgentDefSchema).default([]),
  skills: z.array(PluginSkillDefSchema).default([]),
  tools: z.array(PluginToolDefSchema).default([]),
  topologies: z.array(PluginTopologyDefSchema).default([]),
});

const PluginRequirementsSchema = z.object({
  minVersion: semverSchema,
  providers: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  plugins: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Root manifest schema
// ---------------------------------------------------------------------------

export const PluginManifestSchema = z.object({
  name: pluginNameSchema,
  version: semverSchema,
  author: z.string().min(1).max(128),
  description: z.string().min(10).max(500),
  license: z.string().min(1),
  tags: z.array(z.string()).default([]),
  icon: z.string().nullable().default(null),
  homepage: z.string().url().nullable().optional().default(null),
  repository: z.string().url().nullable().optional().default(null),
  provides: PluginProvidesSchema,
  requires: PluginRequirementsSchema,
  config: z.record(z.string(), PluginConfigFieldSchema).default({}),
});

export type PluginManifestSchemaType = typeof PluginManifestSchema;
