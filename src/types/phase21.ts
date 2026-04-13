// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Phase 21: Visual Workflow Builder Types
 *
 * Canvas, node, edge, validation, execution, and undo/redo types.
 * HR-1: Every interface is readonly + immutable.
 */

// ---------------------------------------------------------------------------
// Core Canvas Types
// ---------------------------------------------------------------------------

export type WorkflowNodeType =
  | 'start' | 'agent' | 'tool' | 'condition' | 'loop'
  | 'human_approval' | 'output' | 'merge' | 'transform';

export type PortDirection = 'input' | 'output';

export interface WorkflowPort {
  readonly id: string;
  readonly direction: PortDirection;
  readonly label: string;
  readonly dataType: 'text' | 'json' | 'boolean' | 'any';
  readonly multi: boolean;
}

export interface CanvasPosition {
  readonly x: number;
  readonly y: number;
}

export interface WorkflowNode {
  readonly id: string;
  readonly type: WorkflowNodeType;
  readonly position: CanvasPosition;
  readonly label: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly inputs: readonly WorkflowPort[];
  readonly outputs: readonly WorkflowPort[];
  readonly size: { readonly width: number; readonly height: number };
}

export interface WorkflowEdge {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly sourcePortId: string;
  readonly targetNodeId: string;
  readonly targetPortId: string;
  readonly label: string | null;
  readonly condition: string | null;
}

export interface CanvasViewport {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly zoom: number;
}

export interface WorkflowDocument {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  readonly viewport: CanvasViewport;
  readonly metadata: WorkflowMetadata;
}

export interface WorkflowMetadata {
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly authorRole: 'admin' | 'developer' | 'viewer';
  readonly tags: readonly string[];
  readonly estimatedCostUsd: number;
}

// ---------------------------------------------------------------------------
// Node Type Definitions
// ---------------------------------------------------------------------------

export interface NodeTypeDefinition {
  readonly type: WorkflowNodeType;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly category: 'flow' | 'agent' | 'logic' | 'io';
  readonly color: string;
  readonly configSchema: readonly NodeConfigField[];
  readonly defaultInputs: readonly WorkflowPort[];
  readonly defaultOutputs: readonly WorkflowPort[];
  readonly defaultConfig: Readonly<Record<string, unknown>>;
  readonly maxInstances: number;
}

export interface NodeConfigField {
  readonly name: string;
  readonly label: string;
  readonly type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'json' | 'model-picker' | 'tool-picker';
  readonly required: boolean;
  readonly placeholder: string;
  readonly helpText: string;
  readonly defaultValue: unknown;
  readonly options?: readonly string[];
  readonly validation?: {
    readonly min?: number;
    readonly max?: number;
    readonly pattern?: string;
  };
}

// ---------------------------------------------------------------------------
// Execution State Types
// ---------------------------------------------------------------------------

export type NodeExecutionStatus = 'idle' | 'pending' | 'running' | 'complete' | 'error' | 'skipped';

export interface NodeExecutionState {
  readonly nodeId: string;
  readonly status: NodeExecutionStatus;
  readonly output: string | null;
  readonly error: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly costUsd: number;
  readonly latencyMs: number;
}

export interface WorkflowExecutionState {
  readonly workflowId: string;
  readonly runId: string;
  readonly status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly nodeStates: Readonly<Record<string, NodeExecutionState>>;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly totalCostUsd: number;
  readonly finalOutput: string | null;
}

export interface WorkflowRunInput {
  readonly workflowId: string;
  readonly prompt: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

export interface ConnectionRule {
  readonly sourceType: WorkflowNodeType;
  readonly sourcePort: string;
  readonly targetType: WorkflowNodeType;
  readonly targetPort: string;
  readonly allowed: boolean;
  readonly reason: string;
}

export interface WorkflowValidationResult {
  readonly valid: boolean;
  readonly errors: readonly WorkflowValidationError[];
  readonly warnings: readonly WorkflowValidationWarning[];
}

export interface WorkflowValidationError {
  readonly code: string;
  readonly message: string;
  readonly nodeId: string | null;
  readonly edgeId: string | null;
}

export interface WorkflowValidationWarning {
  readonly code: string;
  readonly message: string;
  readonly nodeId: string | null;
}

export type ConnectionMatrix = Readonly<
  Record<WorkflowNodeType, Readonly<Record<WorkflowNodeType, boolean>>>
>;

// ---------------------------------------------------------------------------
// Undo/Redo Types
// ---------------------------------------------------------------------------

export interface CanvasCommand {
  readonly type: string;
  readonly description: string;
  readonly timestamp: string;
  readonly apply: (doc: WorkflowDocument) => WorkflowDocument;
  readonly undo: (doc: WorkflowDocument) => WorkflowDocument;
}

export interface CanvasHistory {
  readonly undoStack: readonly CanvasCommand[];
  readonly redoStack: readonly CanvasCommand[];
  readonly maxSize: number;
}

// ---------------------------------------------------------------------------
// API Types
// ---------------------------------------------------------------------------

export interface CreateWorkflowRequest {
  readonly name: string;
  readonly description: string;
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
}

export interface UpdateWorkflowRequest {
  readonly name?: string;
  readonly description?: string;
  readonly nodes?: readonly WorkflowNode[];
  readonly edges?: readonly WorkflowEdge[];
  readonly tags?: readonly string[];
}

export interface RunWorkflowRequest {
  readonly prompt: string;
  readonly variables?: Readonly<Record<string, string>>;
  readonly dryRun?: boolean;
}

export interface WorkflowSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly tags: readonly string[];
  readonly estimatedCostUsd: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastRunAt: string | null;
  readonly lastRunStatus: 'completed' | 'failed' | null;
}
