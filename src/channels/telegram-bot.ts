// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- Telegram Bot Channel
 *
 * grammY-based Telegram bot with 4 commands: /start, /run, /status, /cost.
 * Export createTelegramBot() factory for testability.
 */

import { Bot } from 'grammy';
import type { Orchestrator } from '../engine/orchestrator.js';
import { formatResult, formatStatus, formatCost, formatError } from './formatters.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTelegramBot(
  orchestrator: Orchestrator,
  token: string,
): Bot {
  const bot = new Bot(token);

  // /start - Welcome message
  bot.command('start', async (ctx) => {
    await ctx.reply(
      'Welcome to Qualixar OS! Available commands:\n' +
      '/run <prompt> - Submit a task\n' +
      '/status <taskId> - Check task status\n' +
      '/cost - Show cost summary',
    );
  });

  // /run <prompt> - Submit a task
  bot.command('run', async (ctx) => {
    const prompt = ctx.message?.text?.replace(/^\/run\s*/, '').trim();
    if (!prompt) {
      await ctx.reply('Usage: /run <your task prompt>');
      return;
    }

    try {
      await ctx.reply('Task submitted. Processing...');
      const result = await orchestrator.run({ prompt });
      const formatted = formatResult(result, 'telegram');
      await ctx.reply(formatted, { parse_mode: 'Markdown' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(formatError(new Error(message), 'telegram'));
    }
  });

  // /status <taskId> - Check task status
  bot.command('status', async (ctx) => {
    const taskId = ctx.message?.text?.replace(/^\/status\s*/, '').trim();
    if (!taskId) {
      await ctx.reply('Usage: /status <taskId>');
      return;
    }

    try {
      const status = orchestrator.getStatus(taskId);
      const formatted = formatStatus(status, 'telegram');
      await ctx.reply(formatted, { parse_mode: 'Markdown' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(formatError(new Error(message), 'telegram'));
    }
  });

  // /cost - Show cost summary
  bot.command('cost', async (ctx) => {
    try {
      const summary = orchestrator.costTracker.getSummary();
      const formatted = formatCost(summary, 'telegram');
      await ctx.reply(formatted, { parse_mode: 'Markdown' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(formatError(new Error(message), 'telegram'));
    }
  });

  return bot;
}

// ---------------------------------------------------------------------------
// Starter
// ---------------------------------------------------------------------------

export async function startTelegramBot(
  orchestrator: Orchestrator,
  token: string,
): Promise<Bot> {
  const bot = createTelegramBot(orchestrator, token);
  bot.start();
  return bot;
}
