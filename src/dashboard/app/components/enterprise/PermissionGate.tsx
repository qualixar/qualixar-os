/**
 * Qualixar OS Phase 22 Enterprise — PermissionGate
 * Wrapper that conditionally renders children based on role + resource + action.
 * Role matrix: admin has all permissions, developer has read/write but not admin
 * actions, viewer has read only.
 */

import React from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PermissionGateProps {
  readonly role: string;
  readonly resource: string;
  readonly action: string;
  readonly children: React.ReactNode;
  readonly fallback?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Permission Matrix
// ---------------------------------------------------------------------------

type RolePermissions = Record<string, Record<string, readonly string[]>>;

const ROLE_PERMISSIONS: RolePermissions = {
  admin: {
    '*': ['read', 'write', 'delete', 'admin', 'export', 'purge', 'rotate'],
  },
  developer: {
    audit:       ['read', 'export'],
    credentials: ['read', 'write'],
    users:       ['read'],
    sso:         ['read'],
    '*':         ['read', 'write', 'export'],
  },
  viewer: {
    '*': ['read'],
  },
};

function hasPermission(role: string, resource: string, action: string): boolean {
  const normalized = role.toLowerCase();
  const matrix = ROLE_PERMISSIONS[normalized];

  if (!matrix) return false;

  // Check wildcard first (admin shortcut)
  const wildcardActions = matrix['*'];
  if (wildcardActions?.includes(action)) return true;

  // Check specific resource
  const resourceActions = matrix[resource];
  if (resourceActions?.includes(action)) return true;

  // Developer wildcard fallback
  const devWildcard = matrix['*'];
  return devWildcard?.includes(action) ?? false;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PermissionGate({
  role,
  resource,
  action,
  children,
  fallback = null,
}: PermissionGateProps): React.ReactElement {
  if (hasPermission(role, resource, action)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
