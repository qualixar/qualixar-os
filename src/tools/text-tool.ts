// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Text Analyze Tool
 *
 * Analyze text content: word count, sentence count, reading level
 * (Flesch-Kincaid), and key phrase extraction. Zero external deps.
 */

import type { ToolResult } from './tool-registry.js';

// ---------------------------------------------------------------------------
// Analysis Functions
// ---------------------------------------------------------------------------

/** Split text into words (non-empty tokens). */
function getWords(text: string): readonly string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Split text into sentences using punctuation boundaries. */
function getSentences(text: string): readonly string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Count syllables in an English word (heuristic). */
function countSyllables(word: string): number {
  const lower = word.toLowerCase().replace(/[^a-z]/g, '');
  if (lower.length <= 3) return 1;

  let count = 0;
  let prevVowel = false;
  for (const ch of lower) {
    const isVowel = 'aeiouy'.includes(ch);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }

  // Trailing silent 'e' adjustment
  if (lower.endsWith('e') && count > 1) count--;
  return Math.max(1, count);
}

/**
 * Flesch-Kincaid Grade Level.
 * FK = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 */
function fleschKincaidGrade(words: readonly string[], sentences: readonly string[]): number {
  if (words.length === 0 || sentences.length === 0) return 0;
  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade =
    0.39 * (words.length / sentences.length) +
    11.8 * (totalSyllables / words.length) -
    15.59;
  return Math.round(grade * 10) / 10;
}

/** Extract top-frequency n-grams (unigrams and bigrams). */
function extractKeyPhrases(words: readonly string[], topN = 10): readonly string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'it', 'its', 'this', 'that', 'these', 'those', 'i', 'we', 'you',
    'he', 'she', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
  ]);

  const freq = new Map<string, number>();
  const lower = words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Unigrams
  for (const w of lower) {
    if (w.length > 2 && !stopWords.has(w)) {
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }

  // Bigrams
  for (let i = 0; i < lower.length - 1; i++) {
    if (stopWords.has(lower[i]) || stopWords.has(lower[i + 1])) continue;
    if (lower[i].length < 2 || lower[i + 1].length < 2) continue;
    const bigram = `${lower[i]} ${lower[i + 1]}`;
    freq.set(bigram, (freq.get(bigram) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase]) => phrase);
}

// ---------------------------------------------------------------------------
// Supported Analyses
// ---------------------------------------------------------------------------

type AnalysisKey = 'word_count' | 'sentence_count' | 'reading_level' | 'key_phrases' | 'char_count';

const DEFAULT_ANALYSES: readonly AnalysisKey[] = ['word_count', 'sentence_count', 'reading_level'];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function textAnalyze(
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const text = input.text as string | undefined;
  if (!text || typeof text !== 'string') {
    return { content: 'Error: text is required and must be a string', isError: true };
  }

  const rawAnalyses = input.analyses as string[] | undefined;
  const analyses: readonly AnalysisKey[] =
    Array.isArray(rawAnalyses) && rawAnalyses.length > 0
      ? (rawAnalyses as AnalysisKey[])
      : DEFAULT_ANALYSES;

  const words = getWords(text);
  const sentences = getSentences(text);
  const result: Record<string, unknown> = {};

  for (const key of analyses) {
    switch (key) {
      case 'word_count':
        result.word_count = words.length;
        break;
      case 'sentence_count':
        result.sentence_count = sentences.length;
        break;
      case 'reading_level': {
        const grade = fleschKincaidGrade(words, sentences);
        result.reading_level = { flesch_kincaid_grade: grade };
        break;
      }
      case 'key_phrases':
        result.key_phrases = extractKeyPhrases(words);
        break;
      case 'char_count':
        result.char_count = text.length;
        break;
      default:
        result[key] = `unknown analysis: ${key}`;
    }
  }

  return { content: JSON.stringify(result, null, 2) };
}
