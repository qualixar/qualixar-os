/**
 * Qualixar OS Phase 7 -- Telegram Bot Tests
 *
 * Tests bot command handlers by mocking grammY's Bot class to capture
 * and invoke the command handler callbacks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Orchestrator } from '../../src/engine/orchestrator.js';
import type { TaskResult } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Mock grammY Bot -- capture command handlers
// ---------------------------------------------------------------------------

type CommandHandler = (ctx: any) => Promise<void>;

const commandHandlers = new Map<string, CommandHandler>();

vi.mock('grammy', () => {
  class MockBot {
    token: string;
    api: Record<string, unknown>;

    constructor(token: string) {
      this.token = token;
      this.api = { setMyCommands: vi.fn() };
      commandHandlers.clear();
    }

    command(name: string, handler: CommandHandler): void {
      commandHandlers.set(name, handler);
    }

    on(_filter: string, _handler: CommandHandler): void {
      // No-op for now
    }

    start(): void {
      // No-op -- avoids real network polling
    }
  }

  return { Bot: MockBot };
});

// ---------------------------------------------------------------------------
// Import AFTER mock is set up
// ---------------------------------------------------------------------------

const { createTelegramBot, startTelegramBot } = await import('../../src/channels/telegram-bot.js');

// ---------------------------------------------------------------------------
// Mock Orchestrator
// ---------------------------------------------------------------------------

const mockResult: TaskResult = {
  taskId: 'tg-task-1',
  status: 'completed',
  output: 'Telegram output',
  artifacts: [],
  cost: { total_usd: 0.01, by_model: {}, by_agent: {}, by_category: {}, budget_remaining_usd: 9.99 },
  judges: [],
  teamDesign: null,
  duration_ms: 400,
  metadata: {},
};

function createMockOrchestrator(): Orchestrator {
  return {
    run: vi.fn().mockResolvedValue(mockResult),
    getStatus: vi.fn().mockReturnValue({
      taskId: 'tg-task-1',
      phase: 'run',
      progress: 50,
      currentAgents: [],
      redesignCount: 0,
      costSoFar: 0.01,
      startedAt: '2026-03-30T10:00:00Z',
    }),
    costTracker: {
      getSummary: vi.fn().mockReturnValue({
        total_usd: 0.01,
        by_model: {},
        by_agent: {},
        by_category: {},
        budget_remaining_usd: 9.99,
      }),
    },
    eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  } as unknown as Orchestrator;
}

// ---------------------------------------------------------------------------
// Mock Context Factory
// ---------------------------------------------------------------------------

function createMockCtx(text: string) {
  return {
    reply: vi.fn().mockResolvedValue(undefined),
    message: { text },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Telegram Bot', () => {
  let orchestrator: Orchestrator;

  beforeEach(() => {
    orchestrator = createMockOrchestrator();
    commandHandlers.clear();
  });

  describe('createTelegramBot', () => {
    it('creates a Bot instance', () => {
      const bot = createTelegramBot(orchestrator, 'test-token-123');
      expect(bot).toBeDefined();
    });

    it('registers all 4 command handlers', () => {
      createTelegramBot(orchestrator, 'test-token-123');
      expect(commandHandlers.has('start')).toBe(true);
      expect(commandHandlers.has('run')).toBe(true);
      expect(commandHandlers.has('status')).toBe(true);
      expect(commandHandlers.has('cost')).toBe(true);
    });
  });

  describe('/start command', () => {
    it('replies with welcome message', async () => {
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('start')!;
      const ctx = createMockCtx('/start');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Welcome to Qualixar OS'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/run'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/status'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/cost'));
    });
  });

  describe('/run command', () => {
    it('submits a task and replies with result', async () => {
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('run')!;
      const ctx = createMockCtx('/run Write hello world');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('Task submitted. Processing...');
      expect(orchestrator.run).toHaveBeenCalledWith({ prompt: 'Write hello world' });
      // Second reply is the formatted result
      expect(ctx.reply).toHaveBeenCalledTimes(2);
    });

    it('replies with usage when no prompt provided', async () => {
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('run')!;
      const ctx = createMockCtx('/run');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('Usage: /run <your task prompt>');
      expect(orchestrator.run).not.toHaveBeenCalled();
    });

    it('replies with usage when prompt is only spaces', async () => {
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('run')!;
      const ctx = createMockCtx('/run   ');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('Usage: /run <your task prompt>');
    });

    it('handles run error gracefully', async () => {
      (orchestrator.run as any) = vi.fn().mockRejectedValue(new Error('Budget exceeded'));
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('run')!;
      const ctx = createMockCtx('/run test');

      await handler(ctx);

      // Replies: "Task submitted" + error message
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Budget exceeded'));
    });

    it('handles non-Error throw in run', async () => {
      (orchestrator.run as any) = vi.fn().mockRejectedValue('string error');
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('run')!;
      const ctx = createMockCtx('/run test');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('string error'));
    });

    it('handles missing message.text', async () => {
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('run')!;
      const ctx = { reply: vi.fn(), message: undefined };

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('Usage: /run <your task prompt>');
    });
  });

  describe('/status command', () => {
    it('replies with task status', async () => {
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('status')!;
      const ctx = createMockCtx('/status tg-task-1');

      await handler(ctx);

      expect(orchestrator.getStatus).toHaveBeenCalledWith('tg-task-1');
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('tg-task-1'),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('replies with usage when no taskId', async () => {
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('status')!;
      const ctx = createMockCtx('/status');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('Usage: /status <taskId>');
    });

    it('handles status error', async () => {
      (orchestrator.getStatus as any) = vi.fn().mockImplementation(() => {
        throw new Error('Not found');
      });
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('status')!;
      const ctx = createMockCtx('/status bad-id');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Not found'));
    });

    it('handles non-Error throw in status', async () => {
      (orchestrator.getStatus as any) = vi.fn().mockImplementation(() => {
        throw 'string status error';
      });
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('status')!;
      const ctx = createMockCtx('/status bad-id');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('string status error'));
    });
  });

  describe('/cost command', () => {
    it('replies with cost summary', async () => {
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('cost')!;
      const ctx = createMockCtx('/cost');

      await handler(ctx);

      expect(orchestrator.costTracker.getSummary).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ parse_mode: 'Markdown' }),
      );
    });

    it('handles cost error', async () => {
      (orchestrator.costTracker.getSummary as any) = vi.fn().mockImplementation(() => {
        throw new Error('Cost error');
      });
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('cost')!;
      const ctx = createMockCtx('/cost');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Cost error'));
    });

    it('handles non-Error throw in cost', async () => {
      (orchestrator.costTracker as any).getSummary = vi.fn().mockImplementation(() => {
        throw 42;
      });
      createTelegramBot(orchestrator, 'test-token-123');
      const handler = commandHandlers.get('cost')!;
      const ctx = createMockCtx('/cost');

      await handler(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('42'));
    });
  });

  describe('startTelegramBot', () => {
    it('creates bot and calls start()', async () => {
      const bot = await startTelegramBot(orchestrator, 'test-token-123');
      expect(bot).toBeDefined();
    });
  });
});
