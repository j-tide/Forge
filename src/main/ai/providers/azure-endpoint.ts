/**
 * Azure's SDK appends /v1 (and deployment paths when requested) to its prefix.
 * Settings accept a resource root, /openai, or a copied /openai/v1 endpoint.
 * Normalizing the SDK prefix leaves the user's saved setting unchanged.
 */
export function azureSdkBaseURL(baseURL: string | undefined): string | undefined {
  if (!baseURL) return undefined;
  const url = new URL(baseURL);
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = !pathname ? '/openai'
    : pathname.endsWith('/v1') ? pathname.slice(0, -3) : pathname;
  return url.toString().replace(/\/$/, '');
}
