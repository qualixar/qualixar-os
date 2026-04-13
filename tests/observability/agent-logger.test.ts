/**
 * Qualixar OS Phase E — Agent Logger Tests
 * TDD: Tests for per-agent file logging.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentLogger, type AgentLogEntry } from '../../src/observability/agent-logger.js';

describe('AgentLogger', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'qos-agent-logger-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function readJsonl(filePath: string): AgentLogEntry[] {
    if (!existsSync(filePath)) return [];
    return readFileSync(filePath, 'utf-8')
      .trim()
      .split('\n')
      .filter((l) => l)
      .map((l) => JSON.parse(l) as AgentLogEntry);
  }

  it('creates .qos-log directory on init', () => {
    createAgentLogger(tempDir);
    expect(existsSync(join(tempDir, '.qos-log'))).toBe(true);
  });

  it('returns empty path when no workspace provided', () => {
    const logger = createAgentLogger(undefined);
    expect(logger.getLogPath()).toBe('');
  });

  it('returns log path when workspace provided', () => {
    const logger = createAgentLogger(tempDir);
    expect(logger.getLogPath()).toBe(join(tempDir, '.qos-log'));
  });

  it('does not throw when logging without workspace', () => {
    const logger = createAgentLogger(undefined);
    expect(() =>
      logger.logLlmCall('agent-1', 'coder', 'claude-3', 'hello', 'world', { input: 10, output: 5 }),
    ).not.toThrow();
  });

  it('writes llm_call entries to per-agent and team files', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    logger.logLlmCall('abcdefgh-1234', 'coder', 'claude-3', 'prompt text', 'response text', {
      input: 100,
      output: 50,
    });

    const agentLogs = readJsonl(join(logDir, 'agent-abcdefgh.jsonl'));
    expect(agentLogs).toHaveLength(1);
    expect(agentLogs[0].type).toBe('llm_call');
    expect(agentLogs[0].agentId).toBe('abcdefgh-1234');
    expect(agentLogs[0].agentRole).toBe('coder');
    expect(agentLogs[0].detail).toMatchObject({
      model: 'claude-3',
      promptLength: 11,
      responseLength: 13,
      tokens: { input: 100, output: 50 },
    });

    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));
    expect(teamLogs).toHaveLength(1);
  });

  it('writes tool_call entries', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    logger.logToolCall('agent-01-xx', 'tester', 'run_test', { file: 'a.ts' }, 'passed');

    const agentLogs = readJsonl(join(logDir, 'agent-agent-01.jsonl'));
    expect(agentLogs).toHaveLength(1);
    expect(agentLogs[0].type).toBe('tool_call');
    expect(agentLogs[0].detail).toMatchObject({
      toolName: 'run_test',
      input: { file: 'a.ts' },
      outputLength: 6,
    });
  });

  it('writes message_sent and message_received entries', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    logger.logMessage('agent-aa-bb', 'coder', 'sent', 'reviewer-1', 'check this code');
    logger.logMessage('agent-aa-bb', 'coder', 'received', 'reviewer-1', 'looks good');

    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));
    expect(teamLogs).toHaveLength(2);
    expect(teamLogs[0].type).toBe('message_sent');
    expect(teamLogs[0].detail).toMatchObject({ direction: 'sent', to: 'reviewer-1', contentLength: 15 });
    expect(teamLogs[1].type).toBe('message_received');
    expect(teamLogs[1].detail).toMatchObject({ direction: 'received', to: 'reviewer-1', contentLength: 10 });
  });

  it('writes decision entries', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    logger.logDecision('agent-dd-ee', 'lead', 'approve', 'quality score above threshold');

    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));
    expect(teamLogs).toHaveLength(1);
    expect(teamLogs[0].type).toBe('decision');
    expect(teamLogs[0].detail).toMatchObject({
      decision: 'approve',
      reasoning: 'quality score above threshold',
    });
  });

  it('writes error entries with optional context', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    logger.logError('agent-ff-gg', 'worker', 'timeout exceeded', { retries: 3 });

    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));
    expect(teamLogs).toHaveLength(1);
    expect(teamLogs[0].type).toBe('error');
    expect(teamLogs[0].detail).toMatchObject({ error: 'timeout exceeded', retries: 3 });
  });

  it('writes error entries without context', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    logger.logError('agent-hh-ii', 'worker', 'unknown failure');

    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));
    expect(teamLogs).toHaveLength(1);
    expect(teamLogs[0].detail).toMatchObject({ error: 'unknown failure' });
  });

  it('writes raw log entries via log()', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    const entry: AgentLogEntry = {
      timestamp: '2026-04-12T00:00:00.000Z',
      agentId: 'custom-id-x',
      agentRole: 'specialist',
      type: 'decision',
      detail: { custom: true },
    };
    logger.log(entry);

    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));
    expect(teamLogs).toHaveLength(1);
    expect(teamLogs[0]).toMatchObject(entry);
  });

  it('separates logs per agent', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    logger.logLlmCall('aaaaaaaa-1', 'coder', 'm1', 'p', 'r', { input: 1, output: 1 });
    logger.logLlmCall('bbbbbbbb-2', 'reviewer', 'm2', 'p', 'r', { input: 1, output: 1 });
    logger.logLlmCall('aaaaaaaa-1', 'coder', 'm1', 'p2', 'r2', { input: 2, output: 2 });

    const agentALogs = readJsonl(join(logDir, 'agent-aaaaaaaa.jsonl'));
    const agentBLogs = readJsonl(join(logDir, 'agent-bbbbbbbb.jsonl'));
    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));

    expect(agentALogs).toHaveLength(2);
    expect(agentBLogs).toHaveLength(1);
    expect(teamLogs).toHaveLength(3);
  });

  it('includes valid ISO timestamps', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    logger.logDecision('agent-ts-01', 'lead', 'go', 'all clear');

    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));
    expect(teamLogs).toHaveLength(1);
    const ts = new Date(teamLogs[0].timestamp);
    expect(ts.getTime()).not.toBeNaN();
  });

  it('handles object output in logToolCall', () => {
    const logger = createAgentLogger(tempDir);
    const logDir = join(tempDir, '.qos-log');

    const objOutput = { result: 'ok', items: [1, 2, 3] };
    logger.logToolCall('agent-obj-01', 'worker', 'fetch', {}, objOutput);

    const teamLogs = readJsonl(join(logDir, 'team.jsonl'));
    expect(teamLogs[0].detail.outputLength).toBe(JSON.stringify(objOutput).length);
  });
});
