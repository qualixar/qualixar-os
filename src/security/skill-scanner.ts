// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Skill Scanner
 * LLD Section 2.7
 *
 * 8 pattern categories, regex detection, weighted composite risk score,
 * SHA-256 result caching. SkillFortify-lite.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import type { SkillScanner, ScanResult, ScanIssue } from '../types/common.js';

// ---------------------------------------------------------------------------
// Dangerous Pattern Definitions (8 categories)
// ---------------------------------------------------------------------------

interface DangerousPatternCategory {
  readonly category: string;
  readonly patterns: readonly RegExp[];
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly weight: number;
  readonly description: string;
}

const DANGEROUS_PATTERNS: readonly DangerousPatternCategory[] = [
  {
    category: 'shell_spawning',
    patterns: [/child_process/, /\bspawn\s*\(/, /\bspawnSync\s*\(/],
    severity: 'critical',
    weight: 1.0,
    description: 'Direct OS command invocation from skill code',
  },
  {
    category: 'dynamic_code_eval',
    patterns: [/\beval\s*\(/, /new\s+Function\s*\(/, /\bvm\.run/],
    severity: 'critical',
    weight: 1.0,
    description: 'Arbitrary code execution from strings',
  },
  {
    category: 'filesystem_mutation',
    patterns: [
      /writeFileSync\s*\(/,
      /writeFile\s*\(/,
      /\brmSync\s*\(/,
      /\bunlinkSync\s*\(/,
      /\bappendFileSync\s*\(/,
      /\bmkdirSync\s*\(/,
    ],
    severity: 'high',
    weight: 0.7,
    description: 'Skill modifying or deleting files',
  },
  {
    category: 'network_requests',
    patterns: [
      /http\.request\s*\(/,
      /https\.request\s*\(/,
      /\bfetch\s*\(/,
      /\baxios\b/,
      /\bgot\b/,
      /\.get\s*\(\s*['"]https?:\/\//,
    ],
    severity: 'high',
    weight: 0.7,
    description: 'Skill making outbound network calls',
  },
  {
    category: 'env_access',
    patterns: [/process\.env\b/],
    severity: 'medium',
    weight: 0.4,
    description: 'Skill reading host environment',
  },
  {
    category: 'dynamic_require',
    patterns: [/require\s*\(\s*[^'"]/,  /import\s*\(\s*[^'"]/],
    severity: 'medium',
    weight: 0.4,
    description: 'Skill loading arbitrary modules at runtime',
  },
  {
    category: 'path_discovery',
    patterns: [/__dirname\b/, /__filename\b/, /process\.cwd\s*\(\)/],
    severity: 'low',
    weight: 0.1,
    description: 'Skill inspecting host filesystem location',
  },
  {
    category: 'binary_manipulation',
    patterns: [
      /Buffer\.from\s*\(.*,\s*['"]base64['"]/,
      /Buffer\.alloc\s*\(/,
    ],
    severity: 'low',
    weight: 0.1,
    description: 'Potential data exfiltration preparation',
  },
] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SkillScannerImpl implements SkillScanner {
  private readonly cache: Map<string, ScanResult> = new Map();

  scan(skillPath: string): ScanResult {
    const content = fs.readFileSync(skillPath, 'utf-8');
    return this.scanContent(content);
  }

  scanContent(content: string): ScanResult {
    // Step 1: SHA-256 hash for cache key
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Step 2: Check cache
    const cached = this.cache.get(hash);
    if (cached !== undefined) {
      return cached;
    }

    // Step 3-6: Run all 8 pattern categories
    const issues: ScanIssue[] = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const category of DANGEROUS_PATTERNS) {
      totalWeight += category.weight;
      let categoryMatched = false;

      for (const pattern of category.patterns) {
        const regex = new RegExp(pattern, 'g');
        const matches = [...content.matchAll(regex)];

        for (const match of matches) {
          issues.push({
            severity: category.severity,
            pattern: pattern.source,
            location: `offset:${match.index}`,
            description: category.description,
          });
          categoryMatched = true;
        }
      }

      if (categoryMatched) {
        matchedWeight += category.weight;
      }
    }

    // Step 7: Compute risk score
    const riskScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;

    // Step 8: Determine safe
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const safe = !hasCritical && riskScore < 0.7;

    // Step 9-10: Freeze, cache, return
    const result: ScanResult = Object.freeze({
      safe,
      issues: Object.freeze(issues),
      riskScore,
    });

    this.cache.set(hash, result);
    return result;
  }
}
