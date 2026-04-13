/**
 * Qualixar OS Phase 18 — EmbeddingConfig
 * Select embedding provider + model, test, and save.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from './shared.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EmbeddingModel {
  readonly id: string;
  readonly name: string;
  readonly dimensions: number;
  readonly contextLength?: number;
  readonly description?: string;
}

interface EmbeddingProvider {
  readonly name: string;
  readonly displayName: string;
  readonly models: readonly EmbeddingModel[];
}

interface TestResult {
  readonly success: boolean;
  readonly dimensions?: number;
  readonly latencyMs?: number;
  readonly error?: string;
}

interface CurrentConfig {
  readonly provider?: string;
  readonly model?: string;
  readonly dimensions?: number;
}

// ---------------------------------------------------------------------------
// EmbeddingConfig (main export)
// ---------------------------------------------------------------------------

export function EmbeddingConfig(): React.ReactElement {
  const [providers, setProviders] = useState<EmbeddingProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [dimensions, setDimensions] = useState<number | ''>('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [currentConfig, setCurrentConfig] = useState<CurrentConfig>({});

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Load providers + current config on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [provRes, cfgRes] = await Promise.all([
          fetch('/api/config/embedding/providers'),
          fetch('/api/config/embedding'),
        ]);

        if (provRes.ok) {
          const data = await provRes.json() as { providers: EmbeddingProvider[] };
          // Map API fields (providerName, modelId) to component fields (name, id)
          const mapped: EmbeddingProvider[] = ((data.providers ?? []) as unknown as Record<string, unknown>[]).map((p) => ({
            name: (p.name ?? p.providerName ?? '') as string,
            displayName: (p.displayName ?? '') as string,
            models: Array.isArray(p.models)
              ? (p.models as Record<string, unknown>[]).map((m) => ({
                  id: (m.id ?? m.modelId ?? '') as string,
                  name: (m.name ?? m.displayName ?? '') as string,
                  dimensions: (m.dimensions ?? 0) as number,
                  contextLength: (m.contextLength ?? m.maxTokens) as number | undefined,
                  description: (m.description ?? '') as string,
                }))
              : [],
          }));
          setProviders(mapped);
        }

        if (cfgRes.ok) {
          const data = await cfgRes.json() as { config: CurrentConfig };
          const cfg = data.config ?? {};
          setCurrentConfig(cfg);
          if (cfg.provider) setSelectedProvider(cfg.provider);
          if (cfg.model) setSelectedModel(cfg.model);
          if (cfg.dimensions) setDimensions(cfg.dimensions);
        }
      } catch (err) {
        showToast(`Load failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [showToast]);

  // Auto-fill dimensions when model changes
  useEffect(() => {
    if (!selectedProvider || !selectedModel) return;
    const prov = providers.find((p) => p.name === selectedProvider);
    if (!prov) return;
    const model = prov.models.find((m) => m.id === selectedModel);
    if (model?.dimensions) setDimensions(model.dimensions);
  }, [selectedProvider, selectedModel, providers]);

  // Reset model when provider changes
  const handleProviderChange = useCallback((name: string) => {
    setSelectedProvider(name);
    setSelectedModel('');
    setDimensions('');
    setTestResult(null);
  }, []);

  const handleModelChange = useCallback((id: string) => {
    setSelectedModel(id);
    setTestResult(null);
  }, []);

  const handleTest = useCallback(async () => {
    if (!selectedProvider || !selectedModel) {
      showToast('Select a provider and model first', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/config/embedding/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, model: selectedModel }),
      });
      const data = await res.json() as TestResult;
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }, [selectedProvider, selectedModel, showToast]);

  const handleSave = useCallback(async () => {
    if (!selectedProvider || !selectedModel) {
      showToast('Select a provider and model first', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/config/embedding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          dimensions: dimensions || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error ?? `HTTP ${res.status}`);
      }
      setCurrentConfig({ provider: selectedProvider, model: selectedModel, dimensions: dimensions as number || undefined });
      showToast('Embedding configuration saved', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSaving(false);
    }
  }, [selectedProvider, selectedModel, dimensions, showToast]);

  const activeProvider = providers.find((p) => p.name === selectedProvider);
  const filteredModels = activeProvider?.models ?? [];

  const isConfigured =
    Boolean(currentConfig.provider) && Boolean(currentConfig.model);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast */}
      {toast && (
        <div className={`task-result-toast ${toast.type === 'success' ? 'toast-success' : 'toast-error'}`}>
          {toast.message}
        </div>
      )}

      {/* Current config summary */}
      {isConfigured && (
        <Card title="Current Embedding Config">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Provider</div>
              <div style={{ fontWeight: 600 }}>{currentConfig.provider}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Model</div>
              <div style={{ fontWeight: 600 }}>{currentConfig.model}</div>
            </div>
            {currentConfig.dimensions && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dimensions</div>
                <div style={{ fontWeight: 600 }}>{currentConfig.dimensions}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Config form */}
      <Card title="Configure Embedding Provider">
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Provider dropdown */}
            <div className="settings-row">
              <label className="settings-label">Provider</label>
              <select
                className="settings-input"
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                disabled={testing || saving}
              >
                <option value="">— select provider —</option>
                {providers.map((p) => (
                  <option key={p.name} value={p.name}>{p.displayName}</option>
                ))}
              </select>
            </div>

            {/* Model dropdown */}
            <div className="settings-row">
              <label className="settings-label">Model</label>
              <select
                className="settings-input"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                disabled={!selectedProvider || testing || saving}
              >
                <option value="">— select model —</option>
                {filteredModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.dimensions}d)
                  </option>
                ))}
              </select>
              {selectedModel && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {filteredModels.find((m) => m.id === selectedModel)?.description ?? ''}
                </div>
              )}
            </div>

            {/* Dimensions (auto-filled) */}
            <div className="settings-row">
              <label className="settings-label">Dimensions</label>
              <input
                className="settings-input"
                type="number"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value ? parseInt(e.target.value, 10) : '')}
                placeholder="auto-filled from model"
                disabled={testing || saving}
              />
            </div>

            {/* Test result */}
            {testResult && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 6,
                  fontSize: '0.8125rem',
                  backgroundColor: testResult.success ? '#22c55e22' : '#ef444422',
                  color: testResult.success ? '#22c55e' : '#ef4444',
                  border: `1px solid ${testResult.success ? '#22c55e44' : '#ef444444'}`,
                }}
              >
                {testResult.success ? (
                  <>
                    Test passed — {testResult.dimensions}d vectors, {testResult.latencyMs}ms latency
                  </>
                ) : (
                  <>Test failed: {testResult.error ?? 'Unknown error'}</>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                className="settings-sm-btn"
                onClick={handleTest}
                disabled={!selectedProvider || !selectedModel || testing || saving}
              >
                {testing ? 'Testing...' : 'Test Embedding'}
              </button>
              <button
                className="save-settings-btn"
                onClick={handleSave}
                disabled={!selectedProvider || !selectedModel || testing || saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
