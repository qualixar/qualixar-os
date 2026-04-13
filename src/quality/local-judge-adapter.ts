// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Local Judge Adapter
 * LLD Section 2.10
 *
 * HTTP call to local OpenAI-compatible endpoint (vLLM-Metal or BitNet).
 * Opt-in: only active if models.local is configured.
 * Formats response as JudgeVerdict.
 */

import type { JudgeVerdict, JudgeIssue } from '../types/common.js';

// ---------------------------------------------------------------------------
// JudgeRequest subset (avoid circular)
// ---------------------------------------------------------------------------

export interface LocalJudgeRequest {
  readonly taskId: string;
  readonly prompt: string;
  readonly output: string;
  readonly round: number;
}

// ---------------------------------------------------------------------------
// Config accessor interface
// ---------------------------------------------------------------------------

export interface LocalJudgeConfig {
  readonly models: {
    readonly local?: string;
  };
}

export interface LocalJudgeConfigProvider {
  getConfig(): LocalJudgeConfig;
}

/** Adapts a ConfigManager (with .get()) to the LocalJudgeConfigProvider interface. */
export function adaptConfigManager(cm: { get(): { models: { local?: string } } }): LocalJudgeConfigProvider {
  return { getConfig: () => cm.get() };
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface LocalJudgeAdapter {
  isAvailable(): Promise<boolean>;
  evaluate(request: LocalJudgeRequest): Promise<JudgeVerdict>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class LocalJudgeAdapterImpl implements LocalJudgeAdapter {
  private readonly endpoint: string | null;
  private readonly modelName: string | null;
  private _available: boolean;

  constructor(configProvider: LocalJudgeConfigProvider) {
    const localModelConfig = configProvider.getConfig().models.local;

    if (localModelConfig === undefined || localModelConfig === '') {
      this.endpoint = null;
      this.modelName = null;
      this._available = false;
      return;
    }

    // Parse: "model_name@host:port" or just "model_name"
    const parts = localModelConfig.split('@');
    this.modelName = parts[0];
    this.endpoint =
      parts.length > 1
        ? `http://${parts[1]}/v1`
        : 'http://localhost:8000/v1';
    this._available = false;
  }

  async isAvailable(): Promise<boolean> {
    if (this.endpoint === null) return false;
    if (this._available) return true;

    // Lazy health check
    try {
      const HEALTH_CHECK_TIMEOUT_MS = 3000;
      const response = await fetch(`${this.endpoint}/models`, {
        signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
      });
      if (response.ok) {
        this._available = true;
        return true;
      }
    } catch {
      this._available = false;
    }
    return false;
  }

  async evaluate(request: LocalJudgeRequest): Promise<JudgeVerdict> {
    if (!(await this.isAvailable())) {
      throw new Error('Local judge adapter is not available');
    }

    const startTime = Date.now();

    const body = {
      model: this.modelName,
      messages: [
        {
          role: 'system',
          content:
            'You are a code/output quality judge. Evaluate the output and return JSON with: verdict (approve|reject|revise), score (0-1), feedback (string), issues (array of {severity, category, description}).',
        },
        {
          role: 'user',
          content: `Task prompt: ${request.prompt}\n\nOutput to evaluate:\n${request.output}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    };

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local judge HTTP ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content ?? '{}';

    let parsed: {
      verdict?: string;
      score?: number;
      feedback?: string;
      issues?: JudgeIssue[];
    };
    try {
      parsed = JSON.parse(content) as typeof parsed;
    } catch {
      parsed = { verdict: 'revise', score: 0.3, feedback: content, issues: [] };
    }

    return {
      judgeModel: `local:${this.modelName}`,
      verdict: (parsed.verdict as 'approve' | 'reject' | 'revise') ?? 'revise',
      score: Math.max(0, Math.min(1, parsed.score ?? 0.5)),
      feedback: parsed.feedback ?? '',
      issues: parsed.issues ?? [],
      durationMs: Date.now() - startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocalJudgeAdapter(
  configProvider: LocalJudgeConfigProvider,
): LocalJudgeAdapter {
  return new LocalJudgeAdapterImpl(configProvider);
}
