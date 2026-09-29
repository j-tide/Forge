import type { ClaudeUsageData, ClaudeRateLimitEvent } from './agent';

/** How a credential was resolved — shown in UI for transparency */
export type CredentialSource = 'oauth' | 'api-key' | 'env' | 'keychain';

/** Supported built-in providers (matches @ai-sdk/* packages) */
export type BuiltinProvider =
  | 'anthropic' | 'openai' | 'google' | 'amazon-bedrock' | 'azure'
  | 'mistral' | 'groq' | 'xai' | 'openrouter' | 'zai'
  | 'ollama' | 'openai-compatible';

export type BillingModel = 'subscription' | 'pay-per-use';

/** A test uses draft fields; saving an account is never required first. */
export interface ProviderConnectionConfig {
  apiKey?: string;
  baseUrl?: string;
  region?: string;
  authType?: 'oauth' | 'api-key';
  billingModel?: BillingModel;
  claudeProfileId?: string;
  accountId?: string;
  /** Model tests are explicit because they can consume quota or incur charges. */
  mode?: 'connection' | 'model';
  model?: string;
}

export type ProviderConnectionCode =
  | 'unsupported-provider' | 'oauth-reauth' | 'aws-unsupported' | 'missing-key'
  | 'invalid-key' | 'model-unsupported' | 'zai-needs-model' | 'missing-url'
  | 'invalid-url' | 'insecure-url' | 'invalid-model' | 'invalid-config'
  | 'auth' | 'quota' | 'unsupported-endpoint' | 'redirect' | 'rejected-request'
  | 'http' | 'unexpected-response' | 'cancelled' | 'timeout' | 'network'
  | 'model-verified' | 'endpoint-reachable' | 'metadata-verified';

export interface ProviderConnectionTestResult {
  success: boolean;
  /** Stable status for renderer localization; provider content is never returned. */
  code?: ProviderConnectionCode;
  status?: number;
  error?: string;
  message?: string;
}

/** A user-defined model for custom endpoints */
export interface CustomModel {
  id: string;
  label: string;
}

/** A credential entry for any AI provider */
export interface ProviderAccount {
  id: string;
  provider: BuiltinProvider;
  name: string;
  authType: 'oauth' | 'api-key';
  billingModel: BillingModel;
  apiKey?: string;
  /** Authenticated email (populated from OAuth keychain or provider API) */
  email?: string;
  baseUrl?: string;
  region?: string;
  createdAt: number;
  updatedAt: number;
  claudeProfileId?: string;
  usage?: ClaudeUsageData;
  rateLimitEvents?: ClaudeRateLimitEvent[];
  /** User-configured models for openai-compatible endpoints */
  customModels?: CustomModel[];
}

export type ProviderCategory = 'popular' | 'infrastructure' | 'local';

/** Provider display metadata for UI rendering */
export interface ProviderInfo {
  id: BuiltinProvider;
  name: string;
  description: string;
  category: ProviderCategory;
  authMethods: ('oauth' | 'api-key')[];
  envVars: string[];
  configFields: ('baseUrl' | 'region')[];
  website?: string;
}
