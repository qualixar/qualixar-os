// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Phase 19: Interactive CLI Excellence Types
 *
 * All interfaces for wizard, doctor, templates, provider detection,
 * and non-interactive CLI options.
 * HR-1: Every interface is readonly + immutable.
 */

// ---------------------------------------------------------------------------
// Wizard Types
// ---------------------------------------------------------------------------

export type WizardMode = 'quick' | 'advanced' | 'manual';

export interface WizardStep {
  readonly id: string;
  readonly title: string;
  readonly modes: readonly WizardMode[];
  readonly promptType: 'select' | 'input' | 'confirm' | 'password' | 'checkbox';
  readonly message: string;
  readonly defaultValue: string | boolean | readonly string[] | null;
  readonly choices?: readonly WizardChoice[];
  readonly validator?: string;
  readonly skipWhen?: string;
}

export interface WizardChoice {
  readonly name: string;
  readonly value: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export interface WizardResult {
  readonly mode: WizardMode;
  readonly provider: string;
  readonly apiKeyMode: 'direct' | 'env_ref';
  readonly apiKeyEnv: string;
  readonly model: string;
  readonly fallbackModel: string | null;
  readonly embeddingProvider: string | null;
  readonly embeddingModel: string | null;
  readonly dashboardEnabled: boolean;
  readonly dashboardPort: number;
  readonly channels: readonly string[];
  readonly budgetUsd: number;
  readonly memoryEnabled: boolean;
  readonly securityContainerIsolation: boolean;
  readonly allowedPaths: readonly string[];
  readonly deniedCommands: readonly string[];
  readonly workspaceDir: string;
  readonly mcpServers: readonly string[];
  readonly a2aEndpoints: readonly string[];
}

export interface WizardRunner {
  run(mode: WizardMode): Promise<WizardResult>;
  runStep(step: WizardStep, context: Readonly<Record<string, unknown>>): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Doctor / Health Check Types
// ---------------------------------------------------------------------------

export interface HealthCheckItem {
  readonly name: string;
  readonly category: 'system' | 'config' | 'provider' | 'channel' | 'database';
  readonly status: 'ok' | 'warn' | 'fail' | 'skip';
  readonly message: string;
  readonly fix: string | null;
}

export interface HealthCheckResult {
  readonly items: readonly HealthCheckItem[];
  readonly score: number;
  readonly totalChecks: number;
  readonly summary: string;
  readonly checkedAt: string;
}

export interface HealthChecker {
  check(): Promise<HealthCheckResult>;
  checkOne(name: string): Promise<HealthCheckItem>;
}

// ---------------------------------------------------------------------------
// Template Types
// ---------------------------------------------------------------------------

export interface TemplateDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tagline: string;
  readonly files: readonly TemplateFile[];
  readonly requiredProviders: readonly string[];
  readonly tools: readonly string[];
  readonly topology: string | null;
  readonly postInstructions: readonly string[];
}

export interface TemplateFile {
  readonly path: string;
  readonly content: string;
  readonly overwrite: boolean;
}

export interface ScaffoldResult {
  readonly templateId: string;
  readonly projectDir: string;
  readonly filesCreated: readonly string[];
  readonly filesSkipped: readonly string[];
}

export interface TemplateScaffolder {
  list(): readonly TemplateDefinition[];
  scaffold(templateId: string, projectDir: string, config: WizardResult): Promise<ScaffoldResult>;
}

// ---------------------------------------------------------------------------
// Provider Auto-Detection Types
// ---------------------------------------------------------------------------

export interface DetectedProvider {
  readonly provider: string;
  readonly envVar: string;
  readonly isSet: boolean;
  readonly defaultModel: string;
  readonly defaultFallback: string;
}

export interface ProviderDetector {
  detect(): readonly DetectedProvider[];
  isAvailable(provider: string): boolean;
}

// ---------------------------------------------------------------------------
// Non-Interactive CLI Options
// ---------------------------------------------------------------------------

export interface NonInteractiveOptions {
  readonly provider?: string;
  readonly apiKeyEnv?: string;
  readonly model?: string;
  readonly fallbackModel?: string;
  readonly embeddingProvider?: string;
  readonly embeddingModel?: string;
  readonly dashboard?: boolean;
  readonly dashboardPort?: number;
  readonly channels?: readonly string[];
  readonly budget?: number;
  readonly noInteractive?: boolean;
  readonly skipFirstTask?: boolean;
  readonly projectDir?: string;
}
