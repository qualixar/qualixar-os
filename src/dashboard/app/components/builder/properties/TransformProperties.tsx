/**
 * Qualixar OS Phase 21 — TransformProperties Panel
 * Configuration form for Transform nodes: transformType select, expression textarea.
 */

import React from 'react';

interface TransformPropertiesProps {
  readonly config: Record<string, unknown>;
  readonly onChange: (key: string, value: unknown) => void;
}

type TransformType = 'template' | 'json_extract' | 'regex';

const TRANSFORM_TYPES: readonly { readonly value: TransformType; readonly label: string; readonly placeholder: string }[] = [
  {
    value: 'template',
    label: 'Template',
    placeholder: 'Hello {{input.name}}, your result is {{output.score}}.',
  },
  {
    value: 'json_extract',
    label: 'JSON Extract',
    placeholder: '$.results[0].value',
  },
  {
    value: 'regex',
    label: 'Regex',
    placeholder: '([A-Z]{2}\\d{4})',
  },
];

export function TransformProperties({ config, onChange }: TransformPropertiesProps): React.ReactElement {
  const transformType = (typeof config['transformType'] === 'string'
    ? config['transformType']
    : 'template') as TransformType;
  const expression = typeof config['expression'] === 'string' ? config['expression'] : '';

  const currentType = TRANSFORM_TYPES.find((t) => t.value === transformType) ?? TRANSFORM_TYPES[0];

  return (
    <div className="properties-panel">
      <div className="settings-row">
        <label className="settings-label">Transform Type</label>
        <select
          className="settings-input"
          value={transformType}
          onChange={(e) => onChange('transformType', e.target.value)}
        >
          {TRANSFORM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <label className="settings-label">Expression</label>
        <textarea
          className="settings-input settings-input--textarea settings-input--mono"
          value={expression}
          rows={5}
          placeholder={currentType.placeholder}
          spellCheck={false}
          onChange={(e) => onChange('expression', e.target.value)}
        />
        {transformType === 'template' && (
          <span className="properties-hint">
            Use <code>{'{{variable}}'}</code> for substitutions.
          </span>
        )}
        {transformType === 'json_extract' && (
          <span className="properties-hint">
            JSONPath expression — e.g. <code>$.data.items[0]</code>
          </span>
        )}
        {transformType === 'regex' && (
          <span className="properties-hint">
            Capture group 1 is returned as the result.
          </span>
        )}
      </div>
    </div>
  );
}
