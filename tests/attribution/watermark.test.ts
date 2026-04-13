/**
 * Tests for Layer 3: Steganographic Watermarking
 */
import { describe, it, expect } from 'vitest';
import { QualixarWatermark } from '../../src/attribution/watermark.js';

describe('QualixarWatermark', () => {
  const wm = new QualixarWatermark('qualixar-os');

  it('embeds watermark invisibly', () => {
    const original = 'Hello world';
    const watermarked = wm.embed(original);
    expect(watermarked).not.toBe(original);
    // Visually identical — same visible characters
    expect(wm.strip(watermarked)).toBe(original);
  });

  it('detects embedded watermark', () => {
    const watermarked = wm.embed('Test content');
    expect(wm.detect(watermarked)).toBe(true);
  });

  it('extracts the correct key', () => {
    const watermarked = wm.embed('Some text');
    expect(wm.extract(watermarked)).toBe('qualixar-os');
  });

  it('returns false for unwatermarked text', () => {
    expect(wm.detect('Clean text')).toBe(false);
  });

  it('returns null for unwatermarked text extraction', () => {
    expect(wm.extract('Clean text')).toBeNull();
  });

  it('strips all zero-width characters', () => {
    const watermarked = wm.embed('Clean me');
    const stripped = wm.strip(watermarked);
    expect(stripped).toBe('Clean me');
    // No zero-width chars remain
    expect(stripped).not.toContain('\u200B');
    expect(stripped).not.toContain('\u200C');
    expect(stripped).not.toContain('\u200D');
    expect(stripped).not.toContain('\uFEFF');
  });

  it('handles empty string', () => {
    expect(wm.embed('')).toBe('');
    expect(wm.detect('')).toBe(false);
  });

  it('different keys produce different watermarks', () => {
    const wm2 = new QualixarWatermark('different-key');
    const w1 = wm.embed('test');
    const w2 = wm2.embed('test');
    expect(w1).not.toBe(w2);
    expect(wm.detect(w2)).toBe(false);
    expect(wm2.detect(w1)).toBe(false);
  });

  it('preserves long text', () => {
    const longText = 'A'.repeat(10000);
    const watermarked = wm.embed(longText);
    expect(wm.strip(watermarked)).toBe(longText);
    expect(wm.detect(watermarked)).toBe(true);
  });

  it('throws on empty key', () => {
    expect(() => new QualixarWatermark('')).toThrow();
  });
});
