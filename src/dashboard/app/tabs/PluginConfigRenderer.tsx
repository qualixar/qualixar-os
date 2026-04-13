/**
 * Qualixar OS Phase 20 — Plugin Config Renderer
 * Auto-renders config form fields from plugin manifest schema.
 * VS Code-style: each field has type, description, and optional constraints.
 * Supports: string, number, boolean, select, multiselect.
 */

import React, { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types (exported so PluginDetailModal can import)
// ---------------------------------------------------------------------------

export interface ConfigField {
  readonly type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  readonly description?: string;
  readonly default?: unknown;
  readonly pattern?: string;       // string: regex validation
  readonly min?: number;           // number: min value
  readonly max?: number;           // number: max value
  readonly enum?: readonly string[]; // select/multiselect: options
  readonly required?: boolean;
}

interface PluginConfigRendererProps {
  readonly schema: Record<string, ConfigField>;
  readonly values: Record<string, unknown>;
  readonly onChange: (key: string, value: unknown) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert camelCase or snake_case key to human-readable label */
function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function validateStringField(value: string, field: ConfigField): string | null {
  if (field.required && value.trim() === '') return 'This field is required';
  if (field.pattern && value !== '') {
    try {
      const re = new RegExp(field.pattern);
      if (!re.test(value)) return `Must match pattern: ${field.pattern}`;
    } catch {
      // invalid regex in schema — skip validation
    }
  }
  return null;
}

function validateNumberField(value: number, field: ConfigField): string | null {
  if (field.min !== undefined && value < field.min) return `Minimum value is ${field.min}`;
  if (field.max !== undefined && value > field.max) return `Maximum value is ${field.max}`;
  return null;
}

// ---------------------------------------------------------------------------
// Field renderers
// ---------------------------------------------------------------------------

interface FieldWrapperProps {
  readonly label: string;
  readonly description?: string;
  readonly validationError: string | null;
  readonly children: React.ReactNode;
}

function FieldWrapper({ label, description, validationError, children }: FieldWrapperProps): React.ReactElement {
  return (
    <div className={`settings-row config-field-row${validationError ? ' has-error' : ''}`}>
      <div className="settings-label-col">
        <label className="settings-label">{label}</label>
        {description && <span className="settings-description">{description}</span>}
      </div>
      <div className="settings-control-col">
        {children}
        {validationError && (
          <span className="validation-error">{validationError}</span>
        )}
      </div>
    </div>
  );
}

interface StringFieldProps {
  readonly fieldKey: string;
  readonly field: ConfigField;
  readonly value: string;
  readonly onChange: (key: string, value: unknown) => void;
}

function StringField({ fieldKey, field, value, onChange }: StringFieldProps): React.ReactElement {
  const [touched, setTouched] = useState(false);
  const error = touched ? validateStringField(value, field) : null;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(fieldKey, e.target.value);
    },
    [fieldKey, onChange],
  );

  return (
    <FieldWrapper
      label={humanizeKey(fieldKey)}
      description={field.description}
      validationError={error}
    >
      <input
        type="text"
        className={`settings-input${error ? ' input-error' : ''}`}
        value={value}
        placeholder={field.default !== undefined ? String(field.default) : ''}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
      />
      {error === null && touched && value !== '' && (
        <span className="validation-ok" title="Valid">✓</span>
      )}
    </FieldWrapper>
  );
}

interface NumberFieldProps {
  readonly fieldKey: string;
  readonly field: ConfigField;
  readonly value: number;
  readonly onChange: (key: string, value: unknown) => void;
}

function NumberField({ fieldKey, field, value, onChange }: NumberFieldProps): React.ReactElement {
  const [touched, setTouched] = useState(false);
  const error = touched ? validateNumberField(value, field) : null;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseFloat(e.target.value);
      onChange(fieldKey, isNaN(parsed) ? 0 : parsed);
    },
    [fieldKey, onChange],
  );

  return (
    <FieldWrapper
      label={humanizeKey(fieldKey)}
      description={field.description}
      validationError={error}
    >
      <input
        type="number"
        className={`settings-input${error ? ' input-error' : ''}`}
        value={value}
        min={field.min}
        max={field.max}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
      />
    </FieldWrapper>
  );
}

interface BooleanFieldProps {
  readonly fieldKey: string;
  readonly field: ConfigField;
  readonly value: boolean;
  readonly onChange: (key: string, value: unknown) => void;
}

function BooleanField({ fieldKey, field, value, onChange }: BooleanFieldProps): React.ReactElement {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(fieldKey, e.target.checked);
    },
    [fieldKey, onChange],
  );

  return (
    <FieldWrapper
      label={humanizeKey(fieldKey)}
      description={field.description}
      validationError={null}
    >
      <label className="toggle-label">
        <input
          type="checkbox"
          className="toggle-input"
          checked={value}
          onChange={handleChange}
        />
        <span className="toggle-track" />
        <span className="toggle-text">{value ? 'Enabled' : 'Disabled'}</span>
      </label>
    </FieldWrapper>
  );
}

interface SelectFieldProps {
  readonly fieldKey: string;
  readonly field: ConfigField;
  readonly value: string;
  readonly onChange: (key: string, value: unknown) => void;
}

function SelectField({ fieldKey, field, value, onChange }: SelectFieldProps): React.ReactElement {
  const options = field.enum ?? [];

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(fieldKey, e.target.value);
    },
    [fieldKey, onChange],
  );

  return (
    <FieldWrapper
      label={humanizeKey(fieldKey)}
      description={field.description}
      validationError={null}
    >
      <select className="settings-input" value={value} onChange={handleChange}>
        {!field.required && <option value="">— Select —</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </FieldWrapper>
  );
}

interface MultiSelectFieldProps {
  readonly fieldKey: string;
  readonly field: ConfigField;
  readonly value: readonly string[];
  readonly onChange: (key: string, value: unknown) => void;
}

function MultiSelectField({ fieldKey, field, value, onChange }: MultiSelectFieldProps): React.ReactElement {
  const options = field.enum ?? [];
  const selectedSet = new Set(value);

  const handleToggle = useCallback(
    (opt: string) => {
      const next = selectedSet.has(opt)
        ? value.filter((v) => v !== opt)
        : [...value, opt];
      onChange(fieldKey, next);
    },
    [fieldKey, value, selectedSet, onChange],
  );

  return (
    <FieldWrapper
      label={humanizeKey(fieldKey)}
      description={field.description}
      validationError={null}
    >
      <div className="multiselect-group">
        {options.map((opt) => (
          <label key={opt} className="multiselect-item">
            <input
              type="checkbox"
              checked={selectedSet.has(opt)}
              onChange={() => handleToggle(opt)}
            />
            <span>{opt}</span>
          </label>
        ))}
        {options.length === 0 && (
          <span className="settings-description">No options defined in schema.</span>
        )}
      </div>
    </FieldWrapper>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function PluginConfigRenderer({
  schema,
  values,
  onChange,
}: {
  schema: Record<string, ConfigField>;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}): React.ReactElement {
  const fields = Object.entries(schema);

  if (fields.length === 0) {
    return (
      <p className="settings-description">This plugin has no configurable options.</p>
    );
  }

  return (
    <div className="plugin-config-renderer">
      {fields.map(([key, field]) => {
        const rawValue = key in values ? values[key] : field.default;

        switch (field.type) {
          case 'string':
            return (
              <StringField
                key={key}
                fieldKey={key}
                field={field}
                value={typeof rawValue === 'string' ? rawValue : String(rawValue ?? '')}
                onChange={onChange}
              />
            );

          case 'number':
            return (
              <NumberField
                key={key}
                fieldKey={key}
                field={field}
                value={typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0)}
                onChange={onChange}
              />
            );

          case 'boolean':
            return (
              <BooleanField
                key={key}
                fieldKey={key}
                field={field}
                value={typeof rawValue === 'boolean' ? rawValue : Boolean(rawValue)}
                onChange={onChange}
              />
            );

          case 'select':
            return (
              <SelectField
                key={key}
                fieldKey={key}
                field={field}
                value={typeof rawValue === 'string' ? rawValue : String(rawValue ?? '')}
                onChange={onChange}
              />
            );

          case 'multiselect': {
            const arrValue = Array.isArray(rawValue)
              ? (rawValue as string[])
              : [];
            return (
              <MultiSelectField
                key={key}
                fieldKey={key}
                field={field}
                value={arrValue}
                onChange={onChange}
              />
            );
          }

          default:
            return (
              <div key={key} className="settings-row">
                <span className="settings-label">{humanizeKey(key)}</span>
                <span className="settings-description">
                  Unsupported field type: {(field as ConfigField).type}
                </span>
              </div>
            );
        }
      })}
    </div>
  );
}
