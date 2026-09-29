/** Z.AI exposes separate OpenAI and Anthropic compatible routes. */
export const ZAI_GENERAL_API = 'https://api.z.ai/api/paas/v4';
export const ZAI_CODING_API = 'https://api.z.ai/api/coding/paas/v4';

export function isZaiAnthropicEndpoint(baseURL: string): boolean {
  try {
    return /\/anthropic(?:\/v1)?\/?$/.test(new URL(baseURL).pathname);
  } catch {
    return false;
  }
}

/** @ai-sdk/anthropic appends /messages, so the prefix must include /v1. */
export function zaiAnthropicBaseURL(baseURL: string): string {
  const url = new URL(baseURL);
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/v1')) url.pathname += '/v1';
  return url.toString().replace(/\/$/, '');
}
