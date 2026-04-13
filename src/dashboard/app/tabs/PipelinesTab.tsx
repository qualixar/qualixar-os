/**
 * Qualixar OS Phase 7 -- Pipelines Tab
 * Task pipeline stages visualization (init > memory > forge > simulate > run > judge > output).
 * Active task tracking through pipeline stages.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

const PIPELINE_STAGES = [
  { id: 'init', label: 'Init', color: '#6b7280' },
  { id: 'memory', label: 'Memory', color: '#8b5cf6' },
  { id: 'forge', label: 'Forge', color: '#f59e0b' },
  { id: 'simulate', label: 'Simulate', color: '#06b6d4' },
  { id: 'run', label: 'Run', color: '#22c55e' },
  { id: 'judge', label: 'Judge', color: '#6366f1' },
  { id: 'output', label: 'Output', color: '#ec4899' },
] as const;

// ---------------------------------------------------------------------------
// Stage indicator
// ---------------------------------------------------------------------------

function StageIndicator({
  stage,
  isActive,
  isCompleted,
}: {
  readonly stage: (typeof PIPELINE_STAGES)[number];
  readonly isActive: boolean;
  readonly isCompleted: boolean;
}): React.ReactElement {
  const bgColor = isActive ? stage.color : isCompleted ? `${stage.color}44` : 'var(--bg-tertiary)';
  const borderColor = isActive || isCompleted ? stage.color : 'var(--border-glass)';

  return (
    <div
      className="pipeline-stage"
      style={{
        backgroundColor: bgColor,
        borderColor,
        color: isActive ? '#fff' : isCompleted ? stage.color : 'var(--text-muted)',
      }}
    >
      <span className="stage-label">{stage.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline row for a single task
// ---------------------------------------------------------------------------

function PipelineRow({
  taskId,
  currentPhase,
  progress,
  status,
  heartbeat,
}: {
  readonly taskId: string;
  readonly currentPhase: string;
  readonly progress: number;
  readonly status: string;
  readonly heartbeat?: { status: string; lastSeen: string | null; ageMs: number | null } | null;
}): React.ReactElement {
  const stageIndex = PIPELINE_STAGES.findIndex((s) => s.id === currentPhase);

  return (
    <div className="pipeline-row">
      <div className="pipeline-task-info">
        <span className="pipeline-task-id">{taskId.slice(0, 12)}</span>
        <StatusBadge
          status={status.includes('completed') ? 'completed' : status.includes('failed') ? 'error' : 'active'}
          label={status}
        />
        <span className="pipeline-progress">{progress}%</span>
        {heartbeat && (
          <span
            className="heartbeat-indicator"
            title={`Heartbeat: ${heartbeat.status}${heartbeat.lastSeen ? ` (${Math.round((heartbeat.ageMs ?? 0) / 1000)}s ago)` : ''}`}
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              marginLeft: 6,
              backgroundColor: heartbeat.status === 'healthy' ? '#22c55e'
                : heartbeat.status === 'warning' ? '#eab308'
                : heartbeat.status === 'stale' ? '#ef4444'
                : '#6b7280',
              animation: heartbeat.status === 'healthy' ? 'pulse 2s infinite' : undefined,
            }}
          />
        )}
      </div>
      <div className="pipeline-stages">
        {PIPELINE_STAGES.map((stage, idx) => (
          <React.Fragment key={stage.id}>
            <StageIndicator
              stage={stage}
              isActive={idx === stageIndex}
              isCompleted={idx < stageIndex}
            />
            {idx < PIPELINE_STAGES.length - 1 && (
              <div
                className="pipeline-connector"
                style={{
                  backgroundColor: idx < stageIndex ? PIPELINE_STAGES[idx].color : 'var(--border-glass)',
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelinesTab(): React.ReactElement {
  const tasks = useDashboardStore((s) => s.tasks);
  const fetchTasks = useDashboardStore((s) => s.fetchTasks);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks().finally(() => setLoading(false));
  }, [fetchTasks]);

  const stageDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const stage of PIPELINE_STAGES) {
      counts[stage.id] = 0;
    }
    for (const task of tasks) {
      const phase = task.status === 'completed' ? 'output' : task.status === 'failed' ? 'run' : 'run';
      if (phase in counts) {
        counts[phase]++;
      }
    }
    return PIPELINE_STAGES.map((s) => ({
      stage: s.label,
      count: counts[s.id] ?? 0,
      color: s.color,
    }));
  }, [tasks]);

  if (loading) {
    return <LoadingSpinner message="Loading pipelines..." />;
  }

  return (
    <div className="tab-grid">
      <Card title="Pipeline Stage Distribution">
        <div className="stage-bar-chart">
          {stageDistribution.map((s) => (
            <div key={s.stage} className="stage-bar-item">
              <span className="stage-bar-label">{s.stage}</span>
              <div className="stage-bar-track">
                <div
                  className="stage-bar-fill"
                  style={{
                    width: tasks.length > 0 ? `${(s.count / tasks.length) * 100}%` : '0%',
                    backgroundColor: s.color,
                  }}
                />
              </div>
              <span className="stage-bar-count">{s.count}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Active Task Pipelines" className="span-2">
        {tasks.length === 0 ? (
          <div className="table-empty">No tasks in pipeline</div>
        ) : (
          <div className="pipeline-list">
            {tasks.map((task) => (
              <PipelineRow
                key={task.id}
                taskId={task.id ?? ''}
                currentPhase={task.status === 'completed' ? 'output' : task.status === 'failed' ? 'run' : 'run'}
                progress={task.status === 'completed' ? 100 : task.status === 'failed' ? 0 : 50}
                status={task.status}
                heartbeat={task.heartbeat}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
