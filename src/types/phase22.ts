// Copyright (c) 2026 Varun Pratap Bhardwaj
// Part of Qualixar OS | https://qualixar.com | License: FSL-1.1-ALv2
/**
 * Qualixar OS Phase 22 -- Enterprise Hardening Types
 *
 * All Phase 22 interfaces: credential vault, RBAC, audit logging, SSO, rate limiting.
 * HR-1: Every interface is readonly + immutable.
 * HR-2: No extension from common.ts CredentialVault -- standalone definitions.
 */

// ---------------------------------------------------------------------------
// Credential Vault Types
// ---------------------------------------------------------------------------

export interface EncryptedCredential {
  readonly id: string;
  readonly providerId: string;
  readonly encryptedData: string;
  readonly iv: string;
  readonly authTag: string;
  readonly algorithm: 'aes-256-gcm';
  readonly keyDerivation: 'pbkdf2-sha512';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KeyDerivationConfig {
  readonly iterations: number;
  readonly keyLength: number;
  readonly digest: 'sha512';
  readonly saltLength: number;
}

export interface EncryptionConfig {
  readonly algorithm: 'aes-256-gcm';
  readonly ivLength: number;
  readonly authTagLength: number;
}

export interface RotationConfig {
  readonly autoRotateDays: number;
  readonly notifyBeforeDays: number;
}

export interface CredentialVaultConfig {
  readonly keyDerivation: KeyDerivationConfig;
  readonly encryption: EncryptionConfig;
  readonly rotation: RotationConfig;
}

export interface VaultStoreInput {
  readonly providerId: string;
  readonly plaintext: string;
  readonly passphrase: string;
}

export interface VaultRetrieveInput {
  readonly providerId: string;
  readonly passphrase: string;
}

export interface KeyRotationRequest {
  readonly oldPassphrase: string;
  readonly newPassphrase: string;
}

export interface KeyRotationResult {
  readonly rotated: number;
  readonly failed: number;
  readonly errors: readonly string[];
}

export interface EnterpriseVault {
  store(input: VaultStoreInput): Promise<void>;
  retrieve(input: VaultRetrieveInput): Promise<string>;
  rotateKeys(req: KeyRotationRequest): Promise<KeyRotationResult>;
  unlock(passphrase: string): void;
  lock(): void;
  isUnlocked(): boolean;
  /** Adapter: env var fallback → unlocked vault → config fallback */
  get(key: string, configFallback?: string): Promise<string | undefined>;
  credentialCount(): number;
}

// ---------------------------------------------------------------------------
// RBAC Types
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'developer' | 'viewer';

export type PermissionAction = 'read' | 'write' | 'delete' | 'execute';

export type ResourceGroup =
  | 'credentials'
  | 'models'
  | 'agents'
  | 'tasks'
  | 'workflows'
  | 'audit'
  | 'users'
  | 'plugins'
  | 'marketplace'
  | 'blueprints'
  | 'deployments'
  | 'system';

export interface Permission {
  readonly resource: ResourceGroup;
  readonly actions: readonly PermissionAction[];
}

export interface RateLimit {
  readonly requestsPerMinute: number;
}

export interface RoleDefinition {
  readonly role: Role;
  readonly description: string;
  readonly permissions: readonly Permission[];
  readonly rateLimit: RateLimit;
}

export interface UserIdentity {
  readonly id: string;
  readonly username: string;
  readonly role: Role;
  readonly authSource: 'local' | 'sso';
  readonly ssoProvider: string | null;
  readonly apiToken: string | null;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

export interface TokenPayload {
  readonly userId: string;
  readonly username: string;
  readonly role: Role;
  readonly authSource: 'local' | 'sso';
  readonly iat: number;
  readonly exp: number;
}

export interface RBACCheckRequest {
  readonly role: Role;
  readonly resource: ResourceGroup;
  readonly action: PermissionAction;
}

export interface RBACCheckResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly role: Role;
  readonly resource: ResourceGroup;
  readonly action: PermissionAction;
}

export interface RBACEngine {
  check(req: RBACCheckRequest): RBACCheckResult;
  getRoleDefinition(role: Role): RoleDefinition;
  getAllRoles(): readonly RoleDefinition[];
}

// ---------------------------------------------------------------------------
// Audit Types
// ---------------------------------------------------------------------------

export type AuditEventType =
  | 'credential:stored'
  | 'credential:retrieved'
  | 'credential:rotated'
  | 'credential:rotation_failed'
  | 'vault:unlocked'
  | 'vault:locked'
  | 'rbac:access_denied'
  | 'rbac:access_granted'
  | 'user:created'
  | 'user:role_changed'
  | 'user:token_generated'
  | 'user:login'
  | 'user:logout'
  | 'sso:login'
  | 'sso:callback'
  | 'sso:state_invalid'
  | 'sso:token_exchange_failed'
  | 'audit:purged'
  | 'rate_limit:exceeded'
  | 'security:policy_violation'
  | 'system:bootstrap';

export interface AuditEntry {
  readonly id: string;
  readonly eventType: AuditEventType;
  readonly userId: string | null;
  readonly username: string | null;
  readonly role: Role | null;
  readonly details: Readonly<Record<string, unknown>>;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly resourceType: ResourceGroup | null;
  readonly resourceId: string | null;
  readonly timestamp: string;
}

export interface AuditLogQuery {
  readonly eventType?: AuditEventType;
  readonly userId?: string;
  readonly username?: string;
  readonly resourceType?: ResourceGroup;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AuditLogResult {
  readonly entries: readonly AuditEntry[];
  readonly total: number;
  readonly hasMore: boolean;
}

export interface AuditLogger {
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void;
  query(filters: AuditLogQuery): AuditLogResult;
  exportJson(filters: AuditLogQuery): string;
  exportCsv(filters: AuditLogQuery): string;
  purge(olderThanDays: number): number;
}

// ---------------------------------------------------------------------------
// SSO Types
// ---------------------------------------------------------------------------

export type SSOProvider = 'azure-ad' | 'google' | 'okta' | 'auth0';

export interface SSOConfig {
  readonly provider: SSOProvider;
  readonly clientId: string;
  readonly clientSecretEnv: string;
  readonly tenantId?: string;
  readonly domain?: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

export interface SSOState {
  readonly state: string;
  readonly codeVerifier: string;
  readonly provider: SSOProvider;
  readonly createdAt: string;
}

export interface SSOCallbackResult {
  readonly user: UserIdentity;
  readonly isNewUser: boolean;
  readonly accessToken: string;
  readonly idToken: string | null;
}

export interface SSOEngine {
  getAuthorizationUrl(provider: SSOProvider): Promise<{ url: string; state: string }>;
  handleCallback(code: string, state: string): Promise<SSOCallbackResult>;
  getSupportedProviders(): readonly SSOProvider[];
}

// ---------------------------------------------------------------------------
// Rate Limiter Types
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  readonly windowMs: number;
  readonly limits: Readonly<Record<Role, number>>;
}

export interface RateLimitState {
  readonly role: Role;
  readonly identifier: string;
  readonly count: number;
  readonly windowStart: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
}

export interface RateLimiter {
  check(identifier: string, role: Role): RateLimitState;
  consume(identifier: string, role: Role): RateLimitState;
  reset(identifier: string): void;
  getStatus(identifier: string, role: Role): RateLimitState;
}
