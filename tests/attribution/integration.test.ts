/**
 * Integration test: All 4 layers together
 */
import { describe, it, expect } from 'vitest';
import { QualixarSigner } from '../../src/attribution/signer.js';
import { QualixarWatermark } from '../../src/attribution/watermark.js';
import { QualixarTimestamp } from '../../src/attribution/timestamp.js';
import { attributeContent } from '../../src/attribution/index.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('4-Layer Attribution Integration', () => {
  it('all 4 layers work together on the same content', () => {
    const content = 'Qualixar OS is the Universal OS for AI Agents.';

    // Layer 1: Visible
    const visible = QualixarSigner.getVisibleAttribution();
    expect(visible.platform).toBe('Qualixar');
    expect(visible.author).toBe('Varun Pratap Bhardwaj');

    // Layer 2: Cryptographic
    const signer = new QualixarSigner('integration-test-key');
    const signed = signer.sign(content);
    expect(signer.verify(content, signed)).toBe(true);

    // Layer 3: Steganographic
    const wm = new QualixarWatermark();
    const watermarked = wm.embed(content);
    expect(wm.detect(watermarked)).toBe(true);
    expect(wm.strip(watermarked)).toBe(content);

    // Layer 4: Blockchain (local manifest)
    const tempDir = mkdtempSync(join(tmpdir(), 'qos-integ-'));
    const ts = new QualixarTimestamp(tempDir);
    const record = ts.createLocalManifest(content);
    expect(record.contentHash).toBe(signed.contentHash);
  });

  it('attributeContent convenience function works', async () => {
    const content = 'Test attribution pipeline';
    const result = await attributeContent(content, { blockchain: false });

    expect(result.signed.platform).toBe('Qualixar');
    expect(result.signed.contentHash).toHaveLength(64);
    expect(result.watermarked).not.toBe(content);
    expect(result.timestamp).toBeNull(); // blockchain=false
  });

  it('signed watermarked content is still verifiable', () => {
    const content = 'Verify after watermark';
    const signer = new QualixarSigner('verify-test');
    const wm = new QualixarWatermark();

    // Sign original, then watermark
    const signed = signer.sign(content);
    const watermarked = wm.embed(content);

    // Verify against ORIGINAL (not watermarked) — signing is on clean content
    expect(signer.verify(content, signed)).toBe(true);
    // Watermark is on the visible text
    expect(wm.detect(watermarked)).toBe(true);
    // Strip watermark to get back original
    expect(wm.strip(watermarked)).toBe(content);
    // Verify stripped content matches signed content
    expect(signer.verify(wm.strip(watermarked), signed)).toBe(true);
  });
});
