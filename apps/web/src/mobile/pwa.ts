import { allowedOrigin } from './pairing';
import { PWA_CACHE_PREFIX } from './pwa-shared';
import { clearRedactedSummary } from './offline-summary';
import { clearMessageDraft } from './message-draft';

/** Only the built mobile route registers. The worker never queues commands. */
export async function registerMobileShell(): Promise<boolean> {
  if (!import.meta.env.PROD || !allowedOrigin() ||
      !('serviceWorker' in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    return ready?.scope === registration.scope && registration.active?.state === 'activated' &&
      (await caches.keys()).some((name) => name.startsWith(PWA_CACHE_PREFIX));
  } catch {
    return false;
  }
}

/** Remove this app's static shell, redacted counts and unsent tab draft. Host data remains. */
export async function clearMobileShellCache(): Promise<boolean> {
  const summaryRemoved = clearRedactedSummary();
  const draftRemoved = clearMessageDraft();
  if (!allowedOrigin() || !('caches' in window) ||
      !('serviceWorker' in navigator)) return false;
  const names = (await caches.keys()).filter((name) => name.startsWith(PWA_CACHE_PREFIX));
  const removed = await Promise.all(names.map((name) => caches.delete(name)));
  const registrations = await navigator.serviceWorker.getRegistrations();
  const workerUrl = new URL('/sw.js', location.origin).href;
  const own = registrations.filter((registration) =>
    [registration.active, registration.waiting, registration.installing].some((worker) =>
      worker?.scriptURL === workerUrl));
  const unregistered = await Promise.all(own.map((registration) => registration.unregister()));
  return summaryRemoved && draftRemoved && removed.every(Boolean) && unregistered.every(Boolean);
}
