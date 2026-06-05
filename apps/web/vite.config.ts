import { createHash } from 'node:crypto';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { PWA_CACHE_PREFIX } from './src/mobile/pwa-shared.js';

function mobileStaticShell(): Plugin {
  return {
    name: 'forge-mobile-static-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const builtAssets = Object.keys(bundle).filter((name) =>
        /^assets\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:js|css)$/.test(name))
        .sort().map((name) => `/${name}`);
      const staticPaths = ['/index.html', '/favicon.svg', '/manifest.webmanifest',
        '/forge-192.png', '/forge-512.png', ...builtAssets];
      const revision = createHash('sha256').update(staticPaths.join('\n')).digest('hex').slice(0, 16);
      const source = `/* Generated from the current Vite output. Only listed static GETs are cached. */
const CACHE = '${PWA_CACHE_PREFIX}${revision}';
const PREFIX = '${PWA_CACHE_PREFIX}';
const STATIC_PATHS = new Set(${JSON.stringify(staticPaths)});
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...STATIC_PATHS]))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
    .map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/v1' ||
      url.pathname.startsWith('/v1/')) return;
  if (request.mode === 'navigate') {
    if (url.pathname !== '/' && url.pathname !== '/index.html') return;
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() =>
      caches.match('/index.html')));
    return;
  }
  if (!STATIC_PATHS.has(url.pathname)) return;
  event.respondWith(caches.match(url.pathname).then((cached) => cached || fetch(request)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [vue(), mobileStaticShell()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
});
