/**
 * Qualixar OS Phase 18 — CredentialManager
 * List, add, and delete provider credentials. Supports encrypted direct values and env refs.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatusBadge } from './shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CredentialEntry {
  readonly id: string;
  readonly provider: string;
  readonly storageMode: 'encrypted' | 'env_ref';
  readonly status: 'valid' | 'invalid' | 'untested';
  readonly createdAt: string;
  readonly lastUsed?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function credStatusBadge(status: string): 'active' | 'error' | 'idle' {
  if (status === 'valid') return 'active';
  if (status === 'invalid') return 'error';
  return 'idle';
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Toast (lightweight inline)
// ---------------------------------------------------------------------------

interface InlineToast {
  readonly message: string;
  readonly type: 'success' | 'error';
}

// ---------------------------------------------------------------------------
// CredentialRow
// ---------------------------------------------------------------------------

interface CredentialRowProps {
  readonly cred: CredentialEntry;
  readonly onDelete: (provider: string) => Promise<void>;
}

function CredentialRow({ cred, onDelete }: CredentialRowProps): React.ReactElement {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!window.confirm(`Remove credentials for "${cred.provider}"?`)) return;
    setDeleting(true);
    try {
      await onDelete(cred.provider);
    } finally {
      setDeleting(false);
    }
  }, [cred.provider, onDelete]);

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{cred.provider}</td>
      <td>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: cred.storageMode === 'encrypted' ? '#8b5cf622' : '#3b82f622',
            color: cred.storageMode === 'encrypted' ? '#8b5cf6' : '#3b82f6',
            border: `1px solid ${cred.storageMode === 'encrypted' ? '#8b5cf644' : '#3b82f644'}`,
          }}
        >
          {cred.storageMode === 'encrypted' ? '🔒 Encrypted' : '🔗 Env Ref'}
        </span>
      </td>
      <td>
        <StatusBadge status={credStatusBadge(cred.status)} label={cred.status} />
      </td>
      <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        {formatDate(cred.createdAt)}
      </td>
      <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        {formatDate(cred.lastUsed)}
      </td>
      <td>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="settings-sm-btn"
          style={{
            backgroundColor: '#ef444422',
            color: '#ef4444',
            border: '1px solid #ef444444',
            opacity: deleting ? 0.5 : 1,
            cursor: deleting ? 'wait' : 'pointer',
          }}
        >
          {deleting ? '...' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// AddCredentialForm
// ---------------------------------------------------------------------------

interface AddCredentialFormProps {
  readonly providers: string[];
  readonly onSaved: () => void;
  readonly onError: (msg: string) => void;
}

function AddCredentialForm({ providers, onSaved, onError }: AddCredentialFormProps): React.ReactElement {
  const [provider, setProvider] = useState('');
  const [customProvider, setCustomProvider] = useState('');
  const [storageMode, setStorageMode] = useState<'direct' | 'env_ref'>('direct');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveProvider = provider === '__custom__' ? customProvider : provider;

  const handleSave = useCallback(async () => {
    if (!effectiveProvider.trim()) {
      onError('Provider name is required');
      return;
    }
    if (!value.trim()) {
      onError('Credential value is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: effectiveProvider.trim(),
          storageMode,
          value: value.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `HTTP ${res.status}`);
      }
      setProvider('');
      setCustomProvider('');
      setValue('');
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [effectiveProvider, storageMode, value, onSaved, onError]);

  return (
    <Card title="Add Credential">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Provider select */}
        <div className="settings-row">
          <label className="settings-label">Provider *</label>
          <select
            className="settings-input"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={saving}
          >
            <option value="">— select provider —</option>
            {providers.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            <option value="__custom__">Other (type below)</option>
          </select>
        </div>

        {provider === '__custom__' && (
          <div className="settings-row">
            <label className="settings-label">Provider Name *</label>
            <input
              className="settings-input"
              value={customProvider}
              onChange={(e) => setCustomProvider(e.target.value)}
              placeholder="e.g. openai"
              disabled={saving}
            />
          </div>
        )}

        {/* Storage mode */}
        <div className="settings-row">
          <label className="settings-label">Storage Mode</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['direct', 'env_ref'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setStorageMode(m)}
                className="settings-sm-btn"
                disabled={saving}
                style={{ fontWeight: storageMode === m ? 700 : 400, opacity: storageMode === m ? 1 : 0.55 }}
              >
                {m === 'direct' ? 'Direct' : 'Env Ref'}
              </button>
            ))}
          </div>
        </div>

        {/* Value */}
        <div className="settings-row">
          <label className="settings-label">
            {storageMode === 'direct' ? 'API Key / Secret *' : 'Env Variable Name *'}
          </label>
          <input
            className="settings-input"
            type={storageMode === 'direct' ? 'password' : 'text'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={storageMode === 'direct' ? 'sk-...' : 'OPENAI_API_KEY'}
            disabled={saving}
          />
        </div>

        <button
          className="save-settings-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Credential'}
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CredentialManagerPanel (main export)
// ---------------------------------------------------------------------------

export function CredentialManagerPanel(): React.ReactElement {
  const [credentials, setCredentials] = useState<CredentialEntry[]>([]);
  const [catalogProviders, setCatalogProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<InlineToast | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { credentials: CredentialEntry[] };
      setCredentials(data.credentials ?? []);
    } catch (err) {
      showToast(`Failed to load credentials: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const handleDelete = useCallback(async (providerName: string) => {
    try {
      const res = await fetch(`/api/credentials/${providerName}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast(`Credential for "${providerName}" removed`, 'success');
      await loadCredentials();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }, [loadCredentials, showToast]);

  const handleSaved = useCallback(() => {
    showToast('Credential saved', 'success');
    void loadCredentials();
  }, [loadCredentials, showToast]);

  // Fetch catalog providers for the dropdown
  useEffect(() => {
    fetch('/api/config/providers/catalog')
      .then((r) => r.json())
      .then((data: { catalog: Array<{ id: string }> }) => {
        setCatalogProviders((data.catalog ?? []).map((p) => p.id));
      })
      .catch(() => { /* ignore */ });
  }, []);

  const providerNames = catalogProviders.length > 0
    ? catalogProviders
    : [...new Set(credentials.map((c) => c.provider))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast */}
      {toast && (
        <div className={`task-result-toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.message}
        </div>
      )}

      {/* Credential table */}
      <Card title="Stored Credentials" subtitle={`${credentials.length} credential${credentials.length !== 1 ? 's' : ''}`}>
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
        ) : credentials.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '12px 0' }}>No credentials stored yet.</div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Storage</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((cred) => (
                  <CredentialRow
                    key={`${cred.provider}-${cred.id}`}
                    cred={cred}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add form */}
      <AddCredentialForm
        providers={providerNames}
        onSaved={handleSaved}
        onError={(msg) => showToast(msg, 'error')}
      />
    </div>
  );
}
