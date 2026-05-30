import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPairing, claimPairing, currentSession, revokeSession } from './pairing';

const uuid = '40aeb789-5011-40d1-a61c-748f661bcc5a';
const secret = 'A'.repeat(43);
function response(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status,
    headers: { 'Content-Type': 'application/json' } });
}
afterEach(() => vi.unstubAllGlobals());

describe('same-origin mobile pairing transport', () => {
  it('distinguishes an unpaired Host from a normal Web dev server', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(401, { code: 'REMOTE_AUTH_REJECTED' }))
      .mockResolvedValueOnce(response(403, { code: 'REMOTE_AUTH_REVOKED' }))
      .mockResolvedValueOnce(new Response('<html>Forge</html>', { status: 200,
        headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', fetch);
    expect(await currentSession()).toBeNull();
    await expect(currentSession()).rejects.toThrow('REMOTE_AUTH_REVOKED');
    await expect(currentSession()).rejects.toThrow('REMOTE_GATEWAY_UNAVAILABLE');
    expect(fetch.mock.calls[0]?.[0]).toBe('/v1/session/current');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin',
      mode: 'same-origin', cache: 'no-store', redirect: 'error' });
  });

  it('holds only the one-time claim in caller memory and uses fixed endpoints', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(202, {
      status: 'pending', pairingId: uuid, claimSecret: secret,
      expiresAt: '2026-09-25T09:30:00Z',
    })).mockResolvedValueOnce(response(200, {
      status: 'pending', deviceId: null, csrfToken: null,
      expiresAt: '2026-09-25T09:00:00Z',
    })).mockResolvedValueOnce(response(200, { revoked: true }));
    vi.stubGlobal('fetch', fetch);
    const claimed = await claimPairing(secret, '  Phone  ');
    expect(claimed.claimSecret).toBe(secret);
    expect(fetch.mock.calls[0]?.[0]).toBe('/v1/pair/claim');
    expect(JSON.parse(fetch.mock.calls[0]?.[1]?.body as string))
      .toEqual({ nonce: secret, deviceLabel: 'Phone' });
    expect((await checkPairing(claimed.claimSecret)).status).toBe('pending');
    expect(fetch.mock.calls[1]?.[0]).toBe('/v1/pair/status');
    await revokeSession(secret);
    expect(fetch.mock.calls[2]?.[0]).toBe('/v1/session/revoke');
    expect(fetch.mock.calls[2]?.[1]?.headers['X-CSRF-Token']).toBe(secret);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('rejects malformed input and malformed Host output before state changes', async () => {
    const fetch = vi.fn().mockResolvedValue(response(202, {
      status: 'approved', pairingId: uuid, claimSecret: secret,
      expiresAt: '2026-09-25T09:30:00Z',
    }));
    vi.stubGlobal('fetch', fetch);
    await expect(claimPairing('short', 'Phone')).rejects.toThrow('REMOTE_PAIRING_INPUT_INVALID');
    await expect(claimPairing(secret, 'Phone')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
