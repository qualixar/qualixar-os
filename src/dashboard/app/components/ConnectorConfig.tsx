/**
 * Qualixar OS Phase Pivot-2 — MCP Server Connector Configuration
 * Settings section for registering external MCP servers as tool sources.
 *
 * LLD: phase-pivot2-tool-skill-registry-lld.md Section 2.5
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatusBadge } from './shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface McpConnector {
  readonly id: string;
  readonly name: string;
  readonly transport: 'stdio' | 'streamable-http';
  readonly command?: string;
  readonly args?: readonly string[];
  readonly url?: string;
  readonly status: string;
  readonly tool_count: number;
}

// ---------------------------------------------------------------------------
// ConnectorConfig
// ---------------------------------------------------------------------------

export function ConnectorConfig(): React.ReactElement {
  const [connectors, setConnectors] = useState<readonly McpConnector[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTransport, setNewTransport] = useState<'stdio' | 'streamable-http'>('stdio');
  const [newCommand, setNewCommand] = useState('');
  const [newArgs, setNewArgs] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch('/api/tool-connectors');
      if (res.ok) {
        const data = await res.json();
        setConnectors(data.connectors ?? []);
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { fetchConnectors(); }, [fetchConnectors]);

  const showToastMsg = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) { showToastMsg('Name required', false); return; }
    const body: Record<string, unknown> = {
      name: newName.trim(),
      transport: newTransport,
    };
    if (newTransport === 'stdio') {
      body.command = newCommand.trim();
      body.args = newArgs.trim() ? newArgs.split(/\s+/) : [];
    } else {
      body.url = newUrl.trim();
    }
    try {
      const res = await fetch('/api/tool-connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToastMsg(`Connector '${newName}' registered`, true);
        setShowAdd(false);
        setNewName(''); setNewCommand(''); setNewArgs(''); setNewUrl('');
        fetchConnectors();
      } else {
        const data = await res.json();
        showToastMsg(data.error ?? 'Registration failed', false);
      }
    } catch { showToastMsg('Network error', false); }
  }, [newName, newTransport, newCommand, newArgs, newUrl, showToastMsg, fetchConnectors]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/tool-connectors/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToastMsg(`Connector '${name}' removed`, true);
        fetchConnectors();
      } else {
        showToastMsg('Failed to remove connector', false);
      }
    } catch { showToastMsg('Network error', false); }
  }, [showToastMsg, fetchConnectors]);

  const handleRefresh = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tool-connectors/${id}/refresh`, { method: 'POST' });
      if (res.ok) {
        showToastMsg('Tools refreshed', true);
        fetchConnectors();
      }
    } catch { showToastMsg('Refresh failed', false); }
  }, [showToastMsg, fetchConnectors]);

  return (
    <Card title="Tool Connectors" subtitle="Register external MCP servers as tool sources">
      <div className="settings-section">
        {toast && (
          <div className={`task-result-toast ${toast.ok ? 'toast-success' : 'toast-error'}`}>
            {toast.msg}
          </div>
        )}

        {/* Connector list */}
        {connectors.length === 0 && !showAdd && (
          <p className="settings-empty">No MCP tool connectors registered.</p>
        )}

        {connectors.map((c) => (
          <div key={c.id} className="settings-provider-row">
            <div className="settings-provider-info">
              <strong>{c.name}</strong>
              <span className="settings-dim">{c.transport}</span>
              <span className="settings-dim">{c.tool_count} tools</span>
            </div>
            <StatusBadge
              status={c.status === 'connected' ? 'active' : c.status === 'error' ? 'error' : 'idle'}
              label={c.status}
            />
            <button className="settings-sm-btn" onClick={() => handleRefresh(c.id)}>Refresh</button>
            <button className="settings-sm-btn settings-danger-btn" onClick={() => handleDelete(c.id, c.name)}>Remove</button>
          </div>
        ))}

        {/* Add connector */}
        <button className="save-settings-btn" onClick={() => setShowAdd(!showAdd)} style={{ marginTop: 12 }}>
          {showAdd ? 'Cancel' : '+ Add MCP Server'}
        </button>

        {showAdd && (
          <div className="settings-form">
            <label className="settings-label">
              Name
              <input className="settings-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. github-mcp" />
            </label>
            <label className="settings-label">
              Transport
              <select className="settings-input" value={newTransport} onChange={(e) => setNewTransport(e.target.value as 'stdio' | 'streamable-http')}>
                <option value="stdio">STDIO (local process)</option>
                <option value="streamable-http">Streamable HTTP (remote)</option>
              </select>
            </label>
            {newTransport === 'stdio' && (
              <>
                <label className="settings-label">
                  Command
                  <input className="settings-input" value={newCommand} onChange={(e) => setNewCommand(e.target.value)} placeholder="e.g. npx" />
                </label>
                <label className="settings-label">
                  Args (space-separated)
                  <input className="settings-input" value={newArgs} onChange={(e) => setNewArgs(e.target.value)} placeholder="e.g. -y @modelcontextprotocol/server-github" />
                </label>
              </>
            )}
            {newTransport === 'streamable-http' && (
              <label className="settings-label">
                Server URL
                <input className="settings-input" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://mcp.example.com/sse" />
              </label>
            )}
            <button className="save-settings-btn" onClick={handleAdd}>Register Server</button>
          </div>
        )}
      </div>
    </Card>
  );
}
