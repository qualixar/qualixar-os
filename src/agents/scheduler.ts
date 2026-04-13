// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 4 -- Scheduler
 * Priority queue with DAG decomposition and topological sort.
 *
 * LLD: phase4-multi-agent-lld.md Section 2.6
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchedulerTask {
  readonly id: string;
  readonly priority: number;
  readonly dependsOn: readonly string[];
  readonly status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
}

export interface SchedulerResult {
  readonly executionOrder: readonly string[];
  readonly levels: readonly (readonly string[])[];
  readonly hasCycles: boolean;
}

// ---------------------------------------------------------------------------
// Public Interface
// ---------------------------------------------------------------------------

export interface Scheduler {
  addTask(task: SchedulerTask): void;
  removeTask(taskId: string): void;
  getExecutionOrder(): SchedulerResult;
  getNextReady(): SchedulerTask | undefined;
  markCompleted(taskId: string): void;
  markFailed(taskId: string): void;
  getTask(taskId: string): SchedulerTask | undefined;
  getTasks(): readonly SchedulerTask[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class SchedulerImpl implements Scheduler {
  private readonly _tasks: Map<string, SchedulerTask>;

  constructor() {
    this._tasks = new Map();
  }

  addTask(task: SchedulerTask): void {
    if (!task.id || task.id.trim() === '') {
      throw new Error('Task id must be a non-empty string');
    }
    if (this._tasks.has(task.id)) {
      throw new Error(`Duplicate task: '${task.id}'`);
    }
    this._tasks.set(task.id, task);
  }

  removeTask(taskId: string): void {
    if (!this._tasks.has(taskId)) {
      throw new Error(`Task '${taskId}' not found`);
    }
    this._tasks.delete(taskId);
  }

  getExecutionOrder(): SchedulerResult {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const task of this._tasks.values()) {
      inDegree.set(task.id, task.dependsOn.length);
      if (!adjacency.has(task.id)) {
        adjacency.set(task.id, []);
      }
      for (const dep of task.dependsOn) {
        if (!this._tasks.has(dep)) {
          throw new Error(`Task '${task.id}' depends on missing task '${dep}'`);
        }
        if (!adjacency.has(dep)) {
          adjacency.set(dep, []);
        }
        adjacency.get(dep)!.push(task.id);
      }
    }

    const executionOrder: string[] = [];
    const levels: string[][] = [];
    let processed = 0;

    let currentLevel: string[] = [];
    for (const [taskId, degree] of inDegree.entries()) {
      if (degree === 0) {
        currentLevel.push(taskId);
      }
    }
    currentLevel.sort((a, b) => {
      const tA = this._tasks.get(a)!;
      const tB = this._tasks.get(b)!;
      return tA.priority - tB.priority;
    });

    while (currentLevel.length > 0) {
      levels.push([...currentLevel]);
      const nextLevel: string[] = [];

      for (const taskId of currentLevel) {
        executionOrder.push(taskId);
        processed++;
        for (const neighbor of adjacency.get(taskId) ?? []) {
          const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) {
            nextLevel.push(neighbor);
          }
        }
      }

      nextLevel.sort((a, b) => {
        const tA = this._tasks.get(a)!;
        const tB = this._tasks.get(b)!;
        return tA.priority - tB.priority;
      });
      currentLevel = nextLevel;
    }

    if (processed !== this._tasks.size) {
      return { executionOrder: [], levels: [], hasCycles: true };
    }

    return { executionOrder, levels, hasCycles: false };
  }

  getNextReady(): SchedulerTask | undefined {
    const tasks = Array.from(this._tasks.values())
      .filter((t) => t.status === 'ready')
      .sort((a, b) => a.priority - b.priority);
    return tasks[0];
  }

  markCompleted(taskId: string): void {
    const task = this._tasks.get(taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }
    this._tasks.set(taskId, { ...task, status: 'completed' });
    this._updateDependents(taskId);
  }

  markFailed(taskId: string): void {
    const task = this._tasks.get(taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }
    this._tasks.set(taskId, { ...task, status: 'failed' });
    this._cascadeFailure(taskId);
  }

  getTask(taskId: string): SchedulerTask | undefined {
    return this._tasks.get(taskId);
  }

  getTasks(): readonly SchedulerTask[] {
    return Array.from(this._tasks.values());
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _updateDependents(completedTaskId: string): void {
    for (const task of this._tasks.values()) {
      if (task.dependsOn.includes(completedTaskId) && task.status === 'pending') {
        const allDepsCompleted = task.dependsOn.every((dep) => {
          const depTask = this._tasks.get(dep);
          return depTask?.status === 'completed';
        });
        if (allDepsCompleted) {
          this._tasks.set(task.id, { ...task, status: 'ready' });
        }
      }
    }
  }

  private _cascadeFailure(failedTaskId: string): void {
    const adjacency = new Map<string, string[]>();
    for (const task of this._tasks.values()) {
      for (const dep of task.dependsOn) {
        if (!adjacency.has(dep)) {
          adjacency.set(dep, []);
        }
        adjacency.get(dep)!.push(task.id);
      }
    }

    const queue = [failedTaskId];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dep of adjacency.get(current) ?? []) {
        const depTask = this._tasks.get(dep);
        if (depTask && depTask.status !== 'failed' && depTask.status !== 'completed') {
          this._tasks.set(dep, { ...depTask, status: 'failed' });
          queue.push(dep);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createScheduler(): Scheduler {
  return new SchedulerImpl();
}
