// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- Enterprise Credential Vault
 *
 * AES-256-GCM encryption with PBKDF2-SHA512 key derivation (210K iterations).
 * Supports session unlock (cached derived key), key rotation, and an adapter
 * method that falls through: env var → vault → config fallback.
 *
 * HR-1: All DB operations via parameterized prepared statements.
 * HR-2: Master key never stored — only in memory when unlocked.
 * HR-3: iv + salt are random per encryption operation.
 */

import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import type { QosDatabase } from '../db/database.js';
import type {
  EnterpriseVault,
  VaultStoreInput,
  VaultRetrieveInput,
  KeyRotationRequest,
  KeyRotationResult,
  EncryptedCredential,
} from '../types/phase22.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 210_000;
const KEY_LENGTH = 32; // 256-bit
const DIGEST = 'sha512';
const SALT_LENGTH = 32;
const IV_LENGTH = 12; // 96-bit, GCM standard
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DbCredRow {
  id: string;
  provider_id: string;
  encrypted_data: string;
  iv: string;
  auth_tag: string;
  algorithm: string;
  key_derivation: string;
  created_at: string;
  updated_at: string;
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST);
}

function encryptData(plaintext: string, key: Buffer): { iv: string; authTag: string; encryptedData: string } {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encryptedData: encrypted.toString('hex'),
  };
}

function decryptData(
  encryptedHex: string,
  ivHex: string,
  authTagHex: string,
  key: Buffer,
): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function newId(): string {
  return `cred_${randomBytes(12).toString('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class EnterpriseVaultImpl implements EnterpriseVault {
  private readonly _db: QosDatabase;
  private _unlockedKey: Buffer | null = null;
  private _unlockedSalt: Buffer | null = null;
  // Passphrase kept in memory while vault is unlocked so get() can derive
  // per-credential keys (each credential has its own salt). Cleared on lock().
  private _unlockedPassphrase: string | null = null;

  constructor(db: QosDatabase) {
    this._db = db;
  }

  async store(input: VaultStoreInput): Promise<void> {
    const salt = randomBytes(SALT_LENGTH);
    const key = deriveKey(input.passphrase, salt);
    const { iv, authTag, encryptedData } = encryptData(input.plaintext, key);

    // Salt is prepended to encrypted_data as hex (first 64 hex chars = 32 bytes)
    const payload = salt.toString('hex') + ':' + encryptedData;
    const now = nowIso();
    const existing = this._db.get<DbCredRow>(
      'SELECT id FROM credentials_encrypted WHERE provider_id = ?',
      [input.providerId],
    );

    if (existing) {
      this._db.update(
        'credentials_encrypted',
        { encrypted_data: payload, iv, auth_tag: authTag, updated_at: now },
        { provider_id: input.providerId },
      );
    } else {
      this._db.insert('credentials_encrypted', {
        id: newId(),
        provider_id: input.providerId,
        encrypted_data: payload,
        iv,
        auth_tag: authTag,
        algorithm: ALGORITHM,
        key_derivation: 'pbkdf2-sha512',
        created_at: now,
        updated_at: now,
      });
    }
  }

  async retrieve(input: VaultRetrieveInput): Promise<string> {
    const row = this._db.get<DbCredRow>(
      'SELECT * FROM credentials_encrypted WHERE provider_id = ?',
      [input.providerId],
    );
    if (!row) {
      throw new Error(`Credential not found for provider: ${input.providerId}`);
    }
    const [saltHex, encryptedData] = row.encrypted_data.split(':');
    if (!saltHex || !encryptedData) {
      throw new Error('Malformed credential payload');
    }
    const salt = Buffer.from(saltHex, 'hex');
    const key = deriveKey(input.passphrase, salt);
    return decryptData(encryptedData, row.iv, row.auth_tag, key);
  }

  async rotateKeys(req: KeyRotationRequest): Promise<KeyRotationResult> {
    const rows = this._db.query<DbCredRow>('SELECT * FROM credentials_encrypted', []);
    let rotated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const [saltHex, encryptedData] = row.encrypted_data.split(':');
        if (!saltHex || !encryptedData) {
          throw new Error('Malformed payload');
        }
        const oldSalt = Buffer.from(saltHex, 'hex');
        const oldKey = deriveKey(req.oldPassphrase, oldSalt);
        const plaintext = decryptData(encryptedData, row.iv, row.auth_tag, oldKey);

        const newSalt = randomBytes(SALT_LENGTH);
        const newKey = deriveKey(req.newPassphrase, newSalt);
        const { iv, authTag, encryptedData: newCiphertext } = encryptData(plaintext, newKey);
        const newPayload = newSalt.toString('hex') + ':' + newCiphertext;

        this._db.update(
          'credentials_encrypted',
          { encrypted_data: newPayload, iv, auth_tag: authTag, updated_at: nowIso() },
          { id: row.id },
        );
        rotated++;
      } catch (err) {
        failed++;
        errors.push(`${row.provider_id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (this._unlockedKey !== null) {
      // Refresh in-memory session key with new passphrase
      if (this._unlockedSalt) {
        this._unlockedKey = deriveKey(req.newPassphrase, this._unlockedSalt);
      }
    }

    return { rotated, failed, errors };
  }

  unlock(passphrase: string): void {
    const salt = randomBytes(SALT_LENGTH);
    this._unlockedSalt = salt;
    this._unlockedKey = deriveKey(passphrase, salt);
    // Store passphrase so get() can derive per-credential keys (each credential
    // has its own salt stored alongside the ciphertext). Cleared on lock().
    this._unlockedPassphrase = passphrase;
  }

  lock(): void {
    this._unlockedKey = null;
    this._unlockedSalt = null;
    this._unlockedPassphrase = null;
  }

  isUnlocked(): boolean {
    return this._unlockedKey !== null;
  }

  async get(key: string, configFallback?: string): Promise<string | undefined> {
    // 1. Environment variable
    const envVal = process.env[key];
    if (envVal) {
      return envVal;
    }

    // 2. Vault (only if unlocked with passphrase and credential exists)
    if (this._unlockedPassphrase) {
      const row = this._db.get<DbCredRow>(
        'SELECT * FROM credentials_encrypted WHERE provider_id = ?',
        [key],
      );
      if (row) {
        try {
          const [saltHex, encryptedData] = row.encrypted_data.split(':');
          if (saltHex && encryptedData) {
            // Each credential has its own salt — derive a per-credential key
            const salt = Buffer.from(saltHex, 'hex');
            const credKey = deriveKey(this._unlockedPassphrase, salt);
            return decryptData(encryptedData, row.iv, row.auth_tag, credKey);
          }
        } catch {
          // Decryption failed (wrong passphrase or corrupt data) — fall through
        }
      }
    }

    // 3. Config fallback
    return configFallback;
  }

  credentialCount(): number {
    const row = this._db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM credentials_encrypted',
      [],
    );
    return row?.count ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEnterpriseVault(db: QosDatabase): EnterpriseVault {
  return new EnterpriseVaultImpl(db);
}

export type { EnterpriseVault, EncryptedCredential };
