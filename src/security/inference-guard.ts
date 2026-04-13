// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Inference Guard
 * LLD Section 2.6
 *
 * Prompt injection detection (instruction override, role hijacking,
 * system prompt extraction, delimiter injection). Output sanitization
 * for PII patterns (emails, phones, SSNs, cards, API keys).
 *
 * Accepts modelRouter for REWRITE-SPEC bootstrap compliance.
 * Current implementation is regex-only; modelRouter reserved for
 * future LLM-based injection detection.
 */

import type { SecurityAction, SecurityDecision } from '../types/common.js';

// ---------------------------------------------------------------------------
// ModelRouter type (accepted but unused in current regex-only impl)
// ---------------------------------------------------------------------------

interface ModelRouter {
  route(request: unknown): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Prompt Injection Patterns
// ---------------------------------------------------------------------------

const PROMPT_INJECTION_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly name: string;
  readonly severity: 'high' | 'critical';
}[] = [
  // Instruction override attempts
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, name: 'instruction_override', severity: 'critical' },
  { pattern: /disregard\s+(all\s+)?prior\s+(instructions|context)/i, name: 'instruction_override', severity: 'critical' },
  { pattern: /forget\s+(everything|all)\s+(above|before)/i, name: 'instruction_override', severity: 'critical' },
  { pattern: /new\s+instructions?:\s*/i, name: 'instruction_override', severity: 'critical' },
  // Role hijacking
  { pattern: /you\s+are\s+now\s+/i, name: 'role_hijack', severity: 'critical' },
  { pattern: /act\s+as\s+(a|an|the)\s+/i, name: 'role_hijack', severity: 'high' },
  { pattern: /pretend\s+(to\s+be|you'?re)\s+/i, name: 'role_hijack', severity: 'critical' },
  { pattern: /switch\s+to\s+\w+\s+mode/i, name: 'role_hijack', severity: 'high' },
  // System prompt extraction
  { pattern: /what\s+(is|are)\s+your\s+(system\s+)?instructions/i, name: 'prompt_extraction', severity: 'high' },
  { pattern: /show\s+me\s+your\s+(system\s+)?prompt/i, name: 'prompt_extraction', severity: 'high' },
  { pattern: /repeat\s+(the\s+)?(text|words)\s+above/i, name: 'prompt_extraction', severity: 'high' },
  // Delimiter injection
  { pattern: /```system/i, name: 'delimiter_injection', severity: 'critical' },
  { pattern: /<\|im_start\|>system/i, name: 'delimiter_injection', severity: 'critical' },
  { pattern: /\[INST\]/i, name: 'delimiter_injection', severity: 'critical' },
] as const;

// ---------------------------------------------------------------------------
// PII Patterns (for output sanitization)
// ---------------------------------------------------------------------------

const PII_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly replacement: string;
  readonly name: string;
}[] = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED:EMAIL]', name: 'email' },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[REDACTED:PHONE]', name: 'phone' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED:SSN]', name: 'ssn' },
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED:CARD]', name: 'credit_card' },
  { pattern: /\b(sk-[a-zA-Z0-9]{20,})\b/g, replacement: '[REDACTED:API_KEY]', name: 'openai_key' },
  { pattern: /\b(ghp_[a-zA-Z0-9]{36,})\b/g, replacement: '[REDACTED:GITHUB_TOKEN]', name: 'github_token' },
  { pattern: /\b(AIza[0-9A-Za-z_-]{35})\b/g, replacement: '[REDACTED:GOOGLE_KEY]', name: 'google_key' },
  { pattern: /(-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----)/g, replacement: '[REDACTED:PRIVATE_KEY]', name: 'private_key' },
  { pattern: /\b(xox[bporas]-[0-9a-zA-Z-]+)\b/g, replacement: '[REDACTED:SLACK_TOKEN]', name: 'slack_token' },
] as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class InferenceGuardImpl {
  // modelRouter accepted for bootstrap compliance (REWRITE-SPEC Section 10)
  constructor(private readonly _modelRouter?: ModelRouter) {}

  scan(action: SecurityAction): SecurityDecision {
    const textToScan = JSON.stringify(action.details);

    for (const { pattern, name, severity } of PROMPT_INJECTION_PATTERNS) {
      // Reset lastIndex for stateful regexes
      const regex = new RegExp(pattern.source, pattern.flags);
      if (regex.test(textToScan)) {
        return {
          allowed: false,
          reason: `Prompt injection detected: ${name}`,
          layer: 'inference',
          severity,
        };
      }
    }

    return {
      allowed: true,
      reason: 'No injection patterns detected',
      layer: 'inference',
      severity: 'info',
    };
  }

  sanitizeOutput(output: string): string {
    let sanitized = output;
    for (const { pattern, replacement } of PII_PATTERNS) {
      // Create fresh regex each time (reset lastIndex for /g flags)
      const regex = new RegExp(pattern.source, pattern.flags);
      sanitized = sanitized.replace(regex, replacement);
    }
    return sanitized;
  }
}
