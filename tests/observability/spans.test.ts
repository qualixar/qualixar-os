/**
 * Qualixar OS Phase 9 — Span Helpers Tests
 * TDD: Tests written first, then implementation.
 *
 * Strategy: Use InMemorySpanExporter + BasicTracerProvider to capture real spans.
 * Verify each startXSpan method creates properly attributed spans.
 *
 * We set the global tracer provider directly via the OTEL API to ensure
 * our provider is the one serving `trace.getTracer()` calls from SpanHelpers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
} from '@opentelemetry/sdk-trace-base';
import { SpanHelpers, wrapSpan } from '../../src/observability/spans.js';

// ---------------------------------------------------------------------------
// Test Infrastructure — real OTEL with in-memory exporter
// ---------------------------------------------------------------------------

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;
let helpers: SpanHelpers;

function getFinishedSpans() {
  return exporter.getFinishedSpans();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpanHelpers', () => {
  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    // Register this provider as the global tracer provider
    trace.setGlobalTracerProvider(provider);
    helpers = new SpanHelpers();
  });

  afterEach(async () => {
    await provider.shutdown();
    exporter.reset();
    // Disable the global tracer provider to prevent leaks between tests
    trace.disable();
  });

  // -----------------------------------------------------------------------
  // wrapSpan
  // -----------------------------------------------------------------------
  describe('wrapSpan', () => {
    it('returns a SpanHandle with setAttributes, setStatus, end', () => {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      const handle = wrapSpan(span);

      expect(handle).toHaveProperty('setAttributes');
      expect(handle).toHaveProperty('setStatus');
      expect(handle).toHaveProperty('end');
    });

    it('setAttributes forwards to the underlying span', () => {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      const handle = wrapSpan(span);

      handle.setAttributes({ 'test.key': 'value', 'test.num': 42 });
      handle.end();

      const finished = getFinishedSpans();
      expect(finished.length).toBe(1);
      expect(finished[0].attributes['test.key']).toBe('value');
      expect(finished[0].attributes['test.num']).toBe(42);
    });

    it('setStatus("ok") sets OK status code', () => {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      const handle = wrapSpan(span);

      handle.setStatus('ok');
      handle.end();

      const finished = getFinishedSpans();
      expect(finished[0].status.code).toBe(SpanStatusCode.OK);
    });

    it('setStatus("error", message) sets ERROR with message', () => {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      const handle = wrapSpan(span);

      handle.setStatus('error', 'something went wrong');
      handle.end();

      const finished = getFinishedSpans();
      expect(finished[0].status.code).toBe(SpanStatusCode.ERROR);
      expect(finished[0].status.message).toBe('something went wrong');
    });

    it('end() finalizes the span', () => {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      const handle = wrapSpan(span);

      expect(getFinishedSpans().length).toBe(0);
      handle.end();
      expect(getFinishedSpans().length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // startModelCallSpan
  // -----------------------------------------------------------------------
  describe('startModelCallSpan', () => {
    it('creates a span with provider and model attributes', () => {
      const handle = helpers.startModelCallSpan('openai', 'gpt-4o');
      handle.end();

      const spans = getFinishedSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe('model.call');
      expect(spans[0].attributes['model.provider']).toBe('openai');
      expect(spans[0].attributes['model.name']).toBe('gpt-4o');
    });
  });

  // -----------------------------------------------------------------------
  // startJudgeSpan
  // -----------------------------------------------------------------------
  describe('startJudgeSpan', () => {
    it('creates a span with judge model and round', () => {
      const handle = helpers.startJudgeSpan('claude-sonnet', 2);
      handle.end();

      const spans = getFinishedSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe('judge.evaluate');
      expect(spans[0].attributes['judge.model']).toBe('claude-sonnet');
      expect(spans[0].attributes['judge.round']).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // startOrchestratorStepSpan
  // -----------------------------------------------------------------------
  describe('startOrchestratorStepSpan', () => {
    it('creates a span with step name and task ID', () => {
      const handle = helpers.startOrchestratorStepSpan('plan', 'task-123');
      handle.end();

      const spans = getFinishedSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe('orchestrator.step');
      expect(spans[0].attributes['orchestrator.step']).toBe('plan');
      expect(spans[0].attributes['orchestrator.task_id']).toBe('task-123');
    });
  });

  // -----------------------------------------------------------------------
  // startHttpRequestSpan
  // -----------------------------------------------------------------------
  describe('startHttpRequestSpan', () => {
    it('creates a span with method and path', () => {
      const handle = helpers.startHttpRequestSpan('POST', '/api/tasks');
      handle.end();

      const spans = getFinishedSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe('http.request');
      expect(spans[0].attributes['http.method']).toBe('POST');
      expect(spans[0].attributes['http.path']).toBe('/api/tasks');
    });
  });

  // -----------------------------------------------------------------------
  // startForgeDesignSpan
  // -----------------------------------------------------------------------
  describe('startForgeDesignSpan', () => {
    it('creates a span with task type', () => {
      const handle = helpers.startForgeDesignSpan('team-assembly');
      handle.end();

      const spans = getFinishedSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe('forge.design');
      expect(spans[0].attributes['forge.task_type']).toBe('team-assembly');
    });
  });

  // -----------------------------------------------------------------------
  // startMemoryRecallSpan
  // -----------------------------------------------------------------------
  describe('startMemoryRecallSpan', () => {
    it('creates a span with query attribute', () => {
      const handle = helpers.startMemoryRecallSpan('find previous decisions');
      handle.end();

      const spans = getFinishedSpans();
      expect(spans.length).toBe(1);
      expect(spans[0].name).toBe('memory.recall');
      expect(spans[0].attributes['memory.query']).toBe('find previous decisions');
    });

    it('truncates query longer than 100 characters', () => {
      const longQuery = 'a'.repeat(150);
      const handle = helpers.startMemoryRecallSpan(longQuery);
      handle.end();

      const spans = getFinishedSpans();
      const storedQuery = spans[0].attributes['memory.query'] as string;
      expect(storedQuery.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(storedQuery.endsWith('...')).toBe(true);
    });

    it('does not truncate query of exactly 100 characters', () => {
      const exactQuery = 'b'.repeat(100);
      const handle = helpers.startMemoryRecallSpan(exactQuery);
      handle.end();

      const spans = getFinishedSpans();
      expect(spans[0].attributes['memory.query']).toBe(exactQuery);
    });
  });
});
