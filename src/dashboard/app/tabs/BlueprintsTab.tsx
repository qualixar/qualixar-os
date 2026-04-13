/**
 * Qualixar OS Phase 16 -- Blueprints Tab
 * Reusable template gallery for agents, topologies, workflows, pipelines.
 * Data from GET /api/blueprints -> { blueprints: BlueprintEntry[] }
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, LoadingSpinner } from '../components/shared.js';
import type { BlueprintEntry } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type BlueprintType = BlueprintEntry['type'];

const BLUEPRINT_TYPES: readonly BlueprintType[] = ['agent', 'topology', 'workflow', 'pipeline'] as const;

const TYPE_COLORS: Record<BlueprintType, { bg: string; text: string; border: string }> = {
  agent:    { bg: 'var(--accent-soft)', text: 'var(--accent)', border: 'var(--accent)' },
  topology: { bg: 'var(--info-soft)', text: 'var(--info)', border: 'var(--info)' },
  workflow: { bg: 'var(--success-soft)', text: 'var(--success)', border: 'var(--success)' },
  pipeline: { bg: 'var(--warning-soft)', text: 'var(--warning)', border: 'var(--warning)' },
};

const TYPE_ICONS: Record<BlueprintType, string> = {
  agent: '🤖',
  topology: '🔗',
  workflow: '⚙️',
  pipeline: '🔄',
};

type SortKey = 'name' | 'usageCount' | 'updatedAt';

// ---------------------------------------------------------------------------
// Mock data (used when store is empty)
// ---------------------------------------------------------------------------

const MOCK_BLUEPRINTS: readonly BlueprintEntry[] = [
  {
    id: 'bp-001', name: 'Code Review Team', type: 'agent',
    description: 'A multi-agent team for automated code review with reviewer, security auditor, and style checker agents.',
    agentCount: 3, tags: ['code-review', 'quality', 'security'], usageCount: 47,
    createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-28T14:30:00Z',
  },
  {
    id: 'bp-002', name: 'Research Pipeline', type: 'pipeline',
    description: 'End-to-end research pipeline: search, extract, summarize, synthesize with citation tracking.',
    tags: ['research', 'summarization', 'extraction'], usageCount: 32,
    createdAt: '2026-03-10T08:00:00Z', updatedAt: '2026-03-27T09:15:00Z',
  },
  {
    id: 'bp-003', name: 'Debate Topology', type: 'topology',
    description: 'Adversarial debate topology with proposer, critic, and judge agents for robust decision-making.',
    topology: 'debate-ring', agentCount: 3, tags: ['debate', 'adversarial', 'decision'], usageCount: 19,
    createdAt: '2026-03-12T11:00:00Z', updatedAt: '2026-03-26T16:45:00Z',
  },
  {
    id: 'bp-004', name: 'CI/CD Workflow', type: 'workflow',
    description: 'Continuous integration workflow: lint, test, build, deploy with rollback on failure.',
    tags: ['ci-cd', 'deployment', 'automation'], usageCount: 58,
    createdAt: '2026-03-08T07:00:00Z', updatedAt: '2026-03-29T11:00:00Z',
  },
  {
    id: 'bp-005', name: 'Data Cleaning Agent', type: 'agent',
    description: 'Specialized agent for data validation, deduplication, and normalization across CSV and JSON sources.',
    agentCount: 1, tags: ['data', 'cleaning', 'etl'], usageCount: 25,
    createdAt: '2026-03-14T09:30:00Z', updatedAt: '2026-03-25T13:20:00Z',
  },
  {
    id: 'bp-006', name: 'Fan-Out Topology', type: 'topology',
    description: 'Parallel fan-out topology distributing work across N worker agents with an aggregator.',
    topology: 'fan-out', agentCount: 5, tags: ['parallel', 'fan-out', 'scalable'], usageCount: 41,
    createdAt: '2026-03-11T15:00:00Z', updatedAt: '2026-03-28T10:00:00Z',
  },
  {
    id: 'bp-007', name: 'Document Processing Pipeline', type: 'pipeline',
    description: 'Ingests documents, extracts tables and text, classifies content, and generates structured output.',
    tags: ['documents', 'extraction', 'classification'], usageCount: 36,
    createdAt: '2026-03-09T12:00:00Z', updatedAt: '2026-03-27T08:45:00Z',
  },
  {
    id: 'bp-008', name: 'Approval Workflow', type: 'workflow',
    description: 'Multi-step human-in-the-loop approval workflow with escalation rules and SLA tracking.',
    tags: ['approval', 'human-in-loop', 'governance'], usageCount: 14,
    createdAt: '2026-03-13T16:00:00Z', updatedAt: '2026-03-24T17:30:00Z',
  },
] as const;

// ---------------------------------------------------------------------------
// TypeBadge
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { readonly type: BlueprintType }) {
  const colors = TYPE_COLORS[type];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
    }}>
      {TYPE_ICONS[type]} {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BlueprintFilterBar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  readonly search: string;
  readonly onSearchChange: (v: string) => void;
  readonly activeType: BlueprintType | null;
  readonly onTypeChange: (v: BlueprintType | null) => void;
  readonly sortBy: SortKey;
  readonly onSortChange: (v: SortKey) => void;
  readonly onCreateClick: () => void;
}

function BlueprintFilterBar({
  search, onSearchChange, activeType, onTypeChange, sortBy, onSortChange, onCreateClick,
}: FilterBarProps) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
      marginBottom: 20, padding: 16, background: 'var(--bg-secondary)', borderRadius: 8,
      border: '1px solid var(--bg-tertiary)',
    }}>
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search blueprints..."
        style={{
          flex: '1 1 200px', padding: '8px 12px', borderRadius: 6,
          border: '1px solid var(--border-glass)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
          fontSize: 14, outline: 'none', minWidth: 180,
        }}
      />

      {/* Type chips */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => onTypeChange(null)}
          style={{
            padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
            border: activeType === null ? '1px solid var(--info)' : '1px solid var(--border-glass)',
            background: activeType === null ? 'var(--info-soft)' : 'var(--bg-tertiary)',
            color: activeType === null ? 'var(--info)' : 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          All
        </button>
        {BLUEPRINT_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => onTypeChange(activeType === t ? null : t)}
            style={{
              padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
              border: activeType === t ? `1px solid ${TYPE_COLORS[t].border}` : '1px solid var(--border-glass)',
              background: activeType === t ? TYPE_COLORS[t].bg : 'var(--bg-tertiary)',
              color: activeType === t ? TYPE_COLORS[t].text : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {TYPE_ICONS[t]} {t}
          </button>
        ))}
      </div>

      {/* Sort */}
      <select
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        style={{
          padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-glass)',
          background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
        }}
      >
        <option value="name">Sort: Name</option>
        <option value="usageCount">Sort: Most Used</option>
        <option value="updatedAt">Sort: Recently Updated</option>
      </select>

      {/* Create button */}
      <button
        onClick={onCreateClick}
        style={{
          padding: '8px 16px', borderRadius: 6, border: '1px solid var(--success)',
          background: 'var(--success-soft)', color: 'var(--success)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        + New Blueprint
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlueprintCard
// ---------------------------------------------------------------------------

interface BlueprintCardProps {
  readonly blueprint: BlueprintEntry;
  readonly onSelect: (bp: BlueprintEntry) => void;
}

function BlueprintCard({ blueprint, onSelect }: BlueprintCardProps) {
  return (
    <div
      onClick={() => onSelect(blueprint)}
      style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: 10,
        padding: 20, cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s',
        display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = TYPE_COLORS[blueprint.type].border;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--bg-tertiary)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <TypeBadge type={blueprint.type} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {blueprint.usageCount} uses
        </span>
      </div>

      {/* Name */}
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
        {blueprint.name}
      </h3>

      {/* Description (truncated 2 lines) */}
      <p style={{
        margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {blueprint.description}
      </p>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 'auto' }}>
        {blueprint.tags.map((tag) => (
          <span key={tag} style={{
            padding: '2px 8px', borderRadius: 10, fontSize: 11,
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)',
          }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {blueprint.agentCount != null && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {blueprint.agentCount} agent{blueprint.agentCount !== 1 ? 's' : ''}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            deployBlueprint(blueprint.id);
          }}
          style={{
            marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, fontSize: 12,
            fontWeight: 600, border: '1px solid var(--info)', background: 'var(--info-soft)',
            color: 'var(--info)', cursor: 'pointer',
          }}
        >
          Deploy
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function deployBlueprint(id: string): Promise<void> {
  try {
    // Create a deployment record via Phase 18 deployment API
    const deployRes = await fetch('/api/deployments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprintId: id, triggerType: 'once' }),
    });
    if (!deployRes.ok) {
      const errData = await deployRes.json().catch(() => ({}));
      console.warn('[BlueprintsTab] Deployment API error:', (errData as { error?: string }).error ?? deployRes.status);
    }
    // Also increment usage count on the blueprint
    const res = await fetch(`/api/blueprints/${id}/deploy`, { method: 'POST' });
    if (!res.ok) throw new Error(`Deploy failed: ${res.status}`);
  } catch (err) {
    console.error('[BlueprintsTab] Deploy error:', err);
  }
}

async function deleteBlueprint(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/blueprints/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch (err) {
    console.error('[BlueprintsTab] Delete error:', err);
    return false;
  }
}

async function createBlueprint(payload: {
  readonly name: string;
  readonly type: BlueprintType;
  readonly description: string;
  readonly tags: readonly string[];
}): Promise<boolean> {
  try {
    const res = await fetch('/api/blueprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.error('[BlueprintsTab] Create error:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// BlueprintGallery
// ---------------------------------------------------------------------------

interface GalleryProps {
  readonly blueprints: readonly BlueprintEntry[];
  readonly onSelect: (bp: BlueprintEntry) => void;
}

function BlueprintGallery({ blueprints, onSelect }: GalleryProps) {
  if (blueprints.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 14,
      }}>
        No blueprints match your filters.
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
      gap: 16,
    }}>
      {blueprints.map((bp) => (
        <BlueprintCard key={bp.id} blueprint={bp} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlueprintDetailModal
// ---------------------------------------------------------------------------

interface DetailModalProps {
  readonly blueprint: BlueprintEntry;
  readonly onClose: () => void;
  readonly onDelete: (id: string) => void;
}

function BlueprintDetailModal({ blueprint, onClose, onDelete }: DetailModalProps) {
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    await deployBlueprint(blueprint.id);
    setDeploying(false);
  }, [blueprint.id]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    const ok = await deleteBlueprint(blueprint.id);
    setDeleting(false);
    if (ok) onDelete(blueprint.id);
  }, [blueprint.id, onDelete]);

  const configJson = useMemo(() => JSON.stringify({
    id: blueprint.id,
    type: blueprint.type,
    topology: blueprint.topology ?? null,
    agentCount: blueprint.agentCount ?? null,
    tags: blueprint.tags,
  }, null, 2), [blueprint]);

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', borderRadius: 12,
          padding: 28, maxWidth: 620, width: '100%', maxHeight: '85vh',
          overflowY: 'auto', position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16, background: 'none',
            border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer',
          }}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <TypeBadge type={blueprint.type} />
          <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>{blueprint.name}</h2>
        </div>

        {/* Description */}
        <p style={{ color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          {blueprint.description}
        </p>

        {/* Metadata grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20,
        }}>
          {blueprint.agentCount != null && (
            <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Agents</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{blueprint.agentCount}</div>
            </div>
          )}
          <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Usage Count</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{blueprint.usageCount}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Created</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{new Date(blueprint.createdAt).toLocaleDateString()}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Updated</div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{new Date(blueprint.updatedAt).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Topology placeholder */}
        {blueprint.topology && (
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: 8,
            padding: 20, textAlign: 'center', marginBottom: 16, color: 'var(--text-muted)', fontSize: 13,
          }}>
            Topology: <strong style={{ color: 'var(--info)' }}>{blueprint.topology}</strong>
            <div style={{ marginTop: 8, fontSize: 12, fontStyle: 'italic' }}>
              Visualization placeholder — connect to topology renderer
            </div>
          </div>
        )}

        {/* Tags */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Tags</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {blueprint.tags.map((tag) => (
              <span key={tag} style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 12,
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)',
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Config JSON viewer */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Configuration</div>
          <pre style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: 8,
            padding: 14, fontSize: 12, color: 'var(--accent)', overflow: 'auto',
            maxHeight: 200, margin: 0,
          }}>
            {configJson}
          </pre>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleDeploy}
            disabled={deploying}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--info)',
              background: 'var(--info-soft)', color: 'var(--info)', fontSize: 14, fontWeight: 600,
              cursor: deploying ? 'wait' : 'pointer', opacity: deploying ? 0.6 : 1,
            }}
          >
            {deploying ? 'Deploying...' : 'Deploy'}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '10px 16px', borderRadius: 8, border: '1px solid var(--danger)',
              background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 14, fontWeight: 600,
              cursor: deleting ? 'wait' : 'pointer', opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// CreateBlueprintForm
// ---------------------------------------------------------------------------

interface CreateFormProps {
  readonly onCreated: () => void;
  readonly onCancel: () => void;
}

function CreateBlueprintForm({ onCreated, onCancel }: CreateFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<BlueprintType>('agent');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !description.trim()) return;
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    setSaving(true);
    const ok = await createBlueprint({ name: name.trim(), type, description: description.trim(), tags });
    setSaving(false);
    if (ok) onCreated();
  }, [name, type, description, tagsInput, onCreated]);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 6,
    border: '1px solid var(--border-glass)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block',
  };

  return (
    <Card title="Create Blueprint" subtitle="Define a new reusable template">
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Create Blueprint</h3>
          <button
            onClick={onCancel}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: 16, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Review Team"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BlueprintType)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {BLUEPRINT_TYPES.map((t) => (
                <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this blueprint do?"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="e.g. code-review, quality, security"
            style={inputStyle}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !description.trim()}
          style={{
            padding: '10px 24px', borderRadius: 6, border: '1px solid var(--success)',
            background: 'var(--success-soft)', color: 'var(--success)', fontSize: 14, fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
            opacity: (saving || !name.trim() || !description.trim()) ? 0.5 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save Blueprint'}
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// BlueprintsTab (main)
// ---------------------------------------------------------------------------

export default function BlueprintsTab() {
  const blueprintsFromStore = useDashboardStore((s) => s.blueprints) ?? [];
  const fetchBlueprints = useDashboardStore((s) => s.fetchBlueprints);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<BlueprintType | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('usageCount');
  const [selectedBp, setSelectedBp] = useState<BlueprintEntry | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Use mock data if store is empty
  const isDemo = blueprintsFromStore.length === 0;
  const allBlueprints = useMemo(
    () => (blueprintsFromStore.length > 0 ? blueprintsFromStore : MOCK_BLUEPRINTS),
    [blueprintsFromStore],
  );

  useEffect(() => {
    fetchBlueprints().finally(() => setLoading(false));
  }, [fetchBlueprints]);

  // Filter + sort
  const filteredBlueprints = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const filtered = allBlueprints.filter((bp) => {
      if (activeType && bp.type !== activeType) return false;
      if (lowerSearch) {
        const matchesName = bp.name.toLowerCase().includes(lowerSearch);
        const matchesDesc = bp.description.toLowerCase().includes(lowerSearch);
        const matchesTags = bp.tags.some((t) => t.toLowerCase().includes(lowerSearch));
        if (!matchesName && !matchesDesc && !matchesTags) return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'usageCount') return b.usageCount - a.usageCount;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return sorted;
  }, [allBlueprints, search, activeType, sortBy]);

  const handleDelete = useCallback((id: string) => {
    setSelectedBp(null);
    fetchBlueprints();
  }, [fetchBlueprints]);

  const handleCreated = useCallback(() => {
    setShowCreateForm(false);
    fetchBlueprints();
  }, [fetchBlueprints]);

  // Type summary counts — MUST be before any early return (hooks order rule)
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const bp of allBlueprints) {
      counts[bp.type] = (counts[bp.type] ?? 0) + 1;
    }
    return counts;
  }, [allBlueprints]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ padding: 4 }}>
      {/* Demo banner */}
      {isDemo && (
        <div style={{
          padding: '8px 16px', marginBottom: 16, borderRadius: 8,
          background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#f59e0b', fontSize: 13, fontWeight: 500,
        }}>
          Showing demo data. Create blueprints or connect a live backend to see real data.
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 22, color: 'var(--text-primary)' }}>
          Blueprints
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Reusable templates for agents, topologies, workflows, and pipelines.
          {' '}{allBlueprints.length} blueprint{allBlueprints.length !== 1 ? 's' : ''} available.
        </p>
      </div>

      {/* Summary badges */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {BLUEPRINT_TYPES.map((t) => (
          <div key={t} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 14px', borderRadius: 8, background: 'var(--bg-secondary)',
            border: '1px solid var(--bg-tertiary)',
          }}>
            <TypeBadge type={t} />
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {typeCounts[t] ?? 0}
            </span>
          </div>
        ))}
      </div>

      {/* Create form (toggled) */}
      {showCreateForm && (
        <div style={{ marginBottom: 20 }}>
          <CreateBlueprintForm
            onCreated={handleCreated}
            onCancel={() => setShowCreateForm(false)}
          />
        </div>
      )}

      {/* Filter bar */}
      <BlueprintFilterBar
        search={search}
        onSearchChange={setSearch}
        activeType={activeType}
        onTypeChange={setActiveType}
        sortBy={sortBy}
        onSortChange={setSortBy}
        onCreateClick={() => setShowCreateForm((v) => !v)}
      />

      {/* Gallery */}
      <BlueprintGallery
        blueprints={filteredBlueprints}
        onSelect={setSelectedBp}
      />

      {/* Detail modal */}
      {selectedBp && (
        <BlueprintDetailModal
          blueprint={selectedBp}
          onClose={() => setSelectedBp(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
