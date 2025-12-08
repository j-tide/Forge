import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { hostProtocolVersion, hostWireResponseSchema } from '@forge/contracts';
import { ForgePersistence } from '@forge/persistence';

const entry = fileURLToPath(new URL('../dist/index.js', import.meta.url));

function launch(existingDataDir) {
  const token = randomUUID();
  const dataDir = existingDataDir ?? mkdtempSync(join(tmpdir(), 'forge-host-test-'));
  const child = fork(entry, [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { ...process.env, FORGE_HOST_TRANSPORT: 'cli', FORGE_HOST_OWNERSHIP_TOKEN: token,
      FORGE_HOST_DATA_DIR: dataDir, FORGE_ENVIRONMENT: 'test' },
  });
  return { child, token, dataDir };
}

function message(child, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Host message timeout')); }, timeoutMs);
    const onMessage = (raw) => {
      const parsed = hostWireResponseSchema.safeParse(raw);
      if (!parsed.success) { cleanup(); reject(new Error('Invalid Host response')); return; }
      if (predicate(parsed.data)) { cleanup(); resolve(parsed.data); }
    };
    const onExit = () => { cleanup(); reject(new Error('Host exited before response')); };
    function cleanup() { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); }
    child.on('message', onMessage);
    child.on('exit', onExit);
  });
}

async function request(child, body) {
  const response = message(child, (item) => item.requestId === body.requestId);
  child.send(body);
  return response;
}

test('real Node Host validates handshake, executes health, rejects invalid input and shuts down', async (t) => {
  const { child, token, dataDir } = launch();
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); rmSync(dataDir, { recursive: true, force: true }); });
  const ready = await message(child, (item) => item.kind === 'ready');
  assert.equal(ready.info.pid, child.pid);
  assert.match(ready.info.hostId, /^[0-9a-f-]{36}$/);
  assert.equal(ready.info.status, 'ready');
  assert.equal(ready.info.runtime.node, process.versions.node);
  assert.equal(ready.info.runtime.modules, process.versions.modules);

  const mismatch = await request(child, {
    kind: 'hello', requestId: 'hello-wrong', protocolVersion: 'forge-host-protocol/v999',
    productVersion: '0.0.1', hostVersion: '0.0.1', ownershipToken: token,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, 'PROTOCOL_MISMATCH');

  const versionMismatch = await request(child, {
    kind: 'hello', requestId: 'hello-version-wrong', protocolVersion: hostProtocolVersion,
    productVersion: '9.9.9', hostVersion: '0.0.1', ownershipToken: token,
  });
  assert.equal(versionMismatch.ok, false);
  assert.equal(versionMismatch.error.code, 'VERSION_MISMATCH');

  const hostVersionMismatch = await request(child, {
    kind: 'hello', requestId: 'hello-host-version-wrong', protocolVersion: hostProtocolVersion,
    productVersion: '0.0.1', hostVersion: '9.9.9', ownershipToken: token,
  });
  assert.equal(hostVersionMismatch.ok, false);
  assert.equal(hostVersionMismatch.error.code, 'VERSION_MISMATCH');

  const beforeHandshake = await request(child, {
    kind: 'command', requestId: 'pre-auth', command: {
      schemaVersion: '1.0', commandId: 'pre-auth-command', type: 'system.health',
      createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload: {},
    },
  });
  assert.equal(beforeHandshake.result.error.code, 'UNAUTHENTICATED');

  const hello = await request(child, {
    kind: 'hello', requestId: 'hello-good', protocolVersion: hostProtocolVersion,
    productVersion: '0.0.1', hostVersion: '0.0.1', ownershipToken: token,
  });
  assert.equal(hello.ok, true);
  assert.equal(hello.info.hostId, ready.info.hostId);
  const listenersBefore = child.listenerCount('message');
  for (let i = 0; i < 5; i += 1) {
    const health = await request(child, {
      kind: 'command', requestId: `health-${i}`, command: {
        schemaVersion: '1.0', commandId: `health-command-${i}`, type: 'system.health',
        createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload: {},
      },
    });
    assert.equal(health.result.ok, true);
    assert.equal(health.result.data.pid, child.pid);
    assert.equal(health.result.data.hostId, ready.info.hostId);
    assert.equal(health.result.data.storage.status, 'ready');
    assert.equal(health.result.data.storage.schemaVersion, 2);
    assert.equal(child.listenerCount('message'), listenersBefore);
  }

  const unknown = await request(child, {
    kind: 'command', requestId: 'unknown-command', command: {
      schemaVersion: '1.0', commandId: 'unknown-1', type: 'shell.any',
      createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload: {},
    },
  });
  assert.equal(unknown.result.error.code, 'UNKNOWN_COMMAND');
  const invalid = await request(child, {
    kind: 'command', requestId: 'invalid-payload', command: {
      schemaVersion: '1.0', commandId: 'invalid-1', type: 'system.ping',
      createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload: { shell: 'any' },
    },
  });
  assert.equal(invalid.kind, 'protocol-error');
  assert.equal(invalid.error.code, 'VALIDATION_ERROR');

  const exited = once(child, 'exit');
  const shutdown = await request(child, { kind: 'shutdown', requestId: 'shutdown-1', hostId: ready.info.hostId, ownershipToken: token });
  assert.equal(shutdown.ok, true);
  const [exitCode] = await exited;
  assert.equal(exitCode, 0);
  assert.equal(child.connected, false);
  const closedError = await new Promise((resolve) => child.send({ kind: 'command', requestId: 'after-shutdown' }, resolve));
  assert.equal(closedError?.code, 'ERR_IPC_CHANNEL_CLOSED');
});

test('real Host crash closes its private IPC channel', async (t) => {
  const { child, token, dataDir } = launch();
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); rmSync(dataDir, { recursive: true, force: true }); });
  await message(child, (item) => item.kind === 'ready');
  const hello = await request(child, {
    kind: 'hello', requestId: 'hello-crash', protocolVersion: hostProtocolVersion,
    productVersion: '0.0.1', hostVersion: '0.0.1', ownershipToken: token,
  });
  assert.equal(hello.ok, true);
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  assert.equal(child.connected, false);
});

test('Host restart preserves internal metadata and advances its startup counter', async (t) => {
  const first = launch();
  t.after(() => rmSync(first.dataDir, { recursive: true, force: true }));
  const firstReady = await message(first.child, (item) => item.kind === 'ready');
  assert.equal(firstReady.info.status, 'ready');
  const firstExited = once(first.child, 'exit');
  first.child.kill('SIGTERM');
  await firstExited;
  const storage = new ForgePersistence(first.dataDir);
  await storage.open(); storage.migrate();
  assert.equal(storage.getMetadata('host.startup_count'), '1');
  assert.equal(storage.getMetadata('host.last_id'), firstReady.info.hostId);
  storage.close();

  const second = launch(first.dataDir);
  t.after(() => { if (second.child.exitCode === null) second.child.kill('SIGKILL'); });
  const secondReady = await message(second.child, (item) => item.kind === 'ready');
  assert.notEqual(secondReady.info.hostId, firstReady.info.hostId);
  assert.equal(secondReady.info.status, 'ready');
  const secondExited = once(second.child, 'exit');
  second.child.kill('SIGTERM');
  await secondExited;
  await storage.open(); storage.migrate();
  assert.equal(storage.getMetadata('host.startup_count'), '2');
  assert.equal(storage.getMetadata('host.last_id'), secondReady.info.hostId);
  storage.close();
});

test('invalid Host DB yields degraded health without exposing its file path', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'forge-host-invalid-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  writeFileSync(join(dataDir, 'forge.sqlite'), 'not a SQLite database');
  const { child, token } = launch(dataDir);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const ready = await message(child, (item) => item.kind === 'ready');
  assert.equal(ready.info.status, 'degraded');
  const hello = await request(child, { kind: 'hello', requestId: 'degraded-hello',
    protocolVersion: hostProtocolVersion, productVersion: '0.0.1', hostVersion: '0.0.1', ownershipToken: token });
  assert.equal(hello.ok, true);
  const health = await request(child, { kind: 'command', requestId: 'degraded-health', command: {
    schemaVersion: '1.0', commandId: 'degraded-health-command', type: 'system.health',
    createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload: {},
  } });
  assert.equal(health.result.data.status, 'degraded');
  assert.equal(health.result.data.storage.status, 'unavailable');
  assert.equal(health.result.data.storage.error.code, 'DATABASE_CORRUPT');
  assert.doesNotMatch(JSON.stringify(health), new RegExp(dataDir));
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
});
