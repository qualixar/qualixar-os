/**
 * Qualixar OS Phase Pivot-2 — Tool Palette for Builder
 * Shows available tools grouped by category. Drag tools onto Agent nodes.
 *
 * LLD: phase-pivot2-tool-skill-registry-lld.md Section 2.4
 */

import React, { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types (matches backend ToolCatalogEntry + ToolCategoryInfo)
// ---------------------------------------------------------------------------

interface ToolEntry {
  readonly name: string;
  readonly description: string;
  readonly category: string;
}

interface CategoryInfo {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
}

// ---------------------------------------------------------------------------
// Category colors (matches tool-categories.ts)
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  'web-data':      '#3b82f6',
  'code-dev':      '#22c55e',
  'communication': '#a855f7',
  'knowledge':     '#f59e0b',
  'creative':      '#ec4899',
  'enterprise':    '#64748b',
};

const CATEGORY_ICONS: Record<string, string> = {
  'web-data':      '\u{1F310}',
  'code-dev':      '\u{1F4BB}',
  'communication': '\u{1F4E8}',
  'knowledge':     '\u{1F4DA}',
  'creative':      '\u{1F3A8}',
  'enterprise':    '\u{1F3E2}',
};

// ---------------------------------------------------------------------------
// ToolPalette
// ---------------------------------------------------------------------------

export function ToolPalette(): React.ReactElement {
  const [tools, setTools] = useState<readonly ToolEntry[]>([]);
  const [categories, setCategories] = useState<readonly CategoryInfo[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/tools')
      .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((data: { tools: ToolEntry[]; categories: CategoryInfo[] }) => {
        setTools(data.tools ?? []);
        setCategories(data.categories ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  const filtered = search.trim()
    ? tools.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.description.toLowerCase().includes(search.toLowerCase()),
      )
    : tools;

  // Group by category
  const grouped = new Map<string, ToolEntry[]>();
  for (const tool of filtered) {
    const list = grouped.get(tool.category) ?? [];
    list.push(tool);
    grouped.set(tool.category, list);
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}><span style={titleStyle}>Tools</span></div>
        <div style={msgStyle}>Loading tools...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}><span style={titleStyle}>Tools</span></div>
        <div style={msgStyle}>Failed to load tools</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Tools</span>
        <span style={countStyle}>{tools.length}</span>
      </div>

      <div style={searchWrapStyle}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools\u2026"
          style={searchStyle}
          aria-label="Search tools"
        />
        {search && (
          <button onClick={() => setSearch('')} style={clearBtnStyle} aria-label="Clear search">
            \u2715
          </button>
        )}
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {grouped.size === 0 && (
          <div style={msgStyle}>
            {search ? `No tools match "${search}"` : 'No tools available'}
          </div>
        )}

        {Array.from(grouped.entries()).map(([cat, catTools]) => (
          <div key={cat}>
            <div style={catHeaderStyle(CATEGORY_COLORS[cat] ?? '#718096')}>
              <span>{CATEGORY_ICONS[cat] ?? '\u{1F527}'}</span> {cat}
            </div>
            {catTools.map((tool) => (
              <DraggableToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DraggableToolCard
// ---------------------------------------------------------------------------

function DraggableToolCard({ tool }: { readonly tool: ToolEntry }): React.ReactElement {
  const [dragging, setDragging] = useState(false);
  const color = CATEGORY_COLORS[tool.category] ?? '#718096';

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/qos-tool-name', tool.name);
      e.dataTransfer.effectAllowed = 'copy';
      setDragging(true);
    },
    [tool.name],
  );

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => setDragging(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '6px 12px',
        margin: '1px 8px',
        borderRadius: 6,
        cursor: 'grab',
        background: dragging ? 'var(--node-drag-bg, #2d3748)' : 'transparent',
        border: `1px solid ${dragging ? color : 'transparent'}`,
        transition: 'background 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}
      title={`Drag onto an Agent node to attach: ${tool.name}`}
      aria-label={`Drag ${tool.name} tool onto agent`}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          marginTop: 5,
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary, #e2e8f0)' }}>
          {tool.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #718096)', marginTop: 1 }}>
          {tool.description}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--sidebar-bg, #1a202c)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-color, #2d3748)',
};

const titleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 13,
  color: 'var(--text-primary, #e2e8f0)',
};

const countStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted, #718096)',
  background: 'var(--card-bg, #2d3748)',
  padding: '1px 6px',
  borderRadius: 10,
};

const searchWrapStyle: React.CSSProperties = {
  position: 'relative',
  margin: '8px 8px',
};

const searchStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 28px 6px 10px',
  borderRadius: 6,
  border: '1px solid var(--border-color, #4a5568)',
  background: 'var(--input-bg, #2d3748)',
  color: 'var(--text-primary, #e2e8f0)',
  fontSize: 12,
  boxSizing: 'border-box',
};

const clearBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: 6,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'none',
  border: 'none',
  color: 'var(--text-muted, #718096)',
  cursor: 'pointer',
  fontSize: 11,
  padding: 0,
};

const msgStyle: React.CSSProperties = {
  padding: '16px 12px',
  fontSize: 12,
  color: 'var(--text-muted, #718096)',
  textAlign: 'center',
};

function catHeaderStyle(color: string): React.CSSProperties {
  return {
    padding: '6px 12px 4px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color,
    borderLeft: `3px solid ${color}`,
    marginLeft: 8,
    marginTop: 8,
  };
}

export default ToolPalette;
