// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 0 — Logger Factory
 * LLD Section 2.11
 *
 * Creates pino logger instances with environment-aware transport:
 * - Production (NODE_ENV=production): JSON to stdout (no transport)
 * - Development: pino-pretty with colors and readable timestamps
 *
 * Consumers create child loggers with context bindings:
 *   const log = logger.child({ component: 'ModelRouter', phase: 1 });
 */
import pino from 'pino';
import type { Logger } from 'pino';

/**
 * Create a pino logger instance with the specified log level.
 *
 * @param level - Minimum log level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
 * @returns Configured pino Logger instance
 */
export function createLogger(level: string): Logger {
  if (process.env.NODE_ENV === 'production') {
    return pino({ level });
  }

  return pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    },
  });
}
