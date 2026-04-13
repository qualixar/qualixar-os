/**
 * Qualixar OS Phase 7 -- Tools Tab
 * MCP tools registry, model catalog, imported agents table.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useDashboardStore } from '../store.js';
import { Card, StatusBadge, DataTable, LoadingSpinner } from '../components/shared.js';

// ---------------------------------------------------------------------------
// MCP Tool types
// ---------------------------------------------------------------------------

interface McpToolEntry {
  readonly name: string;
  readonly description: string;
  readonly category: string;
}

interface ToolEntry {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly status: string;
  readonly callCount: number;
}

// ---------------------------------------------------------------------------
// Imported agents (from compatibility layer)
// ---------------------------------------------------------------------------

interface ImportedAgentEntry {
  readonly id: string;
  readonly name: string;
  readonly sourceFormat: string;
  readonly version: number;
  readonly status: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const toolColumns = [
  { key: 'name', header: 'Tool Name' },
  { key: 'description', header: 'Description' },
  {
    key: 'category',
    header: 'Category',
    render: (row: Record<string, unknown>) => (
      <StatusBadge status="active" label={row.category as string} />
    ),
  },
  {
    key: 'status',
    header: 'Status',
    render: (row: Record<string, unknown>) => (
      <StatusBadge
        status={row.status === 'available' ? 'active' : 'idle'}
        label={row.status as string}
      />
    ),
  },
  { key: 'callCount', header: 'Calls' },
];

const agentImportColumns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'sourceFormat', header: 'Format' },
  { key: 'version', header: 'Version' },
  {
    key: 'status',
    header: 'Status',
    render: (row: Record<string, unknown>) => (
      <StatusBadge
        status={row.status === 'active' ? 'active' : 'idle'}
        label={row.status as string}
      />
    ),
  },
];

const modelCatalogColumns = [
  { key: 'name', header: 'Model' },
  { key: 'provider', header: 'Provider' },
  {
    key: 'qualityScore',
    header: 'Quality',
    render: (row: Record<string, unknown>) => `${((row.qualityScore as number) * 100).toFixed(0)}%`,
  },
  {
    key: 'costPerInputToken',
    header: 'Input $/tok',
    render: (row: Record<string, unknown>) => `$${(row.costPerInputToken as number).toFixed(6)}`,
  },
  {
    key: 'available',
    header: 'Status',
    render: (row: Record<string, unknown>) => (
      <StatusBadge
        status={(row.available as boolean) ? 'active' : 'idle'}
        label={(row.available as boolean) ? 'ready' : 'offline'}
      />
    ),
  },
];

export function ToolsTab(): React.ReactElement {
  const logs = useDashboardStore((s) => s.logs);
  const models = useDashboardStore((s) => s.models);
  const fetchModels = useDashboardStore((s) => s.fetchModels);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [mcpTools, setMcpTools] = useState<readonly McpToolEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTools = fetch('/api/mcp/tools')
      .then((r) => r.json())
      .then((data) => {
        if (data.tools) setMcpTools(data.tools as McpToolEntry[]);
      })
      .catch(() => { /* non-critical */ });

    Promise.allSettled([fetchModels(), fetchTools])
      .finally(() => setLoading(false));
  }, [fetchModels]);

  const toolCallCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of logs) {
      if (log.type.includes('mcp:tool')) {
        try {
          const data = JSON.parse(log.message);
          const toolName = data.toolName as string;
          if (toolName) {
            counts[toolName] = (counts[toolName] ?? 0) + 1;
          }
        } catch {
          // skip
        }
      }
    }
    return counts;
  }, [logs]);

  const tools = useMemo((): ToolEntry[] => {
    const enriched = mcpTools.map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      status: 'available' as const,
      callCount: toolCallCounts[t.name] ?? 0,
    }));
    if (filterCategory === 'all') return enriched;
    return enriched.filter((t) => t.category === filterCategory);
  }, [mcpTools, toolCallCounts, filterCategory]);

  const importedAgents = useMemo((): ImportedAgentEntry[] => {
    const agents: ImportedAgentEntry[] = [];
    for (const log of logs) {
      if (log.type.includes('compat:agent_imported')) {
        try {
          const data = JSON.parse(log.message);
          agents.push({
            id: (data.agentId as string) ?? `agent-${agents.length}`,
            name: (data.name as string) ?? 'Unknown',
            sourceFormat: (data.sourceFormat as string) ?? 'unknown',
            version: (data.version as number) ?? 1,
            status: 'active',
          });
        } catch {
          // skip
        }
      }
    }
    return agents;
  }, [logs]);

  const categories = useMemo(() => {
    const cats = new Set(mcpTools.map((t) => t.category));
    return ['all', ...Array.from(cats)];
  }, [mcpTools]);

  if (loading) {
    return <LoadingSpinner message="Loading tools..." />;
  }

  return (
    <div className="tab-grid">
      <Card title="MCP Tools Registry">
        <div className="filter-bar">
          <label className="filter-label">Category:</label>
          <select
            className="filter-select"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <DataTable
          columns={toolColumns}
          data={tools as unknown as Record<string, unknown>[]}
          emptyMessage="No tools registered"
        />
      </Card>

      <Card title="Tool Stats">
        <div className="stat-grid">
          <div className="stat-item">
            <span className="stat-value">{mcpTools.length}</span>
            <span className="stat-label">MCP Tools</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">
              {Object.values(toolCallCounts).reduce((a, b) => a + b, 0)}
            </span>
            <span className="stat-label">Total Calls</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">
              {new Set(mcpTools.map((t) => t.category)).size}
            </span>
            <span className="stat-label">Categories</span>
          </div>
        </div>
      </Card>

      <Card title="Model Catalog" subtitle="Available LLM models and pricing" className="span-2">
        <DataTable
          columns={modelCatalogColumns}
          data={models as unknown as Record<string, unknown>[]}
          emptyMessage="No models loaded"
        />
      </Card>

      <Card title="Imported Agents" className="span-2">
        <DataTable
          columns={agentImportColumns}
          data={importedAgents as unknown as Record<string, unknown>[]}
          emptyMessage="No imported agents"
        />
      </Card>
    </div>
  );
}
