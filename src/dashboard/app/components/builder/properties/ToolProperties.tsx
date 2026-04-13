/**
 * Qualixar OS Phase 21 — ToolProperties Panel
 * Configuration form for Tool nodes: toolName select, parameters JSON.
 */

import React, { useState, useCallback } from 'react';

interface ToolPropertiesProps {
  readonly config: Record<string, unknown>;
  readonly onChange: (key: string, value: unknown) => void;
}

const KNOWN_TOOLS = [
  'web_search', 'code_executor', 'file_reader', 'file_writer',
  'http_request', 'db_query', 'shell', 'memory_recall',
] as const;

export function ToolProperties({ config, onChange }: ToolPropertiesProps): React.ReactElement {
  const toolName = typeof config['toolName'] === 'string' ? config['toolName'] : KNOWN_TOOLS[0];
  const parametersRaw = config['parameters'] !== undefined
    ? JSON.stringify(config['parameters'], null, 2)
    : '{}';

  const [jsonText, setJsonText] = useState<string>(parametersRaw);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleJsonChange = useCallback((text: string) => {
    setJsonText(text);
    try {
      const parsed: unknown = JSON.parse(text);
      onChange('parameters', parsed);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON');
    }
  }, [onChange]);

  return (
    <div className="properties-panel">
      <div className="settings-row">
        <label className="settings-label">Tool Name</label>
        <select
          className="settings-input"
          value={toolName}
          onChange={(e) => onChange('toolName', e.target.value)}
        >
          {KNOWN_TOOLS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <label className="settings-label">
          Parameters (JSON)
          {jsonError && <span className="properties-error"> — {jsonError}</span>}
        </label>
        <textarea
          className={`settings-input settings-input--textarea settings-input--mono${jsonError ? ' settings-input--error' : ''}`}
          value={jsonText}
          rows={6}
          spellCheck={false}
          onChange={(e) => handleJsonChange(e.target.value)}
        />
      </div>
    </div>
  );
}
