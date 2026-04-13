// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 16 -- BrainTab (Prompt Library)
 * Prompt library with version control, filtering, editing, and sharing.
 * Judge configuration card for strictness and custom prompt.
 * Data from GET /api/prompts -> { prompts: PromptEntry[] }
 * PromptEntry: { id, name, category, content, version, usageCount, tags, createdAt, updatedAt }
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useDashboardStore } from '../store.js';
import type { PromptEntry } from '../store.js';
import { Card, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type PromptCategory = PromptEntry['category'];

const CATEGORY_COLORS: Record<PromptCategory, string> = {
  system: 'var(--accent)',
  task: 'var(--success)',
  'few-shot': 'var(--warning)',
  judge: 'var(--danger)',
};

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  system: 'System',
  task: 'Task',
  'few-shot': 'Few-Shot',
  judge: 'Judge',
};

const ALL_CATEGORIES: readonly PromptCategory[] = ['system', 'task', 'few-shot', 'judge'];

type SortField = 'name' | 'usageCount' | 'updatedAt';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

// MOCK_PROMPTS removed — empty state shown when store is empty

// ---------------------------------------------------------------------------
// CategoryBadge
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { readonly category: PromptCategory }): React.ReactElement {
  const color = CATEGORY_COLORS[category];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.025em',
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PromptStats
// ---------------------------------------------------------------------------

function PromptStats({ prompts }: { readonly prompts: readonly PromptEntry[] }): React.ReactElement {
  const stats = useMemo(() => {
    const byCategory = { system: 0, task: 0, 'few-shot': 0, judge: 0 };
    for (const p of prompts) {
      byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
    }
    return { total: prompts.length, ...byCategory };
  }, [prompts]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
      <Card title="Total Prompts" subtitle="library size">
        <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.total}</div>
      </Card>
      <Card title="System Prompts" subtitle="agent personas">
        <div style={{ fontSize: '2rem', fontWeight: 700, color: CATEGORY_COLORS.system }}>{stats.system}</div>
      </Card>
      <Card title="Task Templates" subtitle="reusable tasks">
        <div style={{ fontSize: '2rem', fontWeight: 700, color: CATEGORY_COLORS.task }}>{stats.task}</div>
      </Card>
      <Card title="Few-Shot Examples" subtitle="in-context learning">
        <div style={{ fontSize: '2rem', fontWeight: 700, color: CATEGORY_COLORS['few-shot'] }}>{stats['few-shot']}</div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptFilterBar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  readonly activeCategory: PromptCategory | null;
  readonly onCategoryChange: (cat: PromptCategory | null) => void;
  readonly searchQuery: string;
  readonly onSearchChange: (q: string) => void;
  readonly sortField: SortField;
  readonly onSortChange: (f: SortField) => void;
  readonly onNewPrompt: () => void;
}

function PromptFilterBar({
  activeCategory, onCategoryChange, searchQuery, onSearchChange,
  sortField, onSortChange, onNewPrompt,
}: FilterBarProps): React.ReactElement {
  const chipStyle = (active: boolean, color: string): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '9999px',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${active ? color : 'var(--border-glass)'}`,
    backgroundColor: active ? `${color}22` : 'transparent',
    color: active ? color : 'var(--text-secondary)',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem',
      flexWrap: 'wrap', padding: '0.75rem 1rem', backgroundColor: 'var(--bg-primary)',
      borderRadius: '0.75rem', border: '1px solid var(--bg-tertiary)',
    }}>
      {/* Category chips */}
      <button style={chipStyle(activeCategory === null, 'var(--info)')} onClick={() => onCategoryChange(null)}>
        All
      </button>
      {ALL_CATEGORIES.map((cat) => (
        <button
          key={cat}
          style={chipStyle(activeCategory === cat, CATEGORY_COLORS[cat])}
          onClick={() => onCategoryChange(activeCategory === cat ? null : cat)}
        >
          {CATEGORY_LABELS[cat]}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      {/* Search */}
      <input
        type="text"
        placeholder="Search prompts..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          padding: '6px 12px', borderRadius: '0.5rem', border: '1px solid var(--border-glass)',
          backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.85rem',
          outline: 'none', width: '200px',
        }}
      />

      {/* Sort */}
      <select
        value={sortField}
        onChange={(e) => onSortChange(e.target.value as SortField)}
        style={{
          padding: '6px 12px', borderRadius: '0.5rem', border: '1px solid var(--border-glass)',
          backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.85rem',
          outline: 'none', cursor: 'pointer',
        }}
      >
        <option value="name">Sort: Name</option>
        <option value="usageCount">Sort: Usage</option>
        <option value="updatedAt">Sort: Recent</option>
      </select>

      {/* New Prompt */}
      <button
        onClick={onNewPrompt}
        style={{
          padding: '6px 16px', borderRadius: '0.5rem', border: '1px solid var(--info)',
          backgroundColor: 'var(--info)', color: 'var(--text-primary)', fontSize: '0.85rem',
          fontWeight: 600, cursor: 'pointer',
        }}
      >
        + New Prompt
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptList
// ---------------------------------------------------------------------------

interface PromptListProps {
  readonly prompts: readonly PromptEntry[];
  readonly selectedId: string | null;
  readonly onSelect: (p: PromptEntry) => void;
}

function PromptList({ prompts, selectedId, onSelect }: PromptListProps): React.ReactElement {
  const columns = useMemo(() => [
    {
      key: 'name',
      header: 'Name',
      render: (row: Record<string, unknown>) => (
        <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontWeight: 500 }}>
          {row.name as string}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row: Record<string, unknown>) => (
        <CategoryBadge category={row.category as PromptCategory} />
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (row: Record<string, unknown>) => (
        <span style={{ color: 'var(--text-secondary)' }}>v{row.version as number}</span>
      ),
    },
    {
      key: 'usageCount',
      header: 'Usage',
      render: (row: Record<string, unknown>) => (
        <span style={{ color: 'var(--success)', fontWeight: 600 }}>{row.usageCount as number}</span>
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      render: (row: Record<string, unknown>) => {
        const tags = row.tags as readonly string[];
        return (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {tags.slice(0, 3).map((t) => (
              <span key={t} style={{
                padding: '1px 8px', borderRadius: '4px', fontSize: '0.7rem',
                backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-glass)',
              }}>
                {t}
              </span>
            ))}
            {tags.length > 3 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+{tags.length - 3}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row: Record<string, unknown>) => (
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {new Date(row.updatedAt as string).toLocaleDateString()}
        </span>
      ),
    },
  ], []);

  if (prompts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        No prompts match your filters.
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: '0.75rem', border: '1px solid var(--bg-tertiary)', overflow: 'hidden',
    }}>
      <DataTable
        columns={columns}
        data={prompts as unknown as readonly Record<string, unknown>[]}
        emptyMessage="No prompts in library"
        onRowClick={(row) => onSelect(row as unknown as PromptEntry)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptEditor
// ---------------------------------------------------------------------------

interface EditorState {
  readonly id: string | null;
  readonly name: string;
  readonly category: PromptCategory;
  readonly content: string;
  readonly tags: string;
  readonly version: number;
  readonly mode: 'create' | 'edit';
}

const EMPTY_EDITOR: EditorState = {
  id: null, name: '', category: 'system', content: '', tags: '', version: 1, mode: 'create',
};

function editorFromPrompt(p: PromptEntry): EditorState {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    content: p.content,
    tags: p.tags.join(', '),
    version: p.version,
    mode: 'edit',
  };
}

interface PromptEditorProps {
  readonly editor: EditorState;
  readonly onChange: (e: EditorState) => void;
  readonly onSave: () => void;
  readonly onClose: () => void;
  readonly saving: boolean;
  readonly copyFeedback: string;
  readonly onCopy: () => void;
}

function PromptEditor({
  editor, onChange, onSave, onClose, saving, copyFeedback, onCopy,
}: PromptEditorProps): React.ReactElement {
  const lineCount = editor.content.split('\n').length;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', top: 0, right: 0, width: '520px', height: '100vh',
      backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-glass)',
      display: 'flex', flexDirection: 'column', zIndex: 1000,
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1.25rem', borderBottom: '1px solid var(--bg-tertiary)',
      }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1rem' }}>
          {editor.mode === 'create' ? 'New Prompt' : `Edit: ${editor.name}`}
        </h3>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: '1.25rem', padding: '4px 8px',
        }}>
          x
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Name */}
        <div>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Name
          </label>
          <input
            value={editor.name}
            onChange={(e) => onChange({ ...editor, name: e.target.value })}
            placeholder="prompt-name"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '0.5rem',
              border: '1px solid var(--border-glass)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              fontSize: '0.9rem', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Category */}
        <div>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Category
          </label>
          <select
            value={editor.category}
            onChange={(e) => onChange({ ...editor, category: e.target.value as PromptCategory })}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '0.5rem',
              border: '1px solid var(--border-glass)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              fontSize: '0.9rem', outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
            }}
          >
            {ALL_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
        </div>

        {/* Content (mini editor) */}
        <div style={{ flex: 1, minHeight: '240px' }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Content
          </label>
          <div style={{
            position: 'relative', borderRadius: '0.5rem', border: '1px solid var(--border-glass)',
            overflow: 'hidden', backgroundColor: 'var(--bg-primary)',
          }}>
            {/* Line numbers */}
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '40px',
              backgroundColor: 'var(--bg-primary)', borderRight: '1px solid var(--bg-tertiary)',
              padding: '12px 0', overflow: 'hidden', pointerEvents: 'none',
            }}>
              {Array.from({ length: Math.max(lineCount, 10) }, (_, i) => (
                <div key={i} style={{
                  textAlign: 'right', paddingRight: '8px', fontSize: '0.75rem',
                  lineHeight: '1.5rem', color: 'var(--border-glass)', fontFamily: 'monospace',
                }}>
                  {i + 1}
                </div>
              ))}
            </div>
            <textarea
              value={editor.content}
              onChange={(e) => onChange({ ...editor, content: e.target.value })}
              placeholder="Enter prompt content..."
              spellCheck={false}
              style={{
                width: '100%', minHeight: '240px', padding: '12px 12px 12px 52px',
                backgroundColor: 'transparent', color: 'var(--text-primary)', border: 'none',
                fontFamily: '"Fira Code", "JetBrains Mono", "SF Mono", monospace',
                fontSize: '0.85rem', lineHeight: '1.5rem', resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tags (comma-separated)
          </label>
          <input
            value={editor.tags}
            onChange={(e) => onChange({ ...editor, tags: e.target.value })}
            placeholder="tag1, tag2, tag3"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '0.5rem',
              border: '1px solid var(--border-glass)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Version (read-only) */}
        {editor.mode === 'edit' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Version:</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>v{editor.version}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(auto-incremented on save)</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', gap: '0.75rem', padding: '1rem 1.25rem',
        borderTop: '1px solid var(--bg-tertiary)', alignItems: 'center',
      }}>
        <button
          onClick={onSave}
          disabled={saving || !editor.name.trim() || !editor.content.trim()}
          style={{
            flex: 1, padding: '10px', borderRadius: '0.5rem', border: 'none',
            backgroundColor: saving || !editor.name.trim() || !editor.content.trim() ? 'var(--bg-tertiary)' : 'var(--info)',
            color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : editor.mode === 'create' ? 'Create Prompt' : 'Save Changes'}
        </button>
        <button
          onClick={onCopy}
          disabled={!editor.content.trim()}
          style={{
            padding: '10px 20px', borderRadius: '0.5rem',
            border: '1px solid var(--border-glass)', backgroundColor: 'var(--bg-tertiary)',
            color: copyFeedback ? 'var(--success)' : 'var(--text-primary)',
            fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer',
            minWidth: '90px',
          }}
        >
          {copyFeedback || 'Copy'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// JudgeConfiguration
// ---------------------------------------------------------------------------

type JudgeStrictness = 'strict' | 'balanced' | 'lenient';

const STRICTNESS_OPTIONS: readonly { readonly value: JudgeStrictness; readonly label: string; readonly description: string }[] = [
  { value: 'strict', label: 'Strict', description: 'Zero tolerance for issues — rejects on any concern' },
  { value: 'balanced', label: 'Balanced', description: 'Flags issues but allows minor deviations' },
  { value: 'lenient', label: 'Lenient', description: 'Permissive — only rejects critical failures' },
];

function JudgeConfiguration(): React.ReactElement {
  const systemConfig = useDashboardStore((s) => s.systemConfig);
  const updateConfig = useDashboardStore((s) => s.updateConfig);
  const fetchConfig = useDashboardStore((s) => s.fetchConfig);

  const [strictness, setStrictness] = useState<JudgeStrictness>('balanced');
  const [customPrompt, setCustomPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Load persisted values from config on mount
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    const quality = systemConfig.quality as Record<string, unknown> | undefined;
    if (quality) {
      if (quality.judge_strictness && typeof quality.judge_strictness === 'string') {
        setStrictness(quality.judge_strictness as JudgeStrictness);
      }
      if (quality.custom_judge_prompt && typeof quality.custom_judge_prompt === 'string') {
        setCustomPrompt(quality.custom_judge_prompt as string);
      }
    }
  }, [systemConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setFeedback('');
    try {
      await updateConfig({
        quality: {
          judge_strictness: strictness,
          custom_judge_prompt: customPrompt,
        },
      });
      setFeedback('Saved');
      setTimeout(() => setFeedback(''), 2000);
    } catch {
      setFeedback('Save failed');
      setTimeout(() => setFeedback(''), 3000);
    } finally {
      setSaving(false);
    }
  }, [strictness, customPrompt, updateConfig]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '0.5rem',
    border: '1px solid var(--border-glass)',
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: 'var(--text-secondary)',
    fontSize: '0.75rem',
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <Card title="Judge Configuration" subtitle="Control judge behavior for quality evaluation">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Strictness dropdown */}
        <div>
          <label style={labelStyle}>Strictness Level</label>
          <select
            value={strictness}
            onChange={(e) => setStrictness(e.target.value as JudgeStrictness)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {STRICTNESS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.description}
              </option>
            ))}
          </select>
          <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Current: <span style={{ color: strictness === 'strict' ? 'var(--danger)' : strictness === 'balanced' ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
              {strictness.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Custom judge prompt */}
        <div>
          <label style={labelStyle}>Custom Judge Prompt</label>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Override the default judge system prompt. Leave blank to use the built-in prompt for each judge type."
            rows={5}
            style={{
              ...inputStyle,
              fontFamily: '"Fira Code", "JetBrains Mono", "SF Mono", monospace',
              resize: 'vertical',
              lineHeight: '1.5',
            }}
          />
          <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {customPrompt.length > 0 ? `${customPrompt.length} characters` : 'Using default judge prompt'}
          </div>
        </div>

        {/* Save button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 24px',
              borderRadius: '0.5rem',
              border: 'none',
              backgroundColor: saving ? 'var(--bg-tertiary)' : 'var(--info)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Judge Config'}
          </button>
          {feedback && (
            <span style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: feedback === 'Saved' ? 'var(--success)' : 'var(--danger)',
            }}>
              {feedback}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// BrainTab (Main)
// ---------------------------------------------------------------------------

export default function BrainTab(): React.ReactElement {
  const storePrompts = useDashboardStore((s) => s.prompts) ?? [];
  const fetchPrompts = useDashboardStore((s) => s.fetchPrompts);

  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<PromptCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');

  // Show real data or empty state — no mock fallback
  const prompts: readonly PromptEntry[] = storePrompts;

  useEffect(() => {
    fetchPrompts().finally(() => setLoading(false));
  }, [fetchPrompts]);

  // Filter + sort
  const filtered = useMemo(() => {
    const lowerQ = searchQuery.toLowerCase();
    const base = prompts.filter((p) => {
      if (activeCategory && p.category !== activeCategory) return false;
      if (lowerQ) {
        const haystack = `${p.name} ${p.tags.join(' ')} ${p.content}`.toLowerCase();
        if (!haystack.includes(lowerQ)) return false;
      }
      return true;
    });

    const sorted = [...base];
    if (sortField === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortField === 'usageCount') {
      sorted.sort((a, b) => b.usageCount - a.usageCount);
    } else {
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return sorted;
  }, [prompts, activeCategory, searchQuery, sortField]);

  const handleSelect = useCallback((p: PromptEntry) => {
    setSelectedId(p.id);
    setEditor(editorFromPrompt(p));
  }, []);

  const handleNewPrompt = useCallback(() => {
    setSelectedId(null);
    setEditor({ ...EMPTY_EDITOR });
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditor(null);
    setSelectedId(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editor || !editor.name.trim() || !editor.content.trim()) return;
    setSaving(true);
    try {
      const tags = editor.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const body = {
        name: editor.name.trim(),
        category: editor.category,
        content: editor.content,
        tags,
      };

      if (editor.mode === 'create') {
        await fetch('/api/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else if (editor.id) {
        await fetch(`/api/prompts/${editor.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      await fetchPrompts();
      handleCloseEditor();
    } catch {
      // Error handling — non-critical, store logs it
    } finally {
      setSaving(false);
    }
  }, [editor, fetchPrompts, handleCloseEditor]);

  const handleCopy = useCallback(async () => {
    if (!editor?.content) return;
    try {
      await navigator.clipboard.writeText(editor.content);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(''), 2000);
    } catch {
      setCopyFeedback('Failed');
      setTimeout(() => setCopyFeedback(''), 2000);
    }
  }, [editor]);

  if (loading) {
    return <LoadingSpinner message="Loading prompt library..." />;
  }

  return (
    <div style={{ padding: '1.5rem', position: 'relative' }}>
      <h2 style={{ margin: '0 0 1.25rem', color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 700 }}>
        Brain — Prompt Library
      </h2>

      {prompts.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 16px', marginBottom: 16, borderRadius: 12,
          background: 'var(--bg-primary)', border: '1px solid var(--border-glass)',
        }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 12 }}>
            No prompts yet. Create your first prompt.
          </div>
          <button
            onClick={handleNewPrompt}
            style={{
              padding: '8px 20px', borderRadius: '0.5rem', border: '1px solid var(--info)',
              backgroundColor: 'var(--info)', color: 'var(--text-primary)', fontSize: '0.9rem',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            + New Prompt
          </button>
        </div>
      )}

      <PromptStats prompts={prompts} />

      <PromptFilterBar
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        sortField={sortField}
        onSortChange={setSortField}
        onNewPrompt={handleNewPrompt}
      />

      <PromptList
        prompts={filtered}
        selectedId={selectedId}
        onSelect={handleSelect}
      />

      {editor && (
        <PromptEditor
          editor={editor}
          onChange={setEditor}
          onSave={handleSave}
          onClose={handleCloseEditor}
          saving={saving}
          copyFeedback={copyFeedback}
          onCopy={handleCopy}
        />
      )}
    </div>
  );
}
