// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Layer 2: Cryptographic Signing (HMAC-SHA256)
 *
 * Signs content with HMAC-SHA256 for tamper-proof attribution.
 * Every piece of content (task outputs, artifacts, configs) carries
 * a verifiable proof of origin.
 *
 * Port of SLM's attribution/signer.py to TypeScript.
 *
 * Part of Qualixar | Author: Varun Pratap Bhardwaj
 * License: FSL-1.1-ALv2
 */

import { createHmac, createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Branding Constants (single source of truth)
// ---------------------------------------------------------------------------

export const QUALIXAR_PLATFORM = 'Qualixar';
export const QUALIXAR_AUTHOR = 'Varun Pratap Bhardwaj';
export const QUALIXAR_AUTHOR_URL = 'https://varunpratap.com';
export const QUALIXAR_PRODUCT = 'Qualixar OS';
export const QUALIXAR_PRODUCT_URL = 'https://qualixar.com';
export const QUALIXAR_LICENSE = 'MIT';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Attribution {
  readonly platform: string;
  readonly product: string;
  readonly author: string;
  readonly license: string;
  readonly contentHash: string;
  readonly signature: string;
  readonly timestamp: string;
}

export interface VisibleAttribution {
  readonly platform: string;
  readonly product: string;
  readonly author: string;
  readonly authorUrl: string;
  readonly productUrl: string;
  readonly license: string;
}

// ---------------------------------------------------------------------------
// Key Management
// ---------------------------------------------------------------------------

function getOrCreateKey(): string {
  // 1. Environment variable (highest priority)
  const envKey = process.env.QOS_SIGNER_KEY;
  if (envKey) return envKey;

  // 2. Persisted key file
  const keyDir = join(homedir(), '.qualixar-os');
  const keyPath = join(keyDir, '.signer_key');

  try {
    return readFileSync(keyPath, 'utf-8').trim();
  } catch {
    // Generate new key
    const key = randomBytes(32).toString('hex');
    mkdirSync(keyDir, { recursive: true });
    writeFileSync(keyPath, key, { mode: 0o600 });
    try { chmodSync(keyPath, 0o600); } catch { /* Windows */ }
    return key;
  }
}

// ---------------------------------------------------------------------------
// QualixarSigner
// ---------------------------------------------------------------------------

export class QualixarSigner {
  private readonly _key: Buffer;

  constructor(secretKey?: string) {
    const key = secretKey ?? getOrCreateKey();
    if (!key) throw new Error('secret key must be non-empty');
    this._key = Buffer.from(key, 'utf-8');
  }

  /**
   * Sign content and return attribution metadata.
   */
  sign(content: string): Attribution {
    const contentBytes = Buffer.from(content, 'utf-8');
    const contentHash = createHash('sha256').update(contentBytes).digest('hex');
    const signature = createHmac('sha256', this._key).update(contentBytes).digest('hex');
    const timestamp = new Date().toISOString();

    return {
      platform: QUALIXAR_PLATFORM,
      product: QUALIXAR_PRODUCT,
      author: QUALIXAR_AUTHOR,
      license: QUALIXAR_LICENSE,
      contentHash,
      signature,
      timestamp,
    };
  }

  /**
   * Verify that content matches its attribution signature.
   */
  verify(content: string, attribution: Attribution): boolean {
    const contentBytes = Buffer.from(content, 'utf-8');

    // 1. Verify content hash
    const expectedHash = createHash('sha256').update(contentBytes).digest('hex');
    if (expectedHash !== attribution.contentHash) return false;

    // 2. Verify HMAC signature
    const expectedSig = createHmac('sha256', this._key).update(contentBytes).digest('hex');
    if (expectedSig !== attribution.signature) return false;

    return true;
  }

  /**
   * Layer 1: Get visible attribution (no signing needed).
   */
  static getVisibleAttribution(): VisibleAttribution {
    return {
      platform: QUALIXAR_PLATFORM,
      product: QUALIXAR_PRODUCT,
      author: QUALIXAR_AUTHOR,
      authorUrl: QUALIXAR_AUTHOR_URL,
      productUrl: QUALIXAR_PRODUCT_URL,
      license: QUALIXAR_LICENSE,
    };
  }

  /**
   * Layer 1: Get attribution string for embedding in outputs.
   */
  static getAttributionString(): string {
    return `Part of ${QUALIXAR_PLATFORM} | ${QUALIXAR_PRODUCT} | Author: ${QUALIXAR_AUTHOR} | License: ${QUALIXAR_LICENSE}`;
  }
}
