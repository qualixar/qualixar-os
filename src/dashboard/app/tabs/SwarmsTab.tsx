// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS -- Swarms Tab with Real-Time Execution Streaming
 *
 * Subscribes to the SSE endpoint (/api/sse) for real-time pipeline events.
 * Displays:
 *   1. Pipeline progress: Memory > Forge > Agents > Judge > Output
 *   2. Active agent execution progress within the current topology
 *   3. Real-time event log with auto-scroll
 *   4. Topology graph (force-directed)
 *
 * Sub-components extracted to components/swarm-streaming.tsx for 400-line cap.
 * Uses existing SSE endpoint and EventBus event types -- no new endpoints.
 */

import React, { useMemo, useEffect } from 'react';
import { useDashboardStore } from '../store.js';
import { Card } from '../components/shared.js';
import {
  useSseSubscription,
  PipelineProgress,
  AgentProgressList,
  EventLog,
  ForceGraph,
  buildTopologyLinks,
} from '../components/swarm-streaming.js';
import type { GraphNode } from '../components/swarm-streaming.js';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function SwarmsTab(): React.ReactElement {
  // Subscribe to SSE for real-time execution events
  useSseSubscription();

  const liveExecution = useDashboardStore((s) => s.liveExecution);
  const topologies = useDashboardStore((s) => s.swarmTopologies);
  const resetLiveExecution = useDashboardStore((s) => s.resetLiveExecution);
  const fetchTasks = useDashboardStore((s) => s.fetchTasks);

  // Poll tasks for live/idle detection
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchTasks();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const isLive = liveExecution.pipelineSteps.some((s) => s.status === 'running');

  const activeAgentIds = useMemo(
    () => new Set(
      liveExecution.activeAgents
        .filter((a) => a.status === 'running')
        .map((a) => a.agentId),
    ),
    [liveExecution.activeAgents],
  );

  // Build force graph from live agents
  const { graphNodes, graphLinks } = useMemo(() => {
    const agents = liveExecution.activeAgents;
    if (agents.length === 0) {
      return { graphNodes: [] as GraphNode[], graphLinks: [] as ReturnType<typeof buildTopologyLinks> };
    }

    const topology = (topologies ?? [])[0] ?? 'parallel';
    const hubNode: GraphNode = { id: 'hub', label: topology.toUpperCase(), type: 'hub' };
    const agentNodes: GraphNode[] = agents.slice(0, 8).map((a) => ({
      id: a.agentId,
      label: a.role,
      type: 'agent' as const,
      isActive: activeAgentIds.has(a.agentId),
    }));

    return {
      graphNodes: [hubNode, ...agentNodes],
      graphLinks: buildTopologyLinks(topology, agentNodes),
    };
  }, [liveExecution.activeAgents, topologies, activeAgentIds]);

  return (
    <div className="tab-grid">
      {/* Row 1: Pipeline Progress (full width) */}
      <Card
        title="Pipeline Execution"
        subtitle={liveExecution.taskId ? `Task: ${liveExecution.taskId.slice(0, 12)}` : undefined}
        className="span-2"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              backgroundColor: isLive ? '#22c55e' : '#6b7280',
              display: 'inline-block',
              boxShadow: isLive ? '0 0 8px #22c55e60' : 'none',
              animation: isLive ? 'node-pulse 1.5s ease-in-out infinite' : 'none',
            }} />
            <span style={{
              fontSize: '0.85rem', fontWeight: 600,
              color: isLive ? '#22c55e' : '#6b7280',
            }}>
              {isLive ? 'LIVE' : 'IDLE'}
            </span>
          </div>
          <button
            onClick={resetLiveExecution}
            style={{
              background: 'none', border: '1px solid #334155', borderRadius: '6px',
              color: '#94a3b8', padding: '4px 12px', cursor: 'pointer', fontSize: '0.75rem',
            }}
          >
            Reset
          </button>
        </div>
        <PipelineProgress steps={liveExecution.pipelineSteps} />
      </Card>

      {/* Row 2: Topology Graph + Agent Progress */}
      <Card title="Topology Graph">
        <ForceGraph nodes={graphNodes} links={graphLinks} width={450} height={280} />
      </Card>

      <Card title="Agent Execution">
        <AgentProgressList agents={liveExecution.activeAgents} />
      </Card>

      {/* Row 3: Event Log (full width) */}
      <Card
        title="Real-Time Event Log"
        subtitle={`${liveExecution.eventLog.length} events`}
        className="span-2"
      >
        <EventLog events={liveExecution.eventLog} />
      </Card>
    </div>
  );
}
