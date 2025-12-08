import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HostRuntime } from '../dist/runtime.js';
import { forgeError } from '@forge/contracts';

test('Host runtime follows explicit lifecycle transitions', () => {
  const runtime = new HostRuntime({ hostVersion: '0.0.1', productVersion: '0.0.1', transport: 'cli', ownershipToken: null });
  assert.equal(runtime.info().status, 'starting');
  runtime.transition('ready');
  assert.equal(runtime.health().status, 'ready');
  assert.ok(runtime.health().uptimeMs >= 0);
  assert.throws(() => runtime.transition('offline'), /Invalid Host status transition/);
  runtime.setStorageHealth({ status: 'unavailable', schemaVersion: null, sqliteVersion: null,
    journalMode: 'unknown', error: forgeError('DATABASE_OPEN_FAILED', 'Forge storage could not open', 'runtime-test') });
  assert.equal(runtime.health().status, 'degraded');
  runtime.setStorageHealth({ status: 'ready', schemaVersion: 2, sqliteVersion: '3.53.4', journalMode: 'wal', error: null });
  assert.equal(runtime.health().status, 'ready');
  assert.equal(runtime.health().storage.schemaVersion, 2);
  runtime.transition('stopping');
  runtime.transition('offline');
  assert.equal(runtime.info().status, 'offline');
});
