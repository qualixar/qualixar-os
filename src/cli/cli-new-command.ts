// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- New Project Command Handler
 * LLD Section 8.4
 *
 * Scaffolds a new project from template selection.
 * HR-8: Template files use placeholders, not hardcoded values.
 * HR-13: Never deletes existing files.
 */

import type { WizardResult } from '../types/phase19.js';
import { createTemplateScaffolder } from './templates/template-scaffolder.js';
import type { PromptFunctions } from './wizard/wizard-runner.js';

export async function handleNewCommand(
  projectName: string,
  deps: {
    readonly log?: (msg: string) => void;
    readonly promptFn?: PromptFunctions;
  },
): Promise<void> {
  const log = deps.log ?? console.log;

  const scaffolder = createTemplateScaffolder();
  const templates = scaffolder.list();

  // Build prompt function
  let selectFn: (config: { message: string; choices: readonly { name: string; value: string }[] }) => Promise<string>;

  if (deps.promptFn) {
    selectFn = deps.promptFn.select;
  } else {
    const inquirer = await import('@inquirer/prompts');
    selectFn = (c) => inquirer.select({
      message: c.message,
      choices: c.choices.map((ch) => ({ name: ch.name, value: ch.value })),
    });
  }

  try {
    const templateId = await selectFn({
      message: 'Select a template:',
      choices: templates.map((t) => ({
        name: `${t.name} (${t.tagline})`,
        value: t.id,
      })),
    });

    // Build minimal WizardResult for placeholder resolution
    const config: WizardResult = {
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
      workspaceDir: process.cwd(),
      mcpServers: [],
      a2aEndpoints: [],
    };

    const result = await scaffolder.scaffold(templateId, projectName, config);

    log('');
    log(`Project "${projectName}" created from template "${templateId}"`);
    log('');
    log('Files created:');
    for (const f of result.filesCreated) {
      log(`  + ${f}`);
    }
    if (result.filesSkipped.length > 0) {
      log('Files skipped (already exist):');
      for (const f of result.filesSkipped) {
        log(`  ~ ${f}`);
      }
    }

    // Post instructions
    const template = templates.find((t) => t.id === templateId);
    if (template && template.postInstructions.length > 0) {
      log('');
      log('Next steps:');
      for (const instr of template.postInstructions) {
        log(`  ${instr.replace('{{PROJECT_NAME}}', projectName)}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && (err.name === 'ExitPromptError' || err.message.includes('User force closed'))) {
      log('\nProject creation cancelled.');
      return;
    }
    throw err;
  }
}
