/**
 * Qualixar OS Session 15 -- Streaming Tests (M-03)
 *
 * Dedicated test file for the streaming module.
 * The real streaming implementation is v8-ignored (requires SDK connections),
 * so this tests the factory and interface contracts.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createStreamingModelCall,
  StreamingModelCallImpl,
} from '../../src/router/streaming.js';

describe('StreamingModelCall', () => {
  it('module exports createStreamingModelCall factory', () => {
    expect(typeof createStreamingModelCall).toBe('function');
  });

  it('module exports StreamingModelCallImpl class', () => {
    expect(StreamingModelCallImpl).toBeDefined();
  });

  it('factory returns an object with streamModel method', () => {
    // Mock ConfigManager
    const mockConfig = {
      getValue: vi.fn().mockReturnValue(undefined),
      getConfig: vi.fn().mockReturnValue({}),
      updateConfig: vi.fn(),
    };

    const streaming = createStreamingModelCall(mockConfig as never);
    expect(typeof streaming.streamModel).toBe('function');
  });

  it('StreamingModelCallImpl can be instantiated', () => {
    const mockConfig = {
      getValue: vi.fn().mockReturnValue(undefined),
      getConfig: vi.fn().mockReturnValue({}),
      updateConfig: vi.fn(),
    };

    const instance = new StreamingModelCallImpl(mockConfig as never);
    expect(instance).toBeDefined();
    expect(typeof instance.streamModel).toBe('function');
  });
});
