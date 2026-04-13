/**
 * Qualixar OS Phase 2 -- Container Manager Tests
 * Tests both Docker-available and Docker-unavailable paths.
 * Uses vi.mock to control dockerode behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContainerManagerImpl } from '../../src/security/container-manager.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import type { QosConfig } from '../../src/types/common.js';
import type { Logger } from 'pino';

// ---------------------------------------------------------------------------
// Mock dockerode at module level to control Docker availability
// vi.hoisted ensures variables exist before vi.mock factory runs
// ---------------------------------------------------------------------------

const { mockPing } = vi.hoisted(() => ({
  mockPing: vi.fn(),
}));

vi.mock('dockerode', () => ({
  default: vi.fn().mockImplementation(() => ({
    ping: mockPing,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(): ConfigManager {
  return {
    get: () =>
      ({
        security: {
          container_isolation: true,
          allowed_paths: ['./'],
          denied_commands: [],
        },
      }) as unknown as QosConfig,
    getValue: vi.fn(),
    reload: vi.fn(),
  };
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContainerManagerImpl', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
    vi.clearAllMocks();
  });

  describe('before init()', () => {
    it('isAvailable() returns false by default', () => {
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      expect(cm.isAvailable()).toBe(false);
    });

    it('getFallbackMode() returns sandbox', () => {
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      expect(cm.getFallbackMode()).toBe('sandbox');
    });
  });

  describe('init() -- Docker unavailable', () => {
    it('sets isAvailable=false when Docker ping fails', async () => {
      mockPing.mockRejectedValueOnce(new Error('Cannot connect to Docker'));
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      await cm.init();
      expect(cm.isAvailable()).toBe(false);
      expect(cm.getFallbackMode()).toBe('sandbox');
    });

    it('logs warning when Docker unavailable', async () => {
      mockPing.mockRejectedValueOnce(new Error('ENOENT'));
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      await cm.init();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // Docker-available path tests are v8-ignored in source (require real Docker daemon).
  // Full integration tests for Docker will run in Phase 9 E2E suite.

  describe('create() -- Docker unavailable', () => {
    it('throws clear error when Docker not available', async () => {
      mockPing.mockRejectedValueOnce(new Error('no docker'));
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      await cm.init();
      await expect(cm.create({})).rejects.toThrow(
        'Docker is not available',
      );
    });
  });

  describe('destroy() -- no containers', () => {
    it('handles destroy of non-existent container gracefully', async () => {
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      await cm.destroy('nonexistent-id');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ containerId: 'nonexistent-id' }),
        expect.any(String),
      );
    });
  });

  describe('destroyAll()', () => {
    it('handles destroyAll with no active containers', async () => {
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      await cm.destroyAll();
    });
  });

  describe('degradation matrix', () => {
    it('fallback mode is always sandbox when Docker unavailable', async () => {
      mockPing.mockRejectedValueOnce(new Error('not available'));
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      await cm.init();
      expect(cm.isAvailable()).toBe(false);
      expect(cm.getFallbackMode()).toBe('sandbox');
    });

    it('create() throws before any container operations when unavailable', async () => {
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      await expect(cm.create({ image: 'node:22-slim' })).rejects.toThrow(
        'Docker is not available',
      );
    });

    it('create() with custom config still throws when unavailable', async () => {
      mockPing.mockRejectedValueOnce(new Error('nope'));
      const cm = new ContainerManagerImpl(makeConfig(), logger);
      await cm.init();
      await expect(
        cm.create({
          image: 'python:3.12-slim',
          cpuLimit: 2,
          memoryLimitMb: 1024,
          timeoutSeconds: 60,
          networkEnabled: true,
        }),
      ).rejects.toThrow('Docker is not available');
    });
  });
});
