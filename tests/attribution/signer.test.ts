/**
 * Tests for Layer 1 (Visible) + Layer 2 (Cryptographic) Attribution
 */
import { describe, it, expect } from 'vitest';
import { QualixarSigner, QUALIXAR_PLATFORM, QUALIXAR_AUTHOR, QUALIXAR_LICENSE, QUALIXAR_PRODUCT } from '../../src/attribution/signer.js';

describe('QualixarSigner', () => {
  const signer = new QualixarSigner('test-key-for-unit-tests');

  describe('Layer 1: Visible Attribution', () => {
    it('returns correct platform and author', () => {
      const attr = QualixarSigner.getVisibleAttribution();
      expect(attr.platform).toBe('Qualixar');
      expect(attr.author).toBe('Varun Pratap Bhardwaj');
      expect(attr.product).toBe('Qualixar OS');
      expect(attr.license).toBe('MIT');
      expect(attr.authorUrl).toBe('https://varunpratap.com');
      expect(attr.productUrl).toBe('https://qualixar.com');
    });

    it('returns attribution string', () => {
      const str = QualixarSigner.getAttributionString();
      expect(str).toContain('Qualixar');
      expect(str).toContain('Varun Pratap Bhardwaj');
      expect(str).toContain('MIT');
    });
  });

  describe('Layer 2: Cryptographic Signing', () => {
    it('signs content with HMAC-SHA256', () => {
      const attribution = signer.sign('test content');
      expect(attribution.platform).toBe(QUALIXAR_PLATFORM);
      expect(attribution.author).toBe(QUALIXAR_AUTHOR);
      expect(attribution.license).toBe(QUALIXAR_LICENSE);
      expect(attribution.product).toBe(QUALIXAR_PRODUCT);
      expect(attribution.contentHash).toHaveLength(64);
      expect(attribution.signature).toHaveLength(64);
      expect(attribution.timestamp).toBeTruthy();
    });

    it('produces deterministic hashes for same content', () => {
      const a1 = signer.sign('identical');
      const a2 = signer.sign('identical');
      expect(a1.contentHash).toBe(a2.contentHash);
      expect(a1.signature).toBe(a2.signature);
    });

    it('produces different hashes for different content', () => {
      const a1 = signer.sign('content A');
      const a2 = signer.sign('content B');
      expect(a1.contentHash).not.toBe(a2.contentHash);
      expect(a1.signature).not.toBe(a2.signature);
    });

    it('verifies valid signature', () => {
      const content = 'verify me';
      const attr = signer.sign(content);
      expect(signer.verify(content, attr)).toBe(true);
    });

    it('rejects tampered content', () => {
      const attr = signer.sign('original');
      expect(signer.verify('tampered', attr)).toBe(false);
    });

    it('rejects tampered signature', () => {
      const content = 'test';
      const attr = signer.sign(content);
      const tampered = { ...attr, signature: 'deadbeef'.repeat(8) };
      expect(signer.verify(content, tampered)).toBe(false);
    });

    it('different keys produce different signatures', () => {
      const signer2 = new QualixarSigner('different-key');
      const a1 = signer.sign('same content');
      const a2 = signer2.sign('same content');
      expect(a1.contentHash).toBe(a2.contentHash); // Same hash
      expect(a1.signature).not.toBe(a2.signature);  // Different sig
    });

    it('throws on empty key', () => {
      expect(() => new QualixarSigner('')).toThrow();
    });
  });
});
