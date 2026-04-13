// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Credential Manager
 * LLD Section 3.4, Algorithms 8.2 + 8.3
 *
 * AES-256-GCM encrypted credential storage with machine-bound key derivation.
 * HR-11: API keys NEVER appear in config.yaml.
 * HR-12: API keys NEVER appear in API responses.
 * HR-14: Decrypted keys NEVER stored in global/module-level variables.
 * HR-15: All DB operations use parameterized queries.
 */

import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import { getMachineId, deriveEncryptionKey } from './key-derivation.js';
import type {
  CredentialStore,
  CredentialInput,
  StoredCredential,
  CredentialRef,
} from '../types/phase18.js';

// ---------------------------------------------------------------------------
// DB row shape (snake_case, matches DDL)
// ---------------------------------------------------------------------------

interface CredentialRow {
  readonly id: string;
  readonly provider_name: string;
  readonly storage_mode: 'direct' | 'env_ref';
  readonly encrypted_value: string;
  readonly iv: string | null;
  readonly auth_tag: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCredentialManager(
  db: BetterSqlite3.Database,
): CredentialStore {
  return new CredentialManagerImpl(db);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class CredentialManagerImpl implements CredentialStore {
  private readonly _db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this._db = db;
  }

  store(input: CredentialInput): StoredCredential {
    const { providerName, storageMode, value } = input;

    if (!value || value.length === 0) {
      throw new Error('Credential value must be non-empty');
    }

    if (storageMode === 'direct' && value.length < 8) {
      throw new Error('API key must be at least 8 characters');
    }

    if (storageMode === 'env_ref' && !/^[A-Z][A-Z0-9_]*$/.test(value)) {
      throw new Error('Environment variable name must match /^[A-Z][A-Z0-9_]*$/');
    }

    const id = `cred_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();

    if (storageMode === 'direct') {
      const machineId = getMachineId(this._db);
      const key = deriveEncryptionKey(machineId);
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      // UPSERT: INSERT OR REPLACE (LLD E-11 fix — no 409, overwrites)
      this._db
        .prepare(
          `INSERT OR REPLACE INTO credentials
           (id, provider_name, storage_mode, encrypted_value, iv, auth_tag, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          providerName,
          'direct',
          encrypted.toString('base64'),
          iv.toString('base64'),
          authTag.toString('base64'),
          now,
          now,
        );

      return {
        id,
        providerName,
        storageMode: 'direct',
        encryptedValue: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        createdAt: now,
        updatedAt: now,
      };
    }

    // env_ref mode: store env var name directly
    this._db
      .prepare(
        `INSERT OR REPLACE INTO credentials
         (id, provider_name, storage_mode, encrypted_value, iv, auth_tag, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, providerName, 'env_ref', value, null, null, now, now);

    return {
      id,
      providerName,
      storageMode: 'env_ref',
      encryptedValue: value,
      iv: null,
      authTag: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  resolve(providerName: string): string | undefined {
    const row = this._db
      .prepare('SELECT * FROM credentials WHERE provider_name = ?')
      .get(providerName) as CredentialRow | undefined;

    if (!row) {
      return undefined;
    }

    if (row.storage_mode === 'env_ref') {
      return process.env[row.encrypted_value];
    }

    // Direct mode — decrypt
    try {
      const machineId = getMachineId(this._db);
      const key = deriveEncryptionKey(machineId);
      const iv = Buffer.from(row.iv!, 'base64');
      const authTag = Buffer.from(row.auth_tag!, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(row.encrypted_value, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      return undefined;
    }
  }

  list(): readonly CredentialRef[] {
    const rows = this._db
      .prepare('SELECT * FROM credentials ORDER BY provider_name')
      .all() as CredentialRow[];

    return rows.map((row) => ({
      id: row.id,
      providerName: row.provider_name,
      storageMode: row.storage_mode,
      displayValue: row.storage_mode === 'env_ref' ? row.encrypted_value : '[encrypted]',
      isSet: true,
      createdAt: row.created_at,
    }));
  }

  remove(providerName: string): boolean {
    const result = this._db
      .prepare('DELETE FROM credentials WHERE provider_name = ?')
      .run(providerName);
    return result.changes > 0;
  }

  has(providerName: string): boolean {
    const row = this._db
      .prepare('SELECT 1 FROM credentials WHERE provider_name = ?')
      .get(providerName);
    return row !== undefined;
  }
}
