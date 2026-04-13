// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS V2 -- Q-Learning Router (Meta-Learner)
 *
 * Learns which routing strategy to use per task type via epsilon-greedy
 * Q-learning. Uses a bandit formulation (GAMMA=0) since tasks are
 * independent (no sequential decisions).
 *
 * Source of truth: Phase 1 LLD Section 2.9, REWRITE-SPEC.
 *
 * State encoding: taskTypeHash_modelCountBucket_budgetClass
 * Action space: ['cascade', 'cheapest', 'quality', 'balanced', 'pomdp']
 * Persistence: via EventBus rl:update events stored in SQLite.
 *
 * Hard Rule #7: no global state -- all state via constructor DI.
 * Hard Rule #10: ESM .js extensions on imports.
 */

import type { QosDatabase } from '../db/database.js';
import type { EventBus } from '../events/event-bus.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger(process.env.QOS_LOG_LEVEL ?? 'info').child({ component: 'QLearningRouter' });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Learning rate. */
const ALPHA = 0.1;

/**
 * Discount factor. Set to 0 for pure bandit formulation (M3 note).
 * Tasks are independent -- no sequential state transitions.
 */
const GAMMA = 0.0;

/** Initial exploration rate. */
const EPSILON_START = 0.3;

/** Minimum exploration rate floor. */
const EPSILON_MIN = 0.05;

/** Per-episode exploration decay multiplier. */
const EPSILON_DECAY = 0.995;

/** Available strategy action space. */
const ACTIONS: readonly string[] = [
  'cascade',
  'cheapest',
  'quality',
  'balanced',
  'pomdp',
] as const;

/**
 * Persist Q-table every N episodes to avoid excessive DB writes.
 * LLD: every 10 episodes.
 */
const PERSIST_INTERVAL = 10;

// ---------------------------------------------------------------------------
// Exported Class
// ---------------------------------------------------------------------------

/**
 * Meta-learner that selects which routing strategy to use for a given
 * task context. Used internally by ModelRouter when RL is enabled
 * (power mode).
 *
 * Pattern: Contextual Multi-Armed Bandit -- epsilon-greedy with
 * state-dependent Q-values. Not a full MDP since GAMMA=0.
 */
export class QLearningRouter {
  private readonly _db: QosDatabase;
  private readonly _eventBus: EventBus;
  private _qTable: Map<string, Map<string, number>>;
  private _epsilon: number;
  private _episodeCount: number;

  constructor(db: QosDatabase, eventBus: EventBus) {
    this._db = db;
    this._eventBus = eventBus;
    this._qTable = new Map();
    this._epsilon = EPSILON_START;
    this._episodeCount = 0;

    // Load persisted Q-table from DB (best-effort)
    this._loadQTable();
  }

  // -------------------------------------------------------------------------
  // selectStrategy
  // -------------------------------------------------------------------------

  /**
   * Select a routing strategy for the given task context using
   * epsilon-greedy exploration.
   *
   * @param taskType - Task type identifier (e.g., 'code', 'research')
   * @param modelCount - Number of available models
   * @param budgetRemaining - Remaining budget in USD
   * @returns Selected strategy name from ACTIONS
   */
  selectStrategy(
    taskType: string,
    modelCount: number,
    budgetRemaining: number,
  ): string {
    const stateKey = this._encodeState(taskType, modelCount, budgetRemaining);

    // Epsilon-greedy selection
    const r = Math.random();
    let selected: string;

    if (r < this._epsilon) {
      // Explore: pick random action
      const actionIdx = Math.floor(Math.random() * ACTIONS.length);
      selected = ACTIONS[actionIdx];
    } else {
      // Exploit: pick action with highest Q-value
      selected = this._getBestAction(stateKey);
    }

    // Epsilon decay happens ONLY in recordReward() — not here (H-03 fix)

    return selected;
  }

  // -------------------------------------------------------------------------
  // recordReward
  // -------------------------------------------------------------------------

  /**
   * Record a reward signal for a state-action pair and update Q-values.
   *
   * Uses bandit formulation (GAMMA=0):
   *   Q(s,a) = Q(s,a) + ALPHA * (reward - Q(s,a))
   *
   * @param taskType - Task type identifier
   * @param modelCount - Number of available models
   * @param budgetRemaining - Remaining budget in USD
   * @param strategy - Strategy that was used
   * @param reward - Reward signal in [0, 1]
   */
  recordReward(
    taskType: string,
    modelCount: number,
    budgetRemaining: number,
    strategy: string,
    reward: number,
  ): void {
    const stateKey = this._encodeState(taskType, modelCount, budgetRemaining);

    // Get or create action map for this state
    let actionMap = this._qTable.get(stateKey);
    if (!actionMap) {
      actionMap = new Map<string, number>();
      this._qTable.set(stateKey, actionMap);
    }

    // Current Q-value (default 0)
    const currentQ = actionMap.get(strategy) ?? 0;

    // With GAMMA=0 (bandit), the update simplifies to:
    // Q(s,a) = Q(s,a) + ALPHA * (reward - Q(s,a))
    // No maxQ(s') term needed.
    const newQ = currentQ + ALPHA * (reward - currentQ);

    // Store updated value (immutable pattern: new Map entry)
    actionMap.set(strategy, newQ);

    // Increment episode count and decay epsilon
    this._episodeCount++;
    this._epsilon = Math.max(EPSILON_MIN, this._epsilon * EPSILON_DECAY);

    // Persist Q-table periodically
    if (this._episodeCount % PERSIST_INTERVAL === 0) {
      this._persistQTable();
    }
  }

  // -------------------------------------------------------------------------
  // getQTable
  // -------------------------------------------------------------------------

  /**
   * Return current Q-table as a plain nested object for inspection.
   *
   * @returns Record<stateKey, Record<action, qValue>>
   */
  getQTable(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};

    for (const [state, actions] of this._qTable) {
      const actionObj: Record<string, number> = {};
      for (const [action, value] of actions) {
        actionObj[action] = value;
      }
      result[state] = actionObj;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // getEpsilon
  // -------------------------------------------------------------------------

  /**
   * Return current exploration rate.
   */
  getEpsilon(): number {
    return this._epsilon;
  }

  // -------------------------------------------------------------------------
  // Private: State Encoding
  // -------------------------------------------------------------------------

  /**
   * Encode the task context into a discrete state key.
   *
   * LLD Section 2.9 state space:
   *   taskTypeHash (0-15) + modelCountBucket (few/some/many) + budgetClass (tight/moderate/generous)
   */
  private _encodeState(
    taskType: string,
    modelCount: number,
    budgetRemaining: number,
  ): string {
    const taskTypeHash = _hashCode(taskType);

    const modelCountBucket =
      modelCount <= 2 ? 'few' :
        modelCount <= 5 ? 'some' :
          'many';

    const budgetClass =
      budgetRemaining < 1 ? 'tight' :
        budgetRemaining <= 5 ? 'moderate' :
          'generous';

    return `${taskTypeHash}_${modelCountBucket}_${budgetClass}`;
  }

  // -------------------------------------------------------------------------
  // Private: Best Action
  // -------------------------------------------------------------------------

  /**
   * Return the action with the highest Q-value for a given state.
   * If no Q-values exist, returns 'cascade' as safe default.
   * On tie, returns the first one found (deterministic).
   */
  private _getBestAction(stateKey: string): string {
    const actionMap = this._qTable.get(stateKey);

    if (!actionMap || actionMap.size === 0) {
      return 'cascade';
    }

    let bestAction = 'cascade';
    let bestValue = -Infinity;

    for (const [action, value] of actionMap) {
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  // -------------------------------------------------------------------------
  // Private: Persistence
  // -------------------------------------------------------------------------

  /**
   * Persist Q-table to SQLite via EventBus rl:update event.
   * Best-effort -- errors are logged but not thrown.
   */
  private _persistQTable(): void {
    try {
      const serializedQTable = this.getQTable();

      this._eventBus.emit({
        type: 'rl:update',
        payload: {
          qTable: serializedQTable,
          epsilon: this._epsilon,
          episodeCount: this._episodeCount,
        },
        source: 'QLearningRouter',
      });
    } catch (err: unknown) {
      /* v8 ignore next 2 -- best-effort persist, tested indirectly */
      logger.error({ err }, 'persist error');
    }
  }

  /**
   * Load Q-table from the most recent rl:update event in DB.
   * Best-effort -- starts fresh if no persisted state found.
   */
  private _loadQTable(): void {
    try {
      const row = this._db.get<{ payload: string }>(
        "SELECT payload FROM events WHERE type = 'rl:update' ORDER BY id DESC LIMIT 1",
        [],
      );

      if (!row) {
        return; // No persisted state -- start fresh
      }

      const parsed = JSON.parse(row.payload) as {
        qTable?: Record<string, Record<string, number>>;
        epsilon?: number;
        episodeCount?: number;
      };

      // Restore Q-table
      if (parsed.qTable && typeof parsed.qTable === 'object') {
        this._qTable = new Map();
        for (const [state, actions] of Object.entries(parsed.qTable)) {
          const actionMap = new Map<string, number>();
          for (const [action, value] of Object.entries(actions)) {
            if (typeof value === 'number') {
              actionMap.set(action, value);
            }
          }
          this._qTable.set(state, actionMap);
        }
      }

      // Restore epsilon
      if (typeof parsed.epsilon === 'number') {
        this._epsilon = parsed.epsilon;
      }

      // Restore episode count
      if (typeof parsed.episodeCount === 'number') {
        this._episodeCount = parsed.episodeCount;
      }
    } catch (err: unknown) {
      /* v8 ignore start -- best-effort load, fresh start on corruption */
      logger.error({ err }, 'load error');
      this._qTable = new Map();
      this._epsilon = EPSILON_START;
      this._episodeCount = 0;
      /* v8 ignore stop */
    }
  }
}

// ---------------------------------------------------------------------------
// Private Module-Level Helper
// ---------------------------------------------------------------------------

/**
 * Simple string hash function.
 * Returns a value in [0, 15] (modulo 16).
 *
 * Algorithm per LLD Section 2.9:
 *   hash = ((hash << 5) - hash + charCode) | 0
 *   return abs(hash) % 16
 */
function _hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 16;
}
