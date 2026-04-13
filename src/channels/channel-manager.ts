// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 18 -- Channel Manager
 * LLD Section 3.1 Component #6, Algorithm 8.7
 *
 * Manages channel enable/disable, configuration, and test connections
 * for all 7 channel types (MCP, HTTP, Discord, Telegram, Webhook, A2A, SSE).
 */

import type { ChannelConfig, ChannelTestResult } from '../types/phase18.js';
import type { CredentialStore } from '../types/phase18.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CHANNELS = ['mcp', 'http', 'discord', 'telegram', 'webhook', 'a2a', 'sse'] as const;

const DEFAULT_CHANNELS: readonly ChannelConfig[] = [
  { channelId: 'mcp', type: 'mcp', enabled: true, status: 'connected', lastMessageAt: null, settings: {} },
  { channelId: 'http', type: 'http', enabled: true, status: 'connected', lastMessageAt: null, settings: { port: 3000, corsOrigins: ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:3333'], rateLimit: 100 } },
  { channelId: 'discord', type: 'discord', enabled: false, status: 'disconnected', lastMessageAt: null, settings: { tokenEnv: '', guildIds: [], commandPrefix: '!' } },
  { channelId: 'telegram', type: 'telegram', enabled: false, status: 'disconnected', lastMessageAt: null, settings: { tokenEnv: '', allowedChatIds: [], webhookUrl: null } },
  { channelId: 'webhook', type: 'webhook', enabled: false, status: 'disconnected', lastMessageAt: null, settings: { url: '', headers: {}, authType: 'none', retryPolicy: { maxRetries: 3, backoffMs: 1000 } } },
  { channelId: 'a2a', type: 'a2a', enabled: false, status: 'disconnected', lastMessageAt: null, settings: {} },
  { channelId: 'sse', type: 'sse', enabled: true, status: 'connected', lastMessageAt: null, settings: {} },
];

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface ChannelManager {
  list(): readonly ChannelConfig[];
  get(channelId: string): ChannelConfig | undefined;
  update(channelId: string, enabled: boolean, settings: Record<string, unknown>): ChannelConfig;
  testChannel(channelId: string, credentialStore: CredentialStore): Promise<ChannelTestResult>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createChannelManager(): ChannelManager {
  return new ChannelManagerImpl();
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class ChannelManagerImpl implements ChannelManager {
  private readonly _channels: Map<string, ChannelConfig>;

  constructor() {
    this._channels = new Map();
    for (const ch of DEFAULT_CHANNELS) {
      this._channels.set(ch.channelId, ch);
    }
  }

  list(): readonly ChannelConfig[] {
    return [...this._channels.values()];
  }

  get(channelId: string): ChannelConfig | undefined {
    return this._channels.get(channelId);
  }

  update(channelId: string, enabled: boolean, settings: Record<string, unknown>): ChannelConfig {
    if (!VALID_CHANNELS.includes(channelId as typeof VALID_CHANNELS[number])) {
      throw new Error(`Unknown channel type: ${channelId}`);
    }

    const existing = this._channels.get(channelId) ?? DEFAULT_CHANNELS.find((c) => c.channelId === channelId)!;
    const updated: ChannelConfig = {
      ...existing,
      enabled,
      status: enabled ? 'connected' : 'disconnected',
      settings: { ...existing.settings, ...settings },
    };
    this._channels.set(channelId, updated);
    return updated;
  }

  async testChannel(channelId: string, credentialStore: CredentialStore): Promise<ChannelTestResult> {
    if (!VALID_CHANNELS.includes(channelId as typeof VALID_CHANNELS[number])) {
      throw new Error(`Unknown channel type: ${channelId}`);
    }

    const start = Date.now();
    const config = this._channels.get(channelId);

    try {
      switch (channelId) {
        case 'mcp':
        case 'sse':
          return {
            channelId,
            success: true,
            latencyMs: Date.now() - start,
            error: null,
            testedAt: new Date().toISOString(),
          };

        case 'http': {
          const port = (config?.settings as Record<string, unknown>)?.port ?? 3000;
          const res = await fetch(`http://localhost:${port}/api/health`);
          return {
            channelId,
            success: res.ok,
            latencyMs: Date.now() - start,
            error: res.ok ? null : `HTTP ${res.status}`,
            testedAt: new Date().toISOString(),
          };
        }

        case 'discord': {
          const tokenEnv = ((config?.settings as Record<string, unknown>)?.tokenEnv as string) ?? '';
          const token = tokenEnv ? process.env[tokenEnv] : credentialStore.resolve('discord');
          if (!token) {
            return {
              channelId,
              success: false,
              latencyMs: Date.now() - start,
              error: 'Discord bot token not configured',
              testedAt: new Date().toISOString(),
            };
          }
          const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${token}` },
          });
          const data = await res.json() as { username?: string };
          return {
            channelId,
            success: res.ok,
            latencyMs: Date.now() - start,
            error: res.ok ? null : `Discord API ${res.status}`,
            testedAt: new Date().toISOString(),
          };
        }

        case 'telegram': {
          const tokenEnv = ((config?.settings as Record<string, unknown>)?.tokenEnv as string) ?? '';
          const token = tokenEnv ? process.env[tokenEnv] : credentialStore.resolve('telegram');
          if (!token) {
            return {
              channelId,
              success: false,
              latencyMs: Date.now() - start,
              error: 'Telegram bot token not configured',
              testedAt: new Date().toISOString(),
            };
          }
          const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
          return {
            channelId,
            success: res.ok,
            latencyMs: Date.now() - start,
            error: res.ok ? null : `Telegram API ${res.status}`,
            testedAt: new Date().toISOString(),
          };
        }

        case 'webhook': {
          const url = (config?.settings as Record<string, unknown>)?.url as string;
          if (!url) {
            return {
              channelId,
              success: false,
              latencyMs: Date.now() - start,
              error: 'Webhook URL not configured',
              testedAt: new Date().toISOString(),
            };
          }
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test: true }),
          });
          return {
            channelId,
            success: res.ok,
            latencyMs: Date.now() - start,
            error: res.ok ? null : `Webhook ${res.status}`,
            testedAt: new Date().toISOString(),
          };
        }

        case 'a2a': {
          const agentCardUrl = ((config?.settings as Record<string, unknown>)?.agentCardUrl as string)
            ?? 'http://localhost:3000/.well-known/agent.json';
          const res = await fetch(agentCardUrl);
          return {
            channelId,
            success: res.ok,
            latencyMs: Date.now() - start,
            error: res.ok ? null : `A2A ${res.status}`,
            testedAt: new Date().toISOString(),
          };
        }

        default:
          return {
            channelId,
            success: false,
            latencyMs: Date.now() - start,
            error: `Unknown channel: ${channelId}`,
            testedAt: new Date().toISOString(),
          };
      }
    } catch (err) {
      return {
        channelId,
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
        testedAt: new Date().toISOString(),
      };
    }
  }
}
