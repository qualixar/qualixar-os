/**
 * Qualixar OS Phase 22 Enterprise — SSOConfigPanel
 * SSO provider configuration panel (admin only).
 * Supports: Azure AD, Google Workspace, Okta, Auth0.
 * Each provider: client ID, redirect URI, enabled toggle, test login, status.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { springGentle, springSnappy } from '../../lib/motion-presets.js';
import { Card, StatusBadge, LoadingSpinner } from '../shared.js';
import { PermissionGate } from './PermissionGate.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SSOProvider {
  readonly id: 'azure' | 'google' | 'okta' | 'auth0';
  readonly label: string;
  readonly icon: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly enabled: boolean;
  readonly status: 'connected' | 'error' | 'unconfigured';
  readonly lastTested: string | null;
}

interface SSOConfigPanelProps {
  readonly currentUserRole: string;
}

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

const PROVIDER_META: readonly Pick<SSOProvider, 'id' | 'label' | 'icon'>[] = [
  { id: 'azure',  label: 'Azure AD',         icon: '☁' },
  { id: 'google', label: 'Google Workspace',  icon: '⬡' },
  { id: 'okta',   label: 'Okta',             icon: '◈' },
  { id: 'auth0',  label: 'Auth0',            icon: '◎' },
];

function defaultProviders(): readonly SSOProvider[] {
  return PROVIDER_META.map((m) => ({
    ...m,
    clientId: '',
    redirectUri: `${window.location.origin}/auth/callback/${m.id}`,
    enabled: false,
    status: 'unconfigured',
    lastTested: null,
  }));
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchSSOConfig(): Promise<readonly SSOProvider[]> {
  const res = await fetch('/api/enterprise/sso/providers');
  if (!res.ok) throw new Error('Failed to fetch SSO config');
  return res.json() as Promise<readonly SSOProvider[]>;
}

async function saveSSOProvider(provider: SSOProvider): Promise<void> {
  const res = await fetch(`/api/enterprise/sso/providers/${provider.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: provider.clientId,
      redirectUri: provider.redirectUri,
      enabled: provider.enabled,
    }),
  });
  if (!res.ok) throw new Error('Failed to save provider');
}

async function testSSOLogin(providerId: string): Promise<'connected' | 'error'> {
  const res = await fetch(`/api/enterprise/sso/providers/${providerId}/test`, { method: 'POST' });
  return res.ok ? 'connected' : 'error';
}

// ---------------------------------------------------------------------------
// Provider card
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  readonly provider: SSOProvider;
  readonly onUpdate: (updated: SSOProvider) => void;
  readonly onTest: (id: SSOProvider['id']) => Promise<void>;
  readonly saving: boolean;
}

function ProviderCard({ provider, onUpdate, onTest, saving }: ProviderCardProps): React.ReactElement {
  const [testing, setTesting] = useState(false);

  const handleTest = useCallback(async () => {
    setTesting(true);
    try { await onTest(provider.id); } finally { setTesting(false); }
  }, [onTest, provider.id]);

  const statusBadge = provider.status === 'connected'
    ? <StatusBadge status="active"   label="Connected" />
    : provider.status === 'error'
    ? <StatusBadge status="error"    label="Error" />
    : <StatusBadge status="idle"     label="Unconfigured" />;

  return (
    <motion.div
      className="glass"
      style={{ padding: '16px', borderRadius: '10px' }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>{provider.icon}</span>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{provider.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {statusBadge}
          {/* Toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={provider.enabled}
              onChange={(e) => onUpdate({ ...provider, enabled: e.target.checked })}
              style={{ accentColor: '#3b82f6' }}
            />
            Enabled
          </label>
        </div>
      </div>

      {/* Fields */}
      <AnimatePresence>
        {provider.enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSnappy}
          >
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              <div>
                <label className="field-label">Client ID</label>
                <input
                  className="glass-input"
                  style={{ width: '100%' }}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={provider.clientId}
                  onChange={(e) => onUpdate({ ...provider, clientId: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Redirect URI</label>
                <input
                  className="glass-input"
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.78rem' }}
                  value={provider.redirectUri}
                  onChange={(e) => onUpdate({ ...provider, redirectUri: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: '0.78rem' }}
                onClick={() => void handleTest()}
                disabled={testing || !provider.clientId || saving}
              >
                {testing ? 'Testing…' : 'Test Login'}
              </button>
              {provider.lastTested && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Last tested: {new Date(provider.lastTested).toLocaleString()}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SSOConfigPanel({ currentUserRole }: SSOConfigPanelProps): React.ReactElement {
  const [providers, setProviders] = useState<readonly SSOProvider[]>(defaultProviders());
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    void fetchSSOConfig()
      .then(setProviders)
      .catch(() => { /* use defaults if endpoint not ready */ })
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = useCallback((updated: SSOProvider) => {
    setProviders((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSaved(false);
  }, []);

  const handleTest = useCallback(async (id: SSOProvider['id']) => {
    const result = await testSSOLogin(id);
    setProviders((prev) => prev.map((p) =>
      p.id === id ? { ...p, status: result, lastTested: new Date().toISOString() } : p
    ));
  }, []);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await Promise.all(providers.map(saveSSOProvider));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [providers]);

  return (
    <Card title="SSO Configuration" subtitle="Single Sign-On providers — admin only">
      <PermissionGate role={currentUserRole} resource="sso" action="admin" fallback={
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '16px 0' }}>
          Admin role required to configure SSO providers.
        </p>
      }>
        {loading ? <LoadingSpinner message="Loading SSO config…" /> : (
          <>
            {error && (
              <p style={{ fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
                {error}
              </p>
            )}
            {saved && (
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ fontSize: '0.8rem', color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}
              >
                Configuration saved.
              </motion.p>
            )}

            <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onUpdate={handleUpdate}
                  onTest={handleTest}
                  saving={saving}
                />
              ))}
            </div>

            <button className="btn btn-primary" onClick={() => void handleSaveAll()} disabled={saving}>
              {saving ? 'Saving…' : 'Save All Providers'}
            </button>
          </>
        )}
      </PermissionGate>
    </Card>
  );
}
