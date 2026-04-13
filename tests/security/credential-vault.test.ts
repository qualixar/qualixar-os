/**
 * Qualixar OS Phase 2 -- Credential Vault Tests
 * TDD: Tests the 5-step resolution order, list(), hasKey(), toString()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CredentialVaultImpl, type KeychainAdapter } from '../../src/security/credential-vault.js';
import type { ConfigManager } from '../../src/config/config-manager.js';
import type { QosConfig } from '../../src/types/common.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<QosConfig['security']>): ConfigManager {
  const securityConfig = {
    container_isolation: false,
    policy_path: undefined,
    allowed_paths: ['./'],
    denied_commands: ['rm -rf', 'sudo'],
    ...overrides,
  };

  return {
    get: () => ({ security: securityConfig } as unknown as QosConfig),
    getValue: vi.fn(),
    reload: vi.fn(),
  };
}

function makeKeychain(data: Record<string, string>): KeychainAdapter {
  return {
    read(_service: string, account: string): string | undefined {
      return data[account];
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CredentialVaultImpl', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore env vars
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('get()', () => {
    it('returns value from process.env when set', () => {
      process.env.MY_TEST_KEY = 'env-value';
      const vault = new CredentialVaultImpl(makeConfig());
      expect(vault.get('MY_TEST_KEY')).toBe('env-value');
    });

    it('returns cached value on second call (cache hit)', () => {
      process.env.MY_CACHE_KEY = 'cached';
      const vault = new CredentialVaultImpl(makeConfig());
      vault.get('MY_CACHE_KEY'); // populate cache
      delete process.env.MY_CACHE_KEY; // remove from env
      expect(vault.get('MY_CACHE_KEY')).toBe('cached'); // still returns cached
    });

    it('returns keychain value when env missing but keychain has it', () => {
      const keychain = makeKeychain({ SECRET_KEY: 'keychain-val' });
      const vault = new CredentialVaultImpl(makeConfig(), keychain);
      expect(vault.get('SECRET_KEY')).toBe('keychain-val');
    });

    it('returns config value when env and keychain both miss', () => {
      const config = makeConfig();
      const configWithCreds = {
        ...config,
        get: () =>
          ({
            security: {
              container_isolation: false,
              allowed_paths: ['./'],
              denied_commands: [],
              credentials: { CONFIG_KEY: 'config-val' },
            },
          }) as unknown as QosConfig,
      };
      const vault = new CredentialVaultImpl(configWithCreds);
      expect(vault.get('CONFIG_KEY')).toBe('config-val');
    });

    it('returns undefined when nothing found', () => {
      const vault = new CredentialVaultImpl(makeConfig());
      expect(vault.get('NONEXISTENT_KEY_XYZ_123')).toBeUndefined();
    });

    it('prioritizes env over keychain', () => {
      process.env.DUAL_KEY = 'env-wins';
      const keychain = makeKeychain({ DUAL_KEY: 'keychain-loses' });
      const vault = new CredentialVaultImpl(makeConfig(), keychain);
      expect(vault.get('DUAL_KEY')).toBe('env-wins');
    });

    it('ignores empty keychain value', () => {
      const keychain = makeKeychain({ EMPTY_KEY: '' });
      const vault = new CredentialVaultImpl(makeConfig(), keychain);
      expect(vault.get('EMPTY_KEY')).toBeUndefined();
    });

    it('handles keychain read errors gracefully', () => {
      const keychain: KeychainAdapter = {
        read(_service: string, account: string): string | undefined {
          if (account === '__probe__') return undefined; // allow probe
          throw new Error('keychain error');
        },
      };
      const vault = new CredentialVaultImpl(makeConfig(), keychain);
      expect(vault.get('FAIL_KEY')).toBeUndefined();
    });
  });

  describe('set()', () => {
    it('stores value in cache, retrievable via get()', () => {
      const vault = new CredentialVaultImpl(makeConfig());
      vault.set('INJECTED', 'test-val', 'env');
      expect(vault.get('INJECTED')).toBe('test-val');
    });
  });

  describe('list()', () => {
    it('returns key names, never values', () => {
      const vault = new CredentialVaultImpl(makeConfig());
      vault.set('LIST_KEY', 'secret', 'env');
      const keys = vault.list();
      expect(keys).toContain('LIST_KEY');
      // Ensure no value leaks
      for (const key of keys) {
        expect(key).not.toBe('secret');
      }
    });

    it('includes QOS_ prefixed env vars', () => {
      process.env.QOS_TEST_VAR = 'abc';
      const vault = new CredentialVaultImpl(makeConfig());
      expect(vault.list()).toContain('QOS_TEST_VAR');
    });

    it('includes API_KEY containing env vars', () => {
      process.env.MY_API_KEY = 'xyz';
      const vault = new CredentialVaultImpl(makeConfig());
      expect(vault.list()).toContain('MY_API_KEY');
    });

    it('returns frozen array', () => {
      const vault = new CredentialVaultImpl(makeConfig());
      const list = vault.list();
      expect(Object.isFrozen(list)).toBe(true);
    });
  });

  describe('hasKey()', () => {
    it('returns true when key exists in env', () => {
      process.env.HAS_KEY_TEST = 'yes';
      const vault = new CredentialVaultImpl(makeConfig());
      expect(vault.hasKey('HAS_KEY_TEST')).toBe(true);
    });

    it('returns false when key does not exist', () => {
      const vault = new CredentialVaultImpl(makeConfig());
      expect(vault.hasKey('MISSING_KEY_ZZZ')).toBe(false);
    });
  });

  describe('security invariants', () => {
    it('toString() returns REDACTED', () => {
      const vault = new CredentialVaultImpl(makeConfig());
      expect(vault.toString()).toBe('[CredentialVault: REDACTED]');
      expect(`${vault}`).toBe('[CredentialVault: REDACTED]');
    });

    it('toJSON() returns empty object', () => {
      const vault = new CredentialVaultImpl(makeConfig());
      expect(vault.toJSON()).toEqual({});
      expect(JSON.stringify(vault)).toBe('{}');
    });
  });

  describe('keychain availability', () => {
    it('sets keychainAvailable=false when no adapter provided', () => {
      const vault = new CredentialVaultImpl(makeConfig());
      // No keychain, so only env/config resolution
      expect(vault.get('NO_ADAPTER_KEY')).toBeUndefined();
    });

    it('sets keychainAvailable=false when probe throws', () => {
      const brokenKeychain: KeychainAdapter = {
        read(): string | undefined {
          throw new Error('probe fail');
        },
      };
      const vault = new CredentialVaultImpl(makeConfig(), brokenKeychain);
      expect(vault.get('BROKEN_KC')).toBeUndefined();
    });
  });
});
