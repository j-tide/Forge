import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearMobileShellCache } from './pwa';

afterEach(() => { vi.unstubAllGlobals(); });

describe('mobile PWA cache boundary', () => {
  it('clears only the Forge shell and worker, preserving other origin caches', async () => {
    vi.stubGlobal('location', {
      protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:58841',
    });
    const removed: string[] = [];
    const ownUnregister = vi.fn().mockResolvedValue(true);
    const otherUnregister = vi.fn().mockResolvedValue(true);
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { removeItem });
    vi.stubGlobal('caches', {
      keys: async () => ['forge-shell-abc', 'unrelated-origin-cache'],
      delete: async (name: string) => { removed.push(name); return true; },
    });
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [
      { active: { scriptURL: 'http://127.0.0.1:58841/sw.js' }, unregister: ownUnregister },
      { active: { scriptURL: 'http://127.0.0.1:58841/other-sw.js' }, unregister: otherUnregister },
    ] } });

    expect(await clearMobileShellCache()).toBe(true);
    expect(removed).toEqual(['forge-shell-abc']);
    expect(removeItem).toHaveBeenCalledWith('forge-mobile-redacted-summary/v1');
    expect(ownUnregister).toHaveBeenCalledOnce();
    expect(otherUnregister).not.toHaveBeenCalled();
  });
});
