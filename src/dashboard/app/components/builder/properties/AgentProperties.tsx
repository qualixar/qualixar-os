/**
 * Qualixar OS Phase 21 — AgentProperties Panel
 * Configuration form for Agent nodes: role, model, systemPrompt, tools.
 */

import React from 'react';

interface AgentPropertiesProps {
  readonly config: Record<string, unknown>;
  readonly onChange: (key: string, value: unknown) => void;
}

const KNOWN_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-5',
  'claude-haiku-4-5',
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'llama-3.3-70b',
] as const;

const KNOWN_TOOLS = [
  'web_search', 'code_executor', 'file_reader', 'file_writer',
  'http_request', 'db_query', 'shell', 'memory_recall',
] as const;

export function AgentProperties({ config, onChange }: AgentPropertiesProps): React.ReactElement {
  const role = typeof config['role'] === 'string' ? config['role'] : '';
  const model = typeof config['model'] === 'string' ? config['model'] : KNOWN_MODELS[0];
  const systemPrompt = typeof config['systemPrompt'] === 'string' ? config['systemPrompt'] : '';
  const selectedTools = Array.isArray(config['tools']) ? (config['tools'] as string[]) : [];

  function toggleTool(tool: string): void {
    const next = selectedTools.includes(tool)
      ? selectedTools.filter((t) => t !== tool)
      : [...selectedTools, tool];
    onChange('tools', next);
  }

  return (
    <div className="properties-panel">
      <div className="settings-row">
        <label className="settings-label">Role</label>
        <input
          className="settings-input"
          type="text"
          value={role}
          placeholder="e.g. Researcher"
          onChange={(e) => onChange('role', e.target.value)}
        />
      </div>

      <div className="settings-row">
        <label className="settings-label">Model</label>
        <select
          className="settings-input"
          value={model}
          onChange={(e) => onChange('model', e.target.value)}
        >
          {KNOWN_MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <label className="settings-label">System Prompt</label>
        <textarea
          className="settings-input settings-input--textarea"
          value={systemPrompt}
          rows={4}
          placeholder="You are a helpful assistant…"
          onChange={(e) => onChange('systemPrompt', e.target.value)}
        />
      </div>

      <div className="settings-row">
        <label className="settings-label">Tools</label>
        <div className="properties-checkboxes">
          {KNOWN_TOOLS.map((tool) => (
            <label key={tool} className="properties-checkbox-label">
              <input
                type="checkbox"
                checked={selectedTools.includes(tool)}
                onChange={() => toggleTool(tool)}
              />
              {tool}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
