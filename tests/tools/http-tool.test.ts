/**
 * Tests for Qualixar OS HTTP Request Tool
 *
 * Tests URL validation, security blocking (private IPs, localhost),
 * and error handling. Does not make real network requests in unit tests.
 */

import { describe, it, expect } from 'vitest';
import { httpRequest } from '../../src/tools/http-tool.js';

describe('httpRequest', () => {
  // -------------------------------------------------------------------------
  // Input Validation
  // -------------------------------------------------------------------------

  it('returns error when url is missing', async () => {
    const result = await httpRequest({});
    expect(result.isError).toBe(true);
    expect(result.content).toContain('url is required');
  });

  it('returns error when url is not a string', async () => {
    const result = await httpRequest({ url: 42 });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('url is required');
  });

  it('returns error for invalid URL format', async () => {
    const result = await httpRequest({ url: 'not-a-url' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Invalid URL');
  });

  it('returns error for non-http protocol', async () => {
    const result = await httpRequest({ url: 'ftp://example.com/file' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Unsupported protocol');
  });

  // -------------------------------------------------------------------------
  // Security: Private IP Blocking
  // -------------------------------------------------------------------------

  it('blocks localhost', async () => {
    const result = await httpRequest({ url: 'http://localhost/api' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Blocked host');
  });

  it('blocks 127.0.0.1', async () => {
    const result = await httpRequest({ url: 'http://127.0.0.1:8080/' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Blocked host');
  });

  it('blocks 10.x private range', async () => {
    const result = await httpRequest({ url: 'http://10.0.0.1/internal' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Blocked host');
  });

  it('blocks 192.168.x private range', async () => {
    const result = await httpRequest({ url: 'http://192.168.1.1/' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Blocked host');
  });

  it('blocks 172.16.x private range', async () => {
    const result = await httpRequest({ url: 'http://172.16.0.1/' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Blocked host');
  });

  it('blocks 0.0.0.0', async () => {
    const result = await httpRequest({ url: 'http://0.0.0.0/' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Blocked host');
  });

  it('blocks IPv6 loopback', async () => {
    const result = await httpRequest({ url: 'http://[::1]/' });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('Blocked host');
  });

  // -------------------------------------------------------------------------
  // Network (timeout for unreachable host)
  // -------------------------------------------------------------------------

  it('handles timeout for unreachable host', async () => {
    // Very short timeout to trigger quickly
    const result = await httpRequest({
      url: 'http://192.0.2.1/', // TEST-NET — guaranteed unreachable
      timeout: 100,
    });
    expect(result.isError).toBe(true);
  }, 10_000);
});
