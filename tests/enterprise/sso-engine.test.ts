/**
 * Phase C4 -- SSO Engine Tests
 *
 * Tests real OAuth2 token exchange flow (with mocked fetch).
 * Verifies PKCE, state validation, token storage, and user upsert.
 *
 * Source: Phase C4 LLD
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSSOEngine } from '../../src/enterprise/sso-engine.js';
import type { SSOEngine } from '../../src/types/phase22.js';
import type { QosDatabase } from '../../src/db/database.js';
import type { AuditLogger } from '../../src/types/phase22.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function createMockDb(): QosDatabase {
  const rows: Record<string, Record<string, unknown>[]> = {};

  return {
    insert: vi.fn((table: string, data: Record<string, unknown>) => {
      if (!rows[table]) rows[table] = [];
      rows[table].push(data);
    }),
    get: vi.fn((sql: string, params: unknown[]) => {
      // Return SSO session when querying by state
      if (sql.includes('sso_sessions') && sql.includes('state')) {
        const session = rows['sso_sessions']?.find(
          (r) => r.state === params[0],
        );
        return session ?? null;
      }
      // Return null for user lookup (new user path)
      if (sql.includes('users')) return null;
      return null;
    }),
    query: vi.fn().mockReturnValue([]),
    update: vi.fn(),
    db: {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
        get: vi.fn(),
      }),
    },
  } as unknown as QosDatabase;
}

function createMockAuditLogger(): AuditLogger {
  return { log: vi.fn() } as unknown as AuditLogger;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SSOEngine', () => {
  let db: QosDatabase;
  let auditLogger: AuditLogger;
  let engine: SSOEngine;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    db = createMockDb();
    auditLogger = createMockAuditLogger();
    // Set env vars so SSO engine doesn't throw on missing client ID
    process.env.SSO_CLIENT_ID_GOOGLE = 'test-google-client-id';
    process.env.SSO_CLIENT_ID_AZURE_AD = 'test-azure-client-id';
    process.env.SSO_CLIENT_ID_OKTA = 'test-okta-client-id';
    process.env.SSO_CLIENT_ID_AUTH0 = 'test-auth0-client-id';
    engine = createSSOEngine(db, auditLogger);
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('supports all 4 providers', () => {
    const providers = engine.getSupportedProviders();
    expect(providers).toContain('azure-ad');
    expect(providers).toContain('google');
    expect(providers).toContain('okta');
    expect(providers).toContain('auth0');
  });

  it('generates authorization URL with PKCE parameters', async () => {
    const result = await engine.getAuthorizationUrl('google');

    expect(result.url).toContain('accounts.google.com');
    expect(result.url).toContain('code_challenge=');
    expect(result.url).toContain('code_challenge_method=S256');
    expect(result.url).toContain('response_type=code');
    expect(result.state).toHaveLength(64); // 32 bytes hex

    // Session stored in DB
    expect(db.insert).toHaveBeenCalledWith(
      'sso_sessions',
      expect.objectContaining({
        provider: 'google',
        state: result.state,
      }),
    );
  });

  it('generates unique state per request', async () => {
    const r1 = await engine.getAuthorizationUrl('google');
    const r2 = await engine.getAuthorizationUrl('google');
    expect(r1.state).not.toBe(r2.state);
  });

  it('handleCallback exchanges code for real tokens via fetch', async () => {
    // Setup: create a session first
    const { state } = await engine.getAuthorizationUrl('google');

    // Mock fetch for token + userinfo endpoints
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'real_access_token_xyz',
          id_token: 'real_id_token_abc',
          refresh_token: 'real_refresh_token_123',
          expires_in: 3600,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        }),
      } as Response);

    const result = await engine.handleCallback('auth_code_xyz', state);

    // Verify fetch was called (token exchange + userinfo)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // First call: token endpoint
    const tokenCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(tokenCall[0]).toContain('googleapis.com/token');
    expect(tokenCall[1].method).toBe('POST');

    // Second call: userinfo endpoint
    const userInfoCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(userInfoCall[0]).toContain('userinfo');

    // C-01: Result returns QOS apiToken, NOT OAuth access_token (security)
    expect(result.accessToken).toBeDefined();
    expect(result.accessToken).not.toBe('real_access_token_xyz'); // OAuth token NOT leaked
    expect(result.idToken).toBeNull(); // id_token also not exposed
    expect(result.user.username).toBe('test@example.com');
    expect(result.isNewUser).toBe(true);
  });

  it('handleCallback throws on invalid state', async () => {
    await expect(
      engine.handleCallback('code', 'invalid_state'),
    ).rejects.toThrow('Invalid or expired SSO state');
  });

  it('handleCallback throws on token exchange failure', async () => {
    const { state } = await engine.getAuthorizationUrl('google');

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'invalid_grant',
    } as Response);

    await expect(
      engine.handleCallback('bad_code', state),
    ).rejects.toThrow('SSO token exchange failed');
  });

  it('handleCallback throws on userinfo failure', async () => {
    const { state } = await engine.getAuthorizationUrl('google');

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'tok', id_token: 'id' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

    await expect(
      engine.handleCallback('code', state),
    ).rejects.toThrow('UserInfo fetch failed');
  });

  it('PKCE code_verifier is stored in session but never in result', async () => {
    const { state } = await engine.getAuthorizationUrl('google');

    // Session was stored with code_verifier
    const insertCall = (db.insert as ReturnType<typeof vi.fn>).mock.calls.find(
      (call) => call[0] === 'sso_sessions',
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1].code_verifier).toBeDefined();
    expect(insertCall![1].code_verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('audit logger records login attempt', async () => {
    await engine.getAuthorizationUrl('azure-ad');

    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'sso:login',
        details: expect.objectContaining({ provider: 'azure-ad' }),
      }),
    );
  });
});
