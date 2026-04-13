import { describe, it, expect } from 'vitest';
import { QosConfigSchema } from '../../src/types/common.js';

describe('QosConfigSchema', () => {
  it('parses valid full config', () => {
    const fullConfig = {
      mode: 'power' as const,
      models: {
        primary: 'claude-opus-4',
        fallback: 'gpt-4.1',
        judge: 'claude-sonnet-4-6',
        local: 'llama-3',
      },
      budget: {
        max_usd: 50,
        warn_pct: 0.9,
        per_task_max: 5,
      },
      security: {
        container_isolation: true,
        policy_path: '/etc/qos/policy.yaml',
        allowed_paths: ['./', '/tmp'],
        denied_commands: ['rm -rf', 'sudo', 'chmod 777'],
      },
      memory: {
        enabled: true,
        auto_invoke: false,
        max_ram_mb: 100,
      },
      dashboard: {
        enabled: true,
        port: 8080,
      },
      channels: {
        mcp: true,
        http: { enabled: true, port: 4000 },
        telegram: { enabled: false, token: 'tg-token-123' },
        discord: { enabled: false, token: 'dc-token-456' },
        webhook: { enabled: true, url: 'https://hooks.example.com/qos' },
      },
      observability: {
        otel_endpoint: 'http://localhost:4318',
        log_level: 'debug' as const,
      },
      db: {
        path: '/var/data/qos.db',
      },
    };

    const result = QosConfigSchema.parse(fullConfig);

    expect(result.mode).toBe('power');
    expect(result.models.primary).toBe('claude-opus-4');
    expect(result.models.fallback).toBe('gpt-4.1');
    expect(result.models.judge).toBe('claude-sonnet-4-6');
    expect(result.models.local).toBe('llama-3');
    expect(result.budget.max_usd).toBe(50);
    expect(result.budget.warn_pct).toBe(0.9);
    expect(result.budget.per_task_max).toBe(5);
    expect(result.security.container_isolation).toBe(true);
    expect(result.security.policy_path).toBe('/etc/qos/policy.yaml');
    expect(result.security.allowed_paths).toEqual(['./', '/tmp']);
    expect(result.security.denied_commands).toEqual(['rm -rf', 'sudo', 'chmod 777']);
    expect(result.memory.enabled).toBe(true);
    expect(result.memory.auto_invoke).toBe(false);
    expect(result.memory.max_ram_mb).toBe(100);
    expect(result.dashboard.enabled).toBe(true);
    expect(result.dashboard.port).toBe(8080);
    expect(result.channels.mcp).toBe(true);
    expect(result.channels.http.enabled).toBe(true);
    expect(result.channels.http.port).toBe(4000);
    expect(result.channels.telegram.enabled).toBe(false);
    expect(result.channels.telegram.token).toBe('tg-token-123');
    expect(result.channels.discord.enabled).toBe(false);
    expect(result.channels.discord.token).toBe('dc-token-456');
    expect(result.channels.webhook.enabled).toBe(true);
    expect(result.channels.webhook.url).toBe('https://hooks.example.com/qos');
    expect(result.observability.otel_endpoint).toBe('http://localhost:4318');
    expect(result.observability.log_level).toBe('debug');
    expect(result.db.path).toBe('/var/data/qos.db');
  });

  it('fills defaults for partial config', () => {
    const result = QosConfigSchema.parse({});

    // Top-level defaults
    expect(result.mode).toBe('companion');

    // Models defaults
    expect(result.models.primary).toBe('claude-sonnet-4-6');
    expect(result.models.fallback).toBe('gpt-4.1-mini');
    expect(result.models.judge).toBeUndefined();
    expect(result.models.local).toBeUndefined();

    // Budget defaults
    expect(result.budget.max_usd).toBe(100);
    expect(result.budget.warn_pct).toBe(0.8);
    expect(result.budget.per_task_max).toBeUndefined();

    // Security defaults
    expect(result.security.container_isolation).toBe(false);
    expect(result.security.policy_path).toBeUndefined();
    expect(result.security.allowed_paths).toEqual(['./']);
    expect(result.security.denied_commands).toEqual(['rm -rf', 'sudo']);

    // Memory defaults
    expect(result.memory.enabled).toBe(true);
    expect(result.memory.auto_invoke).toBe(true);
    expect(result.memory.max_ram_mb).toBe(50);

    // Dashboard defaults
    expect(result.dashboard.enabled).toBe(false);
    expect(result.dashboard.port).toBe(3333);

    // Channels defaults
    expect(result.channels.mcp).toBe(true);
    expect(result.channels.http.enabled).toBe(false);
    expect(result.channels.http.port).toBe(3000);
    expect(result.channels.telegram.enabled).toBe(false);
    expect(result.channels.telegram.token).toBeUndefined();
    expect(result.channels.discord.enabled).toBe(false);
    expect(result.channels.discord.token).toBeUndefined();
    expect(result.channels.webhook.enabled).toBe(false);
    expect(result.channels.webhook.url).toBeUndefined();

    // Observability defaults
    expect(result.observability.otel_endpoint).toBeUndefined();
    expect(result.observability.log_level).toBe('info');

    // DB defaults
    expect(result.db.path).toBe('~/.qualixar-os/qos.db');
  });

  it('rejects invalid mode', () => {
    expect(() => {
      QosConfigSchema.parse({ mode: 'turbo' });
    }).toThrow();
  });

  it('rejects negative budget', () => {
    expect(() => {
      QosConfigSchema.parse({ budget: { max_usd: -5 } });
    }).toThrow();
  });

  it('default mode is companion', () => {
    const result = QosConfigSchema.parse({});
    expect(result.mode).toBe('companion');
  });

  it('default models.primary is claude-sonnet-4-6', () => {
    const result = QosConfigSchema.parse({});
    expect(result.models.primary).toBe('claude-sonnet-4-6');
  });

  // --- routing field tests ---

  it('default routing is balanced', () => {
    const result = QosConfigSchema.parse({});
    expect(result.routing).toBe('balanced');
  });

  it('accepts routing: quality', () => {
    const result = QosConfigSchema.parse({ routing: 'quality' });
    expect(result.routing).toBe('quality');
  });

  it('accepts routing: cost', () => {
    const result = QosConfigSchema.parse({ routing: 'cost' });
    expect(result.routing).toBe('cost');
  });

  it('rejects invalid routing value', () => {
    expect(() => {
      QosConfigSchema.parse({ routing: 'invalid' });
    }).toThrow();
  });
});
