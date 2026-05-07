import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RemoteStreamTransport } from '../dist/index.js';

const projectId = '40aeb789-5011-40d1-a61c-748f661bcc5a';
const event = {
  id: 'p:10', hostId: 'fixture-host', projectId,
  taskId: null, entityId: '31ef81d5-3884-4a72-8bf4-0b28ce98130a',
  type: 'conversation.changed', occurredAt: '2026-09-25T12:00:00Z',
};
function stream(text) {
  return new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(text)); controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}
function chunkedStream(chunks) {
  return new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    controller.close();
  } }), { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
}
function done() {
  let resolve;
  const promise = new Promise((value) => { resolve = value; });
  return { promise, resolve };
}

test('remote stream accepts only scoped invalidations and never turns an event into command success', async () => {
  const finished = done();
  const states = [];
  const requests = [];
  const events = [];
  const transport = new RemoteStreamTransport(projectId, 'p:9', {
    async onInvalidation(value) { events.push(value); setTimeout(() => { transport.stop(); finished.resolve(); }, 0); },
    async onResync() { throw new Error('unexpected resync'); },
    onState(value) { states.push(value); },
  }, async (path, options) => {
    requests.push([path, options]);
    return stream(`: heartbeat\n\nevent: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
  }, undefined, 1);
  transport.start(); transport.start();
  await finished.promise;
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], event);
  assert.equal(transport.lastCursor, 'p:10');
  assert.deepEqual(states, ['connecting', 'connected', 'reconnecting', 'stopped']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], `/v1/events?projectId=${projectId}`);
  assert.equal(requests[0][1].headers['Last-Event-ID'], 'p:9');
  assert.equal(requests[0][1].headers['X-Forge-Session'], '1');
  assert.equal(requests[0][1].headers['X-Forge-Policy-Revision'], '1');
  assert.equal(requests[0][1].method, 'GET');
  assert.equal(requests[0][1].credentials, 'same-origin');
});

test('resync_requested requires a new authoritative cursor before reconnecting', async () => {
  const finished = done();
  const cursors = [];
  let fetches = 0;
  const transport = new RemoteStreamTransport(projectId, 'p:1', {
    async onInvalidation(value) { assert.equal(value.id, 'p:10'); setTimeout(() => { transport.stop(); finished.resolve(); }, 0); },
    async onResync() { return 'p:9'; }, onState() {},
  }, async (_path, options) => {
    cursors.push(options.headers['Last-Event-ID']);
    fetches += 1;
    return fetches === 1
      ? stream('event: resync_required\ndata: {"cursor":"p:9"}\n\n')
      : stream(`event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  transport.start(); await finished.promise;
  assert.deepEqual(cursors, ['p:1', 'p:9']);
  assert.equal(transport.lastCursor, 'p:10');
});

test('revoked session stops instead of retrying or retaining a live stream', async () => {
  const finished = done();
  let calls = 0;
  const transport = new RemoteStreamTransport(projectId, 'p:0', {
    async onInvalidation() { throw new Error('unexpected event'); },
    async onResync() { throw new Error('unexpected resync'); },
    onState(state) { if (state === 'unauthorized') finished.resolve(); },
  }, async () => { calls += 1; return new Response('{"code":"REMOTE_AUTH_REVOKED"}',
    { status: 403, headers: { 'Content-Type': 'application/json' } }); });
  transport.start(); await finished.promise;
  assert.equal(calls, 1);
  transport.stop(); assert.equal(calls, 1);
  assert.throws(() => new RemoteStreamTransport('../other', 'p:0', {}, async () => {}),
    /REMOTE_STREAM_INPUT_INVALID/);
});

test('resync does not advance past a Host cursor without an authoritative snapshot', async () => {
  const finished = done();
  const issues = [];
  const transport = new RemoteStreamTransport(projectId, 'p:1', {
    async onInvalidation() { throw new Error('unexpected invalidation'); },
    async onResync() { return 'p:8'; },
    onIssue(code) { issues.push(code); },
    onState(state) { if (state === 'reconnecting') {
      transport.stop(); finished.resolve();
    } },
  }, async () => stream('event: resync_required\ndata: {"cursor":"p:9"}\n\n'));
  transport.start(); await finished.promise;
  assert.deepEqual(issues, ['REMOTE_SNAPSHOT_STALE']);
  assert.equal(transport.lastCursor, 'p:1');
});

test('CRLF frames split across transport reads still invalidate exactly once', async () => {
  const finished = done();
  const events = [];
  const transport = new RemoteStreamTransport(projectId, 'p:9', {
    async onInvalidation(value) {
      events.push(value);
      setTimeout(() => { transport.stop(); finished.resolve(); }, 0);
    },
    async onResync() { throw new Error('unexpected resync'); },
    onState() {},
  }, async () => chunkedStream([
    ': heartbeat\r\n\r', '\n',
    `event: ${event.type}\r\nid: ${event.id}\r\ndata: ${JSON.stringify(event)}\r`,
    '\n\r', '\n',
  ]));
  transport.start(); await finished.promise;
  assert.deepEqual(events, [event]);
  assert.equal(transport.lastCursor, 'p:10');
});

test('frame bound counts UTF-8 bytes and rejects an incomplete oversized event', async () => {
  const finished = done();
  const issues = [];
  const transport = new RemoteStreamTransport(projectId, 'p:9', {
    async onInvalidation() { throw new Error('oversized event must not be delivered'); },
    async onResync() { throw new Error('unexpected resync'); },
    onIssue(code) { issues.push(code); },
    onState(state) { if (state === 'reconnecting') {
      transport.stop(); finished.resolve();
    } },
  }, async () => stream(`data: ${'中'.repeat(3000)}`));
  transport.start(); await finished.promise;
  assert.deepEqual(issues, ['REMOTE_STREAM_FRAME_TOO_LARGE']);
  assert.equal(transport.lastCursor, 'p:9');
});

test('a gateway that never answers times out and its owned request is aborted', async () => {
  const finished = done();
  const states = [];
  const issues = [];
  let signal;
  const transport = new RemoteStreamTransport(projectId, 'p:9', {
    async onInvalidation() { throw new Error('no response was received'); },
    async onResync() { throw new Error('no response was received'); },
    onIssue(code) { issues.push(code); },
    onState(state) {
      states.push(state);
      if (state === 'reconnecting') { transport.stop(); finished.resolve(); }
    },
  }, async (_path, options) => {
    signal = options.signal;
    return new Promise(() => {});
  }, { connectMs: 15, idleMs: 30 });
  transport.start(); await finished.promise;
  assert.equal(signal.aborted, true);
  assert.deepEqual(issues, ['REMOTE_STREAM_TIMEOUT']);
  assert.deepEqual(states, ['connecting', 'reconnecting', 'stopped']);
  assert.equal(transport.lastCursor, 'p:9');
});

test('a connected stream with no heartbeat times out and closes its reader', async () => {
  const finished = done();
  const states = [];
  const issues = [];
  let cancelled = false;
  const transport = new RemoteStreamTransport(projectId, 'p:9', {
    async onInvalidation() { throw new Error('no event was received'); },
    async onResync() { throw new Error('no event was received'); },
    onIssue(code) { issues.push(code); },
    onState(state) {
      states.push(state);
      if (state === 'reconnecting') { transport.stop(); finished.resolve(); }
    },
  }, async () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { headers: { 'Content-Type': 'text/event-stream' } }),
  { connectMs: 30, idleMs: 15 });
  transport.start(); await finished.promise;
  assert.equal(cancelled, true);
  assert.deepEqual(issues, ['REMOTE_STREAM_TIMEOUT']);
  assert.deepEqual(states, ['connecting', 'connected', 'reconnecting', 'stopped']);
  assert.equal(transport.lastCursor, 'p:9');
});

test('a response arriving after stop cannot report connected or advance the cursor', async () => {
  const response = done();
  const states = [];
  const transport = new RemoteStreamTransport(projectId, 'p:9', {
    async onInvalidation() { throw new Error('stopped stream must not deliver events'); },
    async onResync() { throw new Error('stopped stream must not resync'); },
    onState(state) { states.push(state); },
  }, async () => response.promise, { connectMs: 30, idleMs: 30 });
  transport.start(); transport.stop();
  response.resolve(stream(`event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(states, ['connecting', 'stopped']);
  assert.equal(transport.lastCursor, 'p:9');
});
