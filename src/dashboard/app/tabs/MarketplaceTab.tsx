/**
 * Qualixar OS Phase 20 — Marketplace Tab
 * Browse, search, filter, and install plugins from the registry.
 * GET /api/marketplace/browse  — registry listing
 * GET /api/marketplace/installed — installed plugin ids
 * POST /api/marketplace/install — install a plugin
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatusBadge } from '../components/shared.js';
import { PluginDetailModal } from './PluginDetailModal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PluginType = 'all' | 'agent' | 'skill' | 'tool' | 'topology';
type SortOption = 'stars' | 'installs' | 'name' | 'updated';

interface RegistryPlugin {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly types: ReadonlyArray<'agent' | 'skill' | 'tool' | 'topology'>;
  readonly verified: boolean;
  readonly stars: number;
  readonly installs: number;
  readonly version: string;
  readonly updatedAt: string;
}

interface PluginCard extends RegistryPlugin {
  readonly isInstalled: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_BADGE_COLORS: Record<string, string> = {
  agent: '#3B82F6',
  skill: '#8B5CF6',
  tool: '#10B981',
  topology: '#F59E0B',
};

const SORT_OPTIONS: ReadonlyArray<{ value: SortOption; label: string }> = [
  { value: 'stars', label: 'Most Starred' },
  { value: 'installs', label: 'Most Installed' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'updated', label: 'Recently Updated' },
];

const TYPE_FILTER_OPTIONS: ReadonlyArray<{ value: PluginType; label: string }> = [
  { value: 'all', label: 'All Types' },
  { value: 'agent', label: 'Agent' },
  { value: 'skill', label: 'Skill' },
  { value: 'tool', label: 'Tool' },
  { value: 'topology', label: 'Topology' },
];

// Phase 3: Tool category filters
type ToolCategoryFilter = 'all' | 'web-data' | 'code-dev' | 'communication' | 'knowledge' | 'creative' | 'enterprise';

const CATEGORY_FILTERS: ReadonlyArray<{ value: ToolCategoryFilter; label: string; color: string }> = [
  { value: 'all', label: 'All', color: '#718096' },
  { value: 'web-data', label: 'Web & Data', color: '#3b82f6' },
  { value: 'code-dev', label: 'Code & Dev', color: '#22c55e' },
  { value: 'communication', label: 'Communication', color: '#a855f7' },
  { value: 'knowledge', label: 'Knowledge', color: '#f59e0b' },
  { value: 'creative', label: 'Creative', color: '#ec4899' },
  { value: 'enterprise', label: 'Enterprise', color: '#64748b' },
];

// Phase 3: Skill store entry type
interface SkillStoreEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly version: string;
  readonly category: string;
  readonly tier: string;
  readonly types: readonly string[];
  readonly tags: readonly string[];
  readonly toolCount: number;
  readonly toolNames: readonly string[];
  readonly installed: boolean;
  readonly enabled: boolean;
}

type MarketplaceView = 'browse' | 'installed';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ToastProps {
  readonly message: string;
  readonly kind: 'success' | 'error';
  readonly onDismiss: () => void;
}

function Toast({ message, kind, onDismiss }: ToastProps): React.ReactElement {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="marketplace-toast"
      style={{
        background: kind === 'success' ? '#22c55e22' : '#ef444422',
        borderColor: kind === 'success' ? '#22c55e66' : '#ef444466',
        color: kind === 'success' ? '#22c55e' : '#ef4444',
      }}
    >
      <span>{kind === 'success' ? '✓' : '✕'}</span>
      <span>{message}</span>
      <button onClick={onDismiss} className="toast-close">×</button>
    </div>
  );
}

interface PluginCardProps {
  readonly plugin: PluginCard;
  readonly onClickCard: (id: string) => void;
  readonly onInstall: (id: string) => void;
  readonly installing: boolean;
}

function PluginCardItem({ plugin, onClickCard, onInstall, installing }: PluginCardProps): React.ReactElement {
  const handleInstall = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!plugin.isInstalled && !installing) onInstall(plugin.id);
    },
    [plugin.id, plugin.isInstalled, installing, onInstall],
  );

  return (
    <div
      className="plugin-card glass"
      onClick={() => onClickCard(plugin.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClickCard(plugin.id); }}
    >
      <div className="plugin-card-header">
        <div className="plugin-card-title-row">
          <span className="plugin-name">{plugin.name}</span>
          {plugin.verified && (
            <span className="verified-badge" title="Verified by Qualixar OS team">✓ Verified</span>
          )}
        </div>
        <span className="plugin-author">by {plugin.author}</span>
      </div>

      <p className="plugin-description">{plugin.description}</p>

      <div className="plugin-type-badges">
        {plugin.types.map((t) => (
          <span
            key={t}
            className="type-pill"
            style={{
              background: `${TYPE_BADGE_COLORS[t]}22`,
              color: TYPE_BADGE_COLORS[t],
              borderColor: `${TYPE_BADGE_COLORS[t]}55`,
            }}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="plugin-card-footer">
        <div className="plugin-stats">
          <span className="stat-item" title="Stars">★ {plugin.stars.toLocaleString()}</span>
          <span className="stat-item" title="Installs">↓ {plugin.installs.toLocaleString()}</span>
          <span className="stat-item">v{plugin.version}</span>
        </div>
        <button
          className={`install-btn ${plugin.isInstalled ? 'installed' : ''}`}
          onClick={handleInstall}
          disabled={plugin.isInstalled || installing}
        >
          {plugin.isInstalled ? 'Installed' : installing ? 'Installing…' : 'Install'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MarketplaceTab(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<PluginType>('all');
  const [categoryFilter, setCategoryFilter] = useState<ToolCategoryFilter>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>('stars');
  const [view, setView] = useState<MarketplaceView>('browse');
  const [plugins, setPlugins] = useState<readonly PluginCard[]>([]);
  const [skillEntries, setSkillEntries] = useState<readonly SkillStoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch from unified skill store (Phase 3)
  const fetchSkillStore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        ...(query ? { query } : {}),
        ...(categoryFilter !== 'all' ? { category: categoryFilter } : {}),
        ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
        ...(view === 'installed' ? { installedOnly: 'true' } : {}),
        sort: sort === 'stars' || sort === 'installs' || sort === 'updated' ? 'name' : sort,
      });

      const res = await fetch(`/api/skill-store/browse?${params.toString()}`);
      if (!res.ok) throw new Error(`Store error: ${res.status}`);
      const data = (await res.json()) as { results: SkillStoreEntry[] };
      setSkillEntries(data.results ?? []);

      // Also convert to PluginCard format for backward compat with modal
      const asPlugins: PluginCard[] = (data.results ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        author: e.author,
        description: e.description,
        types: e.types as PluginCard['types'],
        verified: e.tier === 'builtin',
        stars: 0,
        installs: 0,
        version: e.version,
        updatedAt: '',
        isInstalled: e.installed,
      }));
      setPlugins(asPlugins);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [query, typeFilter, categoryFilter, sort, view]);

  useEffect(() => {
    const debounce = setTimeout(fetchSkillStore, query ? 350 : 0);
    return () => clearTimeout(debounce);
  }, [fetchSkillStore, query]);

  const handleInstall = useCallback(async (pluginId: string) => {
    setInstalling(pluginId);
    try {
      const res = await fetch('/api/marketplace/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pluginId }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `Install failed (${res.status})`);
      }
      setToast({ message: 'Installed successfully', kind: 'success' });
      void fetchSkillStore();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Installation failed', kind: 'error' });
    } finally {
      setInstalling(null);
    }
  }, [fetchSkillStore]);

  const handleUninstall = useCallback(async (skillId: string) => {
    try {
      const res = await fetch(`/api/skill-store/${encodeURIComponent(skillId)}/uninstall`, { method: 'POST' });
      if (!res.ok) throw new Error(`Uninstall failed (${res.status})`);
      setToast({ message: 'Uninstalled. Tools removed from Forge.', kind: 'success' });
      void fetchSkillStore();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Uninstall failed', kind: 'error' });
    }
  }, [fetchSkillStore]);

  const handleDelete = useCallback(async (skillId: string) => {
    try {
      const res = await fetch(`/api/skill-store/${encodeURIComponent(skillId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setToast({ message: 'Deleted permanently.', kind: 'success' });
      setConfirmDelete(null);
      void fetchSkillStore();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Delete failed', kind: 'error' });
    }
  }, [fetchSkillStore]);

  const handleInstallChange = useCallback(() => { void fetchSkillStore(); }, [fetchSkillStore]);
  const dismissToast = useCallback(() => setToast(null), []);

  const handleRefreshRegistry = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/marketplace/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      setToast({ message: 'Registry refreshed — showing latest skills & plugins', kind: 'success' });
      // Re-fetch the skill store to pick up new entries
      void fetchSkillStore();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Refresh failed', kind: 'error' });
    } finally {
      setRefreshing(false);
    }
  }, [fetchSkillStore]);

  return (
    <div className="tab-content marketplace-tab">
      {toast && <Toast message={toast.message} kind={toast.kind} onDismiss={dismissToast} />}

      {selectedPluginId && (
        <PluginDetailModal pluginId={selectedPluginId} onClose={() => setSelectedPluginId(null)} onInstallChange={handleInstallChange} />
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--card-bg, #1a202c)', border: '1px solid var(--border-color, #4a5568)', borderRadius: 12, padding: 24, maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Delete permanently?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted, #a0aec0)', margin: '0 0 20px' }}>
              This will remove the skill, all its tools, and all data. Forge will no longer have access to these tools. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer' }} onClick={() => handleDelete(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header with view tabs */}
      <Card title="Marketplace" subtitle={`${skillEntries.length} skills, tools & plugins available`}>
        {/* View toggle + Refresh */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, alignItems: 'center' }}>
          <button className={`settings-nav-btn ${view === 'browse' ? 'settings-nav-active' : ''}`} onClick={() => setView('browse')}>Browse All</button>
          <button className={`settings-nav-btn ${view === 'installed' ? 'settings-nav-active' : ''}`} onClick={() => setView('installed')}>Installed</button>
          <div style={{ flex: 1 }} />
          <button
            className="btn-secondary"
            onClick={handleRefreshRegistry}
            disabled={refreshing}
            title="Fetch latest skills & plugins from the Qualixar registry"
            style={{ fontSize: '0.75rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={refreshing ? { animation: 'spin 1s linear infinite' } : {}}>
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh Registry'}
          </button>
        </div>

        {/* Search + filters */}
        <div className="marketplace-toolbar">
          <input type="text" className="search-input" placeholder="Search skills, tools, plugins..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select className="settings-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as PluginType)}>
            {TYPE_FILTER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select className="settings-input" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
            {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {CATEGORY_FILTERS.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(cat.value)}
              style={{
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
                border: `1px solid ${categoryFilter === cat.value ? cat.color : 'transparent'}`,
                background: categoryFilter === cat.value ? `${cat.color}22` : 'var(--card-bg, #2d3748)',
                color: categoryFilter === cat.value ? cat.color : 'var(--text-muted, #a0aec0)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Results */}
      {loading && (
        <div className="marketplace-loading"><div className="spinner" /><span>Loading marketplace...</span></div>
      )}

      {!loading && error && (
        <div className="marketplace-error">
          <StatusBadge status="error" label={error} />
          <button className="btn-secondary" onClick={() => void fetchSkillStore()}>Retry</button>
        </div>
      )}

      {!loading && !error && skillEntries.length === 0 && (
        <div className="marketplace-empty">
          {view === 'installed' ? 'No skills installed yet. Browse and install from the marketplace.' : 'No results found. Try adjusting your filters.'}
        </div>
      )}

      {!loading && !error && skillEntries.length > 0 && (
        <div className="plugin-grid">
          {skillEntries.map((entry) => (
            <SkillCardItem
              key={entry.id}
              entry={entry}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onDelete={(id) => setConfirmDelete(id)}
              installing={installing === entry.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3: Skill Store Card (with uninstall/delete)
// ---------------------------------------------------------------------------

function SkillCardItem({
  entry,
  onInstall,
  onUninstall,
  onDelete,
  installing,
}: {
  readonly entry: SkillStoreEntry;
  readonly onInstall: (id: string) => void;
  readonly onUninstall: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly installing: boolean;
}): React.ReactElement {
  const catColor = CATEGORY_FILTERS.find((c) => c.value === entry.category)?.color ?? '#718096';
  const isBuiltin = entry.tier === 'builtin';

  return (
    <div className="plugin-card glass" role="article">
      <div className="plugin-card-header">
        <div className="plugin-card-title-row">
          <span className="plugin-name">{entry.name}</span>
          {isBuiltin && <span className="verified-badge" title="Ships with Qualixar OS">Built-in</span>}
          {entry.tier === 'community' && entry.installed && <span style={{ fontSize: 10, color: '#22c55e', marginLeft: 4 }}>Installed</span>}
        </div>
        <span className="plugin-author">by {entry.author}</span>
      </div>

      <p className="plugin-description">{entry.description}</p>

      {/* Category + type badges */}
      <div className="plugin-type-badges">
        <span className="type-pill" style={{ background: `${catColor}22`, color: catColor, borderColor: `${catColor}55` }}>
          {entry.category}
        </span>
        {entry.types.map((t) => (
          <span key={t} className="type-pill" style={{ background: `${TYPE_BADGE_COLORS[t] ?? '#718096'}22`, color: TYPE_BADGE_COLORS[t] ?? '#718096', borderColor: `${TYPE_BADGE_COLORS[t] ?? '#718096'}55` }}>
            {t}
          </span>
        ))}
      </div>

      {/* Tool count */}
      {entry.toolCount > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted, #a0aec0)', margin: '4px 0' }}>
          {entry.toolCount} tool{entry.toolCount !== 1 ? 's' : ''}: {entry.toolNames.slice(0, 3).join(', ')}{entry.toolNames.length > 3 ? '...' : ''}
        </div>
      )}

      {/* Actions */}
      <div className="plugin-card-footer">
        <div className="plugin-stats">
          <span className="stat-item">v{entry.version}</span>
          <span className="stat-item">{entry.tier}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {!entry.installed && (
            <button className="install-btn" onClick={() => onInstall(entry.id)} disabled={installing}>
              {installing ? 'Installing...' : 'Install'}
            </button>
          )}
          {entry.installed && !isBuiltin && (
            <>
              <button className="install-btn installed" onClick={() => onUninstall(entry.id)} title="Remove tools from Forge, keep data">
                Uninstall
              </button>
              <button style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }} onClick={() => onDelete(entry.id)} title="Delete permanently">
                Delete
              </button>
            </>
          )}
          {entry.installed && isBuiltin && (
            <button className="install-btn installed" disabled>Installed</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MarketplaceTab;
