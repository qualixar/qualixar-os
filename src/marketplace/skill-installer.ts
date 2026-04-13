// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 3 -- Skill Installer Bridge
 *
 * Connects install/uninstall/delete actions to:
 *   1. skill_packages DB table (persistence)
 *   2. CategorizedToolRegistry (Forge sees tools immediately)
 *   3. EventBus (dashboard reacts in real-time)
 *
 * Plan: .backup/pivot/PHASE3-MARKETPLACE-PLAN.md (Stream 3B)
 */

import type { QosDatabase } from '../db/database.js';
import type { CategorizedToolRegistry, ToolDefinition } from '../tools/tool-registry.js';
import type { EventBus } from '../events/event-bus.js';
import type { ToolCategory } from '../tools/tool-categories.js';
import { SkillManifestSchema, scopeToolName, type SkillManifest } from './skill-package.js';
import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillInstallResult {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly toolCount: number;
  readonly toolNames: readonly string[];
}

export interface SkillInstaller {
  /** Install a skill from a manifest object. Registers tools in ToolRegistry. */
  install(manifest: SkillManifest): SkillInstallResult;

  /** Uninstall: remove tools from ToolRegistry, mark inactive in DB. */
  uninstall(skillId: string): { removed: boolean; toolsRemoved: number };

  /** Delete: remove tools, delete from DB entirely. */
  deleteSkill(skillId: string): { deleted: boolean; toolsRemoved: number };

  /** Load all active skills from DB into ToolRegistry (bootstrap). */
  loadAllActive(): number;

  /** Load built-in plugin tools into ToolRegistry (bootstrap). */
  loadBuiltinTools(): number;
}

// ---------------------------------------------------------------------------
// Stub tool handler (returns description since we can't execute MCP here)
// ---------------------------------------------------------------------------

function createStubHandler(toolName: string): (input: Record<string, unknown>) => Promise<{ content: string }> {
  return async (input) => ({
    content: `[skill-tool] ${toolName} called with: ${JSON.stringify(input).substring(0, 200)}`,
  });
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SkillInstallerImpl implements SkillInstaller {
  private readonly _db: QosDatabase;
  private readonly _toolRegistry: CategorizedToolRegistry;
  private readonly _eventBus: EventBus;

  constructor(db: QosDatabase, toolRegistry: CategorizedToolRegistry, eventBus: EventBus) {
    this._db = db;
    this._toolRegistry = toolRegistry;
    this._eventBus = eventBus;
  }

  install(manifest: SkillManifest): SkillInstallResult {
    // 1. Validate
    const validated = SkillManifestSchema.parse(manifest);

    // 2. Persist to DB
    const id = generateId();
    const timestamp = now();
    const toolNames: string[] = [];

    this._db.db.prepare(`
      INSERT INTO skill_packages (id, name, version, description, category, author_name, license, tool_count, manifest, status, installed_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      id,
      validated.name,
      validated.version,
      validated.description,
      validated.category,
      validated.author.name,
      validated.license,
      validated.tools.length,
      JSON.stringify(validated),
      timestamp,
      timestamp,
    );

    // 3. Register tools in CategorizedToolRegistry
    for (const tool of validated.tools) {
      const scopedName = scopeToolName(validated.name, tool.name);
      toolNames.push(scopedName);

      const toolDef: ToolDefinition = {
        name: scopedName,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        handler: createStubHandler(scopedName),
        category: validated.category as ToolCategory,
        source: 'skill',
        annotations: tool.annotations,
      };

      try {
        this._toolRegistry.register(toolDef);
      } catch (err) {
        console.warn('Skill installer: tool registration skipped (may already exist):', scopedName, err);
      }
    }

    // 4. Emit event
    this._eventBus.emit({
      type: 'skill:installed',
      source: 'skill-installer',
      payload: { skillId: id, name: validated.name, version: validated.version, toolCount: toolNames.length },
    });

    return { id, name: validated.name, version: validated.version, toolCount: toolNames.length, toolNames };
  }

  uninstall(skillId: string): { removed: boolean; toolsRemoved: number } {
    // 1. Find skill in DB
    const row = this._db.get<{ id: string; name: string; manifest: string }>(
      'SELECT id, name, manifest FROM skill_packages WHERE id = ?',
      [skillId],
    );
    if (!row) return { removed: false, toolsRemoved: 0 };

    // 2. Remove tools from ToolRegistry
    let toolsRemoved = 0;
    try {
      const manifest = JSON.parse(row.manifest) as SkillManifest;
      for (const tool of manifest.tools) {
        const scopedName = scopeToolName(manifest.name, tool.name);
        // Use unregisterBySource to clean up
        const existing = this._toolRegistry.get(scopedName);
        if (existing && existing.source === 'skill') {
          toolsRemoved++;
        }
      }
      // Bulk remove all skill-source tools
      toolsRemoved = this._toolRegistry.unregisterBySource('skill', skillId);
    } catch (err) {
      console.warn('Skill installer: manifest parse error during uninstall:', err);
    }

    // 3. Mark inactive in DB (soft delete)
    this._db.db.prepare('UPDATE skill_packages SET status = ?, updated_at = ? WHERE id = ?')
      .run('inactive', now(), skillId);

    this._eventBus.emit({
      type: 'skill:installed',
      source: 'skill-installer',
      payload: { skillId, action: 'uninstalled', toolsRemoved },
    });

    return { removed: true, toolsRemoved };
  }

  deleteSkill(skillId: string): { deleted: boolean; toolsRemoved: number } {
    // 1. Uninstall first (removes tools from registry)
    const { toolsRemoved } = this.uninstall(skillId);

    // 2. Hard delete from DB
    this._db.db.prepare('DELETE FROM skill_packages WHERE id = ?').run(skillId);

    this._eventBus.emit({
      type: 'tool:removed',
      source: 'skill-installer',
      payload: { skillId, action: 'deleted', toolsRemoved },
    });

    return { deleted: true, toolsRemoved };
  }

  loadAllActive(): number {
    let loaded = 0;
    try {
      const rows = this._db.query<{ manifest: string; category: string }>(
        "SELECT manifest, category FROM skill_packages WHERE status = 'active'",
      );
      for (const row of rows) {
        try {
          const manifest = JSON.parse(row.manifest) as SkillManifest;
          for (const tool of manifest.tools) {
            const scopedName = scopeToolName(manifest.name, tool.name);
            const toolDef: ToolDefinition = {
              name: scopedName,
              description: tool.description,
              inputSchema: tool.inputSchema as Record<string, unknown>,
              handler: createStubHandler(scopedName),
              category: (row.category as ToolCategory) ?? 'knowledge',
              source: 'skill',
              annotations: tool.annotations,
            };
            try {
              this._toolRegistry.register(toolDef);
              loaded++;
            } catch (err) { console.warn('Skill installer: tool already registered, skipping:', scopedName, err); }
          }
        } catch (err) { console.warn('Skill installer: bad manifest, skipping:', err); }
      }
    } catch (err) {
      console.warn('Skill installer: loadAllActive error (table may not exist yet):', err);
    }
    return loaded;
  }

  loadBuiltinTools(): number {
    // Built-in plugin tools are already registered by createToolRegistry()
    // This method registers the AGENT tools (tools referenced by built-in agents)
    // that might not be in the registry yet
    return 0; // Built-ins handled by createToolRegistry + createBuiltInTools
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSkillInstaller(
  db: QosDatabase,
  toolRegistry: CategorizedToolRegistry,
  eventBus: EventBus,
): SkillInstaller {
  return new SkillInstallerImpl(db, toolRegistry, eventBus);
}
