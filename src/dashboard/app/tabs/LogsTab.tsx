/**
 * Qualixar OS Phase 15 -- Logs Tab
 * Structured log viewer with terminal-style stream, filtering, and detail modal.
 * Data from store: structuredLogs / fetchStructuredLogs.
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useDashboardStore } from '../store.js';
import { Card, LoadingSpinner } from '../components/shared.js';
import type { StructuredLogEntry } from '../store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_COLORS: Record<StructuredLogEntry['level'], string> = {
  debug: '#6b7280',
  info: '#3b82f6',
  warn: '#f59e0b',
  error: '#ef4444',
};

const LEVEL_BG: Record<StructuredLogEntry['level'], string> = {
  debug: 'rgba(107,114,128,0.15)',
  info: 'rgba(59,130,246,0.15)',
  warn: 'rgba(245,158,11,0.15)',
  error: 'rgba(239,68,68,0.15)',
};

const ALL_LEVELS: readonly StructuredLogEntry['level'][] = ['debug', 'info', 'warn', 'error'];

// ---------------------------------------------------------------------------
// Mock data generator
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    + '.' + d.getMilliseconds().toString().padStart(3, '0');
}

// ---------------------------------------------------------------------------
// LogFilterBar
// ---------------------------------------------------------------------------

interface LogFilterBarProps {
  readonly activeLevels: ReadonlySet<StructuredLogEntry['level']>;
  readonly onToggleLevel: (level: StructuredLogEntry['level']) => void;
  readonly sources: readonly string[];
  readonly selectedSource: string;
  readonly onSourceChange: (source: string) => void;
  readonly searchText: string;
  readonly onSearchChange: (text: string) => void;
  readonly onClear: () => void;
}

function LogFilterBar({
  activeLevels, onToggleLevel, sources, selectedSource,
  onSourceChange, searchText, onSearchChange, onClear,
}: LogFilterBarProps): React.ReactElement {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      padding: '12px 16px', background: 'var(--accent-soft)',
      borderRadius: '8px', border: '1px solid var(--border-glass)',
    }}>
      {/* Level chips */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {ALL_LEVELS.map((lvl) => {
          const active = activeLevels.has(lvl);
          return (
            <button
              key={lvl}
              onClick={() => onToggleLevel(lvl)}
              style={{
                padding: '4px 12px', borderRadius: '14px', fontSize: '12px',
                fontWeight: 600, textTransform: 'uppercase', cursor: 'pointer',
                border: `1px solid ${LEVEL_COLORS[lvl]}`,
                background: active ? LEVEL_BG[lvl] : 'transparent',
                color: active ? LEVEL_COLORS[lvl] : 'var(--text-muted)',
                opacity: active ? 1 : 0.5,
                transition: 'all 0.15s ease',
              }}
            >
              {lvl}
            </button>
          );
        })}
      </div>

      {/* Source dropdown */}
      <select
        value={selectedSource}
        onChange={(e) => onSourceChange(e.target.value)}
        style={{
          padding: '6px 10px', borderRadius: '6px', fontSize: '13px',
          background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
          border: '1px solid var(--border-glass)', cursor: 'pointer',
        }}
      >
        <option value="">All Sources</option>
        {sources.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Search */}
      <input
        type="text"
        placeholder="Search logs..."
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          flex: 1, minWidth: '180px', padding: '6px 12px', borderRadius: '6px',
          fontSize: '13px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
          border: '1px solid var(--border-glass)', outline: 'none',
        }}
      />

      {/* Clear */}
      <button
        onClick={onClear}
        style={{
          padding: '6px 14px', borderRadius: '6px', fontSize: '12px',
          fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-glass)',
          background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
          transition: 'all 0.15s ease',
        }}
      >
        Clear Filters
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogStats
// ---------------------------------------------------------------------------

interface LogStatsProps {
  readonly logs: readonly StructuredLogEntry[];
}

function LogStats({ logs }: LogStatsProps): React.ReactElement {
  const stats = useMemo(() => {
    const sources = new Set<string>();
    let errors = 0;
    let warnings = 0;

    for (const log of logs) {
      sources.add(log.source);
      if (log.level === 'error') errors++;
      if (log.level === 'warn') warnings++;
    }

    return { total: logs.length, errors, warnings, sourceCount: sources.size };
  }, [logs]);

  const items = [
    { title: 'Total Logs', value: stats.total, color: 'var(--text-primary)' },
    { title: 'Errors', value: stats.errors, color: LEVEL_COLORS.error },
    { title: 'Warnings', value: stats.warnings, color: LEVEL_COLORS.warn },
    { title: 'Sources', value: stats.sourceCount, color: LEVEL_COLORS.info },
  ] as const;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
      {items.map((item) => (
        <Card key={item.title} title={item.title}>
          <div style={{
            fontSize: '28px', fontWeight: 700, color: item.color,
            fontFamily: 'monospace', textAlign: 'center', padding: '4px 0',
          }}>
            {item.value.toLocaleString()}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogDetailModal
// ---------------------------------------------------------------------------

interface LogDetailModalProps {
  readonly entry: StructuredLogEntry;
  readonly onClose: () => void;
}

function LogDetailModal({ entry, onClose }: LogDetailModalProps): React.ReactElement {
  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border-glass)',
          borderRadius: '12px', padding: '24px', width: '560px', maxHeight: '80vh',
          overflowY: 'auto', color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Log Detail</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'var(--text-secondary)',
              fontSize: '18px', cursor: 'pointer', padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Level badge */}
        <div style={{ marginBottom: '12px' }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: '10px',
            fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
            background: LEVEL_BG[entry.level], color: LEVEL_COLORS[entry.level],
            border: `1px solid ${LEVEL_COLORS[entry.level]}`,
          }}>
            {entry.level}
          </span>
        </div>

        {/* Fields */}
        <div style={{ fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.8 }}>
          <div><span style={{ color: 'var(--text-secondary)' }}>ID:</span> {entry.id}</div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Timestamp:</span> {entry.timestamp}</div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Source:</span> {entry.source}</div>
          <div><span style={{ color: 'var(--text-secondary)' }}>Message:</span> {entry.message}</div>
          {entry.taskId && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Task ID:</span>{' '}
              <span style={{ color: '#3b82f6', cursor: 'pointer' }}>{entry.taskId}</span>
            </div>
          )}
          {entry.agentId && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Agent ID:</span>{' '}
              <span style={{ color: '#22c55e', cursor: 'pointer' }}>{entry.agentId}</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Metadata
            </div>
            <pre style={{
              background: 'var(--bg-primary)', padding: '12px', borderRadius: '8px',
              fontSize: '12px', fontFamily: 'monospace', color: '#a5b4fc',
              overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap',
            }}>
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// LogStream
// ---------------------------------------------------------------------------

interface LogStreamProps {
  readonly logs: readonly StructuredLogEntry[];
  readonly onSelectLog: (entry: StructuredLogEntry) => void;
  readonly autoScroll: boolean;
}

function LogStream({ logs, onSelectLog, autoScroll }: LogStreamProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  if (logs.length === 0) {
    return (
      <div style={{
        padding: '48px', textAlign: 'center', color: 'var(--text-muted)',
        fontFamily: 'monospace', fontSize: '14px',
      }}>
        No logs match the current filters.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-glass)',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontSize: '12.5px', lineHeight: 1.7, maxHeight: '520px', overflowY: 'auto',
        padding: '8px 0',
      }}
    >
      {logs.map((entry) => (
        <div
          key={entry.id}
          onClick={() => onSelectLog(entry)}
          style={{
            display: 'flex', gap: '10px', padding: '3px 14px', cursor: 'pointer',
            transition: 'background 0.1s ease',
            borderLeft: `3px solid ${LEVEL_COLORS[entry.level]}`,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-soft)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }}
        >
          {/* Timestamp */}
          <span style={{ color: 'var(--text-muted)', flexShrink: 0, userSelect: 'none' }}>
            {formatTimestamp(entry.timestamp)}
          </span>

          {/* Level */}
          <span style={{
            color: LEVEL_COLORS[entry.level], fontWeight: 700,
            textTransform: 'uppercase', width: '44px', flexShrink: 0,
          }}>
            {entry.level.padEnd(5)}
          </span>

          {/* Source */}
          <span style={{ color: '#8b5cf6', flexShrink: 0, width: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            [{entry.source}]
          </span>

          {/* Message */}
          <span style={{ color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.message}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogsTab (main)
// ---------------------------------------------------------------------------

export default function LogsTab(): React.ReactElement {
  const structuredLogs = useDashboardStore((s) => s.structuredLogs) ?? [];
  const fetchStructuredLogs = useDashboardStore((s) => s.fetchStructuredLogs);

  // Local state
  const [activeLevels, setActiveLevels] = useState<ReadonlySet<StructuredLogEntry['level']>>(
    () => new Set(ALL_LEVELS),
  );
  const [selectedSource, setSelectedSource] = useState('');
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedLog, setSelectedLog] = useState<StructuredLogEntry | null>(null);
  const [loading, setLoading] = useState(false);

  // H-22: No mock data — use real logs or empty array
  const allLogs = useMemo<readonly StructuredLogEntry[]>(() => {
    return Array.isArray(structuredLogs) ? structuredLogs : [];
  }, [structuredLogs]);

  // Unique sources for dropdown
  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const log of allLogs) set.add(log.source);
    return [...set].sort();
  }, [allLogs]);

  // Filtered logs (newest first)
  const filteredLogs = useMemo(() => {
    const searchLower = searchText.toLowerCase();
    const filtered = allLogs.filter((log) => {
      if (!activeLevels.has(log.level)) return false;
      if (selectedSource && log.source !== selectedSource) return false;
      if (searchLower && !log.message.toLowerCase().includes(searchLower)
        && !log.source.toLowerCase().includes(searchLower)) return false;
      return true;
    });
    return [...filtered].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [allLogs, activeLevels, selectedSource, searchText]);

  // Fetch on mount
  useEffect(() => {
    setLoading(true);
    fetchStructuredLogs().finally(() => setLoading(false));
  }, [fetchStructuredLogs]);

  // Handlers
  const handleToggleLevel = useCallback((level: StructuredLogEntry['level']) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  const handleClearFilters = useCallback(() => {
    setActiveLevels(new Set(ALL_LEVELS));
    setSelectedSource('');
    setSearchText('');
  }, []);

  if (loading && allLogs.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Stats row */}
      <LogStats logs={allLogs} />

      {/* Filter bar */}
      <LogFilterBar
        activeLevels={activeLevels}
        onToggleLevel={handleToggleLevel}
        sources={sources}
        selectedSource={selectedSource}
        onSourceChange={setSelectedSource}
        searchText={searchText}
        onSearchChange={setSearchText}
        onClear={handleClearFilters}
      />

      {/* Stream header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Showing {filteredLogs.length} of {allLogs.length} entries
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            style={{ accentColor: '#3b82f6' }}
          />
          Auto-scroll
        </label>
      </div>

      {/* Log stream */}
      <LogStream
        logs={filteredLogs}
        onSelectLog={setSelectedLog}
        autoScroll={autoScroll}
      />

      {/* Detail modal */}
      {selectedLog && (
        <LogDetailModal
          entry={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}
