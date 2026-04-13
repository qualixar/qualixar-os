/**
 * Qualixar OS Phase 15 -- Connectors Tab
 * MCP server management dashboard: list, add, inspect, test, remove connectors.
 * Data from GET /api/connectors -> { connectors: ConnectorEntry[] }
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useDashboardStore } from '../store.js';
import type { ConnectorEntry } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const MOCK_CONNECTORS: readonly ConnectorEntry[] = [
  {
    id: 'conn-github-mcp-001',
    name: 'GitHub MCP',
    type: 'mcp',
    status: 'connected',
    url: 'stdio://github-mcp-server',
    toolCount: 14,
    lastSeen: new Date(Date.now() - 30_000).toISOString(),
  },
  {
    id: 'conn-filesystem-mcp-002',
    name: 'Filesystem MCP',
    type: 'mcp',
    status: 'connected',
    url: 'stdio://filesystem-mcp-server',
    toolCount: 8,
    lastSeen: new Date(Date.now() - 60_000).toISOString(),
  },
  {
    id: 'conn-slack-webhook-003',
    name: 'Slack Notifications',
    type: 'webhook',
    status: 'connected',
    url: 'https://hooks.slack.com/services/T00/B00/xxxx',
    toolCount: 1,
    lastSeen: new Date(Date.now() - 120_000).toISOString(),
  },
  {
    id: 'conn-openai-api-004',
    name: 'OpenAI Fallback',
    type: 'api',
    status: 'disconnected',
    url: 'https://api.openai.com/v1',
    toolCount: 3,
    lastSeen: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    id: 'conn-sqlite-mcp-005',
    name: 'SQLite MCP',
    type: 'mcp',
    status: 'error',
    url: 'stdio://sqlite-mcp-server',
    toolCount: 6,
    lastSeen: new Date(Date.now() - 7_200_000).toISOString(),
  },
];

// Mock tools for detail panel
const MOCK_TOOLS: Record<string, readonly string[]> = {
  'conn-github-mcp-001': ['create_issue', 'list_issues', 'create_pr', 'get_file_contents', 'search_code', 'list_commits', 'create_branch', 'fork_repository', 'get_pull_request', 'list_pull_requests', 'search_repositories', 'create_repository', 'push_files', 'get_pull_request_files'],
  'conn-filesystem-mcp-002': ['read_file', 'write_file', 'list_directory', 'create_directory', 'move_file', 'search_files', 'get_file_info', 'read_multiple_files'],
  'conn-slack-webhook-003': ['send_notification'],
  'conn-openai-api-004': ['chat_completion', 'embeddings', 'models_list'],
  'conn-sqlite-mcp-005': ['query', 'list_tables', 'get_table_schema', 'create_record', 'read_records', 'delete_records'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connectorStatusType(status: string): 'active' | 'error' | 'idle' {
  if (status === 'connected') return 'active';
  if (status === 'error') return 'error';
  return 'idle';
}

function typeBadgeColor(type: string): string {
  if (type === 'mcp') return '#8b5cf6';
  if (type === 'api') return '#3b82f6';
  return '#f59e0b';
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// ConnectorSummary
// ---------------------------------------------------------------------------

function ConnectorSummary({
  connectors,
}: {
  readonly connectors: readonly ConnectorEntry[];
}): React.ReactElement {
  const stats = useMemo(() => {
    const connected = connectors.filter((c) => c.status === 'connected').length;
    const disconnected = connectors.filter((c) => c.status === 'disconnected').length;
    const totalTools = connectors.reduce((sum, c) => sum + c.toolCount, 0);
    return { total: connectors.length, connected, disconnected, totalTools };
  }, [connectors]);

  return (
    <div className="stat-grid">
      <Card title="Total Connectors">
        <div className="stat-item" style={{ textAlign: 'center' }}>
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Registered</span>
        </div>
      </Card>
      <Card title="Connected">
        <div className="stat-item" style={{ textAlign: 'center' }}>
          <span className="stat-value" style={{ color: '#22c55e' }}>{stats.connected}</span>
          <span className="stat-label">Online</span>
        </div>
      </Card>
      <Card title="Disconnected">
        <div className="stat-item" style={{ textAlign: 'center' }}>
          <span className="stat-value" style={{ color: 'var(--text-muted)' }}>{stats.disconnected}</span>
          <span className="stat-label">Offline</span>
        </div>
      </Card>
      <Card title="Total Tools">
        <div className="stat-item" style={{ textAlign: 'center' }}>
          <span className="stat-value" style={{ color: '#8b5cf6' }}>{stats.totalTools}</span>
          <span className="stat-label">Available</span>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConnectorList
// ---------------------------------------------------------------------------

function ConnectorList({
  connectors,
  onSelect,
}: {
  readonly connectors: readonly ConnectorEntry[];
  readonly onSelect: (c: ConnectorEntry) => void;
}): React.ReactElement {
  const columns = useMemo(
    () => [
      { key: 'name', header: 'Name' },
      {
        key: 'type',
        header: 'Type',
        render: (row: Record<string, unknown>) => {
          const t = row.type as string;
          return (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                backgroundColor: `${typeBadgeColor(t)}22`,
                color: typeBadgeColor(t),
                border: `1px solid ${typeBadgeColor(t)}44`,
              }}
            >
              {t}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: 'Status',
        render: (row: Record<string, unknown>) => (
          <StatusBadge
            status={connectorStatusType(row.status as string)}
            label={row.status as string}
          />
        ),
      },
      {
        key: 'toolCount',
        header: 'Tools',
        render: (row: Record<string, unknown>) => String(row.toolCount ?? 0),
      },
      {
        key: 'url',
        header: 'URL',
        render: (row: Record<string, unknown>) => {
          const url = row.url as string | undefined;
          if (!url) return '--';
          return (
            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
              {url.length > 40 ? `${url.slice(0, 40)}...` : url}
            </span>
          );
        },
      },
      {
        key: 'lastSeen',
        header: 'Last Seen',
        render: (row: Record<string, unknown>) => formatLastSeen(row.lastSeen as string),
      },
    ],
    [],
  );

  return (
    <Card title="Connector Registry" subtitle="Click a row to inspect" className="span-2">
      <DataTable
        columns={columns}
        data={connectors as unknown as Record<string, unknown>[]}
        emptyMessage="No connectors registered"
        onRowClick={(row) => onSelect(row as unknown as ConnectorEntry)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// AddConnectorForm
// ---------------------------------------------------------------------------

function AddConnectorForm({
  onAdded,
}: {
  readonly onAdded: () => void;
}): React.ReactElement {
  const [name, setName] = useState('');
  const [type, setType] = useState<'mcp' | 'api' | 'webhook'>('mcp');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError('Name is required');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch('/api/connectors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), type, url: url.trim() || undefined }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as Record<string, string>).error ?? `HTTP ${res.status}`);
        }
        setName('');
        setUrl('');
        setType('mcp');
        onAdded();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [name, type, url, onAdded],
  );

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid var(--border-glass)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '0.875rem',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 4,
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  };

  return (
    <Card title="Add Connector">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub MCP"
              disabled={submitting}
            />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select
              style={{ ...inputStyle, cursor: 'pointer' }}
              value={type}
              onChange={(e) => setType(e.target.value as 'mcp' | 'api' | 'webhook')}
              disabled={submitting}
            >
              <option value="mcp">MCP Server</option>
              <option value="api">API</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>URL</label>
            <input
              style={inputStyle}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="stdio://... or https://..."
              disabled={submitting}
            />
          </div>
          {error && (
            <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: '#8b5cf6',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: submitting ? 'wait' : 'pointer',
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? 'Adding...' : 'Add Connector'}
          </button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ConnectorDetailPanel (Modal)
// ---------------------------------------------------------------------------

function ConnectorDetailPanel({
  connector,
  onClose,
}: {
  readonly connector: ConnectorEntry;
  readonly onClose: () => void;
}): React.ReactElement {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [removing, setRemoving] = useState(false);
  const [tools, setTools] = useState<readonly string[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const fetchConnectors = useDashboardStore((s) => s.fetchConnectors);

  // Fetch real tools from API, fall back to mock data
  useEffect(() => {
    setToolsLoading(true);
    fetch(`/api/connectors/${connector.id}/tools`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: { tools?: string[] }) => {
        const realTools = data.tools ?? [];
        setTools(realTools.length > 0 ? realTools : (MOCK_TOOLS[connector.id] ?? []));
      })
      .catch(() => {
        setTools(MOCK_TOOLS[connector.id] ?? []);
      })
      .finally(() => setToolsLoading(false));
  }, [connector.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/connectors/${connector.id}/test`, { method: 'POST' });
      setTestResult(res.ok ? 'success' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTesting(false);
    }
  }, [connector.id]);

  const handleRemove = useCallback(async () => {
    if (!window.confirm(`Remove connector "${connector.name}"? This cannot be undone.`)) {
      return;
    }
    setRemoving(true);
    try {
      await fetch(`/api/connectors/${connector.id}`, { method: 'DELETE' });
      await fetchConnectors();
      onClose();
    } catch {
      setRemoving(false);
    }
  }, [connector.id, connector.name, fetchConnectors, onClose]);

  const detailRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid var(--bg-tertiary)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    color: 'var(--text-primary)',
  };

  return ReactDOM.createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content glass"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <button className="modal-close" onClick={onClose}>x</button>

        <h2 style={{ margin: '0 0 16px', fontSize: '1.125rem' }}>
          {connector.name}
        </h2>

        <div style={detailRowStyle}>
          <span style={labelStyle}>ID</span>
          <span style={valueStyle}>{connector.id}</span>
        </div>
        <div style={detailRowStyle}>
          <span style={labelStyle}>Type</span>
          <span style={{ ...valueStyle, textTransform: 'uppercase', color: typeBadgeColor(connector.type) }}>
            {connector.type}
          </span>
        </div>
        <div style={detailRowStyle}>
          <span style={labelStyle}>Status</span>
          <StatusBadge
            status={connectorStatusType(connector.status)}
            label={connector.status}
          />
        </div>
        <div style={detailRowStyle}>
          <span style={labelStyle}>URL</span>
          <span style={{ ...valueStyle, fontSize: '0.75rem', opacity: 0.8, maxWidth: 300, wordBreak: 'break-all' }}>
            {connector.url ?? '--'}
          </span>
        </div>
        <div style={detailRowStyle}>
          <span style={labelStyle}>Tools</span>
          <span style={valueStyle}>{connector.toolCount}</span>
        </div>
        <div style={detailRowStyle}>
          <span style={labelStyle}>Last Seen</span>
          <span style={valueStyle}>{formatLastSeen(connector.lastSeen)}</span>
        </div>

        {/* Tool list */}
        {tools.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: '0.875rem', marginBottom: 8, color: 'var(--text-secondary)' }}>
              Available Tools ({tools.length})
            </h3>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                maxHeight: 160,
                overflow: 'auto',
              }}
            >
              {tools.map((tool) => (
                <span
                  key={tool}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: '0.6875rem',
                    fontFamily: 'monospace',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: '#a5b4fc',
                    border: '1px solid var(--border-glass)',
                  }}
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: '0.8125rem',
              backgroundColor: testResult === 'success' ? '#22c55e22' : '#ef444422',
              color: testResult === 'success' ? '#22c55e' : '#ef4444',
              border: `1px solid ${testResult === 'success' ? '#22c55e44' : '#ef444444'}`,
            }}
          >
            {testResult === 'success' ? 'Connection successful' : 'Connection failed'}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            style={{
              flex: 1,
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid var(--border-glass)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              fontSize: '0.8125rem',
              cursor: testing ? 'wait' : 'pointer',
              opacity: testing ? 0.6 : 1,
            }}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #ef444444',
              backgroundColor: '#ef444422',
              color: '#ef4444',
              fontWeight: 600,
              fontSize: '0.8125rem',
              cursor: removing ? 'wait' : 'pointer',
              opacity: removing ? 0.6 : 1,
            }}
          >
            {removing ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// ConnectorsTab (default export)
// ---------------------------------------------------------------------------

export default function ConnectorsTab(): React.ReactElement {
  const storeConnectors = useDashboardStore((s) => s.connectors) ?? [];
  const fetchConnectors = useDashboardStore((s) => s.fetchConnectors);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorEntry | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch on mount
  useEffect(() => {
    fetchConnectors().finally(() => setLoading(false));
  }, [fetchConnectors]);

  // Use store data as primary; show mock data only as labeled demo fallback
  const isDemo = storeConnectors.length === 0;
  const connectors: readonly ConnectorEntry[] = useMemo(
    () => (storeConnectors.length > 0 ? storeConnectors : MOCK_CONNECTORS),
    [storeConnectors],
  );

  const handleSelect = useCallback((c: ConnectorEntry) => {
    setSelectedConnector(c);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedConnector(null);
  }, []);

  const handleConnectorAdded = useCallback(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  if (loading) {
    return <LoadingSpinner message="Loading connectors..." />;
  }

  return (
    <div className="tab-grid">
      {isDemo && (
        <div style={{
          gridColumn: '1 / -1',
          padding: '10px 16px',
          borderRadius: 8,
          background: '#f59e0b18',
          border: '1px solid #f59e0b44',
          color: '#f59e0b',
          fontSize: '0.8125rem',
          fontWeight: 500,
        }}>
          Showing demo data. Add a connector below or connect to a running Qualixar OS instance to see real connectors.
        </div>
      )}

      <ConnectorSummary connectors={connectors} />

      <ConnectorList connectors={connectors} onSelect={handleSelect} />

      <AddConnectorForm onAdded={handleConnectorAdded} />

      {selectedConnector && (
        <ConnectorDetailPanel
          connector={selectedConnector}
          onClose={handleCloseDetail}
        />
      )}
    </div>
  );
}
