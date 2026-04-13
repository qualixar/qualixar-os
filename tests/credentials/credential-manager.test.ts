/**
 * Qualixar OS Phase 18 -- Credential Manager Tests
 * LLD TDD Sequence: 16 tests covering store, resolve, list, remove, has
 *
 * Uses in-memory better-sqlite3 DB — no disk I/O, no machine-bound state leaks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createCredentialManager } from '../../src/credentials/credential-manager.js';
import type { CredentialStore } from '../../src/types/phase18.js';

// ---------------------------------------------------------------------------
// Schema (both tables required — install_meta for key derivation)
// ---------------------------------------------------------------------------

const CREATE_CREDENTIALS = `
  CREATE TABLE IF NOT EXISTS credentials (
    id TEXT PRIMARY KEY,
    provider_name TEXT NOT NULL UNIQUE,
    storage_mode TEXT NOT NULL CHECK (storage_mode IN ('direct', 'env_ref')),
    encrypted_value TEXT NOT NULL,
    iv TEXT,
    auth_tag TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

const CREATE_INSTALL_META = `
  CREATE TABLE IF NOT EXISTS install_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------

let db: InstanceType<typeof Database>;
let store: CredentialStore;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowCount(): number {
  return (
    db.prepare('SELECT COUNT(*) as n FROM credentials').get() as { n: number }
  ).n;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CredentialManager', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(CREATE_INSTALL_META);
    db.exec(CREATE_CREDENTIALS);
    store = createCredentialManager(db);

    // Test 4 env var
    process.env['TEST_API_KEY'] = 'test-key-12345';
  });

  afterEach(() => {
    delete process.env['TEST_API_KEY'];
    db.close();
  });

  // -------------------------------------------------------------------------
  // store()
  // -------------------------------------------------------------------------

  it('1. store() with direct mode encrypts the value', () => {
    const result = store.store({
      providerName: 'openai',
      storageMode: 'direct',
      value: 'sk-abc12345xyz',
    });

    expect(result.storageMode).toBe('direct');
    expect(result.encryptedValue).not.toBe('sk-abc12345xyz');
    expect(result.iv).toBeTruthy();
    expect(result.authTag).toBeTruthy();
    // Value should be base64-encoded ciphertext
    expect(() => Buffer.from(result.encryptedValue, 'base64')).not.toThrow();
  });

  it('2. store() with env_ref mode stores env var name as-is', () => {
    const result = store.store({
      providerName: 'anthropic',
      storageMode: 'env_ref',
      value: 'ANTHROPIC_API_KEY',
    });

    expect(result.storageMode).toBe('env_ref');
    expect(result.encryptedValue).toBe('ANTHROPIC_API_KEY');
    expect(result.iv).toBeNull();
    expect(result.authTag).toBeNull();
  });

  it('3. resolve() with direct mode decrypts correctly', () => {
    const plaintext = 'sk-my-secret-key-9999';
    store.store({ providerName: 'openai', storageMode: 'direct', value: plaintext });

    const resolved = store.resolve('openai');

    expect(resolved).toBe(plaintext);
  });

  it('4. resolve() with env_ref mode reads from process.env', () => {
    store.store({
      providerName: 'anthropic',
      storageMode: 'env_ref',
      value: 'TEST_API_KEY',
    });

    const resolved = store.resolve('anthropic');

    expect(resolved).toBe('test-key-12345');
  });

  it('5. resolve() returns undefined for unknown provider', () => {
    const resolved = store.resolve('nonexistent-provider');

    expect(resolved).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // list()
  // -------------------------------------------------------------------------

  it('6. list() returns CredentialRef without secrets', () => {
    store.store({ providerName: 'openai', storageMode: 'direct', value: 'sk-abcdefgh' });

    const refs = store.list();

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      providerName: 'openai',
      storageMode: 'direct',
      isSet: true,
    });
    // Must NOT contain the raw key
    expect(JSON.stringify(refs[0])).not.toContain('sk-abcdefgh');
  });

  it('7. list() shows displayValue=[encrypted] for direct mode', () => {
    store.store({ providerName: 'openai', storageMode: 'direct', value: 'sk-abcdefgh' });

    const refs = store.list();

    expect(refs[0]?.displayValue).toBe('[encrypted]');
  });

  it('8. list() shows env var name for env_ref mode', () => {
    store.store({
      providerName: 'anthropic',
      storageMode: 'env_ref',
      value: 'TEST_API_KEY',
    });

    const refs = store.list();

    expect(refs[0]?.displayValue).toBe('TEST_API_KEY');
  });

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------

  it('9. remove() deletes credential from DB', () => {
    store.store({ providerName: 'openai', storageMode: 'direct', value: 'sk-abcdefgh' });
    expect(rowCount()).toBe(1);

    const removed = store.remove('openai');

    expect(removed).toBe(true);
    expect(rowCount()).toBe(0);
  });

  it('10. remove() returns false for non-existent provider', () => {
    const removed = store.remove('does-not-exist');

    expect(removed).toBe(false);
  });

  // -------------------------------------------------------------------------
  // has()
  // -------------------------------------------------------------------------

  it('11. has() returns true for existing credential', () => {
    store.store({ providerName: 'openai', storageMode: 'direct', value: 'sk-abcdefgh' });

    expect(store.has('openai')).toBe(true);
  });

  it('12. has() returns false for missing credential', () => {
    expect(store.has('nonexistent')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it('13. store() rejects empty value', () => {
    expect(() =>
      store.store({ providerName: 'openai', storageMode: 'direct', value: '' }),
    ).toThrow('non-empty');
  });

  it('14. store() rejects value shorter than 8 chars in direct mode', () => {
    expect(() =>
      store.store({ providerName: 'openai', storageMode: 'direct', value: 'short' }),
    ).toThrow(/at least 8/i);
  });

  // -------------------------------------------------------------------------
  // Upsert
  // -------------------------------------------------------------------------

  it('15. store() overwrites existing credential (upsert)', () => {
    store.store({ providerName: 'openai', storageMode: 'direct', value: 'sk-original1' });
    store.store({ providerName: 'openai', storageMode: 'direct', value: 'sk-updated22' });

    // Still exactly one row
    expect(rowCount()).toBe(1);

    // Resolved value reflects the latest write
    expect(store.resolve('openai')).toBe('sk-updated22');
  });

  // -------------------------------------------------------------------------
  // Encryption randomness
  // -------------------------------------------------------------------------

  it('16. encrypted data is different for same key (unique IV per encryption)', () => {
    const plaintext = 'sk-samevalue1234';

    const first = store.store({
      providerName: 'provider-a',
      storageMode: 'direct',
      value: plaintext,
    });
    // Remove and re-insert under a different name to force a second encryption
    const second = store.store({
      providerName: 'provider-b',
      storageMode: 'direct',
      value: plaintext,
    });

    // Same plaintext → different ciphertext (unique IV each time)
    expect(first.encryptedValue).not.toBe(second.encryptedValue);
    expect(first.iv).not.toBe(second.iv);
  });
});
