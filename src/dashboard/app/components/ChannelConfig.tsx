/**
 * Qualixar OS Phase 18 -- Channel Configuration UI
 * LLD Section 7.1: Per-channel toggles, forms, test connections
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, StatusBadge } from './shared.js';

interface ChannelData {
  readonly channelId: string;
  readonly type: string;
  readonly enabled: boolean;
  readonly status: string;
  readonly lastMessageAt: string | null;
  readonly settings: Record<string, unknown>;
}

interface TestResult {
  readonly channelId: string;
  readonly success: boolean;
  readonly latencyMs: number;
  readonly error: string | null;
}

const CHANNEL_ICONS: Record<string, string> = {
  mcp: '🔌', http: '🌐', discord: '💬', telegram: '📱',
  webhook: '🔗', a2a: '🤖', sse: '📡',
};

export function ChannelConfig(): React.ReactElement {
  const [channels, setChannels] = useState<readonly ChannelData[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formSettings, setFormSettings] = useState<Record<string, unknown>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/config/channels');
      const data = await res.json() as { channels: ChannelData[] };
      setChannels(data.channels);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void fetchChannels(); }, [fetchChannels]);

  const handleToggle = useCallback(async (ch: ChannelData) => {
    try {
      const res = await fetch(`/api/config/channels/${ch.channelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !ch.enabled, settings: ch.settings }),
      });
      if (res.ok) {
        await fetchChannels();
        setToast({ msg: `${ch.channelId} ${ch.enabled ? 'disabled' : 'enabled'}`, ok: true });
      }
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Failed', ok: false });
    }
  }, [fetchChannels]);

  const handleTest = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/config/channels/${channelId}/test`, { method: 'POST' });
      const result = await res.json() as TestResult;
      setTestResults((prev) => ({ ...prev, [channelId]: result }));
    } catch { /* ignore */ }
  }, []);

  const handleSaveSettings = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/config/channels/${channelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, settings: formSettings }),
      });
      if (res.ok) {
        setEditing(null);
        await fetchChannels();
        setToast({ msg: `${channelId} configured`, ok: true });
      }
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Failed', ok: false });
    }
  }, [formSettings, fetchChannels]);

  return (
    <div>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>Channel Configuration</h3>

      {toast && (
        <div className={`task-result-toast ${toast.ok ? 'toast-success' : 'toast-error'}`}
          onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {channels.map((ch) => (
          <Card key={ch.channelId}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '20px' }}>{CHANNEL_ICONS[ch.channelId] ?? '❓'}</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ch.channelId.toUpperCase()}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {ch.lastMessageAt ? `Last: ${new Date(ch.lastMessageAt).toLocaleString()}` : 'No messages'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <StatusBadge status={ch.status === 'connected' ? 'completed' : 'error'} label={ch.status} />
                <label style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={ch.enabled} onChange={() => void handleToggle(ch)} />
                </label>
                <button className="settings-sm-btn" onClick={() => void handleTest(ch.channelId)}>Test</button>
                <button className="settings-sm-btn" onClick={() => {
                  setEditing(ch.channelId);
                  setFormSettings(ch.settings as Record<string, unknown>);
                }}>Configure</button>
              </div>
            </div>

            {testResults[ch.channelId] && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: testResults[ch.channelId].success ? 'var(--color-success)' : 'var(--color-error)' }}>
                {testResults[ch.channelId].success ? `✓ Connected (${testResults[ch.channelId].latencyMs}ms)` : `✗ ${testResults[ch.channelId].error}`}
              </div>
            )}

            {editing === ch.channelId && (
              <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                {ch.type === 'http' && (
                  <>
                    <div className="settings-row">
                      <label className="settings-label">Port</label>
                      <input className="settings-input" type="number" value={(formSettings.port as number) ?? 3000}
                        onChange={(e) => setFormSettings({ ...formSettings, port: Number(e.target.value) })} />
                    </div>
                    <div className="settings-row">
                      <label className="settings-label">Rate Limit</label>
                      <input className="settings-input" type="number" value={(formSettings.rateLimit as number) ?? 100}
                        onChange={(e) => setFormSettings({ ...formSettings, rateLimit: Number(e.target.value) })} />
                    </div>
                  </>
                )}
                {ch.type === 'discord' && (
                  <>
                    <div className="settings-row">
                      <label className="settings-label">Token Env Var</label>
                      <input className="settings-input" value={(formSettings.tokenEnv as string) ?? ''}
                        onChange={(e) => setFormSettings({ ...formSettings, tokenEnv: e.target.value })}
                        placeholder="DISCORD_BOT_TOKEN" />
                    </div>
                    <div className="settings-row">
                      <label className="settings-label">Command Prefix</label>
                      <input className="settings-input" value={(formSettings.commandPrefix as string) ?? '!'}
                        onChange={(e) => setFormSettings({ ...formSettings, commandPrefix: e.target.value })} />
                    </div>
                  </>
                )}
                {ch.type === 'telegram' && (
                  <>
                    <div className="settings-row">
                      <label className="settings-label">Token Env Var</label>
                      <input className="settings-input" value={(formSettings.tokenEnv as string) ?? ''}
                        onChange={(e) => setFormSettings({ ...formSettings, tokenEnv: e.target.value })}
                        placeholder="TELEGRAM_BOT_TOKEN" />
                    </div>
                    <div className="settings-row">
                      <label className="settings-label">Webhook URL</label>
                      <input className="settings-input" value={(formSettings.webhookUrl as string) ?? ''}
                        onChange={(e) => setFormSettings({ ...formSettings, webhookUrl: e.target.value })}
                        placeholder="https://your-server.com/webhook" />
                    </div>
                  </>
                )}
                {ch.type === 'webhook' && (
                  <>
                    <div className="settings-row">
                      <label className="settings-label">Webhook URL</label>
                      <input className="settings-input" value={(formSettings.url as string) ?? ''}
                        onChange={(e) => setFormSettings({ ...formSettings, url: e.target.value })}
                        placeholder="https://api.example.com/webhook" />
                    </div>
                    <div className="settings-row">
                      <label className="settings-label">Auth Type</label>
                      <select className="settings-input" value={(formSettings.authType as string) ?? 'none'}
                        onChange={(e) => setFormSettings({ ...formSettings, authType: e.target.value })}>
                        <option value="none">None</option>
                        <option value="bearer">Bearer</option>
                        <option value="basic">Basic</option>
                      </select>
                    </div>
                  </>
                )}
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <button className="save-settings-btn" onClick={() => void handleSaveSettings(ch.channelId)}>Save</button>
                  <button className="settings-sm-btn" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
