/**
 * Qualixar OS Phase 22 -- Permission Matrix Tests
 *
 * Validates the static PERMISSION_MATRIX and ROLE_DEFINITIONS constants.
 * No DB or runtime dependencies — pure static data assertions.
 *
 * Coverage targets: role count, admin full coverage, developer no-users rule,
 * viewer read-only enforcement, and rate limit presence on all roles.
 */

import { describe, it, expect } from 'vitest';
import { PERMISSION_MATRIX, ROLE_DEFINITIONS } from '../../src/enterprise/permission-matrix.js';

// ---------------------------------------------------------------------------
// Constants mirrored from permission-matrix.ts for assertion clarity
// ---------------------------------------------------------------------------

const ALL_RESOURCES = [
  'credentials',
  'models',
  'agents',
  'tasks',
  'workflows',
  'audit',
  'users',
  'plugins',
  'marketplace',
  'blueprints',
  'deployments',
  'system',
] as const;

const ALL_ACTIONS = ['read', 'write', 'delete', 'execute'] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PERMISSION_MATRIX and ROLE_DEFINITIONS', () => {

  // Test 1: ROLE_DEFINITIONS has exactly 3 entries
  it('ROLE_DEFINITIONS contains exactly 3 role entries', () => {
    expect(ROLE_DEFINITIONS).toHaveLength(3);

    const roles = ROLE_DEFINITIONS.map((d) => d.role);
    expect(roles).toContain('admin');
    expect(roles).toContain('developer');
    expect(roles).toContain('viewer');
  });

  // Test 2: Admin has permissions for all 12 resources (full CRUD + execute)
  it('admin has all 4 actions on every one of the 12 resource groups', () => {
    const adminMatrix = PERMISSION_MATRIX['admin'];

    for (const resource of ALL_RESOURCES) {
      const actions = adminMatrix[resource];
      expect(actions, `admin missing actions on ${resource}`).toBeDefined();
      for (const action of ALL_ACTIONS) {
        expect(
          (actions as readonly string[]).includes(action),
          `admin missing '${action}' on '${resource}'`,
        ).toBe(true);
      }
    }
  });

  // Test 3: Developer has NO permissions on users resource
  it('developer has an empty action list for the users resource', () => {
    const developerUsers = PERMISSION_MATRIX['developer']['users'];
    expect(developerUsers).toHaveLength(0);
  });

  // Test 4: Viewer has only read on resources where they have any access
  it('viewer has only read-only access (no write, delete, or execute) on non-empty resources', () => {
    const viewerMatrix = PERMISSION_MATRIX['viewer'];

    for (const resource of ALL_RESOURCES) {
      const actions = viewerMatrix[resource];
      if (actions.length > 0) {
        // Must only contain 'read'
        expect(
          (actions as readonly string[]).includes('write'),
          `viewer should not have write on ${resource}`,
        ).toBe(false);
        expect(
          (actions as readonly string[]).includes('delete'),
          `viewer should not have delete on ${resource}`,
        ).toBe(false);
        expect(
          (actions as readonly string[]).includes('execute'),
          `viewer should not have execute on ${resource}`,
        ).toBe(false);
        expect(
          (actions as readonly string[]).includes('read'),
          `viewer should have read on non-empty resource ${resource}`,
        ).toBe(true);
      }
    }
  });

  // Test 5: Every role definition has a rateLimit defined
  it('every role definition has a numeric rateLimit.requestsPerMinute', () => {
    for (const def of ROLE_DEFINITIONS) {
      expect(def.rateLimit, `${def.role} is missing rateLimit`).toBeDefined();
      expect(
        typeof def.rateLimit.requestsPerMinute === 'number',
        `${def.role}.rateLimit.requestsPerMinute is not a number`,
      ).toBe(true);
    }

    // Spot-check known values
    const admin = ROLE_DEFINITIONS.find((d) => d.role === 'admin')!;
    const developer = ROLE_DEFINITIONS.find((d) => d.role === 'developer')!;
    const viewer = ROLE_DEFINITIONS.find((d) => d.role === 'viewer')!;

    expect(admin.rateLimit.requestsPerMinute).toBe(Infinity);
    expect(developer.rateLimit.requestsPerMinute).toBe(1000);
    expect(viewer.rateLimit.requestsPerMinute).toBe(100);
  });
});
