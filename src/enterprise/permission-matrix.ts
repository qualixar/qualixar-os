// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- Permission Matrix
 *
 * Static PERMISSION_MATRIX defining all role → resource → actions mappings.
 * Single source of truth — consumed by RBACEngine.
 *
 * Design principle:
 *   admin    = full CRUD + execute on all resources
 *   developer = read + write + execute on operational resources; no user/audit mgmt
 *   viewer   = read-only on most resources; no credentials or users
 */

import type { Role, ResourceGroup, PermissionAction, RoleDefinition } from '../types/phase22.js';

// ---------------------------------------------------------------------------
// Permission Matrix
// ---------------------------------------------------------------------------

/**
 * PERMISSION_MATRIX[role][resource] = allowed actions
 * Empty array means no access.
 */
export const PERMISSION_MATRIX: Readonly<
  Record<Role, Readonly<Record<ResourceGroup, readonly PermissionAction[]>>>
> = {
  admin: {
    credentials: ['read', 'write', 'delete', 'execute'],
    models:       ['read', 'write', 'delete', 'execute'],
    agents:       ['read', 'write', 'delete', 'execute'],
    tasks:        ['read', 'write', 'delete', 'execute'],
    workflows:    ['read', 'write', 'delete', 'execute'],
    audit:        ['read', 'write', 'delete', 'execute'],
    users:        ['read', 'write', 'delete', 'execute'],
    plugins:      ['read', 'write', 'delete', 'execute'],
    marketplace:  ['read', 'write', 'delete', 'execute'],
    blueprints:   ['read', 'write', 'delete', 'execute'],
    deployments:  ['read', 'write', 'delete', 'execute'],
    system:       ['read', 'write', 'delete', 'execute'],
  },
  developer: {
    credentials: ['read', 'write'],
    models:      ['read', 'execute'],
    agents:      ['read', 'write', 'execute'],
    tasks:       ['read', 'write', 'execute'],
    workflows:   ['read', 'write', 'execute'],
    audit:       ['read'],
    users:       [],
    plugins:     ['read', 'write', 'execute'],
    marketplace: ['read', 'execute'],
    blueprints:  ['read', 'write', 'execute'],
    deployments: ['read', 'write', 'execute'],
    system:      ['read'],
  },
  viewer: {
    credentials: [],
    models:      ['read'],
    agents:      ['read'],
    tasks:       ['read'],
    workflows:   ['read'],
    audit:       ['read'],
    users:       [],
    plugins:     ['read'],
    marketplace: ['read'],
    blueprints:  ['read'],
    deployments: ['read'],
    system:      ['read'],
  },
} as const;

// ---------------------------------------------------------------------------
// Role Definitions (with rate limits)
// ---------------------------------------------------------------------------

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    role: 'admin',
    description: 'Full access to all resources including user management and system configuration.',
    permissions: Object.entries(PERMISSION_MATRIX.admin).map(([resource, actions]) => ({
      resource: resource as ResourceGroup,
      actions: actions as readonly PermissionAction[],
    })),
    rateLimit: { requestsPerMinute: Infinity },
  },
  {
    role: 'developer',
    description: 'Operational access to agents, tasks, models, and workflows. No user management.',
    permissions: Object.entries(PERMISSION_MATRIX.developer)
      .filter(([, actions]) => actions.length > 0)
      .map(([resource, actions]) => ({
        resource: resource as ResourceGroup,
        actions: actions as readonly PermissionAction[],
      })),
    rateLimit: { requestsPerMinute: 1000 },
  },
  {
    role: 'viewer',
    description: 'Read-only access to operational resources. Cannot access credentials or users.',
    permissions: Object.entries(PERMISSION_MATRIX.viewer)
      .filter(([, actions]) => actions.length > 0)
      .map(([resource, actions]) => ({
        resource: resource as ResourceGroup,
        actions: actions as readonly PermissionAction[],
      })),
    rateLimit: { requestsPerMinute: 100 },
  },
] as const;
