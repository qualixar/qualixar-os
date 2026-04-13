import { describe, it, expect } from 'vitest';
import { ALL_EVENT_TYPES } from '../../src/types/events.js';

describe('ALL_EVENT_TYPES', () => {
  it('has correct count', () => {
    // Count from REWRITE-SPEC Section 5:
    // System: 5 (system:started, system:stopped, system:error, config:changed, config:migrated)
    // Task: 5 (task:created, task:started, task:completed, task:failed, task:cancelled)
    // Model: 4 (model:call_started, model:call_completed, model:call_failed, model:call_retrying)
    // Cost: 4 (cost:recorded, cost:budget_warning, cost:budget_exceeded, cost:optimized)
    // Mode: 2 (mode:switched, mode:feature_gated)
    // Security: 8 (security:violation, security:policy_evaluated, security:skill_scanned,
    //              security:container_started, security:container_stopped, security:container_failed,
    //              security:credential_accessed, security:audit_logged)
    // Quality: 10 (judge:started, judge:verdict, judge:rejected, judge:approved,
    //              consensus:reached, consensus:split, drift:detected, fabrication:detected,
    //              rl:update, rl:strategy_learned, rl:reward_recorded)
    // Multi-Agent: 16 (forge:designing, forge:designed, forge:redesigning, forge:failed,
    //                   agent:spawned, agent:started, agent:completed, agent:failed, agent:terminated,
    //                   swarm:started, swarm:completed, swarm:failed, swarm:topology_set,
    //                   simulation:started, simulation:completed, simulation:failed,
    //                   handoff:occurred, message:sent, message:received)
    // Memory: 11 (memory:stored, memory:recalled, memory:promoted, memory:archived, memory:expired,
    //             memory:trust_updated, memory:belief_updated, memory:belief_edge_added,
    //             memory:behavior_captured, memory:pattern_learned, memory:team_shared)
    // Orchestrator: 10 (orchestrator:step_started, orchestrator:step_completed,
    //                    checkpoint:saved, checkpoint:restored,
    //                    steering:paused, steering:resumed, steering:redirected, steering:cancelled,
    //                    output:delivered, output:formatted)
    // Access: 5 (channel:connected, channel:disconnected, channel:message_received,
    //            dashboard:client_connected, dashboard:client_disconnected)
    // Compatibility: 7 (compat:agent_imported, compat:agent_converted,
    //                    a2a:request_received, a2a:request_sent, a2a:agent_registered,
    //                    mcp:tool_called, mcp:tool_completed)
    // Total: 5+5+4+4+2+8+11+19+11+10+5+7 = 91
    // Recount carefully from the LLD array:
    // System(5) + Task(5) + Model(4) + Cost(4) + Mode(2) + Security(8) +
    // Quality: judge(4) + consensus(2) + drift(1) + fabrication(1) + rl(3) = 11
    // Multi-Agent: forge(4) + agent(5) + swarm(4) + simulation(3) + handoff(1) + message(2) = 19
    // Memory(11) + Orchestrator(11) + Access(5) + Compat(7)
    // Total = 5+5+4+4+2+8+11+19+11+11+5+7 = 92
    // (Orchestrator grew by 1: output:saved_to_disk added in Session 7)
    // Transport (Phase 10b): 7 (transport:message_sent, transport:send_failed,
    //   transport:fallback, transport:metric_recorded,
    //   transport:location_swapped, transport:agent_removed, transport:metrics_pruned)
    // 99 (0-10b) + 20 (14) + 9 (15) + 8 (16: 2 vector + 3 blueprint + 3 prompt) = 136
    // +2 (Session 12: steering:hitl_approved, steering:hitl_rejected) = 138
    // +1 (Session 13: steering:human_escalation_required) = 139
    // +4 (Session 17: degradation:tier_changed, degradation:human_required, autoorch:recommendation, autoorch:no_data) = 143
    // +13 (Phase 18: credential:stored/removed/decryption_failed, provider:tested/test_failed, embedding:tested/test_failed, channel:tested/test_failed, deployment:created/executed/cancelled/failed) = 156
    // +8 (Phase 19: wizard:started/completed/cancelled/step_completed/connection_tested, doctor:started/completed, template:scaffolded) = 164
    // +12 (Phase 20: plugin:installed/uninstalled/enabled/disabled/configured/config_error/loaded/load_error/sandbox_violation, registry:refreshed/fetch_error, marketplace:search) = 176
    // +11 (Phase 21: workflow:created/updated/deleted/execution_started/execution_completed/execution_failed/validation_failed/conversion_failed/node_started/node_completed/node_failed) = 187
    // +11 (Phase 22: credential:rotated/rotation_failed, rbac:access_denied, user:created/role_changed/token_generated, sso:login/callback/state_invalid/token_exchange_failed, audit:purged) = 198
    // +5 (Phase Pivot-2: tool:registered/removed, tool_connector:registered/removed, skill:installed) = 203
    // +14 (Pivot-2 extended: trilemma:degraded/unsafe, contract:captured/violation, goodhart:risk_elevated,
    //   a2a:message_wrapped/remote_delivery, forge:patterns_preserved, cmd:dispatched/failed,
    //   drift:warning/critical, discovery:completed/failed) = 217
    // +8 (Hybrid+Managed: hybrid:route_assigned/cloud_fallback/cost_reconciled,
    //   managed:session_timeout/session_reconnecting/session_failed/session_limit/stream_incomplete) = 225
    expect(ALL_EVENT_TYPES.length).toBe(225);
  });

  it('has no duplicates', () => {
    const uniqueSet = new Set(ALL_EVENT_TYPES);
    expect(uniqueSet.size).toBe(ALL_EVENT_TYPES.length);
  });

  it('every event type matches namespace:action format', () => {
    const pattern = /^[a-z0-9_]+:[a-z_]+$/;
    for (const eventType of ALL_EVENT_TYPES) {
      expect(eventType).toMatch(pattern);
    }
  });
});
