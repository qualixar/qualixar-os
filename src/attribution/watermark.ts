// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Layer 3: Steganographic Watermarking
 *
 * Embeds invisible zero-width Unicode characters into text to prove
 * provenance. The watermark is undetectable to end users but can be
 * extracted programmatically.
 *
 * Encoding:
 * 1. Key string → binary (each char → 8 bits)
 * 2. 0 → U+200B (zero-width space), 1 → U+200C (zero-width non-joiner)
 * 3. Framed with: start=U+FEFF (BOM), end=U+200D (zero-width joiner)
 * 4. Inserted after first visible character
 *
 * Port of SLM's attribution/watermark.py to TypeScript.
 *
 * Part of Qualixar | Author: Varun Pratap Bhardwaj
 * License: FSL-1.1-ALv2
 */

// ---------------------------------------------------------------------------
// Zero-width Character Constants
// ---------------------------------------------------------------------------

const BIT_ZERO = '\u200B';     // Zero-width space
const BIT_ONE = '\u200C';      // Zero-width non-joiner
const END_MARKER = '\u200D';   // Zero-width joiner
const START_MARKER = '\uFEFF'; // Byte-order mark

const ALL_ZW = new Set([BIT_ZERO, BIT_ONE, END_MARKER, START_MARKER]);

// ---------------------------------------------------------------------------
// QualixarWatermark
// ---------------------------------------------------------------------------

export class QualixarWatermark {
  private readonly _key: string;
  private readonly _encoded: string;

  constructor(key = 'qualixar-os') {
    if (!key) throw new Error('key must be non-empty');
    this._key = key;
    this._encoded = QualixarWatermark._encodeKey(key);
  }

  /**
   * Embed an invisible watermark into text.
   * The returned string is visually identical to the original.
   */
  embed(text: string): string {
    if (!text) return text;
    return text[0] + this._encoded + text.slice(1);
  }

  /**
   * Check whether text contains a valid watermark for this key.
   */
  detect(text: string): boolean {
    return this.extract(text) === this._key;
  }

  /**
   * Extract the watermark payload from text.
   * Returns null if no watermark is found.
   */
  extract(text: string): string | null {
    const startIdx = text.indexOf(START_MARKER);
    if (startIdx === -1) return null;

    const endIdx = text.indexOf(END_MARKER, startIdx + 1);
    if (endIdx === -1) return null;

    const payload = text.slice(startIdx + 1, endIdx);
    return QualixarWatermark._decodePayload(payload);
  }

  /**
   * Remove all zero-width characters, returning clean text.
   */
  strip(text: string): string {
    return [...text].filter((ch) => !ALL_ZW.has(ch)).join('');
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private static _encodeKey(key: string): string {
    const bits: string[] = [];
    for (const char of key) {
      const byteVal = char.charCodeAt(0);
      for (let bitPos = 7; bitPos >= 0; bitPos--) {
        bits.push((byteVal >> bitPos) & 1 ? BIT_ONE : BIT_ZERO);
      }
    }
    return START_MARKER + bits.join('') + END_MARKER;
  }

  private static _decodePayload(payload: string): string | null {
    if (payload.length % 8 !== 0) return null;

    const chars: string[] = [];
    for (let i = 0; i < payload.length; i += 8) {
      let byteVal = 0;
      for (let j = 0; j < 8; j++) {
        byteVal <<= 1;
        const bitChar = payload[i + j];
        if (bitChar === BIT_ONE) byteVal |= 1;
        else if (bitChar === BIT_ZERO) { /* 0 */ }
        else return null;
      }
      chars.push(String.fromCharCode(byteVal));
    }
    return chars.join('');
  }
}
