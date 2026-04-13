/**
 * Tests for Qualixar OS Text Analyze Tool
 *
 * Tests word count, sentence count, Flesch-Kincaid grade level,
 * key phrase extraction, and error handling.
 */

import { describe, it, expect } from 'vitest';
import { textAnalyze } from '../../src/tools/text-tool.js';

describe('textAnalyze', () => {
  // -------------------------------------------------------------------------
  // Input Validation
  // -------------------------------------------------------------------------

  it('returns error when text is missing', async () => {
    const result = await textAnalyze({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('text is required');
  });

  it('returns error when text is not a string', async () => {
    const result = await textAnalyze({ text: 42 });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('text is required');
  });

  // -------------------------------------------------------------------------
  // Default Analyses (word_count, sentence_count, reading_level)
  // -------------------------------------------------------------------------

  it('returns default analyses for simple text', async () => {
    const result = await textAnalyze({
      text: 'The quick brown fox jumps over the lazy dog.',
    });
    const parsed = JSON.parse(result.content);

    expect(parsed.word_count).toBe(9);
    expect(parsed.sentence_count).toBe(1);
    expect(parsed.reading_level).toBeDefined();
    expect(typeof parsed.reading_level.flesch_kincaid_grade).toBe('number');
  });

  it('counts multiple sentences correctly', async () => {
    const result = await textAnalyze({
      text: 'First sentence. Second sentence! Third sentence?',
    });
    const parsed = JSON.parse(result.content);

    expect(parsed.sentence_count).toBe(3);
    expect(parsed.word_count).toBe(6);
  });

  // -------------------------------------------------------------------------
  // Specific Analyses
  // -------------------------------------------------------------------------

  it('returns only requested analyses', async () => {
    const result = await textAnalyze({
      text: 'Hello world.',
      analyses: ['word_count', 'char_count'],
    });
    const parsed = JSON.parse(result.content);

    expect(parsed.word_count).toBe(2);
    expect(parsed.char_count).toBe(12);
    expect(parsed.sentence_count).toBeUndefined();
    expect(parsed.reading_level).toBeUndefined();
  });

  it('extracts key phrases from repeated words', async () => {
    const text = 'machine learning is great. machine learning models improve. machine learning research advances.';
    const result = await textAnalyze({
      text,
      analyses: ['key_phrases'],
    });
    const parsed = JSON.parse(result.content);

    expect(parsed.key_phrases).toBeDefined();
    expect(Array.isArray(parsed.key_phrases)).toBe(true);
    // "machine" and "learning" appear 3 times each
    expect(parsed.key_phrases.some((p: string) => p.includes('machine'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Edge Cases
  // -------------------------------------------------------------------------

  it('handles empty text gracefully', async () => {
    const result = await textAnalyze({ text: '   ' });
    const parsed = JSON.parse(result.content);

    expect(parsed.word_count).toBe(0);
    expect(parsed.sentence_count).toBe(0);
  });

  it('handles unknown analysis key', async () => {
    const result = await textAnalyze({
      text: 'test',
      analyses: ['word_count', 'unknown_analysis'],
    });
    const parsed = JSON.parse(result.content);

    expect(parsed.word_count).toBe(1);
    expect(parsed.unknown_analysis).toContain('unknown analysis');
  });

  it('computes reading level for complex text', async () => {
    const text =
      'The unprecedented proliferation of sophisticated artificial intelligence ' +
      'systems has fundamentally transformed contemporary computational paradigms. ' +
      'Researchers investigate multifaceted implications of autonomous decision-making.';
    const result = await textAnalyze({ text });
    const parsed = JSON.parse(result.content);

    // Complex text should have a high grade level (> 10)
    expect(parsed.reading_level.flesch_kincaid_grade).toBeGreaterThan(10);
  });
});
