// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 6 -- Bootstrap
 * LLD Section 2.5
 *
 * Wire ALL 32 core components via DI in strict dependency order.
 * No global singletons -- all components are const locals.
 *
 * Component count: 32 core (active) + 5 extension slots (commented) = 37 total.
 */

import type { QosConfig } from './types/common.js';
import type { Orchestrator } from './engine/orchestrator.js';

// Phase 0: Foundation
import { createLogger } from './utils/logger.js';
import { createDatabase } from './db/database.js';
import { createEventBus } from './events/event-bus.js';
import { createConfigManager } from './config/config-manager.js';

// Phase 1: Core Engine
import { createModeEngine } from './engine/mode-engine.js';
import { createCostTracker } from './cost/cost-tracker.js';
import { createBudgetChecker } from './cost/budget-checker.js';
import { createBudgetOptimizer } from './cost/budget-optimizer.js';
import { createModelCall } from './router/model-call.js';
import { createModelRouter } from './router/model-router.js';

// Phase 2: Security
import { CredentialVaultImpl } from './security/credential-vault.js';
import { PolicyEngineImpl } from './security/policy-engine.js';
import { FilesystemSandboxImpl } from './security/filesystem-sandbox.js';
import { ContainerManagerImpl } from './security/container-manager.js';
import { InferenceGuardImpl } from './security/inference-guard.js';
import { SkillScannerImpl } from './security/skill-scanner.js';
import { AuditLoggerImpl } from './security/audit-logger.js';
import { SecurityEngineImpl } from './security/security-engine.js';

// Phase 3: Quality + RL
import { createDriftDetector } from './quality/drift-detector.js';
import { createAntiFabrication } from './quality/anti-fabrication.js';
import { createIssueExtractor } from './quality/issue-extractor.js';
import { createRewardAggregator } from './quality/reward-aggregator.js';
import { createConsensusEngine } from './quality/consensus.js';
import { createStrategyMemory } from './quality/strategy-memory.js';
import { createStrategyScorer } from './quality/strategy-scorer.js';
import { createLocalJudgeAdapter } from './quality/local-judge-adapter.js';
import { createJudgePipeline } from './quality/judge-pipeline.js';

// Phase 4: Multi-Agent
import { createMsgHub } from './agents/msghub.js';
import { createAgentRegistry } from './agents/agent-registry.js';
import { createScheduler } from './agents/scheduler.js';
import { createSimulationEngine } from './agents/simulation-engine.js';
import { createHandoffRouter } from './agents/handoff-router.js';
import { createSwarmEngine } from './agents/swarm-engine.js';
import { createForge } from './agents/forge.js';
import { createAutoSwarmBuilder } from './agents/auto-swarm-builder.js';

// Phase 3b: Pivot 2 Quality Monitors
import { createGoodhartDetector } from './quality/goodhart-detector.js';
import { createDriftMonitor } from './quality/drift-bounds.js';
import { createTrilemmaGuard } from './quality/trilemma-guard.js';
import { createBehavioralContractManager } from './quality/behavioral-contracts.js';
import { createForgeContractsIntegration } from './quality/forge-contracts-integration.js';
import { wireGoodhartToEventBus } from './quality/goodhart-wiring.js';
import { wireDriftToEventBus } from './quality/drift-wiring.js';
import { wireTrilemmaToEventBus, wireContractsToEventBus } from './quality/trilemma-contracts-wiring.js';

// Phase 4b: Tools
import { createToolRegistry } from './tools/tool-registry.js';

// Phase 5: Memory
import { createSLMLite } from './memory/index.js';

// Phase 6: Orchestrator
import { SteeringImpl } from './engine/steering.js';
import { DurabilityImpl } from './engine/durability.js';
import { OutputEngineImpl } from './engine/output-engine.js';
import { OrchestratorImpl } from './engine/orchestrator.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a fully wired Qualixar OS Orchestrator from config.
 *
 * 32 core components instantiated in strict dependency order.
 * No global state -- every component is a const local.
 */
export function createQos(config: QosConfig): Orchestrator {
  // -- Phase 0: Foundation (Components 1-4) --
  const logger = createLogger(config.observability.log_level);       // 1
  const db = createDatabase(config.db.path);                         // 2
  db.runMigrations();
  const eventBus = createEventBus(db);                               // 3
  const configManager = createConfigManager(config);                 // 4

  // -- Phase 1: Core Engine (Components 5-10) --
  const modeEngine = createModeEngine(configManager, eventBus);      // 5
  const costTracker = createCostTracker(db);                         // 6
  const budgetChecker = createBudgetChecker(configManager, costTracker); // 7
  const budgetOptimizer = createBudgetOptimizer();                   // 8
  const modelCall = createModelCall(configManager, costTracker, logger); // 9
  const modelRouter = createModelRouter(                             // 10
    modeEngine, modelCall, costTracker, budgetChecker, budgetOptimizer, db, eventBus,
  );

  // -- Phase 2: Security (Components 11-18) --
  const credentialVault = new CredentialVaultImpl(configManager);     // 11
  const policyEngine = new PolicyEngineImpl(configManager);          // 12
  const filesystemSandbox = new FilesystemSandboxImpl(configManager); // 13
  const containerManager = new ContainerManagerImpl(configManager, logger); // 14
  const inferenceGuard = new InferenceGuardImpl(modelRouter);        // 15
  const skillScanner = new SkillScannerImpl();                       // 16
  const auditLogger = new AuditLoggerImpl(db, eventBus);             // 17
  const securityEngine = new SecurityEngineImpl(                     // 18
    containerManager, credentialVault, filesystemSandbox, policyEngine,
    inferenceGuard, skillScanner, auditLogger,
  );

  // -- Phase 3: Quality + RL (Components 19-27) --
  const driftDetector = createDriftDetector(db, eventBus);           // 19
  const antiFabrication = createAntiFabrication(modelRouter, db, eventBus); // 20
  const issueExtractor = createIssueExtractor(modelRouter);          // 21
  const rewardAggregator = createRewardAggregator();                 // 22
  const consensusEngine = createConsensusEngine();                   // 23
  const strategyMemory = createStrategyMemory(db);                   // 24
  const strategyScorer = createStrategyScorer(strategyMemory, db, eventBus);   // 25
  const localJudgeAdapter = createLocalJudgeAdapter(                 // 26
    { getConfig: () => configManager.get() },
  );
  const judgePipeline = createJudgePipeline(                         // 27
    modelRouter, consensusEngine, issueExtractor, driftDetector,
    antiFabrication, localJudgeAdapter, modeEngine, eventBus, db,
  );

  // -- Phase 3b: Pivot 2 Quality Monitors (Components 27a-27e) --
  const goodhartDetector = createGoodhartDetector();                  // 27a
  const driftMonitor = createDriftMonitor();                          // 27b
  const trilemmaGuard = createTrilemmaGuard(eventBus);                // 27c
  const behavioralContracts = createBehavioralContractManager(eventBus); // 27d
  const _forgeContracts = createForgeContractsIntegration(            // 27e
    behavioralContracts, eventBus,
  );

  // Wire quality monitors to EventBus (auto-start on judge/forge events)
  wireGoodhartToEventBus(goodhartDetector, eventBus);
  wireDriftToEventBus(driftMonitor, eventBus);
  wireTrilemmaToEventBus(trilemmaGuard, eventBus);
  wireContractsToEventBus(behavioralContracts, eventBus);

  // -- Phase 4: Multi-Agent (Components 28a-28h) --
  const msgHub = createMsgHub(eventBus);                             // 28a
  const agentRegistry = createAgentRegistry(db, eventBus);           // 28b
  const _taskScheduler = createScheduler();                          // 28c (not wired to orchestrator)
  const simulationEngine = createSimulationEngine(                   // 28d
    modelRouter, containerManager, eventBus, db,
  );
  const handoffRouter = createHandoffRouter(msgHub, agentRegistry, eventBus); // 28f
  const toolRegistry = createToolRegistry(eventBus, filesystemSandbox, { includeExtended: true }); // 28f.5 (C-01) — sandbox enables REAL file I/O
  const swarmEngine = createSwarmEngine(                             // 28g
    msgHub, handoffRouter, agentRegistry, modeEngine, modelRouter, eventBus, toolRegistry,
  );
  const forge = createForge(                                         // 28h
    modelRouter, strategyMemory, strategyScorer, modeEngine, db, eventBus,
  );
  const _autoSwarmBuilder = createAutoSwarmBuilder(modelRouter, forge); // 28e (not wired to orchestrator)

  // -- Phase 5: Memory (Component 29) --
  const slmLite = createSLMLite(db, modelRouter, eventBus, configManager); // 29

  // -- Phase 6: Orchestrator (Components 30-32) --
  const steering = new SteeringImpl(eventBus);                       // 30
  const durability = new DurabilityImpl(db);                         // 31
  const outputEngine = new OutputEngineImpl(configManager);          // 32
  const orchestrator = new OrchestratorImpl(
    modeEngine, modelRouter, securityEngine, judgePipeline, strategyScorer,
    forge, swarmEngine, simulationEngine, slmLite, steering, durability,
    outputEngine, costTracker, budgetChecker, eventBus, agentRegistry, db, logger,
  );

  // -- Extension Slots --
  // Phase 8b components are created at the channel layer (http-server, cli)
  // where they're needed, not in bootstrap, to avoid changing the return type.
  // Usage: import { createMcpConsumer } from './compatibility/mcp-consumer.js';
  //        import { createA2AServer } from './compatibility/a2a-server.js';
  //        import { createA2AClient } from './compatibility/a2a-client.js';
  // 33. const mcpConsumer = createMcpConsumer(eventBus, logger);             // Phase 8b ✓
  // 34. const a2aServer = createA2AServer(orchestrator, eventBus, ...);     // Phase 8b ✓
  // 35. const a2aClient = createA2AClient(eventBus, logger, db);            // Phase 8b ✓
  // 36. const metricsCollector = new MetricsCollector();                     // Phase 9
  // 37. const spanHelpers = new SpanHelpers();                              // Phase 9

  return orchestrator;
}
