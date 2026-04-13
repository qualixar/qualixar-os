// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 7 -- Discord Bot Channel
 *
 * discord.js slash commands: /run, /status, /cost.
 * Export createDiscordBot() factory for testability.
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type Interaction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { Orchestrator } from '../engine/orchestrator.js';
import { formatResult, formatStatus, formatCost, formatError } from './formatters.js';

// ---------------------------------------------------------------------------
// Slash Command Definitions
// ---------------------------------------------------------------------------

function buildSlashCommands(): SlashCommandBuilder[] {
  const run = new SlashCommandBuilder()
    .setName('run')
    .setDescription('Submit a task to Qualixar OS')
    .addStringOption((opt) =>
      opt.setName('prompt').setDescription('The task prompt').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('type').setDescription('Task type').setRequired(false)
        .addChoices(
          { name: 'code', value: 'code' },
          { name: 'research', value: 'research' },
          { name: 'analysis', value: 'analysis' },
          { name: 'creative', value: 'creative' },
          { name: 'custom', value: 'custom' },
        ),
    );

  const status = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check task status')
    .addStringOption((opt) =>
      opt.setName('task_id').setDescription('The task ID').setRequired(true),
    );

  const cost = new SlashCommandBuilder()
    .setName('cost')
    .setDescription('Show cost summary');

  return [run, status, cost] as SlashCommandBuilder[];
}

// ---------------------------------------------------------------------------
// Interaction Handler
// ---------------------------------------------------------------------------

async function handleInteraction(
  orchestrator: Orchestrator,
  interaction: Interaction,
): Promise<void> {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const cmd = interaction as ChatInputCommandInteraction;

  switch (cmd.commandName) {
    case 'run': {
      const prompt = cmd.options.getString('prompt', true);
      const type = cmd.options.getString('type') as 'code' | 'research' | 'analysis' | 'creative' | 'custom' | null;

      await cmd.deferReply();
      try {
        const result = await orchestrator.run({
          prompt,
          type: type ?? undefined,
        });
        const formatted = formatResult(result, 'discord');
        const truncated = formatted.length > 2000
          ? formatted.slice(0, 1997) + '...'
          : formatted;
        await cmd.editReply(truncated);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await cmd.editReply(formatError(new Error(message), 'discord'));
      }
      break;
    }
    case 'status': {
      const taskId = cmd.options.getString('task_id', true);
      try {
        const status = orchestrator.getStatus(taskId);
        await cmd.reply(formatStatus(status, 'discord'));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await cmd.reply(formatError(new Error(message), 'discord'));
      }
      break;
    }
    case 'cost': {
      try {
        const summary = orchestrator.costTracker.getSummary();
        await cmd.reply(formatCost(summary, 'discord'));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await cmd.reply(formatError(new Error(message), 'discord'));
      }
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDiscordBot(
  orchestrator: Orchestrator,
  token: string,
): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.on('interactionCreate', (interaction) => {
    handleInteraction(orchestrator, interaction).catch((err) => {
      console.error('[Discord] Interaction handler error:', err);
    });
  });

  return client;
}

// ---------------------------------------------------------------------------
// Registration + Start
// ---------------------------------------------------------------------------

export async function registerSlashCommands(
  token: string,
  clientId: string,
): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const commands = buildSlashCommands().map((c) => c.toJSON());
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}

export async function startDiscordBot(
  orchestrator: Orchestrator,
  token: string,
): Promise<Client> {
  const client = createDiscordBot(orchestrator, token);
  /* v8 ignore next -- requires real Discord connection */
  await client.login(token);
  /* v8 ignore next -- requires real Discord connection */
  return client;
}

// Export for testing
export { buildSlashCommands, handleInteraction };
