/**
 * Qualixar OS Phase 15 -- Vectors Tab
 * Vector store browser and semantic search playground.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useDashboardStore } from '../store.js';
import { Card } from '../components/shared.js';
import type { VectorEntry, VectorStoreStats } from '../store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VectorDetailState {
  readonly vector: VectorEntry | null;
  readonly open: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOCK_VECTORS: readonly VectorEntry[] = [
  {
    id: 'vec-001', content: 'function fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}',
    source: 'code/utils.ts', similarity: 0.95, metadata: { language: 'typescript', lines: 4 }, createdAt: '2026-03-28T10:00:00Z',
  },
  {
    id: 'vec-002', content: 'The agent orchestrator dispatches tasks to worker agents based on capability matching and current load.',
    source: 'docs/architecture.md', similarity: 0.88, metadata: { section: 'orchestration', version: '2.1' }, createdAt: '2026-03-28T11:00:00Z',
  },
  {
    id: 'vec-003', content: 'User: How do I configure the memory layer?\nAssistant: Set the MEMORY_BACKEND env var to "sqlite" or "postgres".',
    source: 'chat/session-42', similarity: 0.82, metadata: { turnCount: 2, userId: 'u-100' }, createdAt: '2026-03-29T09:15:00Z',
  },
  {
    id: 'vec-004', content: 'export class TaskRouter {\n  private readonly routes: Map<string, Handler>;\n  constructor() { this.routes = new Map(); }\n}',
    source: 'code/router.ts', similarity: 0.79, metadata: { language: 'typescript', lines: 5 }, createdAt: '2026-03-29T14:30:00Z',
  },
  {
    id: 'vec-005', content: 'Rate limiting is enforced at the gateway level using a sliding window algorithm with a 60-second window.',
    source: 'docs/security.md', similarity: 0.71, metadata: { section: 'rate-limiting' }, createdAt: '2026-03-30T08:00:00Z',
  },
  {
    id: 'vec-006', content: 'async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {\n  for (let i = 0; i < maxRetries; i++) { try { return await fn(); } catch { await sleep(2 ** i * 100); } }\n  throw new Error("Max retries exceeded");\n}',
    source: 'code/retry.ts', similarity: 0.65, metadata: { language: 'typescript', lines: 6 }, createdAt: '2026-03-30T10:00:00Z',
  },
  {
    id: 'vec-007', content: 'The judge evaluates agent outputs on three axes: correctness, safety, and relevance. Each axis is scored 0-1.',
    source: 'docs/judges.md', similarity: 0.58, metadata: { section: 'scoring' }, createdAt: '2026-03-31T12:00:00Z',
  },
  {
    id: 'vec-008', content: 'User: Can you summarize the last sprint?\nAssistant: Sprint 14 delivered 23 stories, closed 5 bugs, and shipped the new dashboard.',
    source: 'chat/session-99', similarity: 0.47, metadata: { turnCount: 2, userId: 'u-205' }, createdAt: '2026-03-31T15:00:00Z',
  },
  {
    id: 'vec-009', content: 'CREATE TABLE vectors (\n  id TEXT PRIMARY KEY,\n  content TEXT NOT NULL,\n  embedding BLOB,\n  source TEXT,\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
    source: 'migrations/003_vectors.sql', similarity: 0.39, metadata: { dialect: 'sqlite' }, createdAt: '2026-04-01T09:00:00Z',
  },
  {
    id: 'vec-010', content: 'WebSocket connections are authenticated via a short-lived JWT token passed in the first frame after upgrade.',
    source: 'docs/websocket.md', similarity: 0.25, metadata: { section: 'auth' }, createdAt: '2026-04-01T11:30:00Z',
  },
];

const MOCK_STATS: VectorStoreStats = {
  totalVectors: 12_847,
  dimensions: 384,
  indexType: 'HNSW',
  sizeBytes: 52_428_800,
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}...`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// SimilarityBar
// ---------------------------------------------------------------------------

function SimilarityBar({ score }: { readonly score: number }): React.ReactElement {
  const color = score > 0.8 ? 'var(--success)' : score > 0.5 ? 'var(--warning)' : 'var(--danger)';
  const pct = Math.round(score * 100);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
      <div style={{
        flex: 1, height: 8, borderRadius: 4,
        background: 'var(--bg-tertiary)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 4,
          background: color, transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{ color, fontSize: 12, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VectorStats
// ---------------------------------------------------------------------------

function VectorStats({ stats }: { readonly stats: VectorStoreStats }): React.ReactElement {
  const items = useMemo(() => [
    { title: 'Total Vectors', value: stats.totalVectors.toLocaleString() },
    { title: 'Dimensions', value: String(stats.dimensions) },
    { title: 'Index Type', value: stats.indexType || 'none' },
    { title: 'Store Size', value: formatBytes(stats.sizeBytes) },
  ], [stats]);

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: 12, marginBottom: 20,
    }}>
      {items.map((item) => (
        <Card key={item.title} title={item.title}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
            {item.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SearchPlayground
// ---------------------------------------------------------------------------

function SearchPlayground({
  onSearch,
  loading,
}: {
  readonly onSearch: (query: string) => void;
  readonly loading: boolean;
}): React.ReactElement {
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  }, [query, onSearch]);

  return (
    <Card title="Semantic Search Playground" subtitle="Search vectors by meaning">
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a natural language query..."
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--border-glass)', background: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: 14, outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: loading ? 'var(--border-glass)' : 'var(--accent)',
            color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// VectorResultList
// ---------------------------------------------------------------------------

function VectorResultList({
  vectors,
  onSelect,
}: {
  readonly vectors: readonly VectorEntry[];
  readonly onSelect: (v: VectorEntry) => void;
}): React.ReactElement {
  if (vectors.length === 0) {
    return (
      <Card title="Results">
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
          No vectors found. Try a search query above.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Results" subtitle={`${vectors.length} vectors`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {vectors.map((v) => (
          <VectorResultRow key={v.id} vector={v} onSelect={onSelect} />
        ))}
      </div>
    </Card>
  );
}

function VectorResultRow({
  vector,
  onSelect,
}: {
  readonly vector: VectorEntry;
  readonly onSelect: (v: VectorEntry) => void;
}): React.ReactElement {
  const [showMeta, setShowMeta] = useState(false);

  return (
    <div
      onClick={() => onSelect(vector)}
      style={{
        padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
        background: 'var(--bg-tertiary)', border: '1px solid var(--border-glass)',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-glass)'; }}
    >
      {vector.similarity != null && (
        <SimilarityBar score={vector.similarity} />
      )}
      <pre style={{
        margin: '8px 0 4px', fontSize: 13, color: 'var(--text-primary)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        fontFamily: 'ui-monospace, monospace', lineHeight: 1.5,
      }}>
        {truncate(vector.content, 200)}
      </pre>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {vector.source}
        </span>
        {vector.metadata && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowMeta(!showMeta); }}
            style={{
              fontSize: 11, color: 'var(--accent)', background: 'none',
              border: 'none', cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            {showMeta ? 'Hide metadata' : 'Show metadata'}
          </button>
        )}
      </div>
      {showMeta && vector.metadata && (
        <pre style={{
          marginTop: 8, padding: 8, borderRadius: 6,
          background: 'var(--bg-primary)', fontSize: 11, color: 'var(--text-secondary)',
          overflow: 'auto',
        }}>
          {JSON.stringify(vector.metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VectorDetailPanel (Modal)
// ---------------------------------------------------------------------------

function VectorDetailPanel({
  vector,
  onClose,
}: {
  readonly vector: VectorEntry;
  readonly onClose: () => void;
}): React.ReactElement {
  const embeddingPreview = useMemo(() => {
    if (!vector.embedding || !Array.isArray(vector.embedding)) return null;
    const dims = vector.embedding.slice(0, 8).map((d: number) => d.toFixed(4));
    const suffix = vector.embedding.length > 8 ? `, ... (${vector.embedding.length} dims)` : '';
    return `[${dims.join(', ')}${suffix}]`;
  }, [vector.embedding]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-tertiary)', borderRadius: 12,
          border: '1px solid var(--border-glass)', maxWidth: 640,
          width: '100%', maxHeight: '80vh', overflow: 'auto',
          padding: 24,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>Vector Detail</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)',
              fontSize: 20, cursor: 'pointer', lineHeight: 1,
            }}
          >
            x
          </button>
        </div>

        <DetailRow label="ID" value={vector.id} />
        <DetailRow label="Source" value={vector.source} />
        {vector.similarity != null && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Similarity</span>
            <SimilarityBar score={vector.similarity} />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Content</span>
          <pre style={{
            padding: 12, borderRadius: 8, background: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: 13, whiteSpace: 'pre-wrap',
            wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace',
            lineHeight: 1.5, maxHeight: 200, overflow: 'auto',
          }}>
            {vector.content}
          </pre>
        </div>
        {vector.metadata && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Metadata</span>
            <pre style={{
              padding: 12, borderRadius: 8, background: 'var(--bg-primary)',
              color: 'var(--text-secondary)', fontSize: 12, overflow: 'auto',
            }}>
              {JSON.stringify(vector.metadata, null, 2)}
            </pre>
          </div>
        )}
        {embeddingPreview && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Embedding Preview</span>
            <code style={{
              padding: 10, borderRadius: 8, background: 'var(--bg-primary)',
              color: 'var(--accent)', fontSize: 12, display: 'block',
              overflow: 'auto', whiteSpace: 'pre',
            }}>
              {embeddingPreview}
            </code>
          </div>
        )}
        {vector.createdAt && (
          <DetailRow label="Created" value={formatDate(vector.createdAt)} />
        )}
      </div>
    </div>,
    document.body,
  );
}

function DetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VectorsTab (Main)
// ---------------------------------------------------------------------------

export default function VectorsTab(): React.ReactElement {
  const vectors = useDashboardStore((s) => s.vectors) ?? [];
  const vectorStats = useDashboardStore((s) => s.vectorStats) ?? { totalVectors: 0, dimensions: 0, indexType: 'none', sizeBytes: 0 };
  const fetchVectors = useDashboardStore((s) => s.fetchVectors);
  const fetchVectorStats = useDashboardStore((s) => s.fetchVectorStats);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [detail, setDetail] = useState<VectorDetailState>({ vector: null, open: false });

  // Fetch stats on mount
  useEffect(() => {
    fetchVectorStats();
  }, [fetchVectorStats]);

  // Use mock data when store is empty
  const isDemoStats = vectorStats.totalVectors === 0;
  const isDemoVectors = vectors.length === 0 && searched;

  const displayStats = useMemo((): VectorStoreStats => {
    if (vectorStats.totalVectors > 0) return vectorStats;
    return MOCK_STATS;
  }, [vectorStats]);

  const displayVectors = useMemo((): readonly VectorEntry[] => {
    if (vectors.length > 0) return vectors;
    if (!searched) return [];
    return MOCK_VECTORS;
  }, [vectors, searched]);

  const handleSearch = useCallback(async (query: string) => {
    setLoading(true);
    setSearched(true);
    try {
      await fetchVectors(query);
    } catch {
      // Store handles errors; fall back to mock data via displayVectors
    } finally {
      setLoading(false);
    }
  }, [fetchVectors]);

  const handleSelect = useCallback((v: VectorEntry) => {
    setDetail({ vector: v, open: true });
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetail({ vector: null, open: false });
  }, []);

  return (
    <div style={{ padding: 4 }}>
      <h2 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 22 }}>
        Vector Store
      </h2>

      {(isDemoStats || isDemoVectors) && (
        <div style={{
          padding: '8px 16px', marginBottom: 16, borderRadius: 8,
          background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
          color: '#f59e0b', fontSize: 13, fontWeight: 500,
        }}>
          Showing demo data. Index vectors or connect a live backend to see real data.
        </div>
      )}

      <VectorStats stats={displayStats} />
      <SearchPlayground onSearch={handleSearch} loading={loading} />

      <div style={{ marginTop: 16 }}>
        <VectorResultList vectors={displayVectors} onSelect={handleSelect} />
      </div>

      {detail.open && detail.vector && (
        <VectorDetailPanel vector={detail.vector} onClose={handleCloseDetail} />
      )}
    </div>
  );
}
