// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Complete Event Type System
 *
 * All event types across all 9 phases. Each follows the namespace:action format.
 * Source of truth: REWRITE-SPEC Section 5, Phase 0 LLD Section 2.2.
 */

export type QosEventType =
  // System lifecycle (Phase 0)
  | 'system:started' | 'system:stopped' | 'system:error'
  | 'config:changed' | 'config:migrated'
  // Task lifecycle (Phase 1)
  | 'task:created' | 'task:started' | 'task:completed' | 'task:failed' | 'task:cancelled'
  // Model calls (Phase 1)
  | 'model:call_started' | 'model:call_completed' | 'model:call_failed' | 'model:call_retrying'
  // Cost (Phase 1)
  | 'cost:recorded' | 'cost:budget_warning' | 'cost:budget_exceeded' | 'cost:optimized'
  // Mode (Phase 1)
  | 'mode:switched' | 'mode:feature_gated'
  // Security (Phase 2)
  | 'security:violation' | 'security:policy_evaluated' | 'security:skill_scanned'
  | 'security:container_started' | 'security:container_stopped' | 'security:container_failed'
  | 'security:credential_accessed' | 'security:audit_logged'
  // Quality (Phase 3)
  | 'judge:started' | 'judge:verdict' | 'judge:rejected' | 'judge:approved'
  | 'consensus:reached' | 'consensus:split'
  | 'drift:detected' | 'fabrication:detected'
  | 'rl:update' | 'rl:strategy_learned' | 'rl:reward_recorded'
  // Multi-Agent (Phase 4)
  | 'forge:designing' | 'forge:designed' | 'forge:redesigning' | 'forge:failed'
  | 'agent:spawned' | 'agent:started' | 'agent:completed' | 'agent:failed' | 'agent:terminated'
  | 'swarm:started' | 'swarm:completed' | 'swarm:failed' | 'swarm:topology_set'
  | 'simulation:started' | 'simulation:completed' | 'simulation:failed'
  | 'handoff:occurred' | 'message:sent' | 'message:received'
  // Memory (Phase 5)
  | 'memory:stored' | 'memory:recalled' | 'memory:promoted' | 'memory:archived' | 'memory:expired'
  | 'memory:trust_updated' | 'memory:belief_updated' | 'memory:belief_edge_added'
  | 'memory:behavior_captured' | 'memory:pattern_learned' | 'memory:team_shared'
  // Orchestrator (Phase 6)
  | 'orchestrator:step_started' | 'orchestrator:step_completed'
  | 'checkpoint:saved' | 'checkpoint:restored'
  | 'steering:paused' | 'steering:resumed' | 'steering:redirected' | 'steering:cancelled'
  | 'steering:hitl_approved' | 'steering:hitl_rejected' | 'steering:human_escalation_required'
  | 'output:delivered' | 'output:formatted' | 'output:saved_to_disk'
  // Access (Phase 7)
  | 'channel:connected' | 'channel:disconnected' | 'channel:message_received'
  | 'dashboard:client_connected' | 'dashboard:client_disconnected'
  // Compatibility (Phase 8)
  | 'compat:agent_imported' | 'compat:agent_converted'
  | 'a2a:request_received' | 'a2a:request_sent' | 'a2a:agent_registered'
  | 'mcp:tool_called' | 'mcp:tool_completed'
  // Transport (Phase 10b)
  | 'transport:message_sent' | 'transport:send_failed' | 'transport:fallback'
  | 'transport:metric_recorded'
  | 'transport:location_swapped' | 'transport:agent_removed' | 'transport:metrics_pruned'
  // Chat (Phase 14)
  | 'chat:message_created' | 'chat:stream_started' | 'chat:token'
  | 'chat:thinking_started' | 'chat:thinking_ended'
  | 'chat:tool_call_started' | 'chat:tool_call_completed'
  | 'chat:message_completed'
  // Tool Registry (Phase Pivot-2)
  | 'tool:registered' | 'tool:removed'
  | 'tool_connector:registered' | 'tool_connector:removed'
  | 'skill:installed'
  // Lab (Phase 14)
  | 'lab:experiment_started' | 'lab:variant_completed'
  | 'lab:experiment_completed' | 'lab:experiment_failed'
  // Traces (Phase 14)
  | 'trace:span_started' | 'trace:span_completed'
  // Flows (Phase 14)
  | 'flow:node_started' | 'flow:node_completed' | 'flow:node_error'
  | 'flow:edge_activated' | 'flow:paused' | 'flow:completed'
  // Connectors (Phase 15)
  | 'connector:added' | 'connector:removed' | 'connector:status_changed'
  // Gate (Phase 15)
  | 'review:created' | 'review:approved' | 'review:rejected' | 'review:revised'
  // Datasets (Phase 15)
  | 'dataset:uploaded' | 'dataset:deleted'
  // Vectors (Phase 16)
  | 'vector:indexed' | 'vector:deleted'
  // Blueprints (Phase 16)
  | 'blueprint:created' | 'blueprint:deployed' | 'blueprint:deleted'
  // Prompts (Phase 16)
  | 'prompt:created' | 'prompt:updated' | 'prompt:deleted'
  // Degradation (BO-2)
  | 'degradation:tier_changed' | 'degradation:human_required'
  // Auto-Orchestration (BO-3)
  | 'autoorch:recommendation' | 'autoorch:no_data'
  // Phase 18: Dashboard Command Center -- 13
  | 'credential:stored' | 'credential:removed' | 'credential:decryption_failed'
  | 'provider:tested' | 'provider:test_failed'
  | 'embedding:tested' | 'embedding:test_failed'
  | 'channel:tested' | 'channel:test_failed'
  | 'deployment:created' | 'deployment:executed' | 'deployment:cancelled' | 'deployment:failed'
  // Phase 19: Interactive CLI Excellence -- 8
  | 'wizard:started' | 'wizard:completed' | 'wizard:cancelled'
  | 'wizard:step_completed' | 'wizard:connection_tested'
  | 'doctor:started' | 'doctor:completed'
  | 'template:scaffolded'
  // Phase 20: Marketplace Ecosystem -- 12
  | 'plugin:installed' | 'plugin:uninstalled'
  | 'plugin:enabled' | 'plugin:disabled'
  | 'plugin:configured' | 'plugin:config_error'
  | 'plugin:loaded' | 'plugin:load_error'
  | 'plugin:sandbox_violation'
  | 'registry:refreshed' | 'registry:fetch_error'
  | 'marketplace:search'
  // Phase 21: Visual Workflow Builder -- 11
  | 'workflow:created' | 'workflow:updated' | 'workflow:deleted'
  | 'workflow:execution_started' | 'workflow:execution_completed' | 'workflow:execution_failed'
  | 'workflow:validation_failed' | 'workflow:conversion_failed'
  | 'workflow:node_started' | 'workflow:node_completed' | 'workflow:node_failed'
  // Phase 22: Enterprise Hardening -- 11 new (3 overlap with Phase 18)
  | 'credential:rotated' | 'credential:rotation_failed'
  | 'rbac:access_denied'
  | 'user:created' | 'user:role_changed' | 'user:token_generated'
  | 'sso:login' | 'sso:callback' | 'sso:state_invalid' | 'sso:token_exchange_failed'
  | 'audit:purged'
  // Pivot-2 Quality -- 5
  | 'trilemma:degraded' | 'trilemma:unsafe'
  | 'contract:captured' | 'contract:violation'
  | 'goodhart:risk_elevated'
  // Pivot-2 Agent Transport -- 3
  | 'a2a:message_wrapped' | 'a2a:remote_delivery'
  | 'forge:patterns_preserved'
  // Pivot-2 Commands -- 2
  | 'cmd:dispatched' | 'cmd:failed'
  // Pivot-2 Drift -- 2
  | 'drift:warning' | 'drift:critical'
  // Pivot-2 Model Discovery -- 2
  | 'discovery:completed' | 'discovery:failed'
  // Hybrid Topology (Angle 3) -- 3
  | 'hybrid:route_assigned' | 'hybrid:cloud_fallback' | 'hybrid:cost_reconciled'
  // Claude Managed Agents (Angle 2) -- 5
  | 'managed:session_timeout' | 'managed:session_reconnecting'
  | 'managed:session_failed' | 'managed:session_limit' | 'managed:stream_incomplete';

/**
 * Runtime array of all event types for validation and exhaustiveness checks.
 * Must stay in sync with the QosEventType union above.
 */
export const ALL_EVENT_TYPES: readonly QosEventType[] = [
  // System lifecycle (Phase 0) -- 5
  'system:started', 'system:stopped', 'system:error',
  'config:changed', 'config:migrated',
  // Task lifecycle (Phase 1) -- 5
  'task:created', 'task:started', 'task:completed', 'task:failed', 'task:cancelled',
  // Model calls (Phase 1) -- 4
  'model:call_started', 'model:call_completed', 'model:call_failed', 'model:call_retrying',
  // Cost (Phase 1) -- 4
  'cost:recorded', 'cost:budget_warning', 'cost:budget_exceeded', 'cost:optimized',
  // Mode (Phase 1) -- 2
  'mode:switched', 'mode:feature_gated',
  // Security (Phase 2) -- 8
  'security:violation', 'security:policy_evaluated', 'security:skill_scanned',
  'security:container_started', 'security:container_stopped', 'security:container_failed',
  'security:credential_accessed', 'security:audit_logged',
  // Quality (Phase 3) -- 11
  'judge:started', 'judge:verdict', 'judge:rejected', 'judge:approved',
  'consensus:reached', 'consensus:split',
  'drift:detected', 'fabrication:detected',
  'rl:update', 'rl:strategy_learned', 'rl:reward_recorded',
  // Multi-Agent (Phase 4) -- 19
  'forge:designing', 'forge:designed', 'forge:redesigning', 'forge:failed',
  'agent:spawned', 'agent:started', 'agent:completed', 'agent:failed', 'agent:terminated',
  'swarm:started', 'swarm:completed', 'swarm:failed', 'swarm:topology_set',
  'simulation:started', 'simulation:completed', 'simulation:failed',
  'handoff:occurred', 'message:sent', 'message:received',
  // Memory (Phase 5) -- 11
  'memory:stored', 'memory:recalled', 'memory:promoted', 'memory:archived', 'memory:expired',
  'memory:trust_updated', 'memory:belief_updated', 'memory:belief_edge_added',
  'memory:behavior_captured', 'memory:pattern_learned', 'memory:team_shared',
  // Orchestrator (Phase 6) -- 10
  'orchestrator:step_started', 'orchestrator:step_completed',
  'checkpoint:saved', 'checkpoint:restored',
  'steering:paused', 'steering:resumed', 'steering:redirected', 'steering:cancelled',
  'steering:hitl_approved', 'steering:hitl_rejected', 'steering:human_escalation_required',
  'output:delivered', 'output:formatted', 'output:saved_to_disk',
  // Access (Phase 7) -- 5
  'channel:connected', 'channel:disconnected', 'channel:message_received',
  'dashboard:client_connected', 'dashboard:client_disconnected',
  // Compatibility (Phase 8) -- 7
  'compat:agent_imported', 'compat:agent_converted',
  'a2a:request_received', 'a2a:request_sent', 'a2a:agent_registered',
  'mcp:tool_called', 'mcp:tool_completed',
  // Transport (Phase 10b) -- 7
  'transport:message_sent', 'transport:send_failed', 'transport:fallback',
  'transport:metric_recorded',
  'transport:location_swapped', 'transport:agent_removed', 'transport:metrics_pruned',
  // Chat (Phase 14) -- 8
  'chat:message_created', 'chat:stream_started', 'chat:token',
  'chat:thinking_started', 'chat:thinking_ended',
  'chat:tool_call_started', 'chat:tool_call_completed',
  'chat:message_completed',
  // Tool Registry (Phase Pivot-2) -- 5
  'tool:registered', 'tool:removed',
  'tool_connector:registered', 'tool_connector:removed',
  'skill:installed',
  // Lab (Phase 14) -- 4
  'lab:experiment_started', 'lab:variant_completed',
  'lab:experiment_completed', 'lab:experiment_failed',
  // Traces (Phase 14) -- 2
  'trace:span_started', 'trace:span_completed',
  // Flows (Phase 14) -- 6
  'flow:node_started', 'flow:node_completed', 'flow:node_error',
  'flow:edge_activated', 'flow:paused', 'flow:completed',
  // Connectors (Phase 15) -- 3
  'connector:added', 'connector:removed', 'connector:status_changed',
  // Gate (Phase 15) -- 4
  'review:created', 'review:approved', 'review:rejected', 'review:revised',
  // Datasets (Phase 15) -- 2
  'dataset:uploaded', 'dataset:deleted',
  // Vectors (Phase 16) -- 2
  'vector:indexed', 'vector:deleted',
  // Blueprints (Phase 16) -- 3
  'blueprint:created', 'blueprint:deployed', 'blueprint:deleted',
  // Prompts (Phase 16) -- 3
  'prompt:created', 'prompt:updated', 'prompt:deleted',
  // Degradation (BO-2) -- 2
  'degradation:tier_changed', 'degradation:human_required',
  // Auto-Orchestration (BO-3) -- 2
  'autoorch:recommendation', 'autoorch:no_data',
  // Phase 18: Dashboard Command Center -- 13
  'credential:stored', 'credential:removed', 'credential:decryption_failed',
  'provider:tested', 'provider:test_failed',
  'embedding:tested', 'embedding:test_failed',
  'channel:tested', 'channel:test_failed',
  'deployment:created', 'deployment:executed', 'deployment:cancelled', 'deployment:failed',
  // Phase 19: Interactive CLI Excellence -- 8
  'wizard:started', 'wizard:completed', 'wizard:cancelled',
  'wizard:step_completed', 'wizard:connection_tested',
  'doctor:started', 'doctor:completed',
  'template:scaffolded',
  // Phase 20: Marketplace Ecosystem -- 12
  'plugin:installed', 'plugin:uninstalled',
  'plugin:enabled', 'plugin:disabled',
  'plugin:configured', 'plugin:config_error',
  'plugin:loaded', 'plugin:load_error',
  'plugin:sandbox_violation',
  'registry:refreshed', 'registry:fetch_error',
  'marketplace:search',
  // Phase 21: Visual Workflow Builder -- 11
  'workflow:created', 'workflow:updated', 'workflow:deleted',
  'workflow:execution_started', 'workflow:execution_completed', 'workflow:execution_failed',
  'workflow:validation_failed', 'workflow:conversion_failed',
  'workflow:node_started', 'workflow:node_completed', 'workflow:node_failed',
  // Phase 22: Enterprise Hardening -- 11 new
  'credential:rotated', 'credential:rotation_failed',
  'rbac:access_denied',
  'user:created', 'user:role_changed', 'user:token_generated',
  'sso:login', 'sso:callback', 'sso:state_invalid', 'sso:token_exchange_failed',
  'audit:purged',
  // Pivot-2 Quality -- 5
  'trilemma:degraded', 'trilemma:unsafe',
  'contract:captured', 'contract:violation',
  'goodhart:risk_elevated',
  // Pivot-2 Agent Transport -- 3
  'a2a:message_wrapped', 'a2a:remote_delivery',
  'forge:patterns_preserved',
  // Pivot-2 Commands -- 2
  'cmd:dispatched', 'cmd:failed',
  // Pivot-2 Drift -- 2
  'drift:warning', 'drift:critical',
  // Pivot-2 Model Discovery -- 2
  'discovery:completed', 'discovery:failed',
  // Hybrid Topology (Angle 3) -- 3
  'hybrid:route_assigned', 'hybrid:cloud_fallback', 'hybrid:cost_reconciled',
  // Claude Managed Agents (Angle 2) -- 5
  'managed:session_timeout', 'managed:session_reconnecting',
  'managed:session_failed', 'managed:session_limit', 'managed:stream_incomplete',
] as const;
