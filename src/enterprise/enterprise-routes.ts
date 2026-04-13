// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- Enterprise API Routes
 *
 * Hono route registrations for all enterprise hardening endpoints:
 *   - Credential Vault (store/retrieve/unlock/lock/status/rotate)
 *   - User Management (list/create/role change/token gen)
 *   - Audit Log (query/export/purge)
 *   - SSO (login redirect / callback)
 *   - Rate Limit status
 *
 * HR-1: All responses use { ok: true, ... } or { error: ... } pattern.
 * HR-2: Input validated before passing to domain layer.
 * HR-3: No secrets echoed in responses.
 */

import { Hono } from 'hono';
import { randomBytes } from 'node:crypto';
import type { EnterpriseVault } from '../types/phase22.js';
import type { AuditLogger, AuditLogQuery } from '../types/phase22.js';
import type { SSOEngine, SSOProvider } from '../types/phase22.js';
import type { RateLimiter, Role } from '../types/phase22.js';
import type { QosDatabase } from '../db/database.js';

// ---------------------------------------------------------------------------
// Hono Environment (typed context variables set by RBAC middleware)
// ---------------------------------------------------------------------------

type Env = {
  Variables: {
    userId: string;
    userRole: Role;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(data: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isValidRole(v: unknown): v is Role {
  return v === 'admin' || v === 'developer' || v === 'viewer';
}

function isValidProvider(v: unknown): v is SSOProvider {
  return v === 'azure-ad' || v === 'google' || v === 'okta' || v === 'auth0';
}

interface UserRow {
  id: string;
  username: string;
  role: string;
  auth_source: string;
  sso_provider: string | null;
  created_at: string;
  last_login_at: string | null;
}

// ---------------------------------------------------------------------------
// Route Registration
// ---------------------------------------------------------------------------

export function registerEnterpriseRoutes(
  app: Hono<Env>,
  vault: EnterpriseVault,
  auditLogger: AuditLogger,
  ssoEngine: SSOEngine,
  rateLimiter: RateLimiter,
  db: QosDatabase,
): void {
  // ─── Vault: Store ─────────────────────────────────────────────────────────
  app.post('/api/enterprise/vault/store', async (c) => {
    const body = await c.req.json<{ providerId?: unknown; plaintext?: unknown; passphrase?: unknown }>();
    if (typeof body.providerId !== 'string' || !body.providerId) return err('providerId required');
    if (typeof body.plaintext !== 'string' || !body.plaintext) return err('plaintext required');
    if (typeof body.passphrase !== 'string' || !body.passphrase) return err('passphrase required');

    await vault.store({ providerId: body.providerId, plaintext: body.plaintext, passphrase: body.passphrase });
    auditLogger.log({
      eventType: 'credential:stored',
      userId: c.get('userId') ?? null,
      username: null, role: c.get('userRole') ?? null,
      details: { providerId: body.providerId },
      ipAddress: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null,
      resourceType: 'credentials', resourceId: body.providerId,
    });
    return ok({ message: 'Credential stored' });
  });

  // ─── Vault: Retrieve ──────────────────────────────────────────────────────
  app.post('/api/enterprise/vault/retrieve', async (c) => {
    const body = await c.req.json<{ providerId?: unknown; passphrase?: unknown }>();
    if (typeof body.providerId !== 'string' || !body.providerId) return err('providerId required');
    if (typeof body.passphrase !== 'string' || !body.passphrase) return err('passphrase required');

    try {
      const plaintext = await vault.retrieve({ providerId: body.providerId, passphrase: body.passphrase });
      auditLogger.log({
        eventType: 'credential:retrieved',
        userId: c.get('userId') ?? null,
        username: null, role: c.get('userRole') ?? null,
        details: { providerId: body.providerId },
        ipAddress: c.req.header('x-forwarded-for') ?? null,
        userAgent: c.req.header('user-agent') ?? null,
        resourceType: 'credentials', resourceId: body.providerId,
      });
      // C-02 FIX: Never echo the plaintext — return masked length indicator only
      return ok({ providerId: body.providerId, length: plaintext.length });
    } catch (e) {
      return err(e instanceof Error ? e.message : 'Decryption failed', 400);
    }
  });

  // ─── Vault: Unlock ────────────────────────────────────────────────────────
  app.post('/api/enterprise/vault/unlock', async (c) => {
    const body = await c.req.json<{ passphrase?: unknown }>();
    if (typeof body.passphrase !== 'string' || !body.passphrase) return err('passphrase required');
    vault.unlock(body.passphrase);
    auditLogger.log({
      eventType: 'vault:unlocked',
      userId: c.get('userId') ?? null, username: null, role: c.get('userRole') ?? null,
      details: {}, ipAddress: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null, resourceType: 'credentials', resourceId: null,
    });
    return ok({ unlocked: true });
  });

  // ─── Vault: Lock ──────────────────────────────────────────────────────────
  app.post('/api/enterprise/vault/lock', (c) => {
    vault.lock();
    auditLogger.log({
      eventType: 'vault:locked',
      userId: c.get('userId') ?? null, username: null, role: c.get('userRole') ?? null,
      details: {}, ipAddress: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null, resourceType: 'credentials', resourceId: null,
    });
    return ok({ locked: true });
  });

  // ─── Vault: Status ────────────────────────────────────────────────────────
  app.get('/api/enterprise/vault/status', (c) => {
    return ok({ unlocked: vault.isUnlocked(), credentialCount: vault.credentialCount() });
  });

  // ─── Vault: Rotate Keys ───────────────────────────────────────────────────
  app.post('/api/enterprise/vault/rotate', async (c) => {
    const body = await c.req.json<{ oldPassphrase?: unknown; newPassphrase?: unknown }>();
    if (typeof body.oldPassphrase !== 'string' || !body.oldPassphrase) return err('oldPassphrase required');
    if (typeof body.newPassphrase !== 'string' || !body.newPassphrase) return err('newPassphrase required');

    const result = await vault.rotateKeys({ oldPassphrase: body.oldPassphrase, newPassphrase: body.newPassphrase });
    auditLogger.log({
      eventType: result.failed === 0 ? 'credential:rotated' : 'credential:rotation_failed',
      userId: c.get('userId') ?? null, username: null, role: c.get('userRole') ?? null,
      details: { rotated: result.rotated, failed: result.failed },
      ipAddress: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null, resourceType: 'credentials', resourceId: null,
    });
    return ok({ rotated: result.rotated, failed: result.failed, errors: result.errors });
  });

  // ─── Users: List ──────────────────────────────────────────────────────────
  app.get('/api/enterprise/users', (c) => {
    const rows = db.query<UserRow>(
      'SELECT id, username, role, auth_source, sso_provider, created_at, last_login_at FROM users',
      [],
    );
    return ok({ users: rows });
  });

  // ─── Users: Create ────────────────────────────────────────────────────────
  app.post('/api/enterprise/users', async (c) => {
    const body = await c.req.json<{ username?: unknown; role?: unknown }>();
    if (typeof body.username !== 'string' || !body.username) return err('username required');
    if (!isValidRole(body.role)) return err('role must be admin | developer | viewer');

    const id = `usr_${randomBytes(12).toString('hex')}`;
    const apiToken = `qos_${randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();
    db.insert('users', {
      id, username: body.username, role: body.role,
      auth_source: 'local', api_token: apiToken, created_at: now,
    });
    auditLogger.log({
      eventType: 'user:created',
      userId: c.get('userId') ?? null, username: body.username, role: body.role,
      details: { newUserId: id },
      ipAddress: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null, resourceType: 'users', resourceId: id,
    });
    return ok({ id, username: body.username, role: body.role, apiToken });
  });

  // ─── Users: Change Role ───────────────────────────────────────────────────
  app.put('/api/enterprise/users/:id/role', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json<{ role?: unknown }>();
    if (!isValidRole(body.role)) return err('role must be admin | developer | viewer');

    db.update('users', { role: body.role }, { id });
    auditLogger.log({
      eventType: 'user:role_changed',
      userId: c.get('userId') ?? null, username: null, role: body.role,
      details: { targetUserId: id, newRole: body.role },
      ipAddress: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null, resourceType: 'users', resourceId: id,
    });
    return ok({ id, role: body.role });
  });

  // ─── Users: Generate Token ────────────────────────────────────────────────
  app.post('/api/enterprise/users/:id/token', (c) => {
    const { id } = c.req.param();
    const apiToken = `qos_${randomBytes(24).toString('hex')}`;
    db.update('users', { api_token: apiToken }, { id });
    auditLogger.log({
      eventType: 'user:token_generated',
      userId: c.get('userId') ?? null, username: null, role: null,
      details: { targetUserId: id },
      ipAddress: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null, resourceType: 'users', resourceId: id,
    });
    return ok({ id, apiToken });
  });

  // ─── Audit: Query ─────────────────────────────────────────────────────────
  app.get('/api/enterprise/audit', (c) => {
    const { eventType, userId, username, resourceType, from, to, limit, offset } = c.req.query();
    const filters: AuditLogQuery = {
      eventType: eventType as AuditLogQuery['eventType'],
      userId: userId || undefined,
      username: username || undefined,
      resourceType: resourceType as AuditLogQuery['resourceType'],
      fromTimestamp: from || undefined,
      toTimestamp: to || undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    };
    const result = auditLogger.query(filters);
    return ok({ entries: result.entries, total: result.total, hasMore: result.hasMore });
  });

  // ─── Audit: Export ────────────────────────────────────────────────────────
  app.get('/api/enterprise/audit/export', (c) => {
    const format = c.req.query('format') ?? 'json';
    const filters: AuditLogQuery = {};
    if (format === 'csv') {
      const csv = auditLogger.exportCsv(filters);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="audit-log.csv"',
        },
      });
    }
    const json = auditLogger.exportJson(filters);
    return new Response(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="audit-log.json"',
      },
    });
  });

  // ─── Audit: Purge ─────────────────────────────────────────────────────────
  app.delete('/api/enterprise/audit/purge', async (c) => {
    const body = await c.req.json<{ olderThanDays?: unknown }>();
    const days = typeof body.olderThanDays === 'number' ? body.olderThanDays : 90;
    const deleted = auditLogger.purge(days);
    return ok({ deleted, olderThanDays: days });
  });

  // ─── SSO: Login Redirect ──────────────────────────────────────────────────
  app.get('/api/enterprise/sso/:provider/login', async (c) => {
    const { provider } = c.req.param();
    if (!isValidProvider(provider)) return err(`Unsupported SSO provider: ${provider}`, 400);

    const { url, state } = await ssoEngine.getAuthorizationUrl(provider);
    return new Response(null, {
      status: 302,
      headers: { Location: url, 'Set-Cookie': `sso_state=${state}; HttpOnly; SameSite=Lax; Path=/` },
    });
  });

  // ─── SSO: Callback ────────────────────────────────────────────────────────
  app.get('/api/enterprise/sso/callback', async (c) => {
    const { code, state } = c.req.query();
    if (!code || !state) return err('Missing code or state parameter', 400);

    try {
      const result = await ssoEngine.handleCallback(code, state);
      return ok({
        userId: result.user.id,
        username: result.user.username,
        role: result.user.role,
        isNewUser: result.isNewUser,
        apiToken: result.user.apiToken,
      });
    } catch (e) {
      return err(e instanceof Error ? e.message : 'SSO callback failed', 400);
    }
  });

  // ─── Rate Limit: Status ───────────────────────────────────────────────────
  app.get('/api/enterprise/rate-limit/status', (c) => {
    const role = (c.get('userRole') as Role | undefined) ?? 'viewer';
    const userId = (c.get('userId') as string | undefined);
    const ip = c.req.header('x-forwarded-for') ?? 'unknown';
    const identifier = userId ?? ip;
    const state = rateLimiter.getStatus(identifier, role);
    return ok({
      role,
      identifier,
      limit: state.limit === Infinity ? 'unlimited' : state.limit,
      remaining: state.remaining === Infinity ? 'unlimited' : state.remaining,
      resetAt: state.resetAt,
    });
  });
}
