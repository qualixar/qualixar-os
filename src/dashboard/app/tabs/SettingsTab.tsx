/**
 * Qualixar OS Dashboard -- Full Settings Panel
 * 11 sections: Providers, Credentials, Embeddings, Models, Channels, Deploy,
 * Budget, Security, Memory, Import/Export, Env Vars.
 * Phase 18: 5 new sections (provider catalog, credentials, embeddings, channels v2, deploy).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDashboardStore } from '../store.js';
import type { ModelEntry } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';
import { ProviderCatalog } from '../components/ProviderCatalog.js';
import { CredentialManagerPanel } from '../components/CredentialManager.js';
import { EmbeddingConfig } from '../components/EmbeddingConfig.js';
import { ChannelConfig } from '../components/ChannelConfig.js';
import { WorkflowDeploy } from '../components/WorkflowDeploy.js';
import { ConnectorConfig } from '../components/ConnectorConfig.js';
import { SLMBrand } from '../components/SLMBrand.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProviderInfo {
  readonly name: string;
  readonly type: string;
  readonly endpoint: string | null;
  readonly apiKeyEnv: string;
  readonly status: 'connected' | 'disconnected' | 'unknown';
}

interface EnvVarInfo {
  readonly name: string;
  readonly set: boolean;
}

interface FullConfig {
  readonly mode?: string;
  readonly providers?: Record<string, { type: string; endpoint?: string; api_key_env?: string; api_version?: string }>;
  readonly models?: { primary?: string; fallback?: string; judge?: string; catalog?: readonly unknown[] };
  readonly budget?: { max_usd?: number; warn_pct?: number; per_task_max?: number };
  readonly security?: { container_isolation?: boolean; allowed_paths?: string[]; denied_commands?: string[] };
  readonly memory?: { enabled?: boolean; auto_invoke?: boolean; max_ram_mb?: number; embedding?: { provider?: string; model?: string } };
  readonly channels?: {
    mcp?: boolean;
    http?: { enabled?: boolean; port?: number };
    discord?: { enabled?: boolean; token?: string };
    telegram?: { enabled?: boolean; token?: string };
    webhook?: { enabled?: boolean; url?: string };
  };
  readonly workspace?: { default_dir?: string };
  readonly execution?: { max_output_tokens?: number; agent_quality?: 'balanced' | 'high' | 'maximum'; enable_shell?: boolean };
}

type SettingsSection = 'providers' | 'credentials' | 'embeddings' | 'models' | 'channels' | 'deploy' | 'connectors' | 'budget' | 'security' | 'memory' | 'workspace' | 'execution' | 'importexport' | 'env';

const PROVIDER_TYPES = [
  'anthropic', 'openai', 'azure-openai', 'google', 'ollama',
  'bedrock', 'openrouter', 'groq', 'mistral', 'deepseek',
  'together', 'fireworks', 'cerebras', 'cohere', 'custom',
  'lmstudio', 'llamacpp', 'vllm', 'huggingface-tgi', 'claude-managed',
] as const;

// ---------------------------------------------------------------------------
// Section Nav (Phase 18: 5 new sections added)
// ---------------------------------------------------------------------------

const SECTIONS: readonly { readonly id: SettingsSection; readonly label: string }[] = [
  { id: 'providers', label: 'Providers' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'channels', label: 'Channels' },
  { id: 'deploy', label: 'Deploy' },
  { id: 'connectors', label: 'Tool Connectors' },
  { id: 'models', label: 'Models' },
  { id: 'budget', label: 'Budget' },
  { id: 'security', label: 'Security' },
  { id: 'memory', label: 'Memory' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'execution', label: 'Execution' },
  { id: 'importexport', label: 'Import / Export' },
  { id: 'env', label: 'Environment' },
];

// ---------------------------------------------------------------------------
// Settings Component
// ---------------------------------------------------------------------------

export function SettingsTab(): React.ReactElement {
  const models = useDashboardStore((s) => s.models);
  const fetchModels = useDashboardStore((s) => s.fetchModels);

  // DEF-043: Group related UI state to reduce useState calls
  const [section, setSection] = useState<SettingsSection>(() => {
    const saved = localStorage.getItem('qos-settings-section');
    return (saved && SECTIONS.some((s) => s.id === saved) ? saved : 'providers') as SettingsSection;
  });

  // Persist settings section
  useEffect(() => {
    localStorage.setItem('qos-settings-section', section);
  }, [section]);

  const [pageState, setPageState] = useState<{
    readonly config: FullConfig;
    readonly providers: readonly ProviderInfo[];
    readonly envVars: readonly EnvVarInfo[];
    readonly saving: boolean;
    readonly toast: { msg: string; ok: boolean } | null;
    readonly loading: boolean;
  }>({
    config: {},
    providers: [],
    envVars: [],
    saving: false,
    toast: null,
    loading: true,
  });

  // Convenience destructure (read-only)
  const { config, providers, envVars, saving, toast, loading } = pageState;

  // Immutable state updaters
  const setConfig = useCallback((c: FullConfig) => setPageState((s) => ({ ...s, config: c })), []);
  const setProviders = useCallback((p: readonly ProviderInfo[]) => setPageState((s) => ({ ...s, providers: p })), []);
  const setEnvVars = useCallback((e: readonly EnvVarInfo[]) => setPageState((s) => ({ ...s, envVars: e })), []);
  const setSaving = useCallback((v: boolean) => setPageState((s) => ({ ...s, saving: v })), []);
  const setToast = useCallback((t: { msg: string; ok: boolean } | null) => setPageState((s) => ({ ...s, toast: t })), []);
  const setLoading = useCallback((v: boolean) => setPageState((s) => ({ ...s, loading: v })), []);

  // Fetch config on mount
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config ?? {});
      }
    } catch { /* non-critical */ }
  }, []);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/config/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers ?? []);
      }
    } catch { /* non-critical */ }
  }, []);

  const fetchEnv = useCallback(async () => {
    try {
      const res = await fetch('/api/config/env');
      if (res.ok) {
        const data = await res.json();
        setEnvVars(data.env ?? []);
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    Promise.allSettled([fetchConfig(), fetchProviders(), fetchEnv(), fetchModels()])
      .finally(() => setLoading(false));
  }, [fetchConfig, fetchProviders, fetchEnv, fetchModels]);

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const saveConfig = useCallback(async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config ?? {});
        showToast('Settings saved', true);
      } else {
        showToast('Failed to save settings', false);
      }
    } catch {
      showToast('Network error saving settings', false);
    } finally {
      setSaving(false);
    }
  }, [showToast]);

  if (loading) {
    return <LoadingSpinner message="Loading settings..." />;
  }

  return (
    <div className="settings-panel">
      {/* Section Nav */}
      <div className="settings-nav">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`settings-nav-btn ${section === s.id ? 'settings-nav-active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`task-result-toast ${toast.ok ? 'toast-success' : 'toast-error'}`}>
          {toast.msg}
        </div>
      )}

      {/* Content */}
      <div className="settings-content">
        {section === 'providers' && (
          <ProviderCatalog />
        )}
        {section === 'credentials' && (
          <CredentialManagerPanel />
        )}
        {section === 'embeddings' && (
          <EmbeddingConfig />
        )}
        {section === 'models' && (
          <ModelsSection config={config} models={models} onSave={saveConfig} saving={saving} onRefresh={fetchModels} />
        )}
        {section === 'channels' && (
          <ChannelConfig />
        )}
        {section === 'deploy' && (
          <WorkflowDeploy />
        )}
        {section === 'connectors' && (
          <ConnectorConfig />
        )}
        {section === 'budget' && (
          <BudgetSection config={config} onSave={saveConfig} saving={saving} />
        )}
        {section === 'security' && (
          <SecuritySection config={config} onSave={saveConfig} saving={saving} />
        )}
        {section === 'memory' && (
          <MemorySection config={config} onSave={saveConfig} saving={saving} />
        )}
        {section === 'workspace' && (
          <WorkspaceSection config={config} onSave={saveConfig} saving={saving} />
        )}
        {section === 'execution' && (
          <ExecutionSection config={config} onSave={saveConfig} saving={saving} />
        )}
        {section === 'importexport' && (
          <ImportExportSection showToast={showToast} onRefresh={fetchConfig} />
        )}
        {section === 'env' && (
          <EnvSection envVars={envVars} onRefresh={fetchEnv} />
        )}
      </div>
    </div>
  );
}

// ProvidersSection removed (Phase Pivot-2 audit) — replaced by <ProviderCatalog />

// ---------------------------------------------------------------------------
// Section 2: Models
// ---------------------------------------------------------------------------

function ModelsSection({
  config,
  models,
  onSave,
  saving,
  onRefresh,
}: {
  readonly config: FullConfig;
  readonly models: readonly ModelEntry[];
  readonly onSave: (u: Record<string, unknown>) => Promise<void>;
  readonly saving: boolean;
  readonly onRefresh: () => Promise<void>;
}): React.ReactElement {
  const [primary, setPrimary] = useState(config.models?.primary ?? 'claude-sonnet-4-6');
  const [fallback, setFallback] = useState(config.models?.fallback ?? 'gpt-4.1-mini');
  const [judge, setJudge] = useState(config.models?.judge ?? '');

  useEffect(() => {
    if (config.models?.primary) setPrimary(config.models.primary);
    if (config.models?.fallback) setFallback(config.models.fallback);
    if (config.models?.judge) setJudge(config.models.judge);
  }, [config.models]);

  const modelNames = models.map((m) => m.name);

  return (
    <Card title="Models" subtitle="Primary, fallback, and judge model selection">
      <div className="settings-section">
        <label className="settings-label">
          Primary Model
          <select className="settings-input" value={primary} onChange={(e) => setPrimary(e.target.value)}>
            {modelNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="settings-label">
          Fallback Model
          <select className="settings-input" value={fallback} onChange={(e) => setFallback(e.target.value)}>
            {modelNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="settings-label">
          Judge Model
          <select className="settings-input" value={judge} onChange={(e) => setJudge(e.target.value)}>
            <option value="">(default)</option>
            {modelNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="settings-row" style={{ gap: '8px', marginTop: '12px' }}>
          <button
            className="save-settings-btn"
            disabled={saving}
            onClick={() => onSave({ models: { primary, fallback, judge: judge || undefined } })}
          >
            {saving ? 'Saving...' : 'Save Models'}
          </button>
          <button className="settings-sm-btn" onClick={() => onRefresh()}>Refresh Models</button>
        </div>

        {/* Model catalog table */}
        <div style={{ marginTop: '16px' }}>
          <h4 className="settings-subtitle">Available Models ({models.length})</h4>
          <DataTable
            columns={MODEL_COLUMNS}
            data={models as unknown as Record<string, unknown>[]}
            emptyMessage="No models loaded"
          />
        </div>
      </div>
    </Card>
  );
}

const MODEL_COLUMNS = [
  { key: 'name', header: 'Model' },
  { key: 'provider', header: 'Provider' },
  {
    key: 'qualityScore',
    header: 'Quality',
    render: (row: Record<string, unknown>) => {
      const score = row.qualityScore as number;
      return (
        <div className="quality-bar-wrapper">
          <div className="quality-bar" style={{ width: `${score * 100}%` }} />
          <span>{(score * 100).toFixed(0)}%</span>
        </div>
      );
    },
  },
  {
    key: 'available',
    header: 'Status',
    render: (row: Record<string, unknown>) => (
      <StatusBadge
        status={(row.available as boolean) ? 'active' : 'idle'}
        label={(row.available as boolean) ? 'available' : 'unavailable'}
      />
    ),
  },
];

// ChannelsSection removed — replaced by <ChannelConfig /> component

// ---------------------------------------------------------------------------
// Section 4: Budget
// ---------------------------------------------------------------------------

function BudgetSection({
  config,
  onSave,
  saving,
}: {
  readonly config: FullConfig;
  readonly onSave: (u: Record<string, unknown>) => Promise<void>;
  readonly saving: boolean;
}): React.ReactElement {
  const b = config.budget ?? {};
  const [maxUsd, setMaxUsd] = useState(b.max_usd ?? 10);
  const [warnPct, setWarnPct] = useState((b.warn_pct ?? 0.8) * 100);
  const [perTaskMax, setPerTaskMax] = useState(b.per_task_max ?? 0);

  useEffect(() => {
    const bg = config.budget ?? {};
    setMaxUsd(bg.max_usd ?? 10);
    setWarnPct((bg.warn_pct ?? 0.8) * 100);
    setPerTaskMax(bg.per_task_max ?? 0);
  }, [config.budget]);

  return (
    <Card title="Budget" subtitle="Cost limits and warnings">
      <div className="settings-section">
        <label className="settings-label">
          Max USD
          <input className="settings-input settings-narrow" type="number" step="0.5" value={maxUsd} onChange={(e) => setMaxUsd(Number(e.target.value))} />
        </label>
        <label className="settings-label">
          Warning at {warnPct.toFixed(0)}%
          <input className="settings-range" type="range" min={0} max={100} value={warnPct} onChange={(e) => setWarnPct(Number(e.target.value))} />
        </label>
        <label className="settings-label">
          Per-Task Max USD (0 = unlimited)
          <input className="settings-input settings-narrow" type="number" step="0.1" value={perTaskMax} onChange={(e) => setPerTaskMax(Number(e.target.value))} />
        </label>
        <button
          className="save-settings-btn"
          disabled={saving}
          style={{ marginTop: '12px' }}
          onClick={() => onSave({ budget: { max_usd: maxUsd, warn_pct: warnPct / 100, per_task_max: perTaskMax || undefined } })}
        >
          {saving ? 'Saving...' : 'Save Budget'}
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 5: Security
// ---------------------------------------------------------------------------

function SecuritySection({
  config,
  onSave,
  saving,
}: {
  readonly config: FullConfig;
  readonly onSave: (u: Record<string, unknown>) => Promise<void>;
  readonly saving: boolean;
}): React.ReactElement {
  const sec = config.security ?? {};
  const [containerIsolation, setContainerIsolation] = useState(sec.container_isolation ?? false);
  const [allowedPaths, setAllowedPaths] = useState<string[]>(sec.allowed_paths ?? ['./']);
  const [deniedCommands, setDeniedCommands] = useState<string[]>(sec.denied_commands ?? ['rm -rf', 'sudo']);
  const [newPath, setNewPath] = useState('');
  const [newCmd, setNewCmd] = useState('');

  useEffect(() => {
    const s = config.security ?? {};
    setContainerIsolation(s.container_isolation ?? false);
    setAllowedPaths(s.allowed_paths ?? ['./']);
    setDeniedCommands(s.denied_commands ?? ['rm -rf', 'sudo']);
  }, [config.security]);

  return (
    <Card title="Security" subtitle="Isolation and access control">
      <div className="settings-section">
        <ToggleRow label="Container Isolation" checked={containerIsolation} onChange={setContainerIsolation} />

        <h4 className="settings-subtitle">Allowed Paths</h4>
        {allowedPaths.map((p, i) => (
          <div key={i} className="settings-row">
            <code className="settings-code">{p}</code>
            <button className="settings-sm-btn settings-danger-btn" onClick={() => setAllowedPaths(allowedPaths.filter((_, j) => j !== i))}>x</button>
          </div>
        ))}
        <div className="settings-row">
          <input className="settings-input" value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/path/to/allow" />
          <button className="settings-sm-btn" onClick={() => { if (newPath.trim()) { setAllowedPaths([...allowedPaths, newPath.trim()]); setNewPath(''); } }}>Add</button>
        </div>

        <h4 className="settings-subtitle">Denied Commands</h4>
        {deniedCommands.map((cmd, i) => (
          <div key={i} className="settings-row">
            <code className="settings-code">{cmd}</code>
            <button className="settings-sm-btn settings-danger-btn" onClick={() => setDeniedCommands(deniedCommands.filter((_, j) => j !== i))}>x</button>
          </div>
        ))}
        <div className="settings-row">
          <input className="settings-input" value={newCmd} onChange={(e) => setNewCmd(e.target.value)} placeholder="dangerous-command" />
          <button className="settings-sm-btn" onClick={() => { if (newCmd.trim()) { setDeniedCommands([...deniedCommands, newCmd.trim()]); setNewCmd(''); } }}>Add</button>
        </div>

        <button
          className="save-settings-btn"
          disabled={saving}
          style={{ marginTop: '12px' }}
          onClick={() => onSave({ security: { container_isolation: containerIsolation, allowed_paths: allowedPaths, denied_commands: deniedCommands } })}
        >
          {saving ? 'Saving...' : 'Save Security'}
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 6: Memory
// ---------------------------------------------------------------------------

function MemorySection({
  config,
  onSave,
  saving,
}: {
  readonly config: FullConfig;
  readonly onSave: (u: Record<string, unknown>) => Promise<void>;
  readonly saving: boolean;
}): React.ReactElement {
  const mem = config.memory ?? {};
  const [enabled, setEnabled] = useState(mem.enabled ?? true);
  const [autoInvoke, setAutoInvoke] = useState(mem.auto_invoke ?? true);
  const [maxRam, setMaxRam] = useState(mem.max_ram_mb ?? 50);
  const [embProvider, setEmbProvider] = useState(mem.embedding?.provider ?? 'azure');
  const [embModel, setEmbModel] = useState(mem.embedding?.model ?? 'text-embedding-3-large');

  useEffect(() => {
    const m = config.memory ?? {};
    setEnabled(m.enabled ?? true);
    setAutoInvoke(m.auto_invoke ?? true);
    setMaxRam(m.max_ram_mb ?? 50);
    setEmbProvider(m.embedding?.provider ?? 'azure');
    setEmbModel(m.embedding?.model ?? 'text-embedding-3-large');
  }, [config.memory]);

  return (
    <Card title="Memory — Powered by SuperLocalMemory (Lite)" subtitle="Cognitive memory engine configuration">
      <SLMBrand variant="banner" />
      <div className="settings-section">
        <ToggleRow label="Enabled" checked={enabled} onChange={setEnabled} />
        <ToggleRow label="Auto-Invoke" checked={autoInvoke} onChange={setAutoInvoke} />
        <label className="settings-label">
          Max RAM (MB)
          <input className="settings-input settings-narrow" type="number" value={maxRam} onChange={(e) => setMaxRam(Number(e.target.value))} />
        </label>
        <label className="settings-label">
          Embedding Provider
          <select className="settings-input" value={embProvider} onChange={(e) => setEmbProvider(e.target.value)}>
            <option value="azure">Azure</option>
            <option value="openai">OpenAI</option>
            <option value="local">Local</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="settings-label">
          Embedding Model
          <input className="settings-input" value={embModel} onChange={(e) => setEmbModel(e.target.value)} />
        </label>
        <button
          className="save-settings-btn"
          disabled={saving}
          style={{ marginTop: '12px' }}
          onClick={() => onSave({ memory: { enabled, auto_invoke: autoInvoke, max_ram_mb: maxRam, embedding: { provider: embProvider, model: embModel } } })}
        >
          {saving ? 'Saving...' : 'Save Memory'}
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Workspace (G-14)
// ---------------------------------------------------------------------------

function WorkspaceSection({
  config,
  onSave,
  saving,
}: {
  readonly config: FullConfig;
  readonly onSave: (u: Record<string, unknown>) => Promise<void>;
  readonly saving: boolean;
}): React.ReactElement {
  const [workspaceDir, setWorkspaceDir] = useState(config.workspace?.default_dir ?? '');

  useEffect(() => {
    setWorkspaceDir(config.workspace?.default_dir ?? '');
  }, [config.workspace]);

  return (
    <Card title="Workspace" subtitle="Agent output file directory">
      <div className="settings-section">
        <label className="settings-label">
          Default Workspace Directory
          <input
            className="settings-input"
            type="text"
            value={workspaceDir}
            onChange={(e) => setWorkspaceDir(e.target.value)}
            placeholder="~/.qualixar-os/workspaces"
          />
        </label>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
          Where agent-generated files are saved. Leave empty for default (~/.qualixar-os/workspaces).
        </p>
        <button
          className="save-settings-btn"
          disabled={saving}
          onClick={() => onSave({ workspace: { default_dir: workspaceDir || undefined } })}
        >
          {saving ? 'Saving...' : 'Save Workspace'}
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Agent Execution Settings
// ---------------------------------------------------------------------------

const AGENT_QUALITY_OPTIONS = [
  { value: 'balanced', label: 'Balanced — cost/quality ratio' },
  { value: 'high', label: 'High — better models, higher cost' },
  { value: 'maximum', label: 'Maximum — best available models' },
] as const;

function ExecutionSection({
  config,
  onSave,
  saving,
}: {
  readonly config: FullConfig;
  readonly onSave: (u: Record<string, unknown>) => Promise<void>;
  readonly saving: boolean;
}): React.ReactElement {
  const exec = config.execution ?? {};
  const [maxOutputTokens, setMaxOutputTokens] = useState(exec.max_output_tokens ?? 16384);
  const [agentQuality, setAgentQuality] = useState<'balanced' | 'high' | 'maximum'>(exec.agent_quality ?? 'balanced');
  const [enableShell, setEnableShell] = useState(exec.enable_shell ?? false);

  useEffect(() => {
    const e = config.execution ?? {};
    setMaxOutputTokens(e.max_output_tokens ?? 16384);
    setAgentQuality(e.agent_quality ?? 'balanced');
    setEnableShell(e.enable_shell ?? false);
  }, [config.execution]);

  const handleTokenChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (Number.isNaN(raw)) return;
    setMaxOutputTokens(Math.max(1024, Math.min(32768, raw)));
  }, []);

  return (
    <Card title="Agent Execution Settings" subtitle="Token limits, quality tier, and shell access for agent runs">
      <div className="settings-section">
        <label className="settings-label">
          Max Output Tokens
          <input
            className="settings-input settings-narrow"
            type="number"
            min={1024}
            max={32768}
            step={1024}
            value={maxOutputTokens}
            onChange={handleTokenChange}
          />
        </label>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
          Maximum tokens each agent can generate per LLM call (1024–32768). Higher values let agents produce
          complete code files but increase cost. Default: 16384.
        </p>

        <label className="settings-label">
          Agent Quality
          <select
            className="settings-input"
            value={agentQuality}
            onChange={(e) => setAgentQuality(e.target.value as 'balanced' | 'high' | 'maximum')}
          >
            {AGENT_QUALITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
          Controls which model tier agents use. &quot;Maximum&quot; selects the highest-quality models regardless of cost.
        </p>

        <ToggleRow label="Enable Shell Execution" checked={enableShell} onChange={setEnableShell} />
        {enableShell && (
          <p style={{ fontSize: '12px', color: '#f59e0b', margin: '4px 0 12px', fontWeight: 500 }}>
            &#9888; Security Warning: Enabling shell execution allows agents to run arbitrary commands on your system.
            Only enable this if you trust the agents and have container isolation configured.
          </p>
        )}
        {!enableShell && (
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
            When disabled, agents cannot run shell commands (file_write only). Recommended for untrusted workloads.
          </p>
        )}

        <button
          className="save-settings-btn"
          disabled={saving}
          style={{ marginTop: '12px' }}
          onClick={() => onSave({
            execution: {
              max_output_tokens: maxOutputTokens,
              agent_quality: agentQuality,
              enable_shell: enableShell,
            },
          })}
        >
          {saving ? 'Saving...' : 'Save Execution Settings'}
        </button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 7: Import / Export
// ---------------------------------------------------------------------------

function ImportExportSection({
  showToast,
  onRefresh,
}: {
  readonly showToast: (msg: string, ok: boolean) => void;
  readonly onRefresh: () => void;
}): React.ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    try {
      const res = await fetch('/api/config/export');
      if (res.ok) {
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/yaml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'qos-config.yaml';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Config exported', true);
      }
    } catch { showToast('Export failed', false); }
  }, [showToast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
    };
    reader.readAsText(file);
  }, []);

  const handleImport = useCallback(async () => {
    if (!preview) return;
    try {
      const res = await fetch('/api/config/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: preview }),
      });
      if (res.ok) {
        showToast('Config imported', true);
        setPreview(null);
        onRefresh();
      } else {
        const data = await res.json();
        showToast(data.error ?? 'Import failed', false);
      }
    } catch { showToast('Import failed', false); }
  }, [preview, showToast, onRefresh]);

  return (
    <Card title="Import / Export" subtitle="Backup and restore Qualixar OS configuration">
      <div className="settings-section">
        <button className="save-settings-btn" onClick={handleExport}>Export Config (YAML)</button>
        <div style={{ marginTop: '16px' }}>
          <input type="file" ref={fileRef} accept=".yaml,.yml" onChange={handleFileSelect} style={{ display: 'none' }} />
          <button className="save-settings-btn" onClick={() => fileRef.current?.click()}>Import Config (YAML)</button>
        </div>
        {preview && (
          <div style={{ marginTop: '12px' }}>
            <h4 className="settings-subtitle">Preview</h4>
            <pre className="config-json" style={{ maxHeight: '200px', overflow: 'auto' }}>{preview}</pre>
            <button className="save-settings-btn" onClick={handleImport} style={{ marginTop: '8px' }}>Apply Imported Config</button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 8: Environment Variables
// ---------------------------------------------------------------------------

function EnvSection({
  envVars,
  onRefresh,
}: {
  readonly envVars: readonly EnvVarInfo[];
  readonly onRefresh: () => void;
}): React.ReactElement {
  return (
    <Card title="Environment Variables" subtitle="Detected API keys and config (names only, values hidden)">
      <div className="settings-section">
        <div className="settings-env-grid">
          {envVars.map((v) => (
            <div key={v.name} className="settings-env-row">
              <code className="settings-code">{v.name}</code>
              <StatusBadge status={v.set ? 'active' : 'error'} label={v.set ? 'set' : 'not set'} />
            </div>
          ))}
        </div>
        <button className="settings-sm-btn" onClick={onRefresh} style={{ marginTop: '12px' }}>Refresh</button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared: Toggle Row
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="settings-toggle-row">
      <span>{label}</span>
      <button
        className={`settings-toggle ${checked ? 'settings-toggle-on' : ''}`}
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
      >
        <span className="settings-toggle-knob" />
      </button>
    </div>
  );
}
