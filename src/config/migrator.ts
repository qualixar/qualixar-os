// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Config Migrator
 *
 * Handles migration of older config shapes to the current schema version.
 * Source of truth: Phase 0 LLD Section 2.4.
 *
 * Algorithm:
 *   1. Validate input is a non-null object
 *   2. Check for _version field
 *   3. If absent or current (1) -> pass through unchanged
 *   4. If old version -> apply sequential migration transforms
 *   5. Return migrated object (without _version field)
 *
 * L-06: LLD DEVIATION (intentional): Uses `_version` (underscore prefix)
 * instead of the LLD's `version`. The underscore convention signals this
 * is internal metadata, not a user-facing config field. The `_version`
 * field is stripped from the output after migration, so it never appears
 * in the resolved config object. This matches the `_migrations` table
 * naming convention used in the database layer.
 */

// Current config schema version. Bump this when adding new migrations.
const CURRENT_VERSION = 1;

/**
 * Migrate a raw config object from an older schema version to the current one.
 *
 * @param raw - The raw config object (typically from YAML parse)
 * @returns The migrated config object, ready for Zod validation
 * @throws Error if input is not an object or version is unsupported
 */
export function migrateConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  // Step 1: Validate input is a non-null object
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Config must be an object');
  }

  // Step 2: Check _version field
  const version = raw._version;

  // Step 3: No version field means current version -- pass through
  if (version === undefined || version === CURRENT_VERSION) {
    // Strip _version if present (Zod schema does not include it)
    if (version !== undefined) {
      const { _version: _, ...rest } = raw;
      return rest;
    }
    return raw;
  }

  // Step 4: Validate version is a number
  if (typeof version !== 'number') {
    throw new Error(`Unknown config version: ${String(version)}`);
  }

  // Step 5: Apply sequential migrations for known older versions
  // Currently no older versions exist -- this is a placeholder for future migrations.
  // When version 2 is introduced, add: if (version === 1) { /* migrate 1->2 */ }
  throw new Error(`Unknown config version: ${version}`);
}
