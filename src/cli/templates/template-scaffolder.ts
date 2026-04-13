// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- Template Scaffolder
 * LLD Section 8.4: Finds a template, replaces placeholders, writes files to disk.
 *
 * Placeholder tokens replaced:
 *   {{PROJECT_NAME}} -- basename of the resolved project directory
 *   {{PROVIDER}}     -- config.provider
 *   {{MODEL}}        -- config.model
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { ScaffoldResult, TemplateDefinition, TemplateScaffolder, WizardResult } from '../../types/phase19.js';
import { TEMPLATE_CATALOG } from './template-catalog.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTemplateScaffolder(): TemplateScaffolder {
  return new TemplateScaffolderImpl();
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class TemplateScaffolderImpl implements TemplateScaffolder {
  list(): readonly TemplateDefinition[] {
    return TEMPLATE_CATALOG;
  }

  async scaffold(
    templateId: string,
    projectDir: string,
    config: WizardResult,
  ): Promise<ScaffoldResult> {
    // Step 1: find template
    const template = TEMPLATE_CATALOG.find((t) => t.id === templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    // Step 2: resolve absolute path
    const absDir = resolve(projectDir);

    // Step 3: guard against existing directory
    if (existsSync(absDir)) {
      throw new Error(`Directory '${absDir}' already exists`);
    }

    // Step 4: create project directory
    mkdirSync(absDir, { recursive: true });

    const projectName = basename(absDir);
    const filesCreated: string[] = [];
    const filesSkipped: string[] = [];

    // Step 5: write each template file
    for (const file of template.files) {
      const dest = join(absDir, file.path);

      if (existsSync(dest) && !file.overwrite) {
        filesSkipped.push(file.path);
        continue;
      }

      // Ensure parent directories exist (e.g. nested paths like src/index.ts)
      const parentDir = dirname(dest);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      const rendered = replacePlaceholders(file.content, {
        projectName,
        provider: config.provider,
        model: config.model,
      });

      writeFileSync(dest, rendered, { encoding: 'utf8' });
      filesCreated.push(file.path);
    }

    return {
      templateId,
      projectDir: absDir,
      filesCreated,
      filesSkipped,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function replacePlaceholders(
  content: string,
  values: { projectName: string; provider: string; model: string },
): string {
  return content
    .replaceAll('{{PROJECT_NAME}}', values.projectName)
    .replaceAll('{{PROVIDER}}', values.provider)
    .replaceAll('{{MODEL}}', values.model);
}
