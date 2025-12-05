import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForgeClient, LocalTransport } from '../dist/index.js';

test('plain Web ForgeClient returns unavailable health without touching Electron', async () => {
  const client = new ForgeClient();
  assert.equal((await client.connect()).state, 'unavailable');
  const result = await client.health();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'HOST_UNAVAILABLE');
});

test('LocalTransport reports timeout and cleans its status listener on disconnect', async () => {
  const callbacks = new Set();
  const bridge = {
    platform: 'darwin',
    hostStatus: async () => ({ revision: 1, state: 'starting', info: null, health: null, lastHealthCheck: null, error: null }),
    hostHealth: () => new Promise(() => {}),
    invokeSystem: () => new Promise(() => {}),
    onHostStatus(listener) { callbacks.add(listener); return () => callbacks.delete(listener); },
  };
  const transport = new LocalTransport(bridge, 15);
  await transport.connect();
  assert.equal(callbacks.size, 1);
  const result = await transport.health();
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'TRANSPORT_TIMEOUT');
  assert.equal(transport.status.state, 'unavailable');
  transport.disconnect();
  assert.equal(callbacks.size, 0);
});
