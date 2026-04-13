/**
 * Qualixar OS Phase 22 -- RBAC Engine Tests
 *
 * Stateless permission checker. All tests use the static PERMISSION_MATRIX.
 * No DB or external dependencies required.
 *
 * Coverage targets: check() for admin/developer/viewer across resources and
 * actions, listRoles(), and getRoleDefinition().
 */

import { describe, it, expect } from 'vitest';
import { createRBACEngine } from '../../src/enterprise/rbac-engine.js';
import type { RBACEngine } from '../../src/types/phase22.js';

// ---------------------------------------------------------------------------
// Engine instance (stateless — safe to share across tests)
// ---------------------------------------------------------------------------

const engine: RBACEngine = createRBACEngine();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RBACEngine', () => {

  // Test 1: Admin can CRUD providers (credentials resource)
  it('admin can read, write, delete, and execute on credentials', () => {
    const actions = ['read', 'write', 'delete', 'execute'] as const;
    for (const action of actions) {
      const result = engine.check({ role: 'admin', resource: 'credentials', action });
      expect(result.allowed).toBe(true);
      expect(result.role).toBe('admin');
      expect(result.resource).toBe('credentials');
      expect(result.action).toBe(action);
    }
  });

  // Test 2: Developer can read providers but not create (delete)
  it('developer can read credentials but cannot delete them', () => {
    const readResult = engine.check({ role: 'developer', resource: 'credentials', action: 'read' });
    expect(readResult.allowed).toBe(true);

    const deleteResult = engine.check({ role: 'developer', resource: 'credentials', action: 'delete' });
    expect(deleteResult.allowed).toBe(false);
    expect(deleteResult.reason).toContain('developer');
  });

  // Test 3: Viewer can only read tasks
  it('viewer can read tasks but cannot write or delete them', () => {
    const readResult = engine.check({ role: 'viewer', resource: 'tasks', action: 'read' });
    expect(readResult.allowed).toBe(true);

    const writeResult = engine.check({ role: 'viewer', resource: 'tasks', action: 'write' });
    expect(writeResult.allowed).toBe(false);

    const deleteResult = engine.check({ role: 'viewer', resource: 'tasks', action: 'delete' });
    expect(deleteResult.allowed).toBe(false);
  });

  // Test 4: Admin can manage users (all actions)
  it('admin can perform all actions on users resource', () => {
    const actions = ['read', 'write', 'delete', 'execute'] as const;
    for (const action of actions) {
      const result = engine.check({ role: 'admin', resource: 'users', action });
      expect(result.allowed).toBe(true);
    }
  });

  // Test 5: Developer cannot manage users
  it('developer is denied all access to users resource', () => {
    const actions = ['read', 'write', 'delete', 'execute'] as const;
    for (const action of actions) {
      const result = engine.check({ role: 'developer', resource: 'users', action });
      expect(result.allowed).toBe(false);
    }
  });

  // Test 6: Viewer cannot access credentials
  it('viewer is denied all access to credentials resource', () => {
    const actions = ['read', 'write', 'delete', 'execute'] as const;
    for (const action of actions) {
      const result = engine.check({ role: 'viewer', resource: 'credentials', action });
      expect(result.allowed).toBe(false);
    }
  });

  // Test 7: getAllRoles() returns exactly 3 roles
  it('getAllRoles() returns exactly 3 role definitions', () => {
    const roles = engine.getAllRoles();
    expect(roles).toHaveLength(3);

    const roleNames = roles.map((r) => r.role);
    expect(roleNames).toContain('admin');
    expect(roleNames).toContain('developer');
    expect(roleNames).toContain('viewer');
  });

  // Test 8: getRoleDefinition('admin') returns a definition with all 12 resources
  it('getRoleDefinition(admin) returns a definition covering all 12 resource groups', () => {
    const def = engine.getRoleDefinition('admin');
    expect(def.role).toBe('admin');
    expect(def.description).toBeTruthy();

    const ALL_RESOURCES = [
      'credentials', 'models', 'agents', 'tasks', 'workflows',
      'audit', 'users', 'plugins', 'marketplace', 'blueprints',
      'deployments', 'system',
    ];

    const coveredResources = def.permissions.map((p) => p.resource);
    for (const resource of ALL_RESOURCES) {
      expect(coveredResources).toContain(resource);
    }
  });
});
