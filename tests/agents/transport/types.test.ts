/**
 * Phase 10b -- Transport Types Tests
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_TRANSPORT_CONFIG } from '../../../src/agents/transport/types.js';
import type {
  A2ATaskMessage, A2ATaskState, AgentTransport, TransportType,
  AgentLocationType, TransportPreference, AgentLocationEntry,
  TransportConfig, ProtocolMetric, TransportRecommendation,
  LocationRegistry, ProtocolRouter,
} from '../../../src/agents/transport/types.js';

describe('Transport Types', () => {
  it('A2ATaskMessage type covers all variants', () => {
    const types: A2ATaskMessage['type'][] = ['task', 'status', 'artifact', 'cancel'];
    expect(types).toHaveLength(4);
  });

  it('A2ATaskState covers all v1.0 states', () => {
    const states: A2ATaskState[] = [
      'submitted', 'working', 'input-required', 'auth-required',
      'completed', 'failed', 'canceled',
    ];
    expect(states).toHaveLength(7);
  });

  it('TransportType covers 3 modes', () => {
    const types: TransportType[] = ['local', 'a2a', 'hybrid'];
    expect(types).toHaveLength(3);
  });

  it('TransportPreference covers 3 options', () => {
    const prefs: TransportPreference[] = ['local', 'a2a', 'auto'];
    expect(prefs).toHaveLength(3);
  });

  it('DEFAULT_TRANSPORT_CONFIG has correct defaults', () => {
    expect(DEFAULT_TRANSPORT_CONFIG.defaultTransport).toBe('auto');
    expect(DEFAULT_TRANSPORT_CONFIG.a2aTimeoutMs).toBe(30_000);
    expect(DEFAULT_TRANSPORT_CONFIG.retryCount).toBe(2);
    expect(DEFAULT_TRANSPORT_CONFIG.retryBaseDelayMs).toBe(1_000);
    expect(DEFAULT_TRANSPORT_CONFIG.fallbackToLocal).toBe(true);
    expect(DEFAULT_TRANSPORT_CONFIG.enableMetrics).toBe(true);
  });

  it('AgentLocationEntry shape is valid', () => {
    const entry: AgentLocationEntry = {
      agentId: 'agent-1',
      location: 'local',
      transport: 'auto',
      avgLatencyMs: 0,
      lastSeen: new Date().toISOString(),
    };
    expect(entry.agentId).toBe('agent-1');
    expect(entry.url).toBeUndefined();
  });

  it('ProtocolMetric shape is valid', () => {
    const metric: ProtocolMetric = {
      id: 'pm-1',
      agentId: 'agent-1',
      transport: 'local',
      latencyMs: 5,
      success: true,
      createdAt: new Date().toISOString(),
    };
    expect(metric.success).toBe(true);
  });
});
