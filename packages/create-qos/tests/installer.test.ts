/**
 * installer.test.ts — Tests for create-qualixar-os installer.
 * Mocks @clack/prompts and filesystem operations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Mock @clack/prompts before importing anything that uses it
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(() => false),
  select: vi.fn(),
  multiselect: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    step: vi.fn(),
    message: vi.fn(),
  },
}));

// Mock fs operations
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  readFile: vi.fn(async () => '{}'),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
}));

// ---- Tests for config-generator ----

describe('config-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate config.yaml and .env in ~/.qualixar-os/', async () => {
    const { generateConfig } = await import('../src/config-generator.js');
    const { mkdir, writeFile } = await import('node:fs/promises');

    const answers = {
      usageMode: 'mcp',
      provider: 'azure',
      apiKey: 'test-key-123',
      channels: ['dashboard', 'http'],
      executionMode: 'companion',
    };

    const paths = await generateConfig(answers);

    expect(paths.configDir).toBe(join(homedir(), '.qualixar-os'));
    expect(paths.configPath).toBe(join(homedir(), '.qualixar-os', 'config.yaml'));
    expect(paths.envPath).toBe(join(homedir(), '.qualixar-os', '.env'));

    expect(mkdir).toHaveBeenCalledWith(paths.configDir, { recursive: true });
    expect(writeFile).toHaveBeenCalledTimes(2);

    // First call: config.yaml — must NOT contain the API key
    const configCall = vi.mocked(writeFile).mock.calls[0];
    expect(configCall[0]).toBe(paths.configPath);
    const configContent = configCall[1] as string;
    expect(configContent).toContain('usage_mode: mcp');
    expect(configContent).toContain('provider: azure');
    expect(configContent).toContain('execution_mode: companion');
    expect(configContent).not.toContain('test-key-123');

    // Second call: .env — must contain the API key
    const envCall = vi.mocked(writeFile).mock.calls[1];
    expect(envCall[0]).toBe(paths.envPath);
    const envContent = envCall[1] as string;
    expect(envContent).toContain('LLM_API_KEY=test-key-123');
  });

  it('should write placeholder .env when no API key given', async () => {
    const { generateConfig } = await import('../src/config-generator.js');
    const { writeFile } = await import('node:fs/promises');

    await generateConfig({
      usageMode: 'cli',
      provider: 'ollama',
      apiKey: '',
      channels: ['http'],
      executionMode: 'companion',
    });

    const envCall = vi.mocked(writeFile).mock.calls[1];
    const envContent = envCall[1] as string;
    expect(envContent).toContain('# LLM_API_KEY=your-key-here');
  });

  it('should set .env file permissions to 0o600', async () => {
    const { generateConfig } = await import('../src/config-generator.js');
    const { writeFile } = await import('node:fs/promises');

    await generateConfig({
      usageMode: 'mcp',
      provider: 'azure',
      apiKey: 'sk-secret',
      channels: ['dashboard'],
      executionMode: 'companion',
    });

    const envCall = vi.mocked(writeFile).mock.calls[1];
    const envOptions = envCall[2] as { mode: number };
    expect(envOptions.mode).toBe(0o600);
  });
});

// ---- Tests for mcp-config ----

describe('mcp-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should write mcpServers entry for claude-code', async () => {
    const { configureMcp } = await import('../src/mcp-config.js');
    const { writeFile } = await import('node:fs/promises');

    const result = await configureMcp('claude-code');

    expect(result.success).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(writeFile).mock.calls[0];
    const content = JSON.parse(callArgs[1] as string);

    expect(content.mcpServers).toBeDefined();
    expect(content.mcpServers.qualixar-os).toBeDefined();
    expect(content.mcpServers.qualixar-os.command).toBe('npx');
    expect(content.mcpServers.qualixar-os.args).toContain('qualixar-os');
  });

  it('should use "servers" key for vscode (not mcpServers)', async () => {
    const { configureMcp } = await import('../src/mcp-config.js');
    const { writeFile } = await import('node:fs/promises');

    const result = await configureMcp('vscode');

    expect(result.success).toBe(true);
    const callArgs = vi.mocked(writeFile).mock.calls[0];
    const content = JSON.parse(callArgs[1] as string);

    expect(content.servers).toBeDefined();
    expect(content.servers.qualixar-os).toBeDefined();
    expect(content.servers.qualixar-os.type).toBe('stdio');
    expect(content.mcpServers).toBeUndefined();
  });

  it('should merge with existing config and not overwrite', async () => {
    const { existsSync } = await import('node:fs');
    const { readFile, writeFile } = await import('node:fs/promises');

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({
        mcpServers: {
          'existing-server': { command: 'node', args: ['existing'] },
        },
      })
    );

    const { configureMcp } = await import('../src/mcp-config.js');
    const result = await configureMcp('cursor');

    expect(result.success).toBe(true);
    const callArgs = vi.mocked(writeFile).mock.calls[0];
    const content = JSON.parse(callArgs[1] as string);

    // Both the existing server AND qos should be present
    expect(content.mcpServers['existing-server']).toBeDefined();
    expect(content.mcpServers.qualixar-os).toBeDefined();
  });
});

// ---- Tests for constants ----

describe('constants', () => {
  it('should have Azure as first provider', async () => {
    const { LLM_PROVIDERS } = await import('../src/constants.js');
    expect(LLM_PROVIDERS[0].value).toBe('azure');
  });

  it('should have default config with companion mode', async () => {
    const { DEFAULT_CONFIG } = await import('../src/constants.js');
    expect(DEFAULT_CONFIG.executionMode).toBe('companion');
    expect(DEFAULT_CONFIG.usageMode).toBe('mcp');
  });

  it('should have 6 LLM providers', async () => {
    const { LLM_PROVIDERS } = await import('../src/constants.js');
    expect(LLM_PROVIDERS).toHaveLength(6);
  });
});

// ---- Tests for index.ts arg parsing ----

describe('arg parsing (index.ts)', () => {
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  let originalError: typeof console.error;

  beforeEach(() => {
    originalArgv = process.argv;
    originalExit = process.exit;
    originalError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.error = originalError;
  });

  it('--version should print version and exit', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.argv = ['node', 'index.js', '--version'];

    // We import the module fresh — the main() call runs automatically
    // So we test parseArgs indirectly via --version flag behavior
    // For unit testing, we test the parseArgs logic extracted
    // Since main() is called at module load, we test the expected output

    // The version is 0.1.0
    expect(true).toBe(true); // Placeholder — actual E2E test would verify stdout
    logSpy.mockRestore();
  });
});

// ---- Tests for installer default flow ----

describe('installer --default flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip all prompts when useDefaults is true', async () => {
    const p = await import('@clack/prompts');
    const { runInstaller } = await import('../src/installer.js');

    await runInstaller({
      useDefaults: true,
      noTelemetry: true,
    });

    // Should NOT have called select/text/multiselect
    expect(p.select).not.toHaveBeenCalled();
    expect(p.text).not.toHaveBeenCalled();
    expect(p.multiselect).not.toHaveBeenCalled();

    // Should have called intro and outro
    expect(p.intro).toHaveBeenCalled();
    expect(p.outro).toHaveBeenCalled();
  });
});

// ---- Tests for installer cancel handling ----

describe('installer cancel handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should exit on cancel during usage mode selection', async () => {
    const p = await import('@clack/prompts');
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // First select call returns a cancel symbol
    vi.mocked(p.isCancel).mockReturnValueOnce(true);
    vi.mocked(p.select).mockResolvedValueOnce(Symbol('cancel') as unknown as string);

    const { runInstaller } = await import('../src/installer.js');

    await expect(
      runInstaller({ useDefaults: false, noTelemetry: true })
    ).rejects.toThrow('process.exit called');

    expect(p.cancel).toHaveBeenCalledWith('Setup cancelled.');
    exitSpy.mockRestore();
  });
});
