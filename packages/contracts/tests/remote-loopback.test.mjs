import assert from 'node:assert/strict';
import { test } from 'node:test';
import { remoteLoopbackActionSchema, remoteLoopbackStateSchema } from '../dist/index.js';

test('local gateway bridge admits only fixed actions and loopback origin', () => {
  assert.equal(remoteLoopbackActionSchema.parse('start'), 'start');
  assert.equal(remoteLoopbackActionSchema.safeParse('publish').success, false);
  const hostId = '4258436f-9d58-420a-b85b-7742e179c5ef';
  assert.equal(remoteLoopbackStateSchema.parse({ running: true,
    origin: 'http://127.0.0.1:51324', hostId }).hostId, hostId);
  assert.equal(remoteLoopbackStateSchema.safeParse({ running: true,
    origin: 'http://0.0.0.0:51324', hostId }).success, false);
  assert.equal(remoteLoopbackStateSchema.safeParse({ running: false,
    origin: 'http://127.0.0.1:51324', hostId }).success, false);
});
