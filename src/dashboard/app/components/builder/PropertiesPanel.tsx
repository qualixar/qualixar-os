/**
 * Qualixar OS Phase 21 — Properties Panel
 * Right sidebar showing config form for the selected node.
 * Renders typed fields: text, textarea, number, select, boolean, JSON, model-picker, tool-picker.
 */

import React, { useState, useCallback } from 'react';
import type { WorkflowNode } from '../../tabs/BuilderTab.js';

// ---------------------------------------------------------------------------
// Field schema definition
// ---------------------------------------------------------------------------

type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'json' | 'model-picker' | 'tool-picker';

interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly options?: readonly string[]; // for select
  readonly placeholder?: string;
}

// ---------------------------------------------------------------------------
// Known models and tools for pickers
// ---------------------------------------------------------------------------

const KNOWN_MODELS = [
  'claude-opus-4-5', 'claude-sonnet-4-6', 'claude-haiku-4-5',
  'gpt-4o', 'gpt-4o-mini', 'gemini-2.0-flash', 'gemini-2.5-pro',
  'llama-3.3-70b', 'deepseek-r1',
] as const;

const KNOWN_TOOLS = [
  'bash', 'file_read', 'file_write', 'web_search', 'web_fetch',
  'code_interpreter', 'calculator', 'db_query', 'api_call', 'send_email',
] as const;

// ---------------------------------------------------------------------------
// Node type → config schema mapping
// ---------------------------------------------------------------------------

const NODE_CONFIG_SCHEMA: Record<string, readonly FieldDef[]> = {
  agent: [
    { key: 'systemPrompt', label: 'System Prompt', type: 'textarea', placeholder: 'You are a helpful agent…' },
    { key: 'model', label: 'Model', type: 'model-picker' },
    { key: 'tools', label: 'Tools', type: 'tool-picker' },
    { key: 'maxTokens', label: 'Max Tokens', type: 'number' },
    { key: 'temperature', label: 'Temperature', type: 'number' },
    { key: 'streaming', label: 'Enable Streaming', type: 'boolean' },
  ],
  llm: [
    { key: 'prompt', label: 'Prompt Template', type: 'textarea' },
    { key: 'model', label: 'Model', type: 'model-picker' },
    { key: 'maxTokens', label: 'Max Tokens', type: 'number' },
    { key: 'responseFormat', label: 'Response Format', type: 'select', options: ['text', 'json_object', 'json_schema'] },
  ],
  judge: [
    { key: 'criteria', label: 'Evaluation Criteria', type: 'textarea' },
    { key: 'model', label: 'Judge Model', type: 'model-picker' },
    { key: 'scoreThreshold', label: 'Pass Threshold (0–1)', type: 'number' },
    { key: 'strict', label: 'Strict Mode', type: 'boolean' },
  ],
  condition: [
    { key: 'expression', label: 'Condition Expression', type: 'text', placeholder: '${output.score} > 0.8' },
    { key: 'trueBranch', label: 'True Branch Label', type: 'text' },
    { key: 'falseBranch', label: 'False Branch Label', type: 'text' },
  ],
  loop: [
    { key: 'iterableKey', label: 'Iterable Key', type: 'text', placeholder: '${items}' },
    { key: 'maxIterations', label: 'Max Iterations', type: 'number' },
    { key: 'parallel', label: 'Parallel Execution', type: 'boolean' },
  ],
  transform: [
    { key: 'mapping', label: 'Mapping (JSON)', type: 'json' },
  ],
  input: [
    { key: 'schema', label: 'Input Schema (JSON)', type: 'json' },
    { key: 'required', label: 'Required', type: 'boolean' },
  ],
  output: [
    { key: 'format', label: 'Output Format', type: 'select', options: ['json', 'text', 'markdown', 'csv'] },
    { key: 'storeKey', label: 'Storage Key', type: 'text' },
  ],
};

const DEFAULT_SCHEMA: readonly FieldDef[] = [
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PropertiesPanelProps {
  readonly node: WorkflowNode;
  readonly onChange: (updated: WorkflowNode) => void;
}

// ---------------------------------------------------------------------------
// PropertiesPanel
// ---------------------------------------------------------------------------

export function PropertiesPanel({ node, onChange }: PropertiesPanelProps): React.ReactElement {
  const schema = NODE_CONFIG_SCHEMA[node.type] ?? DEFAULT_SCHEMA;

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    onChange({ ...node, config: { ...node.config, [key]: value } });
  }, [node, onChange]);

  const handleLabelChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...node, label: e.target.value });
  }, [node, onChange]);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary, #e2e8f0)' }}>Properties</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted, #718096)', marginTop: 2 }}>{node.type.toUpperCase()} · {node.id}</span>
      </div>

      <div style={{ padding: '8px 12px', flex: 1, overflowY: 'auto' }}>
        {/* Label always editable */}
        <FieldRow label="Label">
          <input
            value={node.label}
            onChange={handleLabelChange}
            style={inputStyle}
            aria-label="Node label"
          />
        </FieldRow>

        {schema.map(field => (
          <FieldRow key={field.key} label={field.label}>
            <FieldInput
              field={field}
              value={node.config[field.key]}
              onChange={val => handleFieldChange(field.key, val)}
            />
          </FieldRow>
        ))}
      </div>

      {/* Node position info (read-only) */}
      <div style={footerStyle}>
        <span style={{ fontSize: 10, color: 'var(--text-muted, #718096)' }}>
          x: {Math.round(node.x)} · y: {Math.round(node.y)} · {node.width}×{node.height}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldRow wrapper
// ---------------------------------------------------------------------------

function FieldRow({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldInput — renders correct control per type
// ---------------------------------------------------------------------------

interface FieldInputProps {
  readonly field: FieldDef;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}

function FieldInput({ field, value, onChange }: FieldInputProps): React.ReactElement {
  const [jsonError, setJsonError] = useState<string | null>(null);

  const strVal = typeof value === 'string' ? value : value != null ? String(value) : '';
  const boolVal = Boolean(value);
  const numVal = typeof value === 'number' ? value : Number(strVal) || 0;

  switch (field.type) {
    case 'text':
      return <input value={strVal} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} style={inputStyle} />;

    case 'textarea':
      return <textarea value={strVal} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }} />;

    case 'number':
      return <input type="number" value={numVal} onChange={e => onChange(Number(e.target.value))} style={inputStyle} />;

    case 'select':
      return (
        <select value={strVal} onChange={e => onChange(e.target.value)} style={inputStyle}>
          <option value="">— select —</option>
          {(field.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );

    case 'boolean':
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={boolVal} onChange={e => onChange(e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: 'var(--text-primary, #e2e8f0)' }}>{boolVal ? 'Enabled' : 'Disabled'}</span>
        </label>
      );

    case 'json':
      return (
        <div>
          <textarea
            value={typeof value === 'string' ? value : JSON.stringify(value, null, 2) || ''}
            onChange={e => {
              const raw = e.target.value;
              try {
                const parsed = JSON.parse(raw);
                onChange(parsed);
                setJsonError(null);
              } catch {
                onChange(raw);
                setJsonError('Invalid JSON');
              }
            }}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 11, borderColor: jsonError ? '#ef4444' : undefined }}
          />
          {jsonError && <span style={{ fontSize: 10, color: '#ef4444' }}>{jsonError}</span>}
        </div>
      );

    case 'model-picker':
      return (
        <select value={strVal} onChange={e => onChange(e.target.value)} style={inputStyle}>
          <option value="">— choose model —</option>
          {KNOWN_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      );

    case 'tool-picker': {
      const selectedTools: string[] = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {KNOWN_TOOLS.map(tool => (
            <label key={tool} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selectedTools.includes(tool)}
                onChange={e => {
                  const next = e.target.checked
                    ? [...selectedTools, tool]
                    : selectedTools.filter(t => t !== tool);
                  onChange(next);
                }}
                style={{ cursor: 'pointer' }}
              />
              {tool}
            </label>
          ))}
        </div>
      );
    }

    default:
      return <input value={strVal} onChange={e => onChange(e.target.value)} style={inputStyle} />;
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--sidebar-bg, #1a202c)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border-color, #2d3748)',
};

const footerStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderTop: '1px solid var(--border-color, #2d3748)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  borderRadius: 5,
  border: '1px solid var(--border-color, #4a5568)',
  background: 'var(--input-bg, #2d3748)',
  color: 'var(--text-primary, #e2e8f0)',
  fontSize: 12,
  boxSizing: 'border-box',
};
