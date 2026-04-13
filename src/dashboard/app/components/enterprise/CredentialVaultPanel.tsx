/**
 * Qualixar OS Phase 22 Enterprise — CredentialVaultPanel
 * Vault management panel for the Settings tab.
 * Shows lock status, unlock/lock controls, credential list (IDs only, no secrets),
 * store-new-credential form, and key rotation trigger.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { springGentle, springSnappy } from '../../lib/motion-presets.js';
import { Card, StatusBadge, LoadingSpinner } from '../shared.js';
import { KeyRotationDialog } from './KeyRotationDialog.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VaultStatus {
  readonly locked: boolean;
  readonly credentialCount: number;
  readonly lastRotated: string | null;
}

interface CredentialEntry {
  readonly providerId: string;
  readonly type: string;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Mock API calls (wired to real endpoints in Phase 22 backend)
// ---------------------------------------------------------------------------

async function fetchVaultStatus(): Promise<VaultStatus> {
  const res = await fetch('/api/enterprise/vault/status');
  if (!res.ok) throw new Error('Failed to fetch vault status');
  return res.json() as Promise<VaultStatus>;
}

async function fetchCredentials(): Promise<readonly CredentialEntry[]> {
  const res = await fetch('/api/enterprise/vault/credentials');
  if (!res.ok) throw new Error('Failed to fetch credentials');
  return res.json() as Promise<readonly CredentialEntry[]>;
}

async function unlockVault(passphrase: string): Promise<void> {
  const res = await fetch('/api/enterprise/vault/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  });
  if (!res.ok) throw new Error('Incorrect passphrase');
}

async function lockVault(): Promise<void> {
  const res = await fetch('/api/enterprise/vault/lock', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to lock vault');
}

async function storeCredential(providerId: string, type: string, secret: string): Promise<void> {
  const res = await fetch('/api/enterprise/vault/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, type, secret }),
  });
  if (!res.ok) throw new Error('Failed to store credential');
}

async function rotateVaultKey(oldPass: string, newPass: string): Promise<void> {
  const res = await fetch('/api/enterprise/vault/rotate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassphrase: oldPass, newPassphrase: newPass }),
  });
  if (!res.ok) throw new Error('Key rotation failed');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CredentialVaultPanel(): React.ReactElement {
  const [status, setStatus]           = useState<VaultStatus | null>(null);
  const [creds, setCreds]             = useState<readonly CredentialEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [passphrase, setPassphrase]   = useState('');
  const [unlocking, setUnlocking]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [showRotate, setShowRotate]   = useState(false);
  const [newProv, setNewProv]         = useState('');
  const [newType, setNewType]         = useState('api_key');
  const [newSecret, setNewSecret]     = useState('');
  const [storing, setStoring]         = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([fetchVaultStatus(), fetchCredentials()]);
      setStatus(s);
      setCreds(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleUnlock = useCallback(async () => {
    if (!passphrase) return;
    setUnlocking(true);
    setError(null);
    try {
      await unlockVault(passphrase);
      setPassphrase('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unlock failed');
    } finally {
      setUnlocking(false);
    }
  }, [passphrase, refresh]);

  const handleLock = useCallback(async () => {
    setError(null);
    try {
      await lockVault();
      setCreds([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lock failed');
    }
  }, [refresh]);

  const handleStore = useCallback(async () => {
    if (!newProv || !newSecret) return;
    setStoring(true);
    setError(null);
    try {
      await storeCredential(newProv, newType, newSecret);
      setNewProv(''); setNewType('api_key'); setNewSecret('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Store failed');
    } finally {
      setStoring(false);
    }
  }, [newProv, newType, newSecret, refresh]);

  if (loading) return <LoadingSpinner message="Loading vault…" />;

  const locked = status?.locked ?? true;

  return (
    <Card title="Credential Vault" subtitle="AES-256-GCM encrypted at rest">
      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <StatusBadge status={locked ? 'error' : 'active'} label={locked ? 'Locked' : 'Unlocked'} />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {status?.credentialCount ?? 0} credential{status?.credentialCount !== 1 ? 's' : ''} stored
        </span>
        {status?.lastRotated && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Last rotated: {new Date(status.lastRotated).toLocaleDateString()}
          </span>
        )}
      </div>

      {error && (
        <p style={{ fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
          {error}
        </p>
      )}

      {/* Unlock form */}
      <AnimatePresence>
        {locked && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springSnappy}
            style={{ marginBottom: '16px' }}
          >
            <label className="field-label">Vault Passphrase</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="password"
                className="glass-input"
                placeholder="Enter passphrase to unlock"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleUnlock(); }}
                style={{ flex: 1 }}
                autoComplete="current-password"
              />
              <button className="btn btn-primary" onClick={() => void handleUnlock()} disabled={unlocking || !passphrase}>
                {unlocking ? 'Unlocking…' : 'Unlock'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credential list */}
      <AnimatePresence>
        {!locked && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={springGentle}>
            {/* Lock + Rotate */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button className="btn btn-ghost" onClick={() => void handleLock()}>Lock Vault</button>
              <button className="btn btn-ghost" onClick={() => setShowRotate(true)}>Rotate Key</button>
            </div>

            {/* Credential table */}
            <div className="table-wrapper" style={{ marginBottom: '20px' }}>
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead><tr><th>Provider ID</th><th>Type</th><th>Created</th></tr></thead>
                <tbody>
                  {creds.length === 0 && (
                    <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No credentials stored</td></tr>
                  )}
                  {creds.map((c) => (
                    <motion.tr key={c.providerId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springGentle}>
                      <td style={{ fontFamily: 'monospace' }}>{c.providerId}</td>
                      <td>{c.type}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Store new credential */}
            <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.82rem', fontWeight: 600 }}>Store New Credential</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px', marginBottom: '8px' }}>
                <input className="glass-input" placeholder="Provider ID (e.g. openai-prod)" value={newProv} onChange={(e) => setNewProv(e.target.value)} />
                <select className="glass-input" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  <option value="api_key">API Key</option>
                  <option value="token">Token</option>
                  <option value="password">Password</option>
                  <option value="cert">Certificate</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="password" className="glass-input" placeholder="Secret value" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} style={{ flex: 1 }} autoComplete="off" />
                <button className="btn btn-primary" onClick={() => void handleStore()} disabled={storing || !newProv || !newSecret}>
                  {storing ? 'Storing…' : 'Store'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showRotate && (
        <KeyRotationDialog onRotate={rotateVaultKey} onClose={() => setShowRotate(false)} />
      )}
    </Card>
  );
}
