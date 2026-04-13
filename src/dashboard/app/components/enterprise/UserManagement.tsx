/**
 * Qualixar OS Phase 22 Enterprise — UserManagement
 * Admin-only user CRUD panel.
 * List users, create with token generation, change role per user.
 * Non-admin roles see a permission notice instead of controls.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { springGentle, springSnappy } from '../../lib/motion-presets.js';
import { Card, StatusBadge, LoadingSpinner } from '../shared.js';
import { PermissionGate } from './PermissionGate.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManagedUser {
  readonly id: string;
  readonly username: string;
  readonly role: 'admin' | 'developer' | 'viewer';
  readonly createdAt: string;
  readonly lastSeen: string | null;
  readonly active: boolean;
}

interface CreateUserPayload {
  readonly username: string;
  readonly role: 'admin' | 'developer' | 'viewer';
}

interface UserManagementProps {
  readonly currentUserRole: string;
}

const VALID_ROLES = ['admin', 'developer', 'viewer'] as const;
type ValidRole = typeof VALID_ROLES[number];

const ROLE_COLORS: Record<ValidRole, string> = {
  admin: '#ef4444',
  developer: '#3b82f6',
  viewer: '#9ca3af',
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchUsers(): Promise<readonly ManagedUser[]> {
  const res = await fetch('/api/enterprise/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json() as Promise<readonly ManagedUser[]>;
}

async function createUser(payload: CreateUserPayload): Promise<{ token: string }> {
  const res = await fetch('/api/enterprise/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create user');
  return res.json() as Promise<{ token: string }>;
}

async function updateUserRole(userId: string, role: ValidRole): Promise<void> {
  const res = await fetch(`/api/enterprise/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error('Failed to update role');
}

async function generateToken(userId: string): Promise<{ token: string }> {
  const res = await fetch(`/api/enterprise/users/${userId}/token`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to generate token');
  return res.json() as Promise<{ token: string }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserManagement({ currentUserRole }: UserManagementProps): React.ReactElement {
  const [users, setUsers]           = useState<readonly ManagedUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole]       = useState<ValidRole>('viewer');
  const [creating, setCreating]     = useState(false);
  const [generatedToken, setToken]  = useState<string | null>(null);
  const [tokenLabel, setTokenLabel] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleCreate = useCallback(async () => {
    if (!newUsername.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { token } = await createUser({ username: newUsername.trim(), role: newRole });
      setToken(token);
      setTokenLabel(`${newUsername.trim()} token`);
      setNewUsername('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }, [newUsername, newRole, refresh]);

  const handleRoleChange = useCallback(async (userId: string, role: ValidRole) => {
    setError(null);
    try {
      await updateUserRole(userId, role);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role update failed');
    }
  }, [refresh]);

  const handleGenToken = useCallback(async (userId: string, username: string) => {
    setError(null);
    try {
      const { token } = await generateToken(userId);
      setToken(token);
      setTokenLabel(`${username} new token`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token generation failed');
    }
  }, []);

  return (
    <Card title="User Management" subtitle="Admin access only">
      <PermissionGate role={currentUserRole} resource="users" action="admin" fallback={
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '16px 0' }}>
          Admin role required to manage users.
        </p>
      }>
        {loading ? <LoadingSpinner message="Loading users…" /> : (
          <>
            {error && (
              <p style={{ fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
                {error}
              </p>
            )}

            {/* Generated token display */}
            {generatedToken && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springSnappy}
                style={{ padding: '12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', marginBottom: '16px' }}
              >
                <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 600, color: '#22c55e' }}>
                  Generated: {tokenLabel}
                </p>
                <code style={{ fontSize: '0.72rem', wordBreak: 'break-all', color: 'var(--text-primary)' }}>{generatedToken}</code>
                <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Copy now — will not be shown again.
                </p>
                <button className="btn btn-ghost" style={{ marginTop: '8px', fontSize: '0.75rem' }} onClick={() => setToken(null)}>Dismiss</button>
              </motion.div>
            )}

            {/* User table */}
            <div className="table-wrapper" style={{ marginBottom: '20px' }}>
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Username</th><th>Role</th><th>Status</th><th>Last Seen</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No users found</td></tr>
                  )}
                  {users.map((u, idx) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...springGentle, delay: Math.min(idx * 0.03, 0.2) }}
                    >
                      <td style={{ fontFamily: 'monospace' }}>{u.username}</td>
                      <td>
                        <select
                          className="glass-input"
                          style={{ fontSize: '0.78rem', padding: '2px 6px', color: ROLE_COLORS[u.role] }}
                          value={u.role}
                          onChange={(e) => void handleRoleChange(u.id, e.target.value as ValidRole)}
                        >
                          {VALID_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td>
                        <StatusBadge status={u.active ? 'active' : 'idle'} label={u.active ? 'Active' : 'Inactive'} />
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                        {u.lastSeen ? new Date(u.lastSeen).toLocaleDateString() : 'Never'}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                          onClick={() => void handleGenToken(u.id, u.username)}
                        >
                          Gen Token
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Create user form */}
            <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 10px', fontSize: '0.82rem', fontWeight: 600 }}>Create User</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="glass-input"
                  placeholder="Username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  style={{ flex: 1 }}
                />
                <select className="glass-input" value={newRole} onChange={(e) => setNewRole(e.target.value as ValidRole)} style={{ width: '120px' }}>
                  {VALID_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button className="btn btn-primary" onClick={() => void handleCreate()} disabled={creating || !newUsername.trim()}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </>
        )}
      </PermissionGate>
    </Card>
  );
}
