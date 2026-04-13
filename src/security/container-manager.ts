// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Container Manager
 * LLD Section 2.2
 *
 * Docker lifecycle via dockerode. Create, run-command-in, destroy containers.
 * Graceful degradation when Docker unavailable: isAvailable() returns false,
 * getFallbackMode() returns 'sandbox'.
 *
 * CRITICAL: Docker is NOT installed on this machine. This implementation
 * handles both Docker-available and Docker-unavailable paths.
 */

import type { Logger } from 'pino';
import type { ConfigManager } from '../config/config-manager.js';
import type { EventBus } from '../events/event-bus.js';
import type {
  ContainerManager,
  ContainerConfig,
  ContainerHandle,
  CommandResult,
} from '../types/common.js';

// ---------------------------------------------------------------------------
// Docker type stubs (avoid hard import crash when Docker absent)
// ---------------------------------------------------------------------------

interface DockerInstance {
  ping(): Promise<unknown>;
  createContainer(opts: Record<string, unknown>): Promise<DockerContainer>;
  listContainers(opts: Record<string, unknown>): Promise<readonly DockerContainerInfo[]>;
  getContainer(id: string): DockerContainer;
}

interface DockerContainer {
  readonly id: string;
  start(): Promise<void>;
  stop(opts: { t: number }): Promise<void>;
  kill(): Promise<void>;
  remove(opts: { force: boolean }): Promise<void>;
  exec(opts: Record<string, unknown>): Promise<DockerExec>;
}

interface DockerExec {
  start(opts: Record<string, unknown>): Promise<NodeJS.ReadableStream>;
  inspect(): Promise<{ ExitCode: number }>;
}

interface DockerContainerInfo {
  readonly Id: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class ContainerManagerImpl implements ContainerManager {
  private docker: DockerInstance | null = null;
  private available = false;
  private readonly fallbackMode: 'sandbox' | 'none' = 'sandbox';
  private readonly activeContainers: Map<string, DockerContainer> = new Map();
  private readonly logger: Logger;
  private readonly eventBus?: EventBus;

  constructor(
    private readonly configManager: ConfigManager,
    logger: Logger,
    eventBus?: EventBus,
  ) {
    this.logger = logger;
    this.eventBus = eventBus;
  }

  async init(): Promise<void> {
    try {
      /* v8 ignore start -- Docker not installed, untestable without Docker daemon */
      const Docker = (await import('dockerode')).default;
      const docker = new Docker({ socketPath: '/var/run/docker.sock' }) as unknown as DockerInstance;
      await docker.ping();
      this.docker = docker;
      this.available = true;
      this.logger.info({ component: 'container-manager' }, 'Docker available');
      /* v8 ignore stop */
    } catch (error: unknown) {
      this.docker = null;
      this.available = false;
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { component: 'container-manager', error: msg },
        'Docker unavailable, using sandbox fallback',
      );
      // H-11: Emit container failed event when Docker is unavailable
      if (this.eventBus) {
        this.eventBus.emit({
          type: 'security:container_failed',
          payload: { reason: 'docker_unavailable', error: msg, fallbackMode: this.fallbackMode },
          source: 'container-manager',
        });
      }
    }
  }

  async create(config: ContainerConfig): Promise<ContainerHandle> {
    if (!this.available || this.docker === null) {
      throw new Error(
        'Docker is not available. Use isAvailable() before calling create().',
      );
    }

    /* v8 ignore start -- Docker container creation requires running Docker daemon */
    const mergedConfig = {
      image: config.image ?? 'node:22-slim',
      cpuLimit: config.cpuLimit ?? 1,
      memoryLimitMb: config.memoryLimitMb ?? 512,
      timeoutSeconds: config.timeoutSeconds ?? 300,
      networkEnabled: config.networkEnabled ?? false,
      volumes: config.volumes ?? [],
    };

    const containerCreateOptions: Record<string, unknown> = {
      Image: mergedConfig.image,
      Cmd: ['/bin/sh'],
      OpenStdin: true,
      Tty: false,
      Labels: { qos: 'true' },
      HostConfig: {
        Memory: mergedConfig.memoryLimitMb * 1024 * 1024,
        NanoCpus: mergedConfig.cpuLimit * 1e9,
        NetworkMode: mergedConfig.networkEnabled ? 'bridge' : 'none',
        ReadonlyRootfs: false,
        AutoRemove: false,
        ...(mergedConfig.volumes.length > 0
          ? {
              Binds: mergedConfig.volumes.map(
                (v) =>
                  `${v.hostPath}:${v.containerPath}:${v.readOnly !== false ? 'ro' : 'rw'}`,
              ),
            }
          : {}),
      },
    };

    const container = await this.docker.createContainer(containerCreateOptions);
    await container.start();
    const containerId = container.id;
    this.activeContainers.set(containerId, container);

    this.logger.info(
      { component: 'container-manager', containerId },
      'Container created and started',
    );

    const timeoutHandle = setTimeout(() => {
      this.destroy(containerId).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          { containerId, error: msg },
          'Timeout auto-destroy failed',
        );
      });
    }, mergedConfig.timeoutSeconds * 1000);

    const handle: ContainerHandle = {
      id: containerId,
      executeCommand: async (command: string): Promise<CommandResult> => {
        return this.executeInContainer(container, command);
      },
      destroy: async (): Promise<void> => {
        clearTimeout(timeoutHandle);
        await this.destroy(containerId);
      },
    };

    return handle;
    /* v8 ignore stop */
  }

  /* v8 ignore start -- Docker destroy requires running Docker daemon */
  async destroy(id: string): Promise<void> {
    const container = this.activeContainers.get(id);
    if (container === undefined) {
      this.logger.warn(
        { containerId: id },
        'Container not found in active set, skipping destroy',
      );
      return;
    }

    try {
      await container.stop({ t: 10 });
    } catch {
      this.logger.warn(
        { containerId: id },
        'Graceful stop failed, killing',
      );
      try {
        await container.kill();
      } catch {
        // Container may already be stopped
      }
    }

    try {
      await container.remove({ force: true });
    } catch (removeError: unknown) {
      const msg = removeError instanceof Error ? removeError.message : String(removeError);
      this.logger.error(
        { containerId: id, error: msg },
        'Container remove failed',
      );
    }

    this.activeContainers.delete(id);
    this.logger.info({ containerId: id }, 'Container destroyed');
  }
  /* v8 ignore stop */

  isAvailable(): boolean {
    return this.available;
  }

  getFallbackMode(): 'sandbox' | 'none' {
    return this.fallbackMode;
  }

  /* v8 ignore start -- Docker operations require running daemon */
  async destroyAll(): Promise<void> {
    // M-08: Destroy tracked containers first
    const ids = Array.from(this.activeContainers.keys());
    for (const id of ids) {
      await this.destroy(id);
    }

    // M-08: Query Docker for orphaned containers with qos=true label
    // that may have been left behind (e.g., after a crash or restart).
    if (this.docker !== null) {
      try {
        const orphans = await this.docker.listContainers({
          all: true,
          filters: JSON.stringify({ label: ['qos=true'] }),
        });
        for (const info of orphans) {
          try {
            const container = this.docker.getContainer(info.Id);
            await container.stop({ t: 5 });
            await container.remove({ force: true });
            this.logger.info({ containerId: info.Id }, 'Orphaned container cleaned up');
          } catch {
            this.logger.warn({ containerId: info.Id }, 'Failed to clean orphaned container');
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn({ error: msg }, 'Failed to query Docker for orphaned containers');
      }
    }
  }

  private async executeInContainer(
    container: DockerContainer,
    command: string,
  ): Promise<CommandResult> {
    const containerExec = await container.exec({
      Cmd: ['/bin/sh', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await containerExec.start({ Detach: false, Tty: false });

    let stdout = '';
    let stderr = '';

    // Collect output from multiplexed stream
    await new Promise<void>((resolve) => {
      stream.on('data', (chunk: Buffer) => {
        // Docker multiplexes: header[0]=1 is stdout, header[0]=2 is stderr
        if (chunk.length > 8) {
          const type = chunk[0];
          const payload = chunk.subarray(8).toString('utf-8');
          if (type === 1) {
            stdout += payload;
          } else if (type === 2) {
            stderr += payload;
          }
        }
      });
      stream.on('end', resolve);
      stream.on('error', resolve);
    });

    const inspectResult = await containerExec.inspect();
    return {
      stdout,
      stderr,
      exitCode: inspectResult.ExitCode ?? -1,
    };
  }
  /* v8 ignore stop */
}
