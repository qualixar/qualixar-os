// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Public Entry Point
 *
 * Single factory export + all public type re-exports.
 * Consumers: import { createQos } from 'qualixar-os';
 */

// -- Factory --
export { createQos } from './bootstrap.js';

// -- Programmatic API (library usage) --
export { createQosInstance } from './api.js';
export type { QosLibConfig, QosInstance, ModelSummary } from './api.js';

// -- Core Types --
export type {
  QosConfig,
  QosMode,
  TaskOptions,
  TaskResult,
  Artifact,
  CostSummary,
  CostEntry,
  ModelCallEntry,
  BudgetStatus,
  ModelRequest,
  ModelResponse,
  FeatureGates,
  TeamDesign,
  AgentRole,
  JudgeVerdict,
  JudgeIssue,
  JudgeProfile,
  ConsensusResult,
  EvalCriterion,
  SecurityAction,
  SecurityDecision,
  QosEvent,
} from './types/common.js';

export { QosConfigSchema } from './types/common.js';

export type { QosEventType } from './types/events.js';

// -- Phase 6 Types --
export type { Orchestrator, TaskStatus } from './engine/orchestrator.js';
export type { Steering, SteeringState } from './engine/steering.js';
export type { Durability, DurableState } from './engine/durability.js';
export type { OutputEngine, OutputChannel, FormattedOutput } from './engine/output-engine.js';
