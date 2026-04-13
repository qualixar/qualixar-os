// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- HTTP Request Tool
 *
 * Make HTTP requests to external APIs using native fetch().
 * Security: blocks localhost, private IPs, and link-local addresses.
 */

import type { ToolResult } from './tool-registry.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Regex matching private/reserved IP ranges that agents must not reach.
 * Covers: 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x (link-local), [::1]
 */
const PRIVATE_IP_RE =
  /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)$/;

const BLOCKED_HOSTS = new Set(['localhost', '0.0.0.0', '[::1]']);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isBlockedUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'Invalid URL';
  }

  if (!parsed.protocol.startsWith('http')) {
    return `Unsupported protocol: ${parsed.protocol}`;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || PRIVATE_IP_RE.test(hostname)) {
    return `Blocked host: requests to private/local addresses are not allowed`;
  }

  return null; // URL is safe
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function httpRequest(
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const url = input.url as string | undefined;
  if (!url || typeof url !== 'string') {
    return { content: 'Error: url is required and must be a string', isError: true };
  }

  const blocked = isBlockedUrl(url);
  if (blocked) {
    return { content: `Security: http_request blocked — ${blocked}`, isError: true };
  }

  const method = ((input.method as string) ?? 'GET').toUpperCase();
  const headers = (input.headers as Record<string, string>) ?? {};
  const body = input.body as string | undefined;
  const timeoutMs = (input.timeout as number) ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOpts: RequestInit = {
      method,
      headers: { 'User-Agent': 'Qualixar OS/2.0', ...headers },
      signal: controller.signal,
      redirect: 'follow',
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOpts.body = body;
    }

    const response = await fetch(url, fetchOpts);
    clearTimeout(timer);

    const text = await response.text();
    const truncated = text.length > MAX_RESPONSE_BYTES
      ? text.slice(0, MAX_RESPONSE_BYTES) + '\n[truncated]'
      : text;

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { respHeaders[k] = v; });

    return {
      content: JSON.stringify({
        status: response.status,
        headers: respHeaders,
        body: truncated,
      }, null, 2),
    };
  } catch (error: unknown) {
    clearTimeout(timer);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('abort')) {
      return { content: `Error: request timed out after ${timeoutMs}ms`, isError: true };
    }
    return { content: `Error: http_request failed — ${msg}`, isError: true };
  }
}
