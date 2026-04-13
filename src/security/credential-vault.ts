// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 2 -- Credential Vault
 * LLD Section 2.3
 *
 * 5-step resolution: cache -> env -> keychain -> config -> undefined.
 * Values NEVER logged. toString() returns REDACTED.
 */

import type { ConfigManager } from '../config/config-manager.js';
import type { CredentialVault } from '../types/common.js';

// ---------------------------------------------------------------------------
// Keychain Adapter (injectable for testing)
// ---------------------------------------------------------------------------

export interface KeychainAdapter {
  read(service: string, account: string): string | undefined;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class CredentialVaultImpl implements CredentialVault {
  private readonly cache: Map<string, string> = new Map();
  private readonly keychainAvailable: boolean;
  private readonly configManager: ConfigManager;
  private readonly keychainAdapter?: KeychainAdapter;

  constructor(
    configManager: ConfigManager,
    keychainAdapter?: KeychainAdapter,
  ) {
    this.configManager = configManager;
    this.keychainAdapter = keychainAdapter;

    // Probe keychain availability
    if (keychainAdapter !== undefined) {
      try {
        keychainAdapter.read('qos', '__probe__');
        this.keychainAvailable = true;
      } catch {
        this.keychainAvailable = false;
      }
    } else {
      this.keychainAvailable = false;
    }
  }

  get(key: string): string | undefined {
    // Step 1: cache
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // Step 2: process.env
    const envValue = process.env[key];
    if (envValue !== undefined) {
      this.cache.set(key, envValue);
      return envValue;
    }

    // Step 3: keychain
    if (this.keychainAvailable && this.keychainAdapter !== undefined) {
      try {
        const keychainValue = this.keychainAdapter.read('qos', key);
        if (keychainValue !== undefined && keychainValue !== '') {
          this.cache.set(key, keychainValue);
          return keychainValue;
        }
      } catch {
        // Swallow -- NEVER log error details (may contain partial value)
      }
    }

    // Step 4: config credentials
    const config = this.configManager.get();
    const credentials = (config.security as Record<string, unknown>)?.credentials as
      Record<string, string> | undefined;
    const configValue = credentials?.[key];
    if (configValue !== undefined) {
      this.cache.set(key, configValue);
      return configValue;
    }

    // Step 5: undefined
    return undefined;
  }

  set(key: string, value: string, _source: 'env' | 'keychain' | 'config'): void {
    // Runtime injection only (cache, no persistence)
    this.cache.set(key, value);
  }

  list(): readonly string[] {
    const cacheKeys = Array.from(this.cache.keys());
    const envKeys = Object.keys(process.env).filter(
      (k) => k.startsWith('QOS_') || k.includes('API_KEY') || k.includes('TOKEN'),
    );
    const merged = [...new Set([...cacheKeys, ...envKeys])];
    return Object.freeze(merged);
  }

  hasKey(key: string): boolean {
    return this.get(key) !== undefined;
  }

  toString(): string {
    return '[CredentialVault: REDACTED]';
  }

  toJSON(): Record<string, never> {
    return {};
  }
}
