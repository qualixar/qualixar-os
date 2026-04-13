// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 19 -- Doctor Command Handler
 * LLD Section 8.3
 *
 * Runs health checks and outputs scored report.
 * HR-7: Exit code 0 even on failures (informational).
 * HR-12: Works without color (chalk.level detection).
 */

import { createHealthChecker } from './doctor/health-checker.js';

export async function handleDoctorCommand(
  deps: { readonly log?: (msg: string) => void },
): Promise<void> {
  const log = deps.log ?? console.log;

  log('');
  log('Qualixar OS Health Check');
  log('==================');
  log('');

  const checker = createHealthChecker();
  const result = await checker.check();

  // Group by category
  const categories = ['system', 'config', 'provider', 'channel'] as const;

  for (const cat of categories) {
    const items = result.items.filter((i) => i.category === cat);
    if (items.length === 0) continue;

    log(cat.charAt(0).toUpperCase() + cat.slice(1));
    for (const item of items) {
      const icon = item.status === 'ok' ? '[OK]  '
        : item.status === 'warn' ? '[WARN]'
        : item.status === 'fail' ? '[FAIL]'
        : '[SKIP]';
      log(`  ${icon} ${item.message}`);
      if (item.fix) {
        log(`           Fix: ${item.fix}`);
      }
    }
    log('');
  }

  log(`Score: ${result.score}/10${result.summary ? ` (${result.summary})` : ''}`);
  log('');
}
