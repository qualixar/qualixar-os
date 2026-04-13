/**
 * Qualixar OS Phase 18 — ProviderCatalog
 * Grid of 15+ AI providers. Add/configure via wizard modal with credential Test & Save.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatusBadge } from './shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfigField {
  readonly key: string;
  readonly label: string;
  readonly type: 'password' | 'text' | 'number';
  readonly placeholder?: string;
  readonly required?: boolean;
}

interface ProviderHealth {
  readonly status: 'healthy' | 'degraded' | 'unreachable';
  readonly latencyMs?: number;
  readonly lastChecked?: string;
}

interface CatalogProvider {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly icon: string;
  readonly category: 'llm' | 'embedding' | 'image' | 'speech';
  readonly configured: boolean;
  readonly configFields: readonly ConfigField[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toStatusBadge(health?: ProviderHealth): 'active' | 'pending' | 'error' | 'idle' {
  if (!health) return 'idle';
  if (health.status === 'healthy') return 'active';
  if (health.status === 'degraded') return 'pending';
  return 'error';
}

function categoryColor(cat: string): string {
  if (cat === 'llm') return '#8b5cf6';
  if (cat === 'embedding') return '#3b82f6';
  if (cat === 'image') return '#f59e0b';
  return '#22c55e';
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly type: 'success' | 'error';
}

function useToast(): { toasts: Toast[]; show: (msg: string, type: 'success' | 'error') => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [counter, setCounter] = useState(0);

  const show = useCallback((message: string, type: 'success' | 'error') => {
    const id = counter + 1;
    setCounter((c) => c + 1);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, [counter]);

  return { toasts, show };
}

// ---------------------------------------------------------------------------
// ToastList
// ---------------------------------------------------------------------------

function ToastList({ toasts }: { readonly toasts: Toast[] }): React.ReactElement {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`task-result-toast ${t.type === 'success' ? 'toast-success' : 'toast-error'}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProviderCard
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  readonly provider: CatalogProvider;
  readonly health?: ProviderHealth;
  readonly onConfigure: (p: CatalogProvider) => void;
}

function ProviderCard({ provider, health, onConfigure }: ProviderCardProps): React.ReactElement {
  return (
    <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '1.75rem' }}>{provider.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
            {provider.displayName}
          </div>
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              padding: '1px 6px',
              borderRadius: 3,
              backgroundColor: `${categoryColor(provider.category)}22`,
              color: categoryColor(provider.category),
              border: `1px solid ${categoryColor(provider.category)}44`,
            }}
          >
            {provider.category}
          </span>
        </div>
        {provider.configured && (
          <StatusBadge
            status={toStatusBadge(health)}
            label={health?.status ?? 'configured'}
          />
        )}
      </div>

      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
        {provider.description}
      </p>

      {health?.latencyMs !== undefined && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Latency: {health.latencyMs}ms
        </div>
      )}

      <button
        className={provider.configured ? 'settings-sm-btn' : 'save-settings-btn'}
        onClick={() => onConfigure(provider)}
        style={{ alignSelf: 'flex-start', marginTop: 'auto' }}
      >
        {provider.configured ? 'Reconfigure' : 'Configure'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddProviderModal
// ---------------------------------------------------------------------------

interface AddProviderModalProps {
  readonly provider: CatalogProvider;
  readonly onClose: () => void;
  readonly onSuccess: (msg: string) => void;
  readonly onError: (msg: string) => void;
}

function AddProviderModal({ provider, onClose, onSuccess, onError }: AddProviderModalProps): React.ReactElement {
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.configFields.map((f) => [f.key, ''])),
  );
  const [storageMode, setStorageMode] = useState<'direct' | 'env_ref'>('direct');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const setField = useCallback((key: string, val: string) => {
    setFields((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleTestAndSave = useCallback(async () => {
    const missing = provider.configFields
      .filter((f) => f.required && !fields[f.key]?.trim())
      .map((f) => f.label);
    if (missing.length > 0) {
      onError(`Required fields missing: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      // 1. Store credential (skip for providers with no API key, e.g. Ollama local)
      const hasApiKey = provider.configFields.some((f) => f.type === 'password');
      if (hasApiKey) {
        const apiKeyField = provider.configFields.find((f) => f.type === 'password');
        const keyValue = apiKeyField ? fields[apiKeyField.key] : '';
        if (keyValue) {
          const credRes = await fetch('/api/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: provider.name,
              storageMode,
              value: storageMode === 'env_ref' ? keyValue : keyValue,
              providerName: provider.name,
            }),
          });
          if (!credRes.ok) {
            const data = await credRes.json().catch(() => ({}));
            throw new Error((data as Record<string, string>).error ?? `Credential save failed (${credRes.status})`);
          }
        }
      }

      // 2. Test provider
      setTesting(true);
      const testRes = await fetch(`/api/config/providers/${provider.name}/test`, { method: 'POST' });
      if (!testRes.ok) {
        const data = await testRes.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `Connection test failed (${testRes.status})`);
      }

      // 3. G-09: Persist provider to config.yaml so it survives restarts
      const apiKeyField = provider.configFields.find((f) => f.type === 'password');
      const endpointField = provider.configFields.find((f) => f.key === 'endpoint' || f.key === 'url');
      const providerPayload: Record<string, string> = {
        type: provider.category === 'llm' ? provider.name : provider.category,
      };
      if (apiKeyField && storageMode === 'env_ref' && fields[apiKeyField.key]) {
        providerPayload.api_key_env = fields[apiKeyField.key];
      }
      if (endpointField && fields[endpointField.key]) {
        providerPayload.endpoint = fields[endpointField.key];
      }
      await fetch(`/api/config/providers/${provider.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(providerPayload),
      });

      onSuccess(`${provider.displayName} configured and verified`);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      setTesting(false);
    }
  }, [provider, fields, storageMode, onClose, onSuccess, onError]);

  const isBusy = saving || testing;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="modal-content glass-heavy"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: '92%' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>
            {provider.icon} Configure {provider.displayName}
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Storage mode toggle */}
        <div className="settings-row" style={{ marginBottom: 16 }}>
          <label className="settings-label">Storage Mode</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['direct', 'env_ref'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setStorageMode(m)}
                className="settings-sm-btn"
                style={{
                  opacity: storageMode === m ? 1 : 0.5,
                  fontWeight: storageMode === m ? 700 : 400,
                }}
                disabled={isBusy}
              >
                {m === 'direct' ? 'Direct (Encrypted)' : 'Env Reference'}
              </button>
            ))}
          </div>
        </div>

        {/* Config fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {provider.configFields.map((f) => (
            <div key={f.key} className="settings-row">
              <label className="settings-label">
                {f.label}{f.required && ' *'}
              </label>
              <input
                className="settings-input"
                type={storageMode === 'env_ref' ? 'text' : f.type}
                value={fields[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={storageMode === 'env_ref' ? `$\{ENV_VAR_NAME}` : (f.placeholder ?? '')}
                disabled={isBusy}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button
            className="save-settings-btn"
            onClick={handleTestAndSave}
            disabled={isBusy}
            style={{ flex: 1 }}
          >
            {testing ? 'Testing...' : saving ? 'Saving...' : 'Test & Save'}
          </button>
          <button className="settings-sm-btn" onClick={onClose} disabled={isBusy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProviderCatalog (main export)
// ---------------------------------------------------------------------------

export function ProviderCatalog(): React.ReactElement {
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [health, setHealth] = useState<Record<string, ProviderHealth>>({});
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState<CatalogProvider | null>(null);
  const { toasts, show } = useToast();

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/config/providers/catalog');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { catalog?: Record<string, unknown>[]; providers?: Record<string, unknown>[] };
      const raw = data.catalog ?? data.providers ?? [];
      // Map API fields (id, configFields[].name) to component fields (name, configFields[].key)
      const mapped: CatalogProvider[] = raw.map((p) => ({
        name: (p.name ?? p.id ?? '') as string,
        displayName: (p.displayName ?? '') as string,
        description: (p.description ?? '') as string,
        icon: (p.icon ?? '') as string,
        category: (p.category ?? 'llm') as CatalogProvider['category'],
        configured: Boolean(p.configured),
        configFields: Array.isArray(p.configFields)
          ? p.configFields.map((f: Record<string, unknown>) => ({
              key: (f.key ?? f.name ?? '') as string,
              label: (f.label ?? '') as string,
              type: (f.type === 'url' || f.type === 'text' ? 'text' : f.type ?? 'text') as ConfigField['type'],
              placeholder: (f.placeholder ?? '') as string,
              required: Boolean(f.required),
            }))
          : [],
      }));
      setCatalog(mapped);
    } catch (err) {
      show(`Failed to load catalog: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [show]);

  const loadHealth = useCallback(async (providerName: string) => {
    try {
      const res = await fetch(`/api/config/providers/${providerName}/health`);
      if (!res.ok) return;
      const data = await res.json() as { health: ProviderHealth };
      setHealth((prev) => ({ ...prev, [providerName]: data.health }));
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // Load health for configured providers once catalog is ready
  useEffect(() => {
    const configured = catalog.filter((p) => p.configured);
    for (const p of configured) {
      void loadHealth(p.name);
    }
  }, [catalog, loadHealth]);

  const handleConfigureSuccess = useCallback((msg: string) => {
    show(msg, 'success');
    void loadCatalog();
  }, [show, loadCatalog]);

  const handleConfigureError = useCallback((msg: string) => {
    show(msg, 'error');
  }, [show]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)' }}>
        Loading provider catalog...
      </div>
    );
  }

  const configured = catalog.filter((p) => p.configured);
  const unconfigured = catalog.filter((p) => !p.configured);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
        <Card title="Total Providers">
          <div style={{ textAlign: 'center' }}>
            <div className="stat-value">{catalog.length}</div>
            <div className="stat-label">Available</div>
          </div>
        </Card>
        <Card title="Configured">
          <div style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ color: '#22c55e' }}>{configured.length}</div>
            <div className="stat-label">Active</div>
          </div>
        </Card>
        <Card title="Healthy">
          <div style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ color: '#8b5cf6' }}>
              {Object.values(health).filter((h) => h.status === 'healthy').length}
            </div>
            <div className="stat-label">Online</div>
          </div>
        </Card>
      </div>

      {/* Configured providers */}
      {configured.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
            Configured Providers
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {configured.map((p) => (
              <ProviderCard
                key={p.name}
                provider={p}
                health={health[p.name]}
                onConfigure={setConfiguring}
              />
            ))}
          </div>
        </div>
      )}

      {/* Available providers */}
      {unconfigured.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.9375rem', color: 'var(--text-secondary)' }}>
            Available Providers
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {unconfigured.map((p) => (
              <ProviderCard
                key={p.name}
                provider={p}
                onConfigure={setConfiguring}
              />
            ))}
          </div>
        </div>
      )}

      {catalog.length === 0 && (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
          No providers in catalog.
        </div>
      )}

      {/* Configure modal */}
      {configuring && (
        <AddProviderModal
          provider={configuring}
          onClose={() => setConfiguring(null)}
          onSuccess={handleConfigureSuccess}
          onError={handleConfigureError}
        />
      )}

      <ToastList toasts={toasts} />
    </div>
  );
}
