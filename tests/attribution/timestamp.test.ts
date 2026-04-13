/**
 * Tests for Layer 4: Blockchain Timestamping
 */
import { describe, it, expect } from 'vitest';
import { QualixarTimestamp } from '../../src/attribution/timestamp.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('QualixarTimestamp', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'qos-ots-'));
  const ts = new QualixarTimestamp(tempDir);

  describe('local manifest', () => {
    it('creates a local manifest with correct fields', () => {
      const record = ts.createLocalManifest('test content for timestamp');
      expect(record.contentHash).toHaveLength(64);
      expect(record.calendarUrl).toBe('local');
      expect(record.status).toBe('submitted');
      expect(record.otsPath).toContain('.manifest.json');
      expect(record.submittedAt).toBeTruthy();
    });

    it('produces deterministic hashes', () => {
      const r1 = ts.createLocalManifest('same content');
      const r2 = ts.createLocalManifest('same content');
      expect(r1.contentHash).toBe(r2.contentHash);
    });

    it('produces different hashes for different content', () => {
      const r1 = ts.createLocalManifest('content A');
      const r2 = ts.createLocalManifest('content B');
      expect(r1.contentHash).not.toBe(r2.contentHash);
    });

    it('hasProof returns false for unknown hash', () => {
      expect(ts.hasProof('0000000000000000000000000000000000000000000000000000000000000000')).toBe(false);
    });

    it('getProofPath returns null for unknown hash', () => {
      expect(ts.getProofPath('nonexistent')).toBeNull();
    });
  });

  describe('blockchain stamp', () => {
    it('handles network failure gracefully', async () => {
      // This will try to connect to the OTS calendar — may fail in test env
      const record = await ts.stamp('blockchain test');
      expect(record.contentHash).toHaveLength(64);
      // Either 'pending' (calendar reachable) or 'error' (offline)
      expect(['pending', 'error']).toContain(record.status);
    });
  });
});
