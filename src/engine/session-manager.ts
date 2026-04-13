// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 13 -- Session Manager
 *
 * Persists session state to ~/.qualixar-os/session.json (NOT DB — survives DB corruption).
 * On server restart: reads session.json, identifies interrupted tasks.
 * Interrupted tasks can be resumed from last checkpoint via durability.ts.
 *
 * Hard Rule: JSON file persistence, not SQLite. Defense in depth.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionState {
  readonly sessionId: string;
  readonly activeTasks: readonly string[];
  readonly startedAt: string;
  readonly lastCheckpoint: string | null;
}

export interface SessionManager {
  save(sessionId: string, activeTasks: readonly string[], lastCheckpoint: string | null): void;
  restore(): SessionState | null;
  getActiveTaskIds(): readonly string[];
  clear(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SessionManagerImpl implements SessionManager {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? join(homedir(), '.qualixar-os', 'session.json');
  }

  save(
    sessionId: string,
    activeTasks: readonly string[],
    lastCheckpoint: string | null,
  ): void {
    const state: SessionState = {
      sessionId,
      activeTasks,
      startedAt: now(),
      lastCheckpoint,
    };

    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  restore(): SessionState | null {
    if (!existsSync(this.filePath)) {
      return null;
    }

    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as SessionState;

      // Validate required fields
      if (!parsed.sessionId || !Array.isArray(parsed.activeTasks) || !parsed.startedAt) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  getActiveTaskIds(): readonly string[] {
    const state = this.restore();
    return state?.activeTasks ?? [];
  }

  clear(): void {
    if (existsSync(this.filePath)) {
      writeFileSync(this.filePath, JSON.stringify(null), 'utf-8');
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSessionManager(filePath?: string): SessionManager {
  return new SessionManagerImpl(filePath);
}
