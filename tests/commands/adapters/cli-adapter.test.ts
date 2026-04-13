/**
 * Phase 10 -- CLI Adapter Tests
 * Source: Phase 10 LLD Section 2.13
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { wireCliToRouter } from '../../../src/commands/adapters/cli-adapter.js';
import type { CommandRouter } from '../../../src/commands/router.js';

// ---------------------------------------------------------------------------
// Mock Router
// ---------------------------------------------------------------------------

function createMockRouter(overrides: Partial<CommandRouter> = {}): CommandRouter {
  return {
    dispatch: vi.fn().mockResolvedValue({ success: true, data: { result: 'ok' } }),
    list: vi.fn().mockReturnValue([
      { name: 'run', category: 'task', description: 'Run a task', type: 'command' },
      { name: 'status', category: 'task', description: 'Get status', type: 'query' },
    ]),
    register: vi.fn(),
    dispatchStream: vi.fn(),
    getDefinition: vi.fn(),
    getCategories: vi.fn(),
    size: 2,
    ...overrides,
  } as unknown as CommandRouter;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('wireCliToRouter', () => {
  let program: Command;
  let router: CommandRouter;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    router = createMockRouter();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
  });

  it('adds cmd and cmd-list subcommands to program', () => {
    wireCliToRouter(program, router);
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('cmd');
    expect(commandNames).toContain('cmd-list');
  });

  it('dispatches command with empty input when no --input flag', async () => {
    wireCliToRouter(program, router);
    await program.parseAsync(['node', 'qos', 'cmd', 'run']);
    expect(router.dispatch).toHaveBeenCalledWith('run', {});
  });

  it('dispatches command with parsed JSON input', async () => {
    wireCliToRouter(program, router);
    const input = JSON.stringify({ prompt: 'hello' });
    await program.parseAsync(['node', 'qos', 'cmd', 'run', '-i', input]);
    expect(router.dispatch).toHaveBeenCalledWith('run', { prompt: 'hello' });
  });

  it('outputs raw JSON when --json flag is used', async () => {
    wireCliToRouter(program, router);
    await program.parseAsync(['node', 'qos', 'cmd', 'run', '--json']);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"success": true'),
    );
  });

  it('outputs string data directly for terminal', async () => {
    (router.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: 'plain text output',
    });
    wireCliToRouter(program, router);
    await program.parseAsync(['node', 'qos', 'cmd', 'echo']);
    expect(consoleSpy).toHaveBeenCalledWith('plain text output');
  });

  it('outputs JSON-formatted object data for terminal', async () => {
    wireCliToRouter(program, router);
    await program.parseAsync(['node', 'qos', 'cmd', 'run']);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"result": "ok"'),
    );
  });

  it('prints error and exits on failure', async () => {
    (router.dispatch as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: { code: 'COMMAND_NOT_FOUND', message: 'Unknown command: nope' },
    });
    wireCliToRouter(program, router);
    await expect(
      program.parseAsync(['node', 'qos', 'cmd', 'nope']),
    ).rejects.toThrow('exit');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('COMMAND_NOT_FOUND'),
    );
  });

  it('cmd-list prints all registered commands', async () => {
    wireCliToRouter(program, router);
    await program.parseAsync(['node', 'qos', 'cmd-list']);
    expect(router.list).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('run'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('status'));
  });
});
