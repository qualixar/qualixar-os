// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Machine-Bound Key Derivation
 * LLD Section 8.2
 *
 * PBKDF2-SHA512 key derivation from hostname + install UUID.
 * HR-16: Iterations MUST be >= 210,000 (OWASP 2026 SHA-512).
 * HR-7: Machine-bound — different hostname = different key.
 */

import { pbkdf2Sync, createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type BetterSqlite3 from 'better-sqlite3';

const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha512';

/**
 * Get or create a persistent install UUID for this Qualixar OS instance.
 * Stored in the install_meta table. Generated once, never changes.
 * If lost, encrypted credentials are irrecoverable (by design).
 */
export function getMachineId(db: BetterSqlite3.Database): string {
  const host = hostname();
  if (!host) {
    throw new Error('Cannot determine hostname for key derivation');
  }

  const row = db
    .prepare('SELECT value FROM install_meta WHERE key = ?')
    .get('install_uuid') as { value: string } | undefined;

  let installUuid: string;
  if (row) {
    installUuid = row.value;
  } else {
    installUuid = randomUUID();
    db.prepare(
      'INSERT INTO install_meta (key, value) VALUES (?, ?)',
    ).run('install_uuid', installUuid);
  }

  return `${host}:${installUuid}`;
}

/**
 * Derive a 32-byte AES-256 encryption key from the machine identity.
 * Uses PBKDF2-SHA512 with 210K iterations per OWASP 2026.
 * Salt is deterministic (SHA-256 of machineId) so the same machine
 * always derives the same key.
 */
export function deriveEncryptionKey(machineId: string): Buffer {
  if (!machineId || machineId.length === 0) {
    throw new Error('machineId must be a non-empty string');
  }

  const salt = createHash('sha256').update(machineId).digest();
  return pbkdf2Sync(machineId, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
}
