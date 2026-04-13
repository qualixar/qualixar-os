import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { hostname } from 'node:os';
import { deriveEncryptionKey, getMachineId } from '../../src/credentials/key-derivation.js';

const CREATE_INSTALL_META = `
  CREATE TABLE IF NOT EXISTS install_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

describe('deriveEncryptionKey', () => {
  it('returns a 32-byte Buffer', () => {
    const key = deriveEncryptionKey('test-machine:some-uuid');
    expect(key).toBeInstanceOf(Buffer);
    expect(key.byteLength).toBe(32);
  });

  it('is deterministic — same input produces same key', () => {
    const machineId = 'my-host:aaaabbbb-cccc-dddd-eeee-ffffffffffff';
    const key1 = deriveEncryptionKey(machineId);
    const key2 = deriveEncryptionKey(machineId);
    expect(key1.equals(key2)).toBe(true);
  });

  it('produces different keys for different machineIds', () => {
    const key1 = deriveEncryptionKey('host-a:uuid-0001');
    const key2 = deriveEncryptionKey('host-b:uuid-0002');
    expect(key1.equals(key2)).toBe(false);
  });

  it('throws if machineId is empty', () => {
    expect(() => deriveEncryptionKey('')).toThrow('machineId must be a non-empty string');
  });

  it('salt derivation is deterministic — SHA-256 of machineId', () => {
    const machineId = 'verify-salt:uuid-1234';
    const expectedSalt = createHash('sha256').update(machineId).digest();
    const expected = pbkdf2Sync(machineId, expectedSalt, 210_000, 32, 'sha512');
    const actual = deriveEncryptionKey(machineId);
    expect(actual.equals(expected)).toBe(true);
  });
});

describe('getMachineId', () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(CREATE_INSTALL_META);
  });

  it('returns a string in hostname:uuid format', () => {
    const machineId = getMachineId(db);
    const host = hostname();
    expect(machineId.startsWith(`${host}:`)).toBe(true);
    const uuid = machineId.slice(host.length + 1);
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('creates an install UUID on first call and persists it in install_meta', () => {
    getMachineId(db);
    const row = db
      .prepare('SELECT value FROM install_meta WHERE key = ?')
      .get('install_uuid') as { value: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns the same UUID on subsequent calls', () => {
    const first = getMachineId(db);
    const second = getMachineId(db);
    expect(first).toBe(second);
  });
});
