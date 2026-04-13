// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- Enterprise Bootstrap
 *
 * Wires all Phase 22 enterprise components during startup.
 * Returns a single EnterpriseComponents bag consumed by dashboard server + routes.
 *
 * Dependency order:
 *   db → auditLogger (needs db + eventBus)
 *   db → vault
 *   rbacEngine (stateless)
 *   rbacMiddleware (needs rbacEngine + db)
 *   rateLimiter (in-memory, no deps)
 *   ssoEngine (needs db + auditLogger)
 */

import { createEnterpriseVault } from './credential-vault.js';
import { createRBACEngine } from './rbac-engine.js';
import { createRBACMiddleware } from './rbac-middleware.js';
import { createAuditLogger } from './audit-logger.js';
import { createRateLimiter, createRateLimiterMiddleware } from './rate-limiter.js';
import { createSSOEngine } from './sso-engine.js';

import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import type { MiddlewareHandler } from 'hono';
import type { EnterpriseVault, AuditLogger, SSOEngine, RateLimiter, RBACEngine } from '../types/phase22.js';

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export interface EnterpriseComponents {
  readonly vault: EnterpriseVault;
  readonly rbac: RBACEngine;
  readonly rbacMiddleware: MiddlewareHandler;
  readonly auditLogger: AuditLogger;
  readonly rateLimiter: RateLimiter;
  readonly rateLimiterMiddleware: MiddlewareHandler;
  readonly ssoEngine: SSOEngine;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function bootstrapEnterprise(
  db: QosDatabase,
  eventBus: EventBus,
  ssoRedirectUri?: string,
): EnterpriseComponents {
  const auditLogger = createAuditLogger(db, eventBus);
  const vault = createEnterpriseVault(db);
  const rbac = createRBACEngine();
  const rbacMiddleware = createRBACMiddleware(rbac, db);
  const rateLimiter = createRateLimiter();
  const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiter);
  const ssoEngine = createSSOEngine(db, auditLogger, ssoRedirectUri);

  auditLogger.log({
    eventType: 'system:bootstrap',
    userId: null,
    username: null,
    role: null,
    details: { phase: 22, component: 'enterprise' },
    ipAddress: null,
    userAgent: null,
    resourceType: 'system',
    resourceId: null,
  });

  return {
    vault,
    rbac,
    rbacMiddleware,
    auditLogger,
    rateLimiter,
    rateLimiterMiddleware,
    ssoEngine,
  };
}
