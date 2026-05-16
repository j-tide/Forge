import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostProtocolVersion } from '@forge/contracts';
import { SystemCommandBus } from '../dist/commands.js';

const info = {
  status: 'ready', hostId: 'fd54e128-cd81-4c94-8b48-b3ccf1e42ec5', pid: 4321,
  version: '0.0.1', productVersion: '0.0.1', protocolVersion: hostProtocolVersion,
  startedAt: '2026-09-23T00:00:00.000Z',
};
const context = { transport: 'cli', callerId: 'test-channel' };
const command = (commandId, type = 'system.ping') => ({
  schemaVersion: '1.0', commandId, type, payload: {},
  createdAt: '2026-09-23T00:00:00.000Z', protocolVersion: hostProtocolVersion,
});

test('only registered system commands run and unknown commands are rejected', () => {
  const bus = new SystemCommandBus({ info: () => info, health: () => ({ ...info, uptimeMs: 10, timestamp: new Date().toISOString() }) });
  assert.equal(bus.execute(command('ping-1'), context).ok, true);
  const unknown = bus.execute(command('unknown-1', 'shell.any'), context);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'UNKNOWN_COMMAND');
  assert.equal(bus.execute({ ...command('forged-1'), actor: 'owner' }, context).error.code, 'VALIDATION_ERROR');
});

test('same command ID returns one receipt and conflicting content is rejected', () => {
  let infoCalls = 0;
  const bus = new SystemCommandBus({ info: () => { infoCalls += 1; return info; }, health: () => ({ ...info, uptimeMs: 10, timestamp: new Date().toISOString() }) });
  const first = bus.execute(command('same-id', 'system.info'), context);
  const replay = bus.execute(command('same-id', 'system.info'), context);
  assert.deepEqual(replay, first);
  assert.equal(infoCalls, 1);
  assert.equal(bus.execute(command('same-id', 'system.ping'), context).error.code, 'IDEMPOTENCY_CONFLICT');
});

test('protocol mismatch is refused before dispatch', () => {
  const bus = new SystemCommandBus({ info: () => info, health: () => ({ ...info, uptimeMs: 10, timestamp: new Date().toISOString() }) });
  const result = bus.execute({ ...command('bad-protocol'), protocolVersion: 'forge-host-protocol/v999' }, context);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'PROTOCOL_MISMATCH');
});
