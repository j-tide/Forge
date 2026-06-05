import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const root = new URL('../apps/web/dist/', import.meta.url);
const id = (path) => new URL(path, root);

test('built PWA manifest has real PNG icons and mobile start route', () => {
  const manifest = JSON.parse(readFileSync(id('manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, '/#/m/inbox');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
  for (const icon of manifest.icons) {
    const data = readFileSync(id(icon.src.slice(1)));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.equal(data.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
    assert.equal(data.readUInt32BE(20), Number(icon.sizes.split('x')[1]));
  }
});

test('generated service worker caches static shell only and never intercepts Host API or POST', async () => {
  const source = readFileSync(id('sw.js'), 'utf8');
  const handlers = new Map();
  let precached = [];
  const cachedIndex = { ok: true, marker: 'static-shell' };
  const cache = { addAll: async (paths) => { precached = paths; } };
  const caches = {
    open: async (name) => { assert.match(name, /^forge-shell-[a-f0-9]{16}$/); return cache; },
    keys: async () => [], delete: async () => true,
    match: async (path) => path === '/index.html' ? cachedIndex : undefined,
  };
  const self = {
    location: { origin: 'http://127.0.0.1:60888' },
    addEventListener: (name, listener) => handlers.set(name, listener),
    skipWaiting: async () => {}, clients: { claim: async () => {} },
  };
  runInNewContext(source, { self, caches, URL, Promise, fetch: async () => {
    throw new Error('offline');
  } });
  let installing;
  handlers.get('install')({ waitUntil: (value) => { installing = value; } });
  await installing;
  assert.ok(precached.includes('/index.html'));
  assert.ok(precached.includes('/manifest.webmanifest'));
  assert.ok(precached.includes('/forge-192.png'));
  assert.ok(precached.some((path) => /^\/assets\/index-.*\.js$/.test(path)));
  assert.ok(precached.every((path) => !path.startsWith('/v1/') &&
    !path.includes('commands') && !path.includes('evidence')));
  function intercepted(method, path, mode = 'same-origin') {
    let promise;
    handlers.get('fetch')({ request: {
      method, mode, url: `${self.location.origin}${path}`,
    }, respondWith: (value) => { promise = value; } });
    return promise;
  }
  assert.equal(intercepted('GET', '/v1/projects'), undefined);
  assert.equal(intercepted('GET', '/v1/approvals/123'), undefined);
  assert.equal(intercepted('POST', '/v1/commands'), undefined);
  assert.equal(intercepted('GET', '/private-source.zip'), undefined);
  assert.deepEqual(await intercepted('GET', '/', 'navigate'), cachedIndex);
  assert.deepEqual(await intercepted('GET', '/index.html', 'navigate'), cachedIndex);
});
