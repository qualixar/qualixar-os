// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Per-agent file logger for deep execution tracing.
 * Writes structured JSONL logs to workspace .qos-log/ directory.
 *
 * Each agent gets its own log file + a combined team.jsonl for full timeline.
 * All entries are immutable append-only — no mutation of existing log data.
 *
 * PA1-HIGH: Uses persistent file descriptors (openSync + writeSync) instead of
 * appendFileSync to avoid repeated open/close overhead per write while
 * maintaining synchronous write semantics for consistency.
 */

import { mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentLogType =
  | 'llm_call'
  | 'tool_call'
  | 'message_sent'
  | 'message_received'
  | 'decision'
  | 'error';

export interface AgentLogEntry {
  readonly timestamp: string;
  readonly agentId: string;
  readonly agentRole: string;
  readonly type: AgentLogType;
  readonly detail: Record<string, unknown>;
}

export interface AgentLogger {
  log(entry: AgentLogEntry): void;
  logLlmCall(
    agentId: string,
    role: string,
    model: string,
    prompt: string,
    response: string,
    tokens: { readonly input: number; readonly output: number },
  ): void;
  logToolCall(
    agentId: string,
    role: string,
    toolName: string,
    input: unknown,
    output: unknown,
  ): void;
  logMessage(
    agentId: string,
    role: string,
    direction: 'sent' | 'received',
    to: string,
    content: string,
  ): void;
  logDecision(
    agentId: string,
    role: string,
    decision: string,
    reasoning: string,
  ): void;
  logError(
    agentId: string,
    role: string,
    error: string,
    context?: Record<string, unknown>,
  ): void;
  getLogPath(): string;
  close(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAgentLogger(workspaceDir: string | undefined): AgentLogger {
  const logDir = workspaceDir ? join(workspaceDir, '.qos-log') : undefined;

  if (logDir) {
    mkdirSync(logDir, { recursive: true });
  }

  // PA1-HIGH: Persistent file descriptors — opened once, reused for all writes.
  // Avoids the open/write/close cycle of appendFileSync on every log entry.
  const fds = new Map<string, number>();

  function getOrOpenFd(filepath: string): number {
    let fd = fds.get(filepath);
    if (fd === undefined) {
      // O_WRONLY | O_CREAT | O_APPEND = 'a' mode
      fd = openSync(filepath, 'a');
      fds.set(filepath, fd);
    }
    return fd;
  }

  function writeEntry(entry: AgentLogEntry): void {
    if (!logDir) return;

    const line = JSON.stringify(entry) + '\n';
    const buf = Buffer.from(line, 'utf-8');

    // Per-agent log — first 8 chars of agent ID for filename
    const agentFile = join(logDir, `agent-${entry.agentId.slice(0, 8)}.jsonl`);
    writeSync(getOrOpenFd(agentFile), buf);

    // Team log — all agents combined for timeline view
    const teamFile = join(logDir, 'team.jsonl');
    writeSync(getOrOpenFd(teamFile), buf);
  }

  return {
    log: writeEntry,

    logLlmCall(agentId, role, model, prompt, response, tokens) {
      writeEntry({
        timestamp: new Date().toISOString(),
        agentId,
        agentRole: role,
        type: 'llm_call',
        detail: {
          model,
          promptLength: prompt.length,
          responseLength: response.length,
          tokens,
        },
      });
    },

    logToolCall(agentId, role, toolName, input, output) {
      writeEntry({
        timestamp: new Date().toISOString(),
        agentId,
        agentRole: role,
        type: 'tool_call',
        detail: {
          toolName,
          input,
          outputLength:
            typeof output === 'string'
              ? output.length
              : JSON.stringify(output).length,
        },
      });
    },

    logMessage(agentId, role, direction, to, content) {
      writeEntry({
        timestamp: new Date().toISOString(),
        agentId,
        agentRole: role,
        type: direction === 'sent' ? 'message_sent' : 'message_received',
        detail: { direction, to, contentLength: content.length },
      });
    },

    logDecision(agentId, role, decision, reasoning) {
      writeEntry({
        timestamp: new Date().toISOString(),
        agentId,
        agentRole: role,
        type: 'decision',
        detail: { decision, reasoning },
      });
    },

    logError(agentId, role, error, context) {
      writeEntry({
        timestamp: new Date().toISOString(),
        agentId,
        agentRole: role,
        type: 'error',
        detail: { error, ...context },
      });
    },

    getLogPath() {
      return logDir ?? '';
    },

    close() {
      for (const fd of fds.values()) {
        try {
          closeSync(fd);
        } catch {
          // FD may already be closed — ignore
        }
      }
      fds.clear();
    },
  };
}
