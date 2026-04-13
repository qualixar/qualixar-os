/**
 * Qualixar OS Phase 15 -- Datasets Tab
 * Test dataset management for eval benchmarking.
 * Upload, browse, preview, and delete datasets.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useDashboardStore } from '../store.js';
import type { DatasetEntry } from '../store.js';
import { Card, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FORMATS: readonly DatasetEntry['format'][] = ['csv', 'json', 'jsonl'] as const;

const FORMAT_COLORS: Record<DatasetEntry['format'], string> = {
  csv: '#22c55e',
  json: '#3b82f6',
  jsonl: '#f59e0b',
};

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_DATASETS: readonly DatasetEntry[] = [
  {
    id: 'ds-001',
    name: 'test-prompts.jsonl',
    format: 'jsonl',
    rowCount: 1200,
    columnCount: 4,
    sizeBytes: 524288,
    createdAt: '2026-03-28T10:00:00Z',
    description: 'Evaluation prompts for agent benchmarking suite',
  },
  {
    id: 'ds-002',
    name: 'eval-responses.csv',
    format: 'csv',
    rowCount: 3500,
    columnCount: 8,
    sizeBytes: 2097152,
    createdAt: '2026-03-29T14:30:00Z',
    description: 'Model response corpus with human ratings',
  },
  {
    id: 'ds-003',
    name: 'tool-calls.json',
    format: 'json',
    rowCount: 800,
    columnCount: 6,
    sizeBytes: 1048576,
    createdAt: '2026-03-30T09:15:00Z',
    description: 'Tool invocation traces for fidelity analysis',
  },
  {
    id: 'ds-004',
    name: 'judge-scores.csv',
    format: 'csv',
    rowCount: 5000,
    columnCount: 12,
    sizeBytes: 4194304,
    createdAt: '2026-03-31T16:45:00Z',
    description: 'Multi-judge consensus scoring results',
  },
  {
    id: 'ds-005',
    name: 'agent-traces.jsonl',
    format: 'jsonl',
    rowCount: 950,
    columnCount: 5,
    sizeBytes: 786432,
    createdAt: '2026-04-01T08:00:00Z',
    description: 'End-to-end agent execution traces',
  },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// FormatBadge
// ---------------------------------------------------------------------------

function FormatBadge({ format }: { readonly format: DatasetEntry['format'] }): React.ReactElement {
  const color = FORMAT_COLORS[format];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'monospace',
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {format.toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DatasetStats
// ---------------------------------------------------------------------------

interface DatasetStatsProps {
  readonly datasets: readonly DatasetEntry[];
}

function DatasetStats({ datasets }: DatasetStatsProps): React.ReactElement {
  const totalDatasets = datasets.length;
  const totalRows = datasets.reduce((sum, d) => sum + d.rowCount, 0);
  const totalSize = datasets.reduce((sum, d) => sum + d.sizeBytes, 0);

  const statStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 4,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
      <Card title="Total Datasets">
        <div style={statStyle}>{totalDatasets}</div>
        <div style={labelStyle}>datasets loaded</div>
      </Card>
      <Card title="Total Rows">
        <div style={statStyle}>{totalRows.toLocaleString()}</div>
        <div style={labelStyle}>across all datasets</div>
      </Card>
      <Card title="Total Size">
        <div style={statStyle}>{formatBytes(totalSize)}</div>
        <div style={labelStyle}>combined storage</div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UploadForm
// ---------------------------------------------------------------------------

interface UploadFormState {
  readonly name: string;
  readonly description: string;
  readonly format: DatasetEntry['format'];
  readonly file: File | null;
  readonly uploading: boolean;
  readonly error: string;
}

const INITIAL_UPLOAD_STATE: UploadFormState = {
  name: '',
  description: '',
  format: 'csv',
  file: null,
  uploading: false,
  error: '',
};

function UploadForm({ onUploaded }: { readonly onUploaded: () => void }): React.ReactElement {
  const [state, setState] = useState<UploadFormState>(INITIAL_UPLOAD_STATE);

  const updateField = useCallback(<K extends keyof UploadFormState>(key: K, value: UploadFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value, error: '' }));
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      updateField('file', file);
      if (!state.name) {
        updateField('name', file.name);
      }
    }
  }, [state.name, updateField]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.name.trim()) {
      updateField('error', 'Dataset name is required');
      return;
    }
    if (!state.file) {
      updateField('error', 'Please select a file to upload');
      return;
    }

    setState((prev) => ({ ...prev, uploading: true, error: '' }));

    try {
      const formData = new FormData();
      formData.append('name', state.name.trim());
      formData.append('description', state.description.trim());
      formData.append('format', state.format);
      formData.append('file', state.file);

      const res = await fetch('/api/datasets', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `Upload failed (${res.status})`);
      }

      setState(INITIAL_UPLOAD_STATE);
      onUploaded();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, uploading: false, error: msg }));
    }
  }, [state, onUploaded, updateField]);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-glass)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <Card title="Upload Dataset" subtitle="Add a new dataset for evaluation">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Name
          </label>
          <input
            type="text"
            value={state.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g. benchmark-v2.csv"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Description
          </label>
          <textarea
            value={state.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Brief description of this dataset..."
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Format
          </label>
          <select
            value={state.format}
            onChange={(e) => updateField('format', e.target.value as DatasetEntry['format'])}
            style={inputStyle}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>{f.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
            File
          </label>
          <input
            type="file"
            accept=".csv,.json,.jsonl"
            onChange={handleFileChange}
            style={{ ...inputStyle, padding: 6 }}
          />
        </div>

        {state.error && (
          <div style={{ color: '#ef4444', fontSize: 13, padding: '4px 0' }}>
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={state.uploading}
          style={{
            padding: '10px 20px',
            backgroundColor: state.uploading ? 'var(--bg-tertiary)' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: state.uploading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          {state.uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DatasetPreviewPanel (Modal)
// ---------------------------------------------------------------------------

interface DatasetPreviewPanelProps {
  readonly dataset: DatasetEntry;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

function DatasetPreviewPanel({ dataset, onClose, onDeleted }: DatasetPreviewPanelProps): React.ReactElement {
  const [deleting, setDeleting] = useState(false);
  const [previewRows, setPreviewRows] = useState<readonly Record<string, unknown>[]>([]);
  const [previewColumns, setPreviewColumns] = useState<readonly string[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadPreview = async () => {
      setLoadingPreview(true);
      try {
        const res = await fetch(`/api/datasets/${dataset.id}/preview?limit=10`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setPreviewRows(data.rows ?? []);
            setPreviewColumns(data.columns ?? []);
          }
        }
      } catch {
        // Preview unavailable — show metadata only
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    };
    loadPreview();
    return () => { cancelled = true; };
  }, [dataset.id]);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Delete dataset "${dataset.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/datasets/${dataset.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDeleted();
        onClose();
      }
    } catch {
      setDeleting(false);
    }
  }, [dataset.id, dataset.name, onClose, onDeleted]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const panelStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-tertiary)',
    borderRadius: 12,
    border: '1px solid var(--border-glass)',
    padding: 24,
    width: '90%',
    maxWidth: 800,
    maxHeight: '85vh',
    overflow: 'auto',
    color: 'var(--text-primary)',
  };

  const metaRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    marginBottom: 20,
  };

  const metaItemStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-primary)',
    borderRadius: 8,
    padding: '10px 14px',
  };

  const metaLabelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 };
  const metaValueStyle: React.CSSProperties = { fontSize: 16, fontWeight: 600 };

  return ReactDOM.createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{dataset.name}</h2>
            {dataset.description && (
              <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>{dataset.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 24,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>

        {/* Metadata */}
        <div style={metaRowStyle}>
          <div style={metaItemStyle}>
            <div style={metaLabelStyle}>Format</div>
            <div style={metaValueStyle}><FormatBadge format={dataset.format} /></div>
          </div>
          <div style={metaItemStyle}>
            <div style={metaLabelStyle}>Rows</div>
            <div style={metaValueStyle}>{dataset.rowCount.toLocaleString()}</div>
          </div>
          <div style={metaItemStyle}>
            <div style={metaLabelStyle}>Columns</div>
            <div style={metaValueStyle}>{dataset.columnCount}</div>
          </div>
          <div style={metaItemStyle}>
            <div style={metaLabelStyle}>Size</div>
            <div style={metaValueStyle}>{formatBytes(dataset.sizeBytes)}</div>
          </div>
          <div style={metaItemStyle}>
            <div style={metaLabelStyle}>Created</div>
            <div style={{ ...metaValueStyle, fontSize: 13 }}>{formatDate(dataset.createdAt)}</div>
          </div>
        </div>

        {/* Preview Table */}
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>Preview (first 10 rows)</h3>
        {loadingPreview ? (
          <LoadingSpinner message="Loading preview..." />
        ) : previewRows.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'monospace' }}>
              <thead>
                <tr>
                  {previewColumns.map((col) => (
                    <th
                      key={col}
                      style={{
                        textAlign: 'left',
                        padding: '6px 10px',
                        borderBottom: '1px solid var(--border-glass)',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--bg-tertiary)' }}>
                    {previewColumns.map((col) => (
                      <td
                        key={col}
                        style={{
                          padding: '5px 10px',
                          color: 'var(--text-primary)',
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 12 }}>
            Preview not available. Upload data to the API to enable row previews.
          </div>
        )}

        {/* Delete Button */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '8px 20px',
              backgroundColor: deleting ? 'var(--bg-tertiary)' : '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete Dataset'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// DatasetList
// ---------------------------------------------------------------------------

interface DatasetListProps {
  readonly datasets: readonly DatasetEntry[];
  readonly onSelect: (dataset: DatasetEntry) => void;
}

const datasetColumns = [
  { key: 'name', header: 'Name' },
  {
    key: 'format',
    header: 'Format',
    render: (row: Record<string, unknown>) => (
      <FormatBadge format={row.format as DatasetEntry['format']} />
    ),
  },
  {
    key: 'rowCount',
    header: 'Rows',
    render: (row: Record<string, unknown>) => (row.rowCount as number).toLocaleString(),
  },
  { key: 'columnCount', header: 'Columns' },
  {
    key: 'sizeBytes',
    header: 'Size',
    render: (row: Record<string, unknown>) => formatBytes(row.sizeBytes as number),
  },
  {
    key: 'createdAt',
    header: 'Created',
    render: (row: Record<string, unknown>) => formatDate(row.createdAt as string),
  },
];

function DatasetList({ datasets, onSelect }: DatasetListProps): React.ReactElement {
  return (
    <Card title="Datasets" subtitle={`${datasets.length} dataset${datasets.length !== 1 ? 's' : ''} loaded`}>
      <DataTable
        columns={datasetColumns}
        data={datasets as unknown as readonly Record<string, unknown>[]}
        emptyMessage="No datasets loaded. Upload one to get started."
        onRowClick={(row) => onSelect(row as unknown as DatasetEntry)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DatasetsTab (Main)
// ---------------------------------------------------------------------------

export default function DatasetsTab(): React.ReactElement {
  const datasets = useDashboardStore((s) => s.datasets) ?? [];
  const fetchDatasets = useDashboardStore((s) => s.fetchDatasets);
  const [selectedDataset, setSelectedDataset] = useState<DatasetEntry | null>(null);
  const [loading, setLoading] = useState(true);

  // H-22: No mock data — use real datasets or empty array
  const effectiveDatasets = useMemo<readonly DatasetEntry[]>(
    () => (Array.isArray(datasets) ? datasets : []),
    [datasets],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchDatasets();
      setLoading(false);
    };
    load();
  }, [fetchDatasets]);

  const handleUploaded = useCallback(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const handleDeleted = useCallback(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  if (loading) {
    return <LoadingSpinner message="Loading datasets..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stats */}
      <DatasetStats datasets={effectiveDatasets} />

      {/* Main grid: list + upload */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
        <DatasetList datasets={effectiveDatasets} onSelect={setSelectedDataset} />
        <UploadForm onUploaded={handleUploaded} />
      </div>

      {/* Preview Modal */}
      {selectedDataset && (
        <DatasetPreviewPanel
          dataset={selectedDataset}
          onClose={() => setSelectedDataset(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
