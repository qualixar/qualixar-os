// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- RBAC Middleware
 *
 * Hono middleware that:
 *   1. Extracts Bearer token from Authorization header
 *   2. Looks up the user record in DB to decode role
 *   3. Maps the URL path to a ResourceGroup
 *   4. Calls RBACEngine.check(role, resource, action)
 *   5. Returns 401/403 on failure, passes through on success
 *
 * Skip list: /api/health, /api/sso/callback (unauthenticated routes).
 * HR-1: No mutation of request context.
 */

import type { MiddlewareHandler } from 'hono';
import type { Context } from 'hono';
import type { QosDatabase } from '../db/database.js';
import type { RBACEngine, ResourceGroup, PermissionAction, Role } from '../types/phase22.js';

// ---------------------------------------------------------------------------
// Hono Environment (typed context variables)
// ---------------------------------------------------------------------------

type Env = {
  Variables: {
    userId: string;
    userRole: Role;
  };
};

type HonoContext = Context<Env>;

// ---------------------------------------------------------------------------
// Route → Resource mapping
// ---------------------------------------------------------------------------

const PATH_RESOURCE_MAP: ReadonlyArray<{ pattern: RegExp; resource: ResourceGroup }> = [
  { pattern: /^\/api\/enterprise\/vault/, resource: 'credentials' },
  { pattern: /^\/api\/enterprise\/users/, resource: 'users' },
  { pattern: /^\/api\/enterprise\/audit/, resource: 'audit' },
  { pattern: /^\/api\/enterprise\/sso/, resource: 'system' },
  { pattern: /^\/api\/enterprise\/rate-limit/, resource: 'system' },
  { pattern: /^\/api\/marketplace/, resource: 'marketplace' },
  { pattern: /^\/api\/plugins/, resource: 'plugins' },
  { pattern: /^\/api\/agents/, resource: 'agents' },
  { pattern: /^\/api\/tasks/, resource: 'tasks' },
  { pattern: /^\/api\/workflows/, resource: 'workflows' },
  { pattern: /^\/api\/blueprints/, resource: 'blueprints' },
  { pattern: /^\/api\/deployments/, resource: 'deployments' },
  { pattern: /^\/api\/models/, resource: 'models' },
];

// ---------------------------------------------------------------------------
// Method → Action mapping
// ---------------------------------------------------------------------------

const METHOD_ACTION_MAP: Readonly<Record<string, PermissionAction>> = {
  GET: 'read',
  POST: 'write',
  PUT: 'write',
  PATCH: 'write',
  DELETE: 'delete',
};

// ---------------------------------------------------------------------------
// Skip list (no auth required)
// ---------------------------------------------------------------------------

const SKIP_PATHS = new Set(['/api/health', '/api/sso/callback', '/api/enterprise/sso/callback']);

function shouldSkip(path: string): boolean {
  if (SKIP_PATHS.has(path)) return true;
  // Allow static assets and websocket upgrade
  if (path.startsWith('/assets/') || path === '/') return true;
  return false;
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  role: Role;
  api_token: string | null;
}

export function createRBACMiddleware(rbacEngine: RBACEngine, db: QosDatabase): MiddlewareHandler<Env> {
  return async (c: HonoContext, next) => {
    const path = new URL(c.req.url).pathname;

    if (shouldSkip(path)) {
      await next();
      return;
    }

    // 1. Extract Bearer token
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      return c.json({ error: 'Empty Bearer token' }, 401);
    }

    // 2. Look up user by API token
    const user = db.get<UserRow>(
      'SELECT id, role, api_token FROM users WHERE api_token = ?',
      [token],
    );
    if (!user) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    // 3. Map path to resource
    let resource: ResourceGroup = 'system';
    for (const { pattern, resource: res } of PATH_RESOURCE_MAP) {
      if (pattern.test(path)) {
        resource = res;
        break;
      }
    }

    // 4. Map HTTP method to action
    const method = c.req.method.toUpperCase();
    const action: PermissionAction = METHOD_ACTION_MAP[method] ?? 'read';

    // 5. Check RBAC
    const result = rbacEngine.check({ role: user.role, resource, action });
    if (!result.allowed) {
      return c.json({ error: 'Forbidden', reason: result.reason }, 403);
    }

    // 6. Attach user context for downstream handlers
    c.set('userId', user.id);
    c.set('userRole', user.role);

    await next();
  };
}
