// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Layer 4: Blockchain Timestamping (OpenTimestamps)
 *
 * Creates .ots (OpenTimestamps) manifests that prove a content hash
 * existed at a specific point in time on the Bitcoin blockchain.
 *
 * OpenTimestamps is free, decentralized, and doesn't require a wallet.
 * It works by submitting SHA-256 hashes to calendar servers which
 * batch them into Bitcoin transactions.
 *
 * This module generates .ots files that can be independently verified
 * by anyone using the OpenTimestamps client.
 *
 * Part of Qualixar | Author: Varun Pratap Bhardwaj
 * License: FSL-1.1-ALv2
 */

import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimestampRecord {
  readonly contentHash: string;
  readonly otsPath: string | null;
  readonly calendarUrl: string;
  readonly submittedAt: string;
  readonly status: 'submitted' | 'pending' | 'confirmed' | 'error';
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// OpenTimestamps Client
// ---------------------------------------------------------------------------

const OTS_CALENDAR = 'https://a.pool.opentimestamps.org';
const OTS_DIR_NAME = '.ots-proofs';

export class QualixarTimestamp {
  private readonly _otsDir: string;

  constructor(baseDir?: string) {
    this._otsDir = baseDir ?? join(homedir(), '.qualixar-os', OTS_DIR_NAME);
    mkdirSync(this._otsDir, { recursive: true });
  }

  /**
   * Submit a content hash to the OpenTimestamps calendar server.
   * Returns a timestamp record. The .ots proof file is saved locally.
   *
   * The proof starts as "pending" and becomes "confirmed" once
   * the Bitcoin blockchain includes it (typically 1-24 hours).
   */
  async stamp(content: string): Promise<TimestampRecord> {
    const contentHash = createHash('sha256')
      .update(Buffer.from(content, 'utf-8'))
      .digest('hex');

    const otsPath = join(this._otsDir, `${contentHash}.ots`);
    const submittedAt = new Date().toISOString();

    try {
      // Submit hash to OpenTimestamps calendar
      const hashBytes = Buffer.from(contentHash, 'hex');
      const res = await fetch(`${OTS_CALENDAR}/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: hashBytes,
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return {
          contentHash, otsPath: null, calendarUrl: OTS_CALENDAR,
          submittedAt, status: 'error',
          error: `Calendar returned ${res.status}`,
        };
      }

      // Save the .ots proof file
      const otsData = Buffer.from(await res.arrayBuffer());
      writeFileSync(otsPath, otsData);

      return {
        contentHash, otsPath, calendarUrl: OTS_CALENDAR,
        submittedAt, status: 'pending',
      };
    } catch (err) {
      return {
        contentHash, otsPath: null, calendarUrl: OTS_CALENDAR,
        submittedAt, status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check if an .ots proof exists for a content hash.
   */
  hasProof(contentHash: string): boolean {
    return existsSync(join(this._otsDir, `${contentHash}.ots`));
  }

  /**
   * Get the path to an .ots proof file.
   */
  getProofPath(contentHash: string): string | null {
    const path = join(this._otsDir, `${contentHash}.ots`);
    return existsSync(path) ? path : null;
  }

  /**
   * Create a local timestamp manifest (JSON) without blockchain submission.
   * Useful as fallback when offline or calendar is unreachable.
   */
  createLocalManifest(content: string): TimestampRecord {
    const contentHash = createHash('sha256')
      .update(Buffer.from(content, 'utf-8'))
      .digest('hex');

    const manifest = {
      version: 1,
      contentHash,
      algorithm: 'sha256',
      timestamp: new Date().toISOString(),
      product: 'Qualixar OS',
      author: 'Varun Pratap Bhardwaj',
    };

    const manifestPath = join(this._otsDir, `${contentHash}.manifest.json`);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return {
      contentHash,
      otsPath: manifestPath,
      calendarUrl: 'local',
      submittedAt: manifest.timestamp,
      status: 'submitted',
    };
  }
}
