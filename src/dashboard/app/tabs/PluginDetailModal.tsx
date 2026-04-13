/**
 * Qualixar OS Phase 20 — Plugin Detail Modal
 * Overlay showing full plugin metadata, provides/requires, config, and actions.
 * GET /api/marketplace/:pluginId  — full plugin detail
 * POST /api/marketplace/install   — install
 * POST /api/marketplace/uninstall — uninstall
 * POST /api/marketplace/enable    — enable
 * POST /api/marketplace/disable   — disable
 * PUT  /api/marketplace/:pluginId/config — save config
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatusBadge } from '../components/shared.js';
import { PluginConfigRenderer } from './PluginConfigRenderer.js';
import type { ConfigField } from './PluginConfigRenderer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginProvides {
  readonly agents: readonly string[];
  readonly tools: readonly string[];
  readonly skills: readonly string[];
  readonly topologies: readonly string[];
}

interface PluginRequires {
  readonly providers: readonly string[];
  readonly tools: readonly string[];
  readonly qosVersion: string;
}

type PluginTier = 'free' | 'pro' | 'enterprise';

interface PluginDetail {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly description: string;
  readonly longDescription?: string;
  readonly verified: boolean;
  readonly tier: PluginTier;
  readonly isInstalled: boolean;
  readonly isEnabled: boolean;
  readonly provides: PluginProvides;
  readonly requires: PluginRequires;
  readonly configSchema: Record<string, ConfigField>;
  readonly configValues: Record<string, unknown>;
}

interface PluginDetailModalProps {
  readonly pluginId: string;
  readonly onClose: () => void;
  readonly onInstallChange: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<PluginTier, string> = {
  free: '#22c55e',
  pro: '#3B82F6',
  enterprise: '#8B5CF6',
};

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

function CountPill({ label, count }: { label: string; count: number }): React.ReactElement {
  return (
    <span className="count-pill">
      {count} <span className="count-label">{label}</span>
    </span>
  );
}

function ProvidesSection({ provides }: { provides: PluginProvides }): React.ReactElement {
  const items: ReadonlyArray<{ key: keyof PluginProvides; label: string }> = [
    { key: 'agents', label: 'agents' },
    { key: 'tools', label: 'tools' },
    { key: 'skills', label: 'skills' },
    { key: 'topologies', label: 'topologies' },
  ];

  return (
    <div className="detail-section">
      <h4 className="detail-section-title">Provides</h4>
      <div className="provides-counts">
        {items.map(({ key, label }) => (
          <CountPill key={key} label={label} count={provides[key].length} />
        ))}
      </div>
      {items.map(({ key, label }) =>
        provides[key].length > 0 ? (
          <div key={key} className="provides-list-group">
            <span className="provides-list-label">{label}:</span>
            <div className="provides-list">
              {provides[key].map((item) => (
                <code key={item} className="provides-item">{item}</code>
              ))}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}

function RequiresSection({ requires }: { requires: PluginRequires }): React.ReactElement {
  return (
    <div className="detail-section">
      <h4 className="detail-section-title">Requirements</h4>
      <div className="requires-grid">
        <div className="requires-row">
          <span className="requires-label">Qualixar OS version</span>
          <code className="requires-value">{requires.qosVersion}</code>
        </div>
        {requires.providers.length > 0 && (
          <div className="requires-row">
            <span className="requires-label">Providers</span>
            <div className="requires-list">
              {requires.providers.map((p) => (
                <code key={p} className="provides-item">{p}</code>
              ))}
            </div>
          </div>
        )}
        {requires.tools.length > 0 && (
          <div className="requires-row">
            <span className="requires-label">Tools</span>
            <div className="requires-list">
              {requires.tools.map((t) => (
                <code key={t} className="provides-item">{t}</code>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PluginDetailModal({
  pluginId,
  onClose,
  onInstallChange,
}: PluginDetailModalProps): React.ReactElement {
  const [detail, setDetail] = useState<PluginDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fetch detail
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/marketplace/${pluginId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load plugin (${res.status})`);
        return res.json() as Promise<{ plugin: PluginDetail }>;
      })
      .then(({ plugin }) => {
        setDetail(plugin);
        setConfigValues(plugin.configValues);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Load error');
      })
      .finally(() => setLoading(false));
  }, [pluginId]);

  const handleConfigChange = useCallback((key: string, value: unknown) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const postAction = useCallback(
    async (action: 'install' | 'uninstall' | 'enable' | 'disable') => {
      if (!detail) return;
      setActionPending(action);
      setActionMessage(null);
      try {
        const res = await fetch(`/api/marketplace/${action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pluginId: detail.id }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `${action} failed`);
        }
        setActionMessage(`${action.charAt(0).toUpperCase() + action.slice(1)} successful`);
        onInstallChange();
        // Refresh detail
        const refreshed = await fetch(`/api/marketplace/${detail.id}`);
        if (refreshed.ok) {
          const { plugin } = (await refreshed.json()) as { plugin: PluginDetail };
          setDetail(plugin);
          setConfigValues(plugin.configValues);
        }
      } catch (err) {
        setActionMessage(err instanceof Error ? err.message : `${action} failed`);
      } finally {
        setActionPending(null);
      }
    },
    [detail, onInstallChange],
  );

  const handleSaveConfig = useCallback(async () => {
    if (!detail) return;
    setActionPending('config');
    setActionMessage(null);
    try {
      const res = await fetch(`/api/marketplace/${detail.id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configValues }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? 'Config save failed');
      }
      setActionMessage('Configuration saved');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setActionPending(null);
    }
  }, [detail, configValues]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="modal-content glass-heavy plugin-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="modal-loading">
            <div className="spinner" />
            <span>Loading plugin details…</span>
          </div>
        )}

        {!loading && error && (
          <div className="modal-error">
            <StatusBadge status="error" label={error} />
            <button className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        )}

        {!loading && !error && detail && (
          <>
            {/* Header */}
            <div className="plugin-detail-header">
              <div className="plugin-detail-title-row">
                <h2 className="plugin-detail-name">{detail.name}</h2>
                <div className="plugin-detail-badges">
                  {detail.verified && (
                    <span className="verified-badge">✓ Verified</span>
                  )}
                  <span
                    className="tier-badge"
                    style={{
                      background: `${TIER_COLORS[detail.tier]}22`,
                      color: TIER_COLORS[detail.tier],
                      borderColor: `${TIER_COLORS[detail.tier]}55`,
                    }}
                  >
                    {detail.tier}
                  </span>
                </div>
              </div>
              <div className="plugin-detail-meta">
                <span>v{detail.version}</span>
                <span>by {detail.author}</span>
                <StatusBadge
                  status={detail.isInstalled ? (detail.isEnabled ? 'active' : 'idle') : 'pending'}
                  label={detail.isInstalled ? (detail.isEnabled ? 'Enabled' : 'Disabled') : 'Not Installed'}
                />
              </div>
              <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>
            </div>

            {/* Action message */}
            {actionMessage && (
              <div className="action-message">{actionMessage}</div>
            )}

            {/* Description */}
            <div className="detail-section">
              <h4 className="detail-section-title">Description</h4>
              <p className="plugin-long-desc">
                {detail.longDescription ?? detail.description}
              </p>
            </div>

            {/* Provides */}
            <ProvidesSection provides={detail.provides} />

            {/* Requires */}
            <RequiresSection requires={detail.requires} />

            {/* Config */}
            {Object.keys(detail.configSchema).length > 0 && (
              <div className="detail-section">
                <h4 className="detail-section-title">Configuration</h4>
                <PluginConfigRenderer
                  schema={detail.configSchema}
                  values={configValues}
                  onChange={handleConfigChange}
                />
              </div>
            )}

            {/* Action buttons */}
            <div className="plugin-detail-actions">
              {detail.isInstalled ? (
                <>
                  <button
                    className="btn-danger"
                    disabled={actionPending !== null}
                    onClick={() => void postAction('uninstall')}
                  >
                    {actionPending === 'uninstall' ? 'Uninstalling…' : 'Uninstall'}
                  </button>
                  {detail.isEnabled ? (
                    <button
                      className="btn-secondary"
                      disabled={actionPending !== null}
                      onClick={() => void postAction('disable')}
                    >
                      {actionPending === 'disable' ? 'Disabling…' : 'Disable'}
                    </button>
                  ) : (
                    <button
                      className="btn-primary"
                      disabled={actionPending !== null}
                      onClick={() => void postAction('enable')}
                    >
                      {actionPending === 'enable' ? 'Enabling…' : 'Enable'}
                    </button>
                  )}
                  {Object.keys(detail.configSchema).length > 0 && (
                    <button
                      className="btn-primary"
                      disabled={actionPending !== null}
                      onClick={() => void handleSaveConfig()}
                    >
                      {actionPending === 'config' ? 'Saving…' : 'Save Config'}
                    </button>
                  )}
                </>
              ) : (
                <button
                  className="btn-primary"
                  disabled={actionPending !== null}
                  onClick={() => void postAction('install')}
                >
                  {actionPending === 'install' ? 'Installing…' : 'Install'}
                </button>
              )}
              <button className="btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
