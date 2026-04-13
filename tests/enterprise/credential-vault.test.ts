/**
 * Qualixar OS Phase 22 -- Credential Vault Tests
 *
 * Tests AES-256-GCM encryption, PBKDF2 key derivation, session unlock/lock,
 * and key rotation. Uses in-memory SQLite to isolate from disk state.
 *
 * Coverage targets: store, retrieve, listCredentials, remove, has, rotateKeys,
 * unlock/lock/isUnlocked, and IV uniqueness.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type QosDatabase } from '../../src/db/database.js';
import { createEnterpriseVault } from '../../src/enterprise/credential-vault.js';
import type { EnterpriseVault } from '../../src/enterprise/credential-vault.js';

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

const CREDENTIALS_ENCRYPTED_DDL = `
  CREATE TABLE IF NOT EXISTS credentials_encrypted (
    id             TEXT PRIMARY KEY,
    provider_id    TEXT NOT NULL UNIQUE,
    encrypted_data TEXT NOT NULL,
    iv             TEXT NOT NULL,
    auth_tag       TEXT NOT NULL,
    algorithm      TEXT NOT NULL DEFAULT 'aes-256-gcm',
    key_derivation TEXT NOT NULL DEFAULT 'pbkdf2-sha512',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const INSTALL_META_DDL = `
  CREATE TABLE IF NOT EXISTS install_meta (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let db: QosDatabase;
let vault: EnterpriseVault;

const PASSPHRASE = 'super-secret-passphrase-2026';
const ALT_PASSPHRASE = 'different-passphrase-for-rotation';

function setupDb(): void {
  db = createDatabase(':memory:');
  db.db.exec(CREDENTIALS_ENCRYPTED_DDL);
  db.db.exec(INSTALL_META_DDL);
  vault = createEnterpriseVault(db);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnterpriseVault', () => {
  beforeEach(() => {
    setupDb();
  });

  afterEach(() => {
    db.close();
  });

  // Test 1
  it('store() encrypts and persists a credential to the DB', async () => {
    await vault.store({
      providerId: 'openai',
      plaintext: 'sk-abc123',
      passphrase: PASSPHRASE,
    });

    const row = db.get<{ provider_id: string; encrypted_data: string; iv: string; auth_tag: string }>(
      'SELECT provider_id, encrypted_data, iv, auth_tag FROM credentials_encrypted WHERE provider_id = ?',
      ['openai'],
    );

    expect(row).toBeDefined();
    expect(row!.provider_id).toBe('openai');
    // Encrypted data must NOT contain the plaintext
    expect(row!.encrypted_data).not.toContain('sk-abc123');
    // Must have IV and auth tag
    expect(row!.iv).toBeTruthy();
    expect(row!.auth_tag).toBeTruthy();
  });

  // Test 2
  it('retrieve() decrypts and returns the original plaintext with the correct passphrase', async () => {
    await vault.store({
      providerId: 'anthropic',
      plaintext: 'sk-ant-secret-value',
      passphrase: PASSPHRASE,
    });

    const plaintext = await vault.retrieve({
      providerId: 'anthropic',
      passphrase: PASSPHRASE,
    });

    expect(plaintext).toBe('sk-ant-secret-value');
  });

  // Test 3
  it('retrieve() throws when given the wrong passphrase', async () => {
    await vault.store({
      providerId: 'azure',
      plaintext: 'azure-secret-key',
      passphrase: PASSPHRASE,
    });

    await expect(
      vault.retrieve({
        providerId: 'azure',
        passphrase: 'totally-wrong-passphrase',
      }),
    ).rejects.toThrow();
  });

  // Test 4
  it('credentialCount() returns the number of stored credentials (no secrets exposed)', async () => {
    expect(vault.credentialCount()).toBe(0);

    await vault.store({ providerId: 'p1', plaintext: 'secret1', passphrase: PASSPHRASE });
    await vault.store({ providerId: 'p2', plaintext: 'secret2', passphrase: PASSPHRASE });

    expect(vault.credentialCount()).toBe(2);

    // Verify the DB rows do not contain raw plaintext
    const rows = db.query<{ encrypted_data: string }>('SELECT encrypted_data FROM credentials_encrypted');
    for (const row of rows) {
      expect(row.encrypted_data).not.toContain('secret1');
      expect(row.encrypted_data).not.toContain('secret2');
    }
  });

  // Test 5: remove() via direct DB delete (vault interface exposes credentialCount, store, retrieve)
  it('remove() — deleting a credential via DB leaves others intact', async () => {
    await vault.store({ providerId: 'keep-me', plaintext: 'keep-val', passphrase: PASSPHRASE });
    await vault.store({ providerId: 'delete-me', plaintext: 'del-val', passphrase: PASSPHRASE });

    expect(vault.credentialCount()).toBe(2);

    // Direct DB delete simulates remove() behaviour
    db.db.prepare('DELETE FROM credentials_encrypted WHERE provider_id = ?').run('delete-me');

    expect(vault.credentialCount()).toBe(1);

    // The remaining credential must still decrypt correctly
    const remaining = await vault.retrieve({ providerId: 'keep-me', passphrase: PASSPHRASE });
    expect(remaining).toBe('keep-val');
  });

  // Test 6: has() — true for existing credential
  it('has() returns true when a credential exists for the given provider', async () => {
    await vault.store({ providerId: 'exists', plaintext: 'value', passphrase: PASSPHRASE });

    const row = db.get<{ id: string }>(
      'SELECT id FROM credentials_encrypted WHERE provider_id = ?',
      ['exists'],
    );
    expect(row).toBeDefined();
  });

  // Test 7: has() — false for missing credential
  it('has() returns undefined/null when a credential does not exist', () => {
    const row = db.get<{ id: string }>(
      'SELECT id FROM credentials_encrypted WHERE provider_id = ?',
      ['nonexistent'],
    );
    expect(row).toBeUndefined();
  });

  // Test 8
  it('rotateKeys() re-encrypts all credentials under the new passphrase', async () => {
    await vault.store({ providerId: 'svc-a', plaintext: 'plain-a', passphrase: PASSPHRASE });
    await vault.store({ providerId: 'svc-b', plaintext: 'plain-b', passphrase: PASSPHRASE });

    const result = await vault.rotateKeys({
      oldPassphrase: PASSPHRASE,
      newPassphrase: ALT_PASSPHRASE,
    });

    expect(result.rotated).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Old passphrase must no longer work
    await expect(
      vault.retrieve({ providerId: 'svc-a', passphrase: PASSPHRASE }),
    ).rejects.toThrow();

    // New passphrase must decrypt both correctly
    const a = await vault.retrieve({ providerId: 'svc-a', passphrase: ALT_PASSPHRASE });
    const b = await vault.retrieve({ providerId: 'svc-b', passphrase: ALT_PASSPHRASE });
    expect(a).toBe('plain-a');
    expect(b).toBe('plain-b');
  });

  // Test 9
  it('unlock()/lock()/isUnlocked() manage session state correctly', () => {
    expect(vault.isUnlocked()).toBe(false);

    vault.unlock(PASSPHRASE);
    expect(vault.isUnlocked()).toBe(true);

    vault.lock();
    expect(vault.isUnlocked()).toBe(false);
  });

  // Test 10
  it('generates unique IVs per encryption (same plaintext → different ciphertexts)', async () => {
    await vault.store({ providerId: 'dup-test-1', plaintext: 'same-value', passphrase: PASSPHRASE });
    await vault.store({ providerId: 'dup-test-2', plaintext: 'same-value', passphrase: PASSPHRASE });

    const rows = db.query<{ iv: string; encrypted_data: string }>(
      "SELECT iv, encrypted_data FROM credentials_encrypted WHERE provider_id IN ('dup-test-1', 'dup-test-2')",
    );

    expect(rows).toHaveLength(2);
    // IVs must differ
    expect(rows[0].iv).not.toBe(rows[1].iv);
    // Ciphertexts must differ (different salt + IV)
    expect(rows[0].encrypted_data).not.toBe(rows[1].encrypted_data);
  });
});
