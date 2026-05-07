import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserMobilePlatformBridge } from '../dist/index.js';

test('browser PWA exposes no fabricated native mobile capabilities', () => {
  assert.equal(browserMobilePlatformBridge.kind, 'web');
  for (const name of ['push', 'secureStore', 'scanner']) {
    const capability = browserMobilePlatformBridge[name];
    assert.deepEqual(capability, {
      available: false, reason: 'native-adapter-unavailable',
    });
    assert.equal('port' in capability, false);
  }
});
