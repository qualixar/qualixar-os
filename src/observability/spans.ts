// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 9 — Span Helper Factory
 *
 * Provides a simplified SpanHandle interface and pre-configured span
 * creators for every Qualixar OS subsystem. Hides raw OTEL Span plumbing
 * behind a clean, hard-to-misuse API.
 *
 * @module observability/spans
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { TRACER_NAMES } from './traces.js';
import { VERSION } from '../version.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Simplified span handle — callers don't touch raw OTEL Span. */
export interface SpanHandle {
  /** Set one or more attributes on the span. */
  readonly setAttributes: (attrs: Record<string, string | number | boolean>) => void;
  /** Set the span's final status. */
  readonly setStatus: (code: 'ok' | 'error', message?: string) => void;
  /** End (finalize) the span. Must be called exactly once. */
  readonly end: () => void;
}

// ---------------------------------------------------------------------------
// wrapSpan
// ---------------------------------------------------------------------------

/** Wrap a raw OTEL Span into the simplified SpanHandle. */
export function wrapSpan(span: Span): SpanHandle {
  return {
    setAttributes(attrs: Record<string, string | number | boolean>): void {
      span.setAttributes(attrs);
    },
    setStatus(code: 'ok' | 'error', message?: string): void {
      if (code === 'ok') {
        span.setStatus({ code: SpanStatusCode.OK });
      } else {
        span.setStatus({ code: SpanStatusCode.ERROR, message });
      }
    },
    end(): void {
      span.end();
    },
  };
}

// ---------------------------------------------------------------------------
// SpanHelpers
// ---------------------------------------------------------------------------

/** Maximum query length stored in memory recall span attributes. */
const MAX_QUERY_LENGTH = 100;

/**
 * Pre-configured span creators for Qualixar OS subsystems.
 *
 * Each method obtains the correct tracer by name and creates a span
 * with the mandatory attributes already set.
 */
export class SpanHelpers {
  private getTracer(name: string): Tracer {
    return trace.getTracer(name, VERSION);
  }

  /** Span for an LLM model call. */
  startModelCallSpan(provider: string, model: string): SpanHandle {
    const tracer = this.getTracer(TRACER_NAMES.MODEL_CALL);
    const span = tracer.startSpan('model.call');
    span.setAttributes({
      'model.provider': provider,
      'model.name': model,
    });
    return wrapSpan(span);
  }

  /** Span for a judge evaluation round. */
  startJudgeSpan(judgeModel: string, round: number): SpanHandle {
    const tracer = this.getTracer(TRACER_NAMES.JUDGE);
    const span = tracer.startSpan('judge.evaluate');
    span.setAttributes({
      'judge.model': judgeModel,
      'judge.round': round,
    });
    return wrapSpan(span);
  }

  /** Span for an orchestrator execution step. */
  startOrchestratorStepSpan(step: string, taskId: string): SpanHandle {
    const tracer = this.getTracer(TRACER_NAMES.ORCHESTRATOR);
    const span = tracer.startSpan('orchestrator.step');
    span.setAttributes({
      'orchestrator.step': step,
      'orchestrator.task_id': taskId,
    });
    return wrapSpan(span);
  }

  /** Span for an inbound HTTP request. */
  startHttpRequestSpan(method: string, path: string): SpanHandle {
    const tracer = this.getTracer(TRACER_NAMES.HTTP);
    const span = tracer.startSpan('http.request');
    span.setAttributes({
      'http.method': method,
      'http.path': path,
    });
    return wrapSpan(span);
  }

  /** Span for a forge (team design) operation. */
  startForgeDesignSpan(taskType: string): SpanHandle {
    const tracer = this.getTracer(TRACER_NAMES.FORGE);
    const span = tracer.startSpan('forge.design');
    span.setAttributes({
      'forge.task_type': taskType,
    });
    return wrapSpan(span);
  }

  /** Span for a memory recall query. Truncates long queries. */
  startMemoryRecallSpan(query: string): SpanHandle {
    const tracer = this.getTracer(TRACER_NAMES.MEMORY);
    const span = tracer.startSpan('memory.recall');

    const truncated = query.length > MAX_QUERY_LENGTH
      ? query.slice(0, MAX_QUERY_LENGTH) + '...'
      : query;

    span.setAttributes({
      'memory.query': truncated,
    });
    return wrapSpan(span);
  }
}
