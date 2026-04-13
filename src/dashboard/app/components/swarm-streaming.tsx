// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Swarm Streaming Components
 * Extracted from SwarmsTab for the 400-line file cap.
 *
 * Contains: PipelineProgress, AgentProgressList, EventLog, ForceGraph,
 * buildTopologyLinks, and SSE subscription hook.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as d3 from 'd3-force';
import { useDashboardStore } from '../store.js';
import { StatusBadge } from './shared.js';
import type { PipelineStep, StepStatus, LiveAgentState, LiveExecutionEvent } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_LABELS: Readonly<Record<PipelineStep, string>> = {
  memory: 'Memory', forge: 'Forge', agents: 'Agents', judge: 'Judge', output: 'Output',
};

const STEP_ICONS: Readonly<Record<PipelineStep, string>> = {
  memory: '\u{1F9E0}', forge: '\u{2692}', agents: '\u{1F916}', judge: '\u{2696}', output: '\u{1F4E4}',
};

const STATUS_COLORS: Readonly<Record<StepStatus, string>> = {
  pending: '#6b7280', running: '#f59e0b', completed: '#22c55e', failed: '#ef4444', skipped: '#9ca3af',
};

// ---------------------------------------------------------------------------
// SSE Hook -- subscribe to /api/sse and push events into store
// ---------------------------------------------------------------------------

export function useSseSubscription(): void {
  const pushLiveEvent = useDashboardStore((s) => s.pushLiveEvent);

  useEffect(() => {
    const eventSource = new EventSource('/api/sse');
    const executionPrefixes = ['task:', 'orchestrator:', 'agent:', 'swarm:', 'forge:', 'judge:', 'consensus:', 'memory:', 'output:'];

    const handler = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data as string) as Record<string, unknown>;
        const eventType = event.type;
        if (executionPrefixes.some((p) => eventType.startsWith(p))) {
          pushLiveEvent(eventType, payload);
        }
      } catch {
        // Malformed SSE data, ignore
      }
    };

    const eventTypes = [
      'task:created', 'task:started', 'task:completed', 'task:failed', 'task:cancelled',
      'orchestrator:step_started', 'orchestrator:step_completed',
      'agent:spawned', 'agent:started', 'agent:completed', 'agent:failed', 'agent:terminated',
      'swarm:started', 'swarm:completed', 'swarm:failed', 'swarm:topology_set',
      'forge:designing', 'forge:designed', 'forge:redesigning', 'forge:failed',
      'judge:started', 'judge:verdict', 'judge:approved', 'judge:rejected',
      'consensus:reached', 'consensus:split',
      'memory:recalled', 'memory:stored',
      'output:delivered', 'output:formatted',
    ];

    for (const et of eventTypes) {
      eventSource.addEventListener(et, handler);
    }

    return () => { eventSource.close(); };
  }, [pushLiveEvent]);
}

// ---------------------------------------------------------------------------
// Pipeline Progress Bar
// ---------------------------------------------------------------------------

export function PipelineProgress({
  steps,
}: {
  readonly steps: ReadonlyArray<{ readonly step: PipelineStep; readonly status: StepStatus }>;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '12px 0' }}>
      {steps.map((s, i) => {
        const color = STATUS_COLORS[s.status];
        const isActive = s.status === 'running';
        return (
          <React.Fragment key={s.step}>
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              flex: 1, position: 'relative',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                backgroundColor: `${color}20`, border: `2px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
                boxShadow: isActive ? `0 0 12px ${color}60` : 'none',
                animation: isActive ? 'node-pulse 1.5s ease-in-out infinite' : 'none',
                transition: 'all 0.3s ease',
              }}>
                {STEP_ICONS[s.step]}
              </div>
              <span style={{
                fontSize: '0.7rem', fontWeight: isActive ? 700 : 500,
                color: isActive ? '#f59e0b' : color,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {STEP_LABELS[s.step]}
              </span>
              <span style={{ fontSize: '0.6rem', color, opacity: 0.8 }}>{s.status}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: '0 0 auto', width: 32, height: 2,
                backgroundColor: steps[i + 1].status !== 'pending' ? '#22c55e' : '#334155',
                borderRadius: 1, marginBottom: 28, transition: 'background-color 0.3s ease',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Progress List
// ---------------------------------------------------------------------------

export function AgentProgressList({
  agents,
}: {
  readonly agents: readonly LiveAgentState[];
}): React.ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  if (agents.length === 0) {
    return <div className="table-empty">No agents active -- waiting for swarm dispatch</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {agents.map((a) => {
        const statusColor = a.status === 'completed' ? '#22c55e'
          : a.status === 'failed' ? '#ef4444'
            : a.status === 'running' ? '#f59e0b' : '#6b7280';
        const isOpen = expanded.has(a.agentId);
        return (
          <div
            key={a.agentId}
            style={{
              padding: '10px 14px', borderRadius: '8px',
              background: `${statusColor}08`, border: `1px solid ${statusColor}30`,
              cursor: a.output ? 'pointer' : 'default', transition: 'all 0.2s ease',
            }}
            onClick={() => a.output && toggle(a.agentId)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor,
                  display: 'inline-block',
                  boxShadow: a.status === 'running' ? `0 0 6px ${statusColor}` : 'none',
                  animation: a.status === 'running' ? 'node-pulse 1.5s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e2e8f0' }}>{a.role}</span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{a.agentId.slice(0, 8)}</span>
              </div>
              <StatusBadge
                status={a.status === 'completed' ? 'completed' : a.status === 'failed' ? 'error' : 'active'}
                label={a.status}
              />
            </div>
            {isOpen && a.output && (
              <pre style={{
                marginTop: '8px', padding: '8px', borderRadius: '6px',
                backgroundColor: '#0f172a', color: '#94a3b8',
                fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: '150px', overflow: 'auto', border: '1px solid #1e293b',
              }}>
                {a.output.slice(0, 500)}{a.output.length > 500 ? '...' : ''}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Real-Time Event Log
// ---------------------------------------------------------------------------

function summarizePayload(type: string, payload: Record<string, unknown>): string {
  const taskId = (payload.taskId as string)?.slice(0, 8) ?? '';
  const agentId = (payload.agentId as string)?.slice(0, 8) ?? '';
  const role = (payload.role as string) ?? '';
  const step = (payload.step as string) ?? '';
  const topology = (payload.topology as string) ?? '';
  if (step) return `step=${step}${taskId ? ` task=${taskId}` : ''}`;
  if (role && agentId) return `${role} (${agentId})`;
  if (agentId) return `agent=${agentId}`;
  if (topology) return `topology=${topology}`;
  if (taskId) return `task=${taskId}`;
  const keys = Object.keys(payload).slice(0, 3);
  if (keys.length === 0) return '--';
  return keys.map((k) => `${k}=${String(payload[k]).slice(0, 30)}`).join(' ');
}

export function EventLog({
  events,
}: {
  readonly events: readonly LiveExecutionEvent[];
}): React.ReactElement {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  const typeColor = (type: string): string => {
    if (type.includes('failed') || type.includes('rejected')) return '#ef4444';
    if (type.includes('completed') || type.includes('approved') || type.includes('delivered')) return '#22c55e';
    if (type.includes('started') || type.includes('designing') || type.includes('running')) return '#f59e0b';
    if (type.includes('spawned')) return '#8b5cf6';
    return '#94a3b8';
  };

  if (events.length === 0) {
    return <div className="table-empty">Waiting for execution events...</div>;
  }

  return (
    <div ref={logRef} style={{
      maxHeight: '250px', overflowY: 'auto', padding: '4px 0',
      fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem',
    }}>
      {events.map((e) => (
        <div key={e.id} style={{
          display: 'flex', gap: '8px', padding: '3px 8px',
          borderBottom: '1px solid #1e293b15', alignItems: 'baseline',
        }}>
          <span style={{ color: '#475569', minWidth: '70px', flexShrink: 0 }}>
            {new Date(e.timestamp).toLocaleTimeString()}
          </span>
          <span style={{ color: typeColor(e.type), fontWeight: 600, minWidth: '120px', flexShrink: 0 }}>
            {e.type.split(':').pop() ?? e.type}
          </span>
          <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summarizePayload(e.type, e.payload)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Force Graph
// ---------------------------------------------------------------------------

export interface GraphNode extends d3.SimulationNodeDatum {
  readonly id: string;
  readonly label: string;
  readonly type: 'agent' | 'hub';
  readonly isActive?: boolean;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  readonly source: string;
  readonly target: string;
}

export function ForceGraph({
  nodes, links, width = 500, height = 280,
}: {
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
  readonly width?: number;
  readonly height?: number;
}): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;
    const mutableNodes = nodes.map((n) => ({ ...n }));
    const mutableLinks = links.map((l) => ({ ...l }));
    const simulation = d3
      .forceSimulation(mutableNodes)
      .force('link', d3.forceLink(mutableLinks).id((d) => (d as GraphNode).id).distance(90))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2));
    simulation.on('tick', () => {
      const svg = svgRef.current;
      if (!svg) return;
      svg.querySelectorAll('.graph-link').forEach((el, i) => {
        const l = mutableLinks[i];
        if (!l) return;
        const src = l.source as unknown as GraphNode;
        const tgt = l.target as unknown as GraphNode;
        el.setAttribute('x1', String(src.x ?? 0));
        el.setAttribute('y1', String(src.y ?? 0));
        el.setAttribute('x2', String(tgt.x ?? 0));
        el.setAttribute('y2', String(tgt.y ?? 0));
      });
      svg.querySelectorAll('.graph-node').forEach((el, i) => {
        el.setAttribute('cx', String(mutableNodes[i]?.x ?? 0));
        el.setAttribute('cy', String(mutableNodes[i]?.y ?? 0));
      });
      svg.querySelectorAll('.graph-label').forEach((el, i) => {
        el.setAttribute('x', String(mutableNodes[i]?.x ?? 0));
        el.setAttribute('y', String((mutableNodes[i]?.y ?? 0) + 20));
      });
    });
    return () => { simulation.stop(); };
  }, [nodes, links, width, height]);

  if (nodes.length === 0) {
    return <div className="table-empty">No topology -- submit a task to see the graph</div>;
  }

  return (
    <svg ref={svgRef} width={width} height={height} className="force-graph">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#6366f1" opacity={0.6} />
        </marker>
      </defs>
      <style>{`@keyframes node-pulse{0%,100%{opacity:1}50%{opacity:0.5}}.agent-node-active{animation:node-pulse 1.5s ease-in-out infinite}`}</style>
      {links.map((l, i) => (
        <line key={i} className="graph-link" stroke="#6366f1" strokeWidth={1.5} strokeOpacity={0.5} markerEnd="url(#arrowhead)" />
      ))}
      {nodes.map((n) => (
        <circle
          key={n.id}
          className={`graph-node${n.isActive ? ' agent-node-active' : ''}`}
          r={n.type === 'hub' ? 14 : n.isActive ? 11 : 9}
          fill={n.isActive ? '#22c55e' : n.type === 'hub' ? '#6366f1' : '#334155'}
          stroke={n.isActive ? '#4ade80' : n.type === 'hub' ? '#818cf8' : '#475569'}
          strokeWidth={n.isActive ? 3 : 2} opacity={n.isActive ? 1.0 : 0.7}
        />
      ))}
      {nodes.map((n) => (
        <text
          key={`lbl-${n.id}`} className="graph-label"
          fill={n.isActive ? '#86efac' : n.type === 'hub' ? '#c7d2fe' : '#94a3b8'}
          fontSize={n.type === 'hub' ? 11 : 10}
          fontWeight={n.type === 'hub' || n.isActive ? 600 : 400}
          textAnchor="middle"
        >{n.label}</text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Build topology links
// ---------------------------------------------------------------------------

export function buildTopologyLinks(topology: string, agentNodes: readonly GraphNode[]): GraphLink[] {
  if (agentNodes.length === 0) return [];
  const links: GraphLink[] = [];
  if (topology === 'sequential') {
    links.push({ source: 'hub', target: agentNodes[0].id });
    for (let i = 1; i < agentNodes.length; i++) links.push({ source: agentNodes[i - 1].id, target: agentNodes[i].id });
  } else if (topology === 'hierarchical' && agentNodes[0]) {
    links.push({ source: 'hub', target: agentNodes[0].id });
    for (let i = 1; i < agentNodes.length; i++) links.push({ source: agentNodes[0].id, target: agentNodes[i].id });
  } else if (topology === 'circular') {
    for (let i = 0; i < agentNodes.length; i++) links.push({ source: agentNodes[i].id, target: agentNodes[(i + 1) % agentNodes.length].id });
    links.push({ source: 'hub', target: agentNodes[0].id });
  } else if (topology === 'mesh') {
    for (let i = 0; i < agentNodes.length; i++) {
      links.push({ source: 'hub', target: agentNodes[i].id });
      for (let j = i + 1; j < agentNodes.length; j++) links.push({ source: agentNodes[i].id, target: agentNodes[j].id });
    }
  } else {
    for (const n of agentNodes) links.push({ source: 'hub', target: n.id });
  }
  return links.filter((l) => l.source && l.target);
}
