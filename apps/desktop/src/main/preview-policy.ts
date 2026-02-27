/** Local development previews have one exact loopback origin, never a file or remote URL. */
export function parseLocalPreviewUrl(raw: string): URL {
  if (raw.length > 2048) throw new Error('PREVIEW_URL_REJECTED');
  let target: URL;
  try { target = new URL(raw); } catch { throw new Error('PREVIEW_URL_REJECTED'); }
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' ||
    !target.port || target.username || target.password) throw new Error('PREVIEW_URL_REJECTED');
  return target;
}

export function isPreviewRequestAllowed(raw: string, origin: string): boolean {
  try {
    const request = new URL(raw);
    return request.protocol === 'http:' && request.origin === origin;
  } catch { return false; }
}
