// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- SSO Engine
 *
 * OAuth2 Authorization Code + PKCE flow stub.
 * Supports: azure-ad, google, okta, auth0 (config-driven endpoints).
 *
 * PKCE: code_verifier >= 43 chars, code_challenge = S256(code_verifier).
 * State param: random 32 bytes, stored in sso_sessions, validated on callback.
 *
 * HR-1: code_verifier never logged or returned to caller.
 * HR-2: access_token stored in sso_sessions — never in logs.
 * HR-3: All DB via parameterized prepared statements.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { QosDatabase } from '../db/database.js';
import type { AuditLogger } from '../types/phase22.js';
import type {
  SSOEngine,
  SSOProvider,
  SSOCallbackResult,
  UserIdentity,
  Role,
} from '../types/phase22.js';

// ---------------------------------------------------------------------------
// Provider endpoint registry
// ---------------------------------------------------------------------------

interface ProviderEndpoints {
  readonly authorizationEndpoint: (config: Readonly<ProviderParams>) => string;
  readonly tokenEndpoint: (config: Readonly<ProviderParams>) => string;
  readonly userInfoEndpoint: (config: Readonly<ProviderParams>) => string;
  readonly scopes: readonly string[];
}

interface ProviderParams {
  readonly tenantId?: string;
  readonly domain?: string;
}

const PROVIDER_ENDPOINTS: Readonly<Record<SSOProvider, ProviderEndpoints>> = {
  'azure-ad': {
    authorizationEndpoint: (p) =>
      `https://login.microsoftonline.com/${p.tenantId ?? 'common'}/oauth2/v2.0/authorize`,
    tokenEndpoint: (p) =>
      `https://login.microsoftonline.com/${p.tenantId ?? 'common'}/oauth2/v2.0/token`,
    userInfoEndpoint: () => 'https://graph.microsoft.com/oidc/userinfo',
    scopes: ['openid', 'profile', 'email'],
  },
  'google': {
    authorizationEndpoint: () => 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: () => 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: () => 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'profile', 'email'],
  },
  'okta': {
    authorizationEndpoint: (p) =>
      `https://${p.domain ?? 'your-domain.okta.com'}/oauth2/v1/authorize`,
    tokenEndpoint: (p) =>
      `https://${p.domain ?? 'your-domain.okta.com'}/oauth2/v1/token`,
    userInfoEndpoint: (p) =>
      `https://${p.domain ?? 'your-domain.okta.com'}/oauth2/v1/userinfo`,
    scopes: ['openid', 'profile', 'email'],
  },
  'auth0': {
    authorizationEndpoint: (p) =>
      `https://${p.domain ?? 'your-tenant.auth0.com'}/authorize`,
    tokenEndpoint: (p) =>
      `https://${p.domain ?? 'your-tenant.auth0.com'}/oauth/token`,
    userInfoEndpoint: (p) =>
      `https://${p.domain ?? 'your-tenant.auth0.com'}/userinfo`,
    scopes: ['openid', 'profile', 'email'],
  },
};

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateCodeVerifier(): string {
  // RFC 7636: code_verifier is 43-128 URL-safe chars
  return randomBytes(48).toString('base64url'); // 64 chars
}

function generateCodeChallenge(verifier: string): string {
  // S256: BASE64URL(SHA256(ASCII(code_verifier)))
  return createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
  return randomBytes(32).toString('hex');
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

interface SsoSessionRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly provider: string;
  readonly state: string;
  readonly code_verifier: string;
  readonly access_token: string | null;
  readonly refresh_token: string | null;
  readonly id_token: string | null;
  readonly expires_at: string | null;
  readonly created_at: string;
}

interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly role: string;
  readonly auth_source: string;
  readonly sso_provider: string | null;
  readonly api_token: string | null;
  readonly created_at: string;
  readonly last_login_at: string | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SSOEngineImpl implements SSOEngine {
  private readonly _db: QosDatabase;
  private readonly _auditLogger: AuditLogger;
  // In production, these would come from config. Stubs for wiring.
  private readonly _clientIds: Partial<Record<SSOProvider, string>> = {};
  private readonly _redirectUri: string;
  private readonly _providerParams: Partial<Record<SSOProvider, ProviderParams>> = {};

  constructor(
    db: QosDatabase,
    auditLogger: AuditLogger,
    redirectUri = 'http://localhost:3000/api/enterprise/sso/callback',
  ) {
    this._db = db;
    this._auditLogger = auditLogger;
    this._redirectUri = redirectUri;
  }

  async getAuthorizationUrl(
    provider: SSOProvider,
  ): Promise<{ url: string; state: string }> {
    const endpoints = PROVIDER_ENDPOINTS[provider];
    const clientId = this._clientIds[provider] ?? process.env[`SSO_CLIENT_ID_${provider.toUpperCase().replace(/-/g, '_')}`];
    if (!clientId) {
      throw new Error(`SSO client_id not configured for provider '${provider}'. Set SSO_CLIENT_ID_${provider.toUpperCase().replace(/-/g, '_')} env var.`);
    }
    const params = this._providerParams[provider] ?? {};

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    this._db.insert('sso_sessions', {
      id: newId('sso'),
      user_id: null,
      provider,
      state,
      code_verifier: codeVerifier,
      access_token: null,
      refresh_token: null,
      id_token: null,
      expires_at: expiresAt,
      created_at: now,
    });

    const scopes = endpoints.scopes.join(' ');
    const authUrl = new URL(endpoints.authorizationEndpoint(params));
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', this._redirectUri);
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    this._auditLogger.log({
      eventType: 'sso:login',
      userId: null,
      username: null,
      role: null,
      details: { provider, state },
      ipAddress: null,
      userAgent: null,
      resourceType: 'system',
      resourceId: null,
    });

    return { url: authUrl.toString(), state };
  }

  async handleCallback(code: string, state: string): Promise<SSOCallbackResult> {
    // 1. Validate state
    const session = this._db.get<SsoSessionRow>(
      'SELECT * FROM sso_sessions WHERE state = ?',
      [state],
    );
    if (!session) {
      this._auditLogger.log({
        eventType: 'sso:state_invalid',
        userId: null, username: null, role: null,
        details: { state },
        ipAddress: null, userAgent: null, resourceType: 'system', resourceId: null,
      });
      throw new Error('Invalid or expired SSO state');
    }

    // H-04: Enforce session expiry
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      throw new Error('SSO session expired — please restart the login flow');
    }

    const provider = session.provider as SSOProvider;
    const endpoints = PROVIDER_ENDPOINTS[provider];
    const params = this._providerParams[provider] ?? {};
    const clientId = this._clientIds[provider] ?? process.env[`SSO_CLIENT_ID_${provider.toUpperCase().replace(/-/g, '_')}`];
    if (!clientId) {
      throw new Error(`SSO client_id not configured for provider '${provider}'`);
    }
    const clientSecret = process.env[`SSO_CLIENT_SECRET_${provider.toUpperCase().replace(/-/g, '_')}`] ?? '';

    // 2. Exchange code for tokens via real OAuth2 token endpoint
    const tokenUrl = endpoints.tokenEndpoint(params);
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: this._redirectUri,
      code_verifier: session.code_verifier,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
    });

    let accessToken: string;
    let idToken: string | undefined;
    let refreshToken: string | undefined;
    let tokenPayload: { sub: string; email: string; name: string };

    try {
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });

      if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text();
        throw new Error(`Token exchange failed (${tokenResponse.status}): ${errorBody.substring(0, 200)}`);
      }

      const tokenData = await tokenResponse.json() as {
        access_token: string;
        id_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };

      accessToken = tokenData.access_token;
      idToken = tokenData.id_token;
      refreshToken = tokenData.refresh_token;

      // 2b. Fetch user info from provider
      const userInfoUrl = endpoints.userInfoEndpoint(params);
      const userInfoResponse = await fetch(userInfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!userInfoResponse.ok) {
        throw new Error(`UserInfo fetch failed (${userInfoResponse.status})`);
      }

      tokenPayload = await userInfoResponse.json() as { sub: string; email: string; name: string };
    } catch (err) {
      this._auditLogger.log({
        eventType: 'sso:token_exchange_failed' as never,
        userId: null, username: null, role: null,
        details: { provider, error: err instanceof Error ? err.message : String(err) },
        ipAddress: null, userAgent: null, resourceType: 'system', resourceId: null,
      });
      throw new Error(`SSO token exchange failed for ${provider}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Upsert user
    const username = tokenPayload.email;
    const existing = this._db.get<UserRow>(
      'SELECT * FROM users WHERE username = ? AND auth_source = ?',
      [username, 'sso'],
    );

    let user: UserIdentity;
    let isNewUser = false;

    if (existing) {
      this._db.update(
        'users',
        { last_login_at: nowIso() },
        { id: existing.id },
      );
      user = {
        id: existing.id,
        username: existing.username,
        role: existing.role as Role,
        authSource: 'sso',
        ssoProvider: provider,
        apiToken: existing.api_token,
        createdAt: existing.created_at,
        lastLoginAt: nowIso(),
      };
    } else {
      isNewUser = true;
      const userId = newId('usr');
      const apiToken = `qos_${randomBytes(24).toString('hex')}`;
      this._db.insert('users', {
        id: userId,
        username,
        role: 'developer',
        auth_source: 'sso',
        sso_provider: provider,
        api_token: apiToken,
        created_at: nowIso(),
      });
      user = {
        id: userId,
        username,
        role: 'developer',
        authSource: 'sso',
        ssoProvider: provider,
        apiToken,
        createdAt: nowIso(),
        lastLoginAt: null,
      };
    }

    // 4. Update session with real tokens (HR-2: access_token stored in DB only, never returned)
    this._db.db
      .prepare('UPDATE sso_sessions SET user_id = ?, access_token = ?, id_token = ?, refresh_token = ? WHERE state = ?')
      .run(user.id, accessToken, idToken ?? null, refreshToken ?? null, state);

    // L-06: Mark session as consumed to prevent replay
    this._db.db
      .prepare('UPDATE sso_sessions SET expires_at = datetime(\'now\') WHERE state = ?')
      .run(state);

    this._auditLogger.log({
      eventType: 'sso:callback',
      userId: user.id,
      username: user.username,
      role: user.role,
      details: { provider, isNewUser },
      ipAddress: null,
      userAgent: null,
      resourceType: 'system',
      resourceId: null,
    });

    // C-01 fix: Return user's apiToken, NOT the OAuth access_token (HR-2 compliance)
    return { user, isNewUser, accessToken: user.apiToken ?? '', idToken: null };
  }

  getSupportedProviders(): readonly SSOProvider[] {
    return ['azure-ad', 'google', 'okta', 'auth0'];
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSSOEngine(
  db: QosDatabase,
  auditLogger: AuditLogger,
  redirectUri?: string,
): SSOEngine {
  return new SSOEngineImpl(db, auditLogger, redirectUri);
}
