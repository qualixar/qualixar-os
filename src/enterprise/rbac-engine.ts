// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- RBAC Engine
 *
 * Stateless permission checker. Reads from the static PERMISSION_MATRIX.
 * check(role, resource, action) → RBACCheckResult (allowed / denied + reason).
 *
 * HR-1: No mutation — all results are new objects.
 * HR-2: No DB dependency — matrix is static.
 */

import type {
  RBACEngine,
  RBACCheckRequest,
  RBACCheckResult,
  Role,
  RoleDefinition,
} from '../types/phase22.js';
import { PERMISSION_MATRIX, ROLE_DEFINITIONS } from './permission-matrix.js';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class RBACEngineImpl implements RBACEngine {
  check(req: RBACCheckRequest): RBACCheckResult {
    const { role, resource, action } = req;

    const resourceMatrix = PERMISSION_MATRIX[role];
    if (!resourceMatrix) {
      return {
        allowed: false,
        reason: `Unknown role: ${role}`,
        role,
        resource,
        action,
      };
    }

    const allowedActions = resourceMatrix[resource];
    if (!allowedActions) {
      return {
        allowed: false,
        reason: `Unknown resource: ${resource}`,
        role,
        resource,
        action,
      };
    }

    if (allowedActions.length === 0) {
      return {
        allowed: false,
        reason: `Role '${role}' has no access to resource '${resource}'`,
        role,
        resource,
        action,
      };
    }

    const isAllowed = (allowedActions as readonly string[]).includes(action);
    return {
      allowed: isAllowed,
      reason: isAllowed
        ? `Role '${role}' is permitted to '${action}' on '${resource}'`
        : `Role '${role}' cannot '${action}' on '${resource}' (allowed: ${allowedActions.join(', ')})`,
      role,
      resource,
      action,
    };
  }

  getRoleDefinition(role: Role): RoleDefinition {
    const def = ROLE_DEFINITIONS.find((d) => d.role === role);
    if (!def) {
      throw new Error(`Unknown role: ${role}`);
    }
    return def;
  }

  getAllRoles(): readonly RoleDefinition[] {
    return ROLE_DEFINITIONS;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRBACEngine(): RBACEngine {
  return new RBACEngineImpl();
}
