// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Centralized version source — reads from package.json at runtime.
 * All modules import VERSION from here instead of hardcoding.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _version: string;
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  _version = pkg.version;
} catch {
  // Keep in sync with package.json version
  _version = '2.1.1';
}

export const VERSION = _version;
