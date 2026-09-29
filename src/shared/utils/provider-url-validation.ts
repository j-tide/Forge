export type ProviderUrlValidation =
  | { valid: true; url: URL }
  | { valid: false; code: 'invalid-url' | 'insecure-url' };

/** Shared by account forms, persistence and probes; never echoes the input. */
export function validateProviderBaseUrl(
  baseUrl: string,
  options: { apiKey?: string } = {},
): ProviderUrlValidation {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return { valid: false, code: 'invalid-url' };
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
    return { valid: false, code: 'invalid-url' };
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (options.apiKey?.trim() && url.protocol === 'http:' && !loopback) {
    return { valid: false, code: 'insecure-url' };
  }
  return { valid: true, url };
}
