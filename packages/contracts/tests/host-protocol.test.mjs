import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hostHealthSchema,
  hostProtocolVersion,
  systemCommandEnvelopeSchema,
  hostWireRequestSchema,
} from '../dist/index.js';

test('Host health requires runtime identity and rejects extra fields', () => {
  const health = {
    status: 'ready', hostId: 'fd54e128-cd81-4c94-8b48-b3ccf1e42ec5', pid: 4321,
    version: '0.0.1', productVersion: '0.0.1', protocolVersion: hostProtocolVersion,
    startedAt: '2026-09-23T00:00:00.000Z', uptimeMs: 100,
    timestamp: '2026-09-23T00:00:00.100Z',
    runtime: { version: 'v24.21.0', node: '24.21.0', modules: '149', electron: '44.4.3', platform: 'darwin', arch: 'arm64' },
    storage: { status: 'ready', schemaVersion: 2, sqliteVersion: '3.53.4', journalMode: 'wal', error: null },
  };
  assert.equal(hostHealthSchema.safeParse(health).success, true);
  assert.equal(hostHealthSchema.safeParse({ ...health, status: 'online' }).success, false);
  assert.equal(hostHealthSchema.safeParse({ ...health, secret: 'must reject' }).success, false);
});

test('system command rejects forged context and invalid payload', () => {
  const command = {
    schemaVersion: '1.0', commandId: 'cmd-1', type: 'system.health',
    createdAt: '2026-09-23T00:00:00.000Z', protocolVersion: hostProtocolVersion,
    payload: {},
  };
  assert.equal(systemCommandEnvelopeSchema.safeParse(command).success, true);
  assert.equal(systemCommandEnvelopeSchema.safeParse({ ...command, actor: 'owner' }).success, false);
  assert.equal(systemCommandEnvelopeSchema.safeParse({ ...command, payload: { shell: 'any' } }).success, false);
  assert.equal(hostWireRequestSchema.safeParse({ kind: 'command', requestId: 'req-1', command }).success, true);
  assert.equal(hostWireRequestSchema.safeParse({ kind: 'command', requestId: 'req-1', command, extra: 1 }).success, false);
});
