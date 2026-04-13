/**
 * Qualixar OS Phase 21 — GenericProperties Panel
 * Fallback property panel for Start, Output, HumanApproval, and Merge nodes.
 * Dynamically renders fields from configSchema — no hardcoded field list.
 */

import React from 'react';

type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'boolean';

interface FieldSchema {
  readonly type: FieldType;
  readonly label: string;
  readonly placeholder?: string;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
}

interface GenericPropertiesProps {
  readonly config: Record<string, unknown>;
  readonly configSchema: Record<string, FieldSchema>;
  readonly onChange: (key: string, value: unknown) => void;
}

export function GenericProperties({ config, configSchema, onChange }: GenericPropertiesProps): React.ReactElement {
  const keys = Object.keys(configSchema);

  if (keys.length === 0) {
    return (
      <div className="properties-panel">
        <p className="node-empty-hint">No configurable fields for this node type.</p>
      </div>
    );
  }

  return (
    <div className="properties-panel">
      {keys.map((key) => {
        const field = configSchema[key];
        const value = config[key];

        if (field.type === 'boolean') {
          return (
            <div key={key} className="settings-row settings-row--inline">
              <label className="settings-label">{field.label}</label>
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => onChange(key, e.target.checked)}
              />
            </div>
          );
        }

        if (field.type === 'select' && field.options) {
          return (
            <div key={key} className="settings-row">
              <label className="settings-label">{field.label}</label>
              <select
                className="settings-input"
                value={typeof value === 'string' ? value : (field.options[0] ?? '')}
                onChange={(e) => onChange(key, e.target.value)}
              >
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          );
        }

        if (field.type === 'textarea') {
          return (
            <div key={key} className="settings-row">
              <label className="settings-label">{field.label}</label>
              <textarea
                className="settings-input settings-input--textarea"
                value={typeof value === 'string' ? value : ''}
                rows={4}
                placeholder={field.placeholder ?? ''}
                onChange={(e) => onChange(key, e.target.value)}
              />
            </div>
          );
        }

        if (field.type === 'number') {
          return (
            <div key={key} className="settings-row">
              <label className="settings-label">{field.label}</label>
              <input
                className="settings-input settings-input--narrow"
                type="number"
                min={field.min}
                max={field.max}
                value={typeof value === 'number' ? value : ''}
                placeholder={field.placeholder ?? ''}
                onChange={(e) => onChange(key, parseFloat(e.target.value))}
              />
            </div>
          );
        }

        // Default: text
        return (
          <div key={key} className="settings-row">
            <label className="settings-label">{field.label}</label>
            <input
              className="settings-input"
              type="text"
              value={typeof value === 'string' ? value : ''}
              placeholder={field.placeholder ?? ''}
              onChange={(e) => onChange(key, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
