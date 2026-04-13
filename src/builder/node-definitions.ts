// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 21 -- Node Type Definitions
 *
 * Canonical definitions for all 9 workflow node types.
 * Each definition specifies ports, config schema, colors, and constraints.
 *
 * HR-1: All interfaces are readonly + immutable.
 * HR-2: No mutation — every definition is Object.freeze'd at runtime.
 */

import type {
  NodeTypeDefinition,
  WorkflowPort,
  NodeConfigField,
} from '../types/phase21.js';

// ---------------------------------------------------------------------------
// Port Factories (helpers to reduce repetition)
// ---------------------------------------------------------------------------

function inputPort(id: string, label: string, dataType: WorkflowPort['dataType'] = 'any', multi = false): WorkflowPort {
  return { id, direction: 'input', label, dataType, multi };
}

function outputPort(id: string, label: string, dataType: WorkflowPort['dataType'] = 'any', multi = false): WorkflowPort {
  return { id, direction: 'output', label, dataType, multi };
}

// ---------------------------------------------------------------------------
// Config Field Factories
// ---------------------------------------------------------------------------

function textField(
  name: string,
  label: string,
  placeholder: string,
  helpText: string,
  required = false,
  defaultValue: unknown = '',
): NodeConfigField {
  return { name, label, type: 'text', required, placeholder, helpText, defaultValue };
}

function textareaField(
  name: string,
  label: string,
  placeholder: string,
  helpText: string,
  required = false,
  defaultValue: unknown = '',
): NodeConfigField {
  return { name, label, type: 'textarea', required, placeholder, helpText, defaultValue };
}

function selectField(
  name: string,
  label: string,
  options: readonly string[],
  helpText: string,
  defaultValue: unknown,
  required = false,
): NodeConfigField {
  return { name, label, type: 'select', required, placeholder: '', helpText, defaultValue, options };
}

function numberField(
  name: string,
  label: string,
  helpText: string,
  defaultValue: number,
  min?: number,
  max?: number,
): NodeConfigField {
  return {
    name, label, type: 'number', required: false,
    placeholder: String(defaultValue), helpText, defaultValue,
    validation: { min, max },
  };
}

function booleanField(
  name: string,
  label: string,
  helpText: string,
  defaultValue: boolean,
): NodeConfigField {
  return { name, label, type: 'boolean', required: false, placeholder: '', helpText, defaultValue };
}

function modelPickerField(
  name: string,
  label: string,
  helpText: string,
  defaultValue: string,
): NodeConfigField {
  return { name, label, type: 'model-picker', required: false, placeholder: '', helpText, defaultValue };
}

function toolPickerField(): NodeConfigField {
  return {
    name: 'tools',
    label: 'Allowed Tools',
    type: 'tool-picker',
    required: false,
    placeholder: '',
    helpText: 'Select tools this node may invoke',
    defaultValue: [],
  };
}

// ---------------------------------------------------------------------------
// Node Definitions
// ---------------------------------------------------------------------------

const startNode: NodeTypeDefinition = {
  type: 'start',
  label: 'Start',
  description: 'Entry point of the workflow. Receives the initial prompt and variables.',
  icon: 'play-circle',
  category: 'flow',
  color: '#22c55e',
  maxInstances: 1,
  configSchema: [
    textField('triggerDescription', 'Trigger Description', 'e.g. User submits a task...', 'Human-readable description of what triggers this workflow'),
  ],
  defaultInputs: [],
  defaultOutputs: [
    outputPort('out', 'Output', 'text'),
  ],
  defaultConfig: {
    triggerDescription: '',
  },
};

const agentNode: NodeTypeDefinition = {
  type: 'agent',
  label: 'Agent',
  description: 'Runs an AI agent with a configurable model, system prompt, and tools.',
  icon: 'cpu',
  category: 'agent',
  color: '#3b82f6',
  maxInstances: -1,
  configSchema: [
    textField('name', 'Agent Name', 'e.g. Researcher', 'Display name for this agent role', true, 'Agent'),
    modelPickerField('model', 'Model', 'LLM model to use for this agent', 'claude-sonnet-4-6'),
    textareaField('systemPrompt', 'System Prompt', 'You are a helpful assistant...', 'Instructions that define the agent\'s behavior', true, 'You are a helpful assistant.'),
    toolPickerField(),
    numberField('maxTokens', 'Max Tokens', 'Maximum output tokens', 4096, 1, 32000),
    numberField('temperature', 'Temperature', 'Sampling temperature (0-1)', 0.7, 0, 1),
  ],
  defaultInputs: [
    inputPort('in', 'Input', 'text'),
  ],
  defaultOutputs: [
    outputPort('out', 'Output', 'text'),
  ],
  defaultConfig: {
    name: 'Agent',
    model: 'claude-sonnet-4-6',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    maxTokens: 4096,
    temperature: 0.7,
  },
};

const toolNode: NodeTypeDefinition = {
  type: 'tool',
  label: 'Tool',
  description: 'Invokes a registered Qualixar OS tool directly.',
  icon: 'wrench',
  category: 'agent',
  color: '#8b5cf6',
  maxInstances: -1,
  configSchema: [
    toolPickerField(),
    textareaField('inputTemplate', 'Input Template', '{"query": "{{input}}"}', 'JSON template for tool input. Use {{input}} to reference upstream output.', false, ''),
    booleanField('failOnError', 'Fail on Error', 'Stop workflow if tool throws an error', true),
  ],
  defaultInputs: [
    inputPort('in', 'Input', 'any'),
  ],
  defaultOutputs: [
    outputPort('out', 'Output', 'json'),
  ],
  defaultConfig: {
    tools: [],
    inputTemplate: '',
    failOnError: true,
  },
};

const conditionNode: NodeTypeDefinition = {
  type: 'condition',
  label: 'Condition',
  description: 'Routes execution based on a boolean expression evaluated against upstream output.',
  icon: 'git-branch',
  category: 'logic',
  color: '#f59e0b',
  maxInstances: -1,
  configSchema: [
    textareaField('expression', 'Condition Expression', 'output.includes("error")', 'JavaScript expression that evaluates to true/false. Use `output` to reference upstream text.', true, ''),
    selectField('mode', 'Evaluation Mode', ['contains', 'regex', 'js_expression', 'json_path'], 'How the expression is evaluated', 'contains'),
  ],
  defaultInputs: [
    inputPort('in', 'Input', 'any'),
  ],
  defaultOutputs: [
    outputPort('true', 'True', 'any'),
    outputPort('false', 'False', 'any'),
  ],
  defaultConfig: {
    expression: '',
    mode: 'contains',
  },
};

const loopNode: NodeTypeDefinition = {
  type: 'loop',
  label: 'Loop',
  description: 'Iterates over a list of items or repeats until a condition is met.',
  icon: 'refresh-cw',
  category: 'logic',
  color: '#06b6d4',
  maxInstances: -1,
  configSchema: [
    selectField('loopType', 'Loop Type', ['forEach', 'while', 'times'], 'Type of loop to execute', 'forEach'),
    textField('itemsPath', 'Items Path', 'e.g. $.results[*]', 'JSON path to extract the list of items (for forEach loops)'),
    textField('condition', 'Condition', 'output !== "done"', 'Expression to evaluate for while loop continuation'),
    numberField('maxIterations', 'Max Iterations', 'Safety limit to prevent infinite loops', 10, 1, 100),
    numberField('times', 'Times', 'Number of repetitions (for times loop)', 3, 1, 100),
  ],
  defaultInputs: [
    inputPort('in', 'Input', 'any'),
    inputPort('loop_back', 'Loop Back', 'any'),
  ],
  defaultOutputs: [
    outputPort('item', 'Current Item', 'any'),
    outputPort('done', 'Done', 'any'),
  ],
  defaultConfig: {
    loopType: 'forEach',
    itemsPath: '',
    condition: '',
    maxIterations: 10,
    times: 3,
  },
};

const humanApprovalNode: NodeTypeDefinition = {
  type: 'human_approval',
  label: 'Human Approval',
  description: 'Pauses workflow and waits for a human to approve or reject before continuing.',
  icon: 'user-check',
  category: 'io',
  color: '#ef4444',
  maxInstances: -1,
  configSchema: [
    textField('approverRole', 'Approver Role', 'admin', 'Role required to approve (admin, developer, viewer)', true, 'admin'),
    textareaField('instructions', 'Instructions', 'Please review the output above and approve or reject.', 'Message shown to the human reviewer'),
    numberField('timeoutSeconds', 'Timeout (seconds)', 'Time to wait for approval before auto-rejecting (0 = no timeout)', 0, 0, 86400),
    booleanField('autoApproveOnTimeout', 'Auto-Approve on Timeout', 'If true, auto-approves when timeout expires instead of rejecting', false),
  ],
  defaultInputs: [
    inputPort('in', 'Input', 'any'),
  ],
  defaultOutputs: [
    outputPort('approved', 'Approved', 'any'),
    outputPort('rejected', 'Rejected', 'any'),
  ],
  defaultConfig: {
    approverRole: 'admin',
    instructions: 'Please review the output above and approve or reject.',
    timeoutSeconds: 0,
    autoApproveOnTimeout: false,
  },
};

const outputNode: NodeTypeDefinition = {
  type: 'output',
  label: 'Output',
  description: 'Terminal node that collects the final result of the workflow.',
  icon: 'flag',
  category: 'io',
  color: '#10b981',
  maxInstances: -1,
  configSchema: [
    selectField('format', 'Output Format', ['text', 'json', 'markdown', 'html'], 'Format of the final output', 'text'),
    textField('label', 'Output Label', 'Final Answer', 'Human-readable label for this output', false, 'Final Answer'),
    booleanField('saveToFile', 'Save to File', 'Write output to a file on disk', false),
    textField('filePath', 'File Path', './output.txt', 'Relative path for the saved file (only if Save to File is enabled)'),
  ],
  defaultInputs: [
    inputPort('in', 'Input', 'any'),
  ],
  defaultOutputs: [],
  defaultConfig: {
    format: 'text',
    label: 'Final Answer',
    saveToFile: false,
    filePath: './output.txt',
  },
};

const mergeNode: NodeTypeDefinition = {
  type: 'merge',
  label: 'Merge',
  description: 'Waits for 2 or more parallel branches and combines their outputs.',
  icon: 'git-merge',
  category: 'logic',
  color: '#6366f1',
  maxInstances: -1,
  configSchema: [
    selectField('strategy', 'Merge Strategy', ['concat', 'json_array', 'last_wins', 'custom_template'], 'How to combine outputs from parallel branches', 'concat'),
    textField('separator', 'Separator', '\\n\\n', 'Text separator between outputs (for concat strategy)', false, '\n\n'),
    textareaField('template', 'Template', 'Branch 1: {{input_a}}\nBranch 2: {{input_b}}', 'Template string for custom_template strategy'),
  ],
  defaultInputs: [
    inputPort('in_a', 'Input A', 'any'),
    inputPort('in_b', 'Input B', 'any'),
  ],
  defaultOutputs: [
    outputPort('out', 'Merged Output', 'any'),
  ],
  defaultConfig: {
    strategy: 'concat',
    separator: '\n\n',
    template: '',
  },
};

const transformNode: NodeTypeDefinition = {
  type: 'transform',
  label: 'Transform',
  description: 'Applies a data transformation to reshape or reformat upstream output.',
  icon: 'shuffle',
  category: 'logic',
  color: '#ec4899',
  maxInstances: -1,
  configSchema: [
    selectField('transformType', 'Transform Type', ['json_parse', 'json_stringify', 'extract_field', 'js_expression', 'template', 'truncate'], 'Type of transformation to apply', 'template'),
    textareaField('expression', 'Expression / Template', '{{output.toUpperCase()}}', 'Transform expression or template. Use {{output}} for input data.', false, '{{output}}'),
    textField('fieldPath', 'Field Path', 'data.result', 'JSON path to extract (for extract_field transform)'),
    numberField('maxLength', 'Max Length', 'Truncate output to this many characters (0 = no limit)', 0, 0, 100000),
  ],
  defaultInputs: [
    inputPort('in', 'Input', 'any'),
  ],
  defaultOutputs: [
    outputPort('out', 'Transformed', 'any'),
  ],
  defaultConfig: {
    transformType: 'template',
    expression: '{{output}}',
    fieldPath: '',
    maxLength: 0,
  },
};

// ---------------------------------------------------------------------------
// Exported Catalog
// ---------------------------------------------------------------------------

export const NODE_TYPE_DEFINITIONS: readonly NodeTypeDefinition[] = Object.freeze([
  startNode,
  agentNode,
  toolNode,
  conditionNode,
  loopNode,
  humanApprovalNode,
  outputNode,
  mergeNode,
  transformNode,
]);

/**
 * Look up a node type definition by type string.
 * Returns undefined if the type is not registered.
 */
export function getNodeTypeDefinition(type: string): NodeTypeDefinition | undefined {
  return NODE_TYPE_DEFINITIONS.find((d) => d.type === type);
}
