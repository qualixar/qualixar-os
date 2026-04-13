// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Output Writer
 *
 * Writes task output to the user's working directory.
 * For code tasks: extracts code blocks from agent output and saves as source files.
 * For all tasks: saves output.md, metadata.json, and any artifacts.
 *
 * Directory structure:
 *   {workingDir}/qos-output/{taskId}/
 *     output.md         — Human-readable summary
 *     metadata.json     — Machine-readable metadata
 *     src/              — Extracted source files (from code blocks)
 *     artifacts/        — Explicit artifacts from agents
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { TaskResult } from '../types/common.js';

// ---------------------------------------------------------------------------
// Code block extraction
// ---------------------------------------------------------------------------

interface ExtractedFile {
  readonly path: string;
  readonly language: string;
  readonly content: string;
}

/** Language → file extension mapping */
const LANG_EXT: Record<string, string> = {
  typescript: '.ts', ts: '.ts', javascript: '.js', js: '.js',
  python: '.py', py: '.py', html: '.html', css: '.css',
  json: '.json', yaml: '.yaml', yml: '.yaml', sql: '.sql',
  bash: '.sh', sh: '.sh', shell: '.sh', java: '.java',
  rust: '.rs', go: '.go', cpp: '.cpp', c: '.c', ruby: '.rb',
  swift: '.swift', kotlin: '.kt', dart: '.dart', vue: '.vue',
  svelte: '.svelte', tsx: '.tsx', jsx: '.jsx', scss: '.scss',
  dockerfile: '.dockerfile', docker: '.dockerfile', xml: '.xml',
  toml: '.toml', ini: '.ini', env: '.env', md: '.md', markdown: '.md',
};

/**
 * Extract code blocks from markdown-style text.
 * Handles:
 *   ```language:path/to/file.ext   → saves to path
 *   ```language                     → saves with auto-generated name
 *   // filename: path/to/file.ext   → uses as hint for path
 */
export function extractCodeBlocks(text: string): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  // Match ```lang ... ``` blocks (with optional file path after lang)
  const regex = /```(\w[\w+#-]*)(?::([^\n]+))?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let fileIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const language = match[1].toLowerCase();
    let filePath = match[2]?.trim() ?? '';
    const content = match[3];

    if (!content.trim()) continue;

    // If no explicit path, try to extract from first-line comment
    if (!filePath) {
      const firstLine = content.split('\n')[0];
      const pathHint = firstLine.match(/(?:\/\/|#|<!--|\/\*)\s*(?:file(?:name)?|path):\s*(.+?)(?:\s*(?:-->|\*\/))?$/i);
      if (pathHint) {
        filePath = pathHint[1].trim();
      }
    }

    // If still no path, generate one
    if (!filePath) {
      fileIndex++;
      const ext = LANG_EXT[language] ?? `.${language}`;
      filePath = `file-${fileIndex}${ext}`;
    }

    files.push({ path: filePath, language, content: content.trimEnd() });
  }

  return files;
}

// ---------------------------------------------------------------------------
// Main writer
// ---------------------------------------------------------------------------

export async function writeOutputToDisk(
  workingDir: string,
  taskId: string,
  result: TaskResult,
): Promise<string> {
  const outputDir = join(workingDir, 'qos-output', taskId);
  await mkdir(outputDir, { recursive: true });

  // 1. Main output as markdown
  const outputMd = [
    `# Qualixar OS Task Output`,
    ``,
    `**Task ID:** ${taskId}`,
    `**Status:** ${result.status}`,
    `**Duration:** ${result.duration_ms}ms`,
    `**Cost:** $${result.cost.total_usd.toFixed(4)}`,
    ``,
    `## Output`,
    ``,
    result.output,
    ``,
    result.judges.length > 0 ? `## Judge Verdicts` : '',
    ...result.judges.map(
      (j) => `- **${j.judgeModel}**: ${j.verdict} (score: ${j.score.toFixed(2)})`,
    ),
  ]
    .filter(Boolean)
    .join('\n');

  await writeFile(join(outputDir, 'output.md'), outputMd, 'utf-8');

  // 2. Metadata JSON
  const metadata = {
    taskId,
    status: result.status,
    cost: result.cost,
    judges: result.judges.map((j) => ({
      model: j.judgeModel,
      verdict: j.verdict,
      score: j.score,
    })),
    teamDesign: result.teamDesign
      ? { topology: result.teamDesign.topology, id: result.teamDesign.id }
      : null,
    duration_ms: result.duration_ms,
    timestamp: new Date().toISOString(),
    filesWritten: [] as string[],
  };

  // 3. Explicit artifacts from agents
  if (result.artifacts.length > 0) {
    const artifactDir = join(outputDir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });
    for (const artifact of result.artifacts) {
      const fileName = artifact.path.split('/').pop()
        ?? `artifact-${Math.random().toString(36).slice(2, 8)}`;
      if (artifact.content) {
        await writeFile(join(artifactDir, fileName), artifact.content, 'utf-8');
        metadata.filesWritten.push(`artifacts/${fileName}`);
      }
    }
  }

  // 4. Extract code blocks from output and save as source files
  const codeFiles = extractCodeBlocks(result.output);
  if (codeFiles.length > 0) {
    const srcDir = join(outputDir, 'src');
    await mkdir(srcDir, { recursive: true });
    for (const file of codeFiles) {
      const filePath = join(srcDir, file.path);
      // Create subdirectories if path has them (e.g., "src/components/App.tsx")
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, file.content, 'utf-8');
      metadata.filesWritten.push(`src/${file.path}`);
    }
  }

  // 5. Write metadata (after collecting filesWritten)
  await writeFile(
    join(outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8',
  );

  return outputDir;
}
