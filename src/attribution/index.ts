// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- 4-Layer Attribution System
 *
 * Every Qualixar product implements this system for IP protection
 * and provenance tracking:
 *
 * Layer 1 (Visible):        "Part of Qualixar | Author: Varun Pratap Bhardwaj"
 * Layer 2 (Cryptographic):  HMAC-SHA256 signing with QualixarSigner
 * Layer 3 (Steganographic): Zero-width Unicode watermark with QualixarWatermark
 * Layer 4 (Blockchain):     OpenTimestamps .ots proofs with QualixarTimestamp
 *
 * Part of Qualixar | Author: Varun Pratap Bhardwaj
 * License: FSL-1.1-ALv2
 */

export {
  QualixarSigner,
  QUALIXAR_PLATFORM,
  QUALIXAR_AUTHOR,
  QUALIXAR_AUTHOR_URL,
  QUALIXAR_PRODUCT,
  QUALIXAR_PRODUCT_URL,
  QUALIXAR_LICENSE,
  type Attribution,
  type VisibleAttribution,
} from './signer.js';

export {
  QualixarWatermark,
} from './watermark.js';

export {
  QualixarTimestamp,
  type TimestampRecord,
} from './timestamp.js';

/**
 * Sign, watermark, and optionally timestamp content in one call.
 * Returns the full attribution bundle.
 */
export async function attributeContent(
  content: string,
  options?: { readonly blockchain?: boolean },
): Promise<{
  readonly signed: import('./signer.js').Attribution;
  readonly watermarked: string;
  readonly timestamp: import('./timestamp.js').TimestampRecord | null;
}> {
  const { QualixarSigner: Signer } = await import('./signer.js');
  const { QualixarWatermark: Watermark } = await import('./watermark.js');

  const signer = new Signer();
  const watermark = new Watermark();

  const signed = signer.sign(content);
  const watermarked = watermark.embed(content);

  let timestamp = null;
  if (options?.blockchain) {
    const { QualixarTimestamp: Timestamp } = await import('./timestamp.js');
    const ts = new Timestamp();
    timestamp = await ts.stamp(content);
  }

  return { signed, watermarked, timestamp };
}
