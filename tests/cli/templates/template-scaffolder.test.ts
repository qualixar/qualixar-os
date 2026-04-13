/**
 * Qualixar OS Phase 19 -- Template Scaffolder Tests
 * Tests for createTemplateScaffolder() — list(), scaffold(), placeholder replacement.
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createTemplateScaffolder } from '../../../src/cli/templates/template-scaffolder.js';
import type { WizardResult } from '../../../src/types/phase19.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All temp directories created during the test suite — cleaned in afterEach. */
const tempDirs: string[] = [];

function makeTempDir(): string {
  // Generate a path but do NOT create it — scaffolder creates it
  const dir = path.join(
    os.tmpdir(),
    `qos-scaffold-test-${crypto.randomUUID()}`,
  );
  tempDirs.push(dir);
  return dir;
}

function makeWizardResult(overrides: Partial<WizardResult> = {}): WizardResult {
  return {
    mode: 'quick',
    provider: 'anthropic',
    apiKeyMode: 'env_ref',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-6',
    fallbackModel: null,
    embeddingProvider: null,
    embeddingModel: null,
    dashboardEnabled: true,
    dashboardPort: 3333,
    channels: [],
    budgetUsd: 10,
    memoryEnabled: true,
    securityContainerIsolation: false,
    allowedPaths: ['./'],
    deniedCommands: ['rm -rf', 'sudo'],
    workspaceDir: os.tmpdir(),
    mcpServers: [],
    a2aEndpoints: [],
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    } catch {
      // Best-effort cleanup — do not fail the test suite on cleanup errors
    }
  }
  tempDirs.length = 0;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTemplateScaffolder', () => {
  it('list() returns exactly 5 templates', () => {
    const scaffolder = createTemplateScaffolder();
    const templates = scaffolder.list();
    expect(templates.length).toBe(5);
  });

  it('scaffold() creates the project directory on disk', async () => {
    const scaffolder = createTemplateScaffolder();
    const projectDir = makeTempDir();

    await scaffolder.scaffold('blank', projectDir, makeWizardResult());

    expect(fs.existsSync(projectDir)).toBe(true);
    expect(fs.statSync(projectDir).isDirectory()).toBe(true);
  });

  it('scaffold() creates all files defined in the template', async () => {
    const scaffolder = createTemplateScaffolder();
    const projectDir = makeTempDir();
    const templates = scaffolder.list();
    const blankTemplate = templates.find((t) => t.id === 'blank')!;

    const result = await scaffolder.scaffold('blank', projectDir, makeWizardResult());

    expect(result.filesCreated.length).toBe(blankTemplate.files.length);
    for (const filePath of result.filesCreated) {
      expect(fs.existsSync(path.join(projectDir, filePath))).toBe(true);
    }
  });

  it('scaffold() replaces {{PROJECT_NAME}}, {{PROVIDER}}, {{MODEL}} in file content', async () => {
    const scaffolder = createTemplateScaffolder();
    const projectDir = makeTempDir();
    const config = makeWizardResult({ provider: 'openai', model: 'gpt-4.1' });

    await scaffolder.scaffold('blank', projectDir, config);

    const configYaml = fs.readFileSync(path.join(projectDir, 'config.yaml'), 'utf-8');
    const projectName = path.basename(projectDir);

    // Placeholders must be replaced
    expect(configYaml).toContain(projectName);
    expect(configYaml).toContain('openai');
    expect(configYaml).toContain('gpt-4.1');

    // Raw placeholder tokens must not remain
    expect(configYaml).not.toContain('{{PROJECT_NAME}}');
    expect(configYaml).not.toContain('{{PROVIDER}}');
    expect(configYaml).not.toContain('{{MODEL}}');
  });

  it('scaffold() throws when the target directory already exists', async () => {
    const scaffolder = createTemplateScaffolder();
    const projectDir = makeTempDir();

    // Pre-create the directory to trigger the guard
    fs.mkdirSync(projectDir, { recursive: true });

    await expect(
      scaffolder.scaffold('blank', projectDir, makeWizardResult()),
    ).rejects.toThrow(/already exists/i);
  });

  it('scaffold() throws when an invalid template ID is supplied', async () => {
    const scaffolder = createTemplateScaffolder();
    const projectDir = makeTempDir();

    await expect(
      scaffolder.scaffold('does-not-exist', projectDir, makeWizardResult()),
    ).rejects.toThrow(/not found/i);
  });
});
