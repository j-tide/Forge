import { z } from 'zod';

const uuid = z.uuid();
const claimSchema = z.strictObject({
  status: z.literal('pending'), pairingId: uuid, claimSecret: z.string().min(40).max(128),
  expiresAt: z.iso.datetime(),
});
const statusSchema = z.strictObject({
  status: z.enum(['pending', 'approved', 'expired']), deviceId: uuid.nullable(),
  csrfToken: z.string().nullable(), expiresAt: z.iso.datetime().nullable(),
});
const currentSchema = z.strictObject({
  sessionId: uuid, deviceId: uuid, projectIds: z.array(uuid).max(32),
  policyRevision: z.number().int().positive(),
  expiresAt: z.iso.datetime(), csrfToken: z.string().min(40).max(128),
});
const revokedSchema = z.strictObject({ revoked: z.literal(true) });

export type MobileSession = z.infer<typeof currentSchema>;
export type PairingClaim = z.infer<typeof claimSchema>;
export type PairingStatus = z.infer<typeof statusSchema>;

export function allowedOrigin(): boolean {
  if (typeof location === 'undefined') return false;
  return location.protocol === 'https:' || (location.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname));
}

/** A definite Host rejection is safe to report without replaying the write. */
export async function isCsrfRejection(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  const body: unknown = await response.json().catch(() => null);
  return !!body && typeof body === 'object' && 'code' in body &&
    body.code === 'REMOTE_CSRF_REJECTED';
}

async function call(path: string, body?: Record<string, string>, csrf?: string): Promise<Response> {
  if (!allowedOrigin()) throw new Error('REMOTE_SECURE_ORIGIN_REQUIRED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(path, {
      method: body || csrf ? 'POST' : 'GET',
      credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error',
      headers: {
        'X-Forge-Session': '1',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } finally { clearTimeout(timeout); }
}

async function json(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.startsWith('application/json')) {
    throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
  }
  return response.json();
}

export async function currentSession(): Promise<MobileSession | null> {
  const response = await call('/v1/session/current');
  const data = await json(response);
  if (response.status === 401) return null;
  if (response.status === 403 && (data as { code?: unknown }).code ===
      'REMOTE_AUTH_REVOKED') throw new Error('REMOTE_AUTH_REVOKED');
  if (!response.ok) throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
  return currentSchema.parse(data);
}

export async function claimPairing(nonce: string, deviceLabel: string): Promise<PairingClaim> {
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(nonce) || !deviceLabel.trim() ||
      deviceLabel.length > 80) throw new Error('REMOTE_PAIRING_INPUT_INVALID');
  const response = await call('/v1/pair/claim', { nonce, deviceLabel: deviceLabel.trim() });
  const data = await json(response);
  if (!response.ok) throw new Error('REMOTE_PAIRING_REJECTED');
  return claimSchema.parse(data);
}

export async function checkPairing(claimSecret: string): Promise<PairingStatus> {
  const response = await call('/v1/pair/status', { claimSecret });
  const data = await json(response);
  if (!response.ok) throw new Error('REMOTE_PAIRING_REJECTED');
  return statusSchema.parse(data);
}

export async function revokeSession(csrfToken: string): Promise<void> {
  const response = await call('/v1/session/revoke', undefined, csrfToken);
  const data = await json(response);
  if (!response.ok) throw new Error('REMOTE_SESSION_REVOKE_FAILED');
  revokedSchema.parse(data);
}
