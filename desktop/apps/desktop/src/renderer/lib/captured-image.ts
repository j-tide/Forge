import { MAX_IMAGE_SIZE } from '../../shared/constants';

export interface CapturedImage {
  /** Raw base64 payload expected by attachments and the model SDK. */
  data: string;
  /** Canonical browser image source, with exactly one PNG prefix. */
  dataUrl: string;
  size: number;
}

/** Main returns a complete PNG data URL; older callers may provide bare base64. */
export function normalizeCapturedImage(value: string): CapturedImage | null {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  const data = input.startsWith('data:')
    ? /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input)?.[1]
    : input;
  if (!data || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const size = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  const normalized = { data, dataUrl: `data:image/png;base64,${data}`, size };
  // Let callers display the existing size-limit guidance without decoding a huge payload.
  if (size > MAX_IMAGE_SIZE) return normalized;
  let bytes: string;
  try { bytes = atob(data); } catch { return null; }
  if (bytes.length < 33 || bytes.slice(0, 8) !== '\x89PNG\r\n\x1a\n') return null;
  const readUint32 = (offset: number) => ((bytes.charCodeAt(offset) << 24) |
    (bytes.charCodeAt(offset + 1) << 16) | (bytes.charCodeAt(offset + 2) << 8) |
    bytes.charCodeAt(offset + 3)) >>> 0;
  if (readUint32(8) !== 13 || bytes.slice(12, 16) !== 'IHDR' ||
    readUint32(16) === 0 || readUint32(20) === 0) return null;
  let offset = 8;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(offset);
    const type = bytes.slice(offset + 4, offset + 8);
    const nextOffset = offset + length + 12;
    if (nextOffset > bytes.length) return null;
    if (type === 'IDAT') hasImageData = true;
    if (type === 'IEND') return length === 0 && nextOffset === bytes.length && hasImageData ? normalized : null;
    offset = nextOffset;
  }
  return null;
}
