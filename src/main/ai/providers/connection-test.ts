/**
 * Account diagnostics for the Aperant-derived preview. This does not schedule
 * agents or implement Forge's Python Host protocol. A normal connection test
 * only reads metadata. A Z.AI model test requires explicit mode + model input.
 */
import { PROVIDER_REGISTRY } from '../../../shared/constants/providers';
import type { ProviderConnectionCode, ProviderConnectionConfig, ProviderConnectionTestResult } from '../../../shared/types/provider-account';
import { isZaiAnthropicEndpoint, zaiAnthropicBaseURL, ZAI_CODING_API, ZAI_GENERAL_API } from './zai-endpoint';
import { azureSdkBaseURL } from './azure-endpoint';
import { validateProviderBaseUrl } from '../../../shared/utils/provider-url-validation';

const TEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1_048_576;

const DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  mistral: 'https://api.mistral.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  ollama: 'http://localhost:11434',
};

interface Probe {
  url: URL;
  headers: Record<string, string>;
  body?: string;
  responseKind: 'models' | 'google' | 'ollama' | 'key' | 'chat' | 'message';
}

export interface ConnectionTestOptions {
  /** Test seams only; renderer cannot override transport or limits. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

function failure(error: string, code: ProviderConnectionCode, status?: number): ProviderConnectionTestResult {
  return { success: false, code, error, ...(status === undefined ? {} : { status }) };
}

class ProbeResponseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Return both forms for older clients, never any credential value. */
export function detectProviderEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  const detected: Record<string, boolean> = {};
  for (const provider of PROVIDER_REGISTRY) {
    for (const envVar of provider.envVars) {
      if (!env[envVar]?.trim()) continue;
      if (provider.id === 'amazon-bedrock' && !env.AWS_SECRET_ACCESS_KEY?.trim()) continue;
      detected[provider.id] = true;
      detected[envVar] = true;
    }
  }
  if (env.AWS_BEARER_TOKEN_BEDROCK?.trim()) {
    detected['amazon-bedrock'] = true;
    detected.AWS_BEARER_TOKEN_BEDROCK = true;
  }
  return detected;
}

function appendPath(url: URL, suffix: string): URL {
  const endpoint = new URL(url);
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + suffix;
  return endpoint;
}

function makeProbe(provider: string, config: ProviderConnectionConfig, env: NodeJS.ProcessEnv): Probe | ProviderConnectionTestResult {
  const info = PROVIDER_REGISTRY.find(entry => entry.id === provider);
  if (!info) return failure('This provider does not support connection testing.', 'unsupported-provider');
  if (config.authType === 'oauth') {
    return failure('OAuth accounts cannot be verified by an API-key probe. Use Reauthenticate to verify this account.', 'oauth-reauth');
  }
  if (provider === 'amazon-bedrock') {
    return failure('AWS Bedrock needs its signed credential chain or Bedrock bearer-token authentication. This connection test does not verify AWS credentials.', 'aws-unsupported');
  }
  const key = config.apiKey?.trim() || info.envVars.map(name => env[name]?.trim()).find(Boolean);
  if (provider !== 'ollama' && !key) return failure('An API key is required to test this connection.', 'missing-key');
  if (key && (key.length > 16_384 || /[\r\n]/.test(key))) return failure('The API key contains invalid characters.', 'invalid-key');
  if (config.mode === 'model' && provider !== 'zai') {
    return failure('A model request is currently supported only for Z.AI. Use a connection test for this provider.', 'model-unsupported');
  }
  if (provider === 'zai' && config.mode !== 'model') {
    return failure('Z.AI has no supported free credential probe here. Select a model test to send one minimal request; it may consume quota or incur charges.', 'zai-needs-model');
  }

  const defaultZaiURL = config.billingModel === 'subscription' ? ZAI_CODING_API : ZAI_GENERAL_API;
  const envBaseUrl = provider === 'anthropic' ? env.ANTHROPIC_BASE_URL
    : provider === 'openai' ? env.OPENAI_BASE_URL
    : provider === 'azure' ? env.AZURE_OPENAI_ENDPOINT : undefined;
  const baseUrl = config.baseUrl?.trim() || envBaseUrl?.trim()
    || (provider === 'zai' ? defaultZaiURL : DEFAULT_BASE_URLS[provider]);
  if (!baseUrl) return failure('A Base URL is required to test this connection.', 'missing-url');
  const validation = validateProviderBaseUrl(baseUrl, { apiKey: key });
  if (!validation.valid && validation.code === 'invalid-url') {
    return failure('Use an HTTP or HTTPS Base URL without credentials, query parameters, or a fragment.', 'invalid-url');
  }
  if (!validation.valid) {
    return failure('Use HTTPS when sending an API key to a remote endpoint.', 'insecure-url');
  }
  let url = validation.url;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  switch (provider) {
    case 'anthropic':
      delete headers.Authorization;
      headers['x-api-key'] = key ?? '';
      headers['anthropic-version'] = '2023-06-01';
      return { url: appendPath(url, '/models'), headers, responseKind: 'models' };
    case 'google':
      delete headers.Authorization;
      headers['x-goog-api-key'] = key ?? '';
      return { url: appendPath(url, '/models'), headers, responseKind: 'google' };
    case 'azure':
      delete headers.Authorization;
      headers['api-key'] = key ?? '';
      url = appendPath(new URL(azureSdkBaseURL(url.toString()) ?? url.toString()), '/v1/models');
      url.searchParams.set('api-version', 'v1');
      return { url, headers, responseKind: 'models' };
    case 'ollama':
      url.pathname = url.pathname.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
      return { url: appendPath(url, '/api/tags'), headers, responseKind: 'ollama' };
    case 'openrouter':
      // /models is public, so it cannot prove that the configured key works.
      return { url: appendPath(url, '/key'), headers, responseKind: 'key' };
    case 'zai': {
      const model = config.model?.trim();
      if (!model || model.length > 256 || /[\r\n]/.test(model)) {
        return failure('Select a valid model for the model test.', 'invalid-model');
      }
      const anthropic = isZaiAnthropicEndpoint(url.toString());
      headers['Content-Type'] = 'application/json';
      if (anthropic) {
        headers['anthropic-version'] = '2023-06-01';
        url = new URL(zaiAnthropicBaseURL(url.toString()));
      }
      return {
        url: appendPath(url, anthropic ? '/messages' : '/chat/completions'),
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
          ...(anthropic ? {} : { thinking: { type: 'disabled' } }),
        }),
        responseKind: anthropic ? 'message' : 'chat',
      };
    }
    default:
      return { url: appendPath(url, '/models'), headers, responseKind: 'models' };
  }
}

function validResponse(payload: unknown, kind: Probe['responseKind']): boolean {
  if (!isRecord(payload) || payload.error !== undefined) return false;
  switch (kind) {
    case 'models':
      return Array.isArray(payload.data) && payload.data.every(model => isRecord(model) && isNonemptyString(model.id));
    case 'google':
      return Array.isArray(payload.models) && payload.models.every(model => isRecord(model) && isNonemptyString(model.name));
    case 'ollama':
      return Array.isArray(payload.models) && payload.models.every(model => isRecord(model) && isNonemptyString(model.name));
    case 'key':
      return isRecord(payload.data) && isNonemptyString(payload.data.label)
        && typeof payload.data.usage === 'number' && Number.isFinite(payload.data.usage)
        && payload.data.disabled !== true && payload.data.is_management_key !== true;
    case 'chat':
      return isNonemptyString(payload.id) && isNonemptyString(payload.model)
        && Array.isArray(payload.choices) && payload.choices.length > 0
        && payload.choices.every(choice => isRecord(choice) && isRecord(choice.message)
          && choice.message.role === 'assistant' && typeof choice.message.content === 'string'
          && ['stop', 'length'].includes(String(choice.finish_reason)));
    case 'message':
      return payload.type === 'message' && payload.role === 'assistant' && isNonemptyString(payload.id)
        && isNonemptyString(payload.model) && Array.isArray(payload.content)
        && payload.content.every(block => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
        && ['end_turn', 'max_tokens', 'stop_sequence'].includes(String(payload.stop_reason));
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) {
    await response.body?.cancel();
    throw new ProbeResponseError('invalid-response');
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new ProbeResponseError('oversized-response');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ProbeResponseError('invalid-response');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProbeResponseError('oversized-response');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ProbeResponseError('invalid-response');
  }
}

function httpFailure(status: number): ProviderConnectionTestResult {
  if (status === 401 || status === 403) return failure('Authentication failed. Check the API key and account permissions.', 'auth', status);
  if (status === 402 || status === 429) return failure('The provider is rate limited or has insufficient quota. The connection could not be verified.', 'quota', status);
  if (status === 404 || status === 405) return failure('This endpoint does not support the test API. Check the Base URL; credentials have not been verified.', 'unsupported-endpoint', status);
  if (status >= 300 && status < 400) return failure('The endpoint redirected the test. Use the final API Base URL; credentials were not forwarded.', 'redirect', status);
  if (status === 400 || status === 422) return failure('The provider rejected the test request. Check the endpoint and model; this is not a successful test.', 'rejected-request', status);
  return failure(`The provider returned HTTP ${status}. The connection could not be verified.`, 'http', status);
}

export async function testProviderConnection(
  provider: string,
  input: ProviderConnectionConfig,
  options: ConnectionTestOptions = {},
): Promise<ProviderConnectionTestResult> {
  if (typeof provider !== 'string' || !isRecord(input)) return failure('Invalid provider test configuration.', 'invalid-config');
  for (const name of ['apiKey', 'baseUrl', 'region', 'model', 'accountId', 'claudeProfileId']) {
    if (input[name as keyof ProviderConnectionConfig] !== undefined && typeof input[name as keyof ProviderConnectionConfig] !== 'string') {
      return failure('Invalid provider test configuration.', 'invalid-config');
    }
  }
  if ((typeof input.baseUrl === 'string' && input.baseUrl.length > 8_192)
    || (typeof input.region === 'string' && input.region.length > 128)
    || (typeof input.accountId === 'string' && input.accountId.length > 256)
    || (typeof input.claudeProfileId === 'string' && input.claudeProfileId.length > 256)) {
    return failure('Invalid provider test configuration.', 'invalid-config');
  }
  if ((input.mode !== undefined && (typeof input.mode !== 'string' || !['connection', 'model'].includes(input.mode)))
    || (input.authType !== undefined && (typeof input.authType !== 'string' || !['oauth', 'api-key'].includes(input.authType)))
    || (input.billingModel !== undefined && (typeof input.billingModel !== 'string' || !['subscription', 'pay-per-use'].includes(input.billingModel)))) {
    return failure('Invalid provider test configuration.', 'invalid-config');
  }
  const probe = makeProbe(provider, input, options.env ?? process.env);
  if ('success' in probe) return probe;
  if (options.signal?.aborted) return failure('The connection test was cancelled.', 'cancelled');
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? TEST_TIMEOUT_MS);
  timeout.unref?.();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await (options.fetch ?? fetch)(probe.url, {
      method: probe.body ? 'POST' : 'GET',
      headers: probe.headers,
      ...(probe.body ? { body: probe.body } : {}),
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!response.ok) {
      await response.body?.cancel();
      return httpFailure(response.status);
    }
    const payload = await readBoundedJson(response);
    if (!validResponse(payload, probe.responseKind)) {
      return failure('The endpoint returned an unexpected response. Check the API Base URL; the connection has not been verified.', 'unexpected-response');
    }
    return {
      success: true,
      code: probe.body ? 'model-verified'
        : provider === 'openai-compatible' || provider === 'ollama' ? 'endpoint-reachable' : 'metadata-verified',
      message: probe.body ? 'The selected model accepted the minimal test request.'
        : provider === 'openai-compatible' || provider === 'ollama'
          ? 'The model list is reachable. Model inference and server-side credential enforcement were not tested.'
          : 'The provider accepted the metadata test. Model inference and available quota were not tested.',
    };
  } catch (error) {
    if (timedOut) return failure('Connection test timed out. Check the network and Base URL.', 'timeout');
    if (options.signal?.aborted) return failure('The connection test was cancelled.', 'cancelled');
    if (error instanceof ProbeResponseError) {
      return failure('The endpoint returned an unexpected response. Check the API Base URL; the connection has not been verified.', 'unexpected-response');
    }
    // Never expose provider error bodies or fetch errors: they can echo secrets.
    return failure('The connection test failed. Check the network, TLS certificate, and API Base URL.', 'network');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
