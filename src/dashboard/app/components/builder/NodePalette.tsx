/**
 * Qualixar OS Phase 21 — Node Palette
 * Left sidebar with draggable node type cards grouped by category.
 * Search filters. No external libraries.
 */

import React, { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Palette data
// ---------------------------------------------------------------------------

interface PaletteItem {
  readonly type: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly category: 'Flow' | 'Agent' | 'Logic' | 'IO';
}

const PALETTE_ITEMS: readonly PaletteItem[] = [
  // Flow
  { type: 'start', label: 'Start', icon: '▶', description: 'Entry point of the workflow', category: 'Flow' },
  { type: 'end', label: 'End', icon: '⬛', description: 'Terminal node', category: 'Flow' },
  { type: 'branch', label: 'Branch', icon: '⑂', description: 'Split into parallel paths', category: 'Flow' },
  { type: 'merge', label: 'Merge', icon: '⊕', description: 'Join parallel paths', category: 'Flow' },
  // Agent
  { type: 'agent', label: 'Agent', icon: '🤖', description: 'Run a Qualixar OS agent', category: 'Agent' },
  { type: 'llm', label: 'LLM Call', icon: '💬', description: 'Direct LLM inference', category: 'Agent' },
  { type: 'judge', label: 'Judge', icon: '⚖', description: 'Quality evaluation node', category: 'Agent' },
  // Logic
  { type: 'condition', label: 'Condition', icon: '?', description: 'If/else routing', category: 'Logic' },
  { type: 'loop', label: 'Loop', icon: '↻', description: 'Iterate over a list', category: 'Logic' },
  { type: 'filter', label: 'Filter', icon: '▽', description: 'Filter items by predicate', category: 'Logic' },
  // IO
  { type: 'input', label: 'Input', icon: '⬇', description: 'Receive external data', category: 'IO' },
  { type: 'output', label: 'Output', icon: '⬆', description: 'Emit final result', category: 'IO' },
  { type: 'transform', label: 'Transform', icon: '⇄', description: 'Map / reshape data', category: 'IO' },
];

const CATEGORY_ORDER: readonly PaletteItem['category'][] = ['Flow', 'Agent', 'Logic', 'IO'];

const CATEGORY_COLORS: Record<PaletteItem['category'], string> = {
  Flow: '#22c55e',
  Agent: '#3b82f6',
  Logic: '#f59e0b',
  IO: '#64748b',
};

// ---------------------------------------------------------------------------
// NodePalette
// ---------------------------------------------------------------------------

export function NodePalette(): React.ReactElement {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? PALETTE_ITEMS.filter(
        item =>
          item.label.toLowerCase().includes(search.toLowerCase()) ||
          item.description.toLowerCase().includes(search.toLowerCase()),
      )
    : PALETTE_ITEMS;

  const grouped = CATEGORY_ORDER.reduce<Record<string, PaletteItem[]>>((acc, cat) => {
    const items = filtered.filter(i => i.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary, #e2e8f0)' }}>Node Types</span>
      </div>

      <div style={searchWrapStyle}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search nodes…"
          style={searchStyle}
          aria-label="Search node types"
        />
        {search && (
          <button onClick={() => setSearch('')} style={clearBtnStyle} aria-label="Clear search">✕</button>
        )}
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div style={categoryHeaderStyle(CATEGORY_COLORS[cat as PaletteItem['category']])}>
              {cat}
            </div>
            {items.map(item => (
              <DraggableCard key={item.type} item={item} />
            ))}
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-muted, #718096)', textAlign: 'center' }}>
            No nodes match "{search}"
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DraggableCard
// ---------------------------------------------------------------------------

function DraggableCard({ item }: { item: PaletteItem }): React.ReactElement {
  const [dragging, setDragging] = useState(false);

  const onDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('application/qos-node-type', item.type);
    e.dataTransfer.effectAllowed = 'copy';
    setDragging(true);
  }, [item.type]);

  const onDragEnd = useCallback(() => setDragging(false), []);

  const accentColor = CATEGORY_COLORS[item.category];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        margin: '2px 8px',
        borderRadius: 6,
        cursor: 'grab',
        background: dragging ? 'var(--node-drag-bg, #2d3748)' : 'transparent',
        border: `1px solid ${dragging ? accentColor : 'transparent'}`,
        transition: 'background 0.15s, border-color 0.15s',
        userSelect: 'none',
      }}
      title={item.description}
      aria-label={`Drag ${item.label} node onto canvas`}
    >
      <span style={{ fontSize: 18, width: 22, textAlign: 'center', color: accentColor }}>
        {item.icon}
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #e2e8f0)' }}>{item.label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #718096)', marginTop: 1 }}>{item.description}</div>
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
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-color, #2d3748)',
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

function categoryHeaderStyle(color: string): React.CSSProperties {
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
