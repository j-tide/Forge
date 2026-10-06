// Test-only transport fixture. Product runSession, tools, and persistence stay real.
// No listener is opened and no actual HTTP request is issued.
import fs from 'node:fs';
import net from 'node:net';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { workerData } from 'node:worker_threads';
import path from 'node:path';

const endpoint = 'http://127.0.0.1:11439/v1/chat/completions';
const scenario = process.env.FORGE_FIXTURE_SCENARIO;
const tracePath = process.env.FORGE_FIXTURE_TRACE;
const projectDir = workerData?.session?.projectDir;
let requestNumber = 0;

function record(value) {
  fs.appendFileSync(tracePath, JSON.stringify({ timestamp: new Date().toISOString(), ...value }) + '\n');
}

// Block accidental TCP requests before DNS or connection establishment.
net.Socket.prototype.connect = function blockedFixtureTcpConnect() {
  record({ type: 'blocked-tcp-connect' });
  throw new Error('Offline acceptance fixture forbids actual TCP connections');
};
// No MCP/other subprocess is expected for the selected agent config. Record and
// reject an unexpected attempt rather than letting it inherit any host context.
for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
  childProcess[method] = function blockedFixtureChildProcess() {
    record({ type: 'blocked-child-process', method });
    throw new Error('Offline acceptance fixture forbids unexpected subprocesses');
  };
}
syncBuiltinESMExports();

function sse(delta, finishReason) {
  const common = { id: `fixture-${requestNumber}`, object: 'chat.completion.chunk', created: 1791244800, model: 'forge-local-transport-fixture' };
  const chunks = [
    { ...common, choices: [{ index: 0, delta, finish_reason: null }] },
    { ...common, choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: 32, completion_tokens: 16, total_tokens: 48 } },
  ];
  const bytes = new TextEncoder().encode(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n');
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function toolResponse(name, args) {
  record({ type: 'fixture-response', kind: 'tool-call', toolName: name, args });
  return sse({ role: 'assistant', tool_calls: [{ index: 0, id: `fixture-call-${requestNumber}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, 'tool_calls');
}

globalThis.fetch = async function offlineFixtureFetch(input, init = {}) {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  if (url !== endpoint) {
    record({ type: 'blocked-fetch', url });
    throw new Error('Offline acceptance fixture rejected a non-fixture URL');
  }
  requestNumber++;
  const bodyText = typeof init.body === 'string' ? init.body : await input.clone().text();
  const body = JSON.parse(bodyText);
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  record({
    type: 'fixture-request', requestNumber, url, method: init.method ?? 'POST',
    authorization: headers.get('authorization') === 'Bearer ollama' ? 'product-built-in-ollama-sentinel' : (headers.has('authorization') ? 'unexpected-present-redacted' : 'absent'),
    body,
  });
  if (body.stream !== true) throw new Error('Expected actual SDK streaming request');

  if (scenario === 'provider-error') {
    record({ type: 'fixture-response', kind: 'http-400-protocol-response' });
    return new Response(JSON.stringify({ error: { message: 'Local transport fixture deliberately rejected this request', type: 'fixture_error', code: 'fixture_bad_request' } }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  if (scenario === 'abort-pending') {
    record({ type: 'fixture-pending-until-abort' });
    const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    return await new Promise((_resolve, reject) => {
      if (!signal) return reject(new Error('Expected SDK abort signal'));
      if (signal.aborted) return reject(new DOMException('Fixture aborted', 'AbortError'));
      signal.addEventListener('abort', () => {
        record({ type: 'fixture-aborted' });
        reject(new DOMException('Fixture aborted', 'AbortError'));
      }, { once: true });
    });
  }

  const toolMessages = body.messages.filter(message => message.role === 'tool');
  const latestToolContent = toolMessages.at(-1)?.content ?? '';
  if (scenario === 'path-containment') {
    if (requestNumber === 1) return toolResponse('Write', { file_path: process.env.FORGE_FIXTURE_CANARY, content: 'SHOULD_NEVER_BE_WRITTEN' });
    if (!String(latestToolContent).includes('outside')) throw new Error('Expected real Write path-containment rejection in the next SDK request');
    record({ type: 'fixture-response', kind: 'text-after-tool-error' });
    return sse({ role: 'assistant', content: 'Local fixture observed the Write path-containment error.' }, 'stop');
  }
  if (requestNumber === 1) return toolResponse('Read', { file_path: path.join(projectDir, 'seed.txt') });
  if (requestNumber === 2) {
    if (!String(latestToolContent).includes('FORGE_OFFLINE_SEED_20261006')) throw new Error('Expected actual Read output in the next SDK request');
    return toolResponse('Write', { file_path: path.join(projectDir, 'artifact.txt'), content: 'FORGE_OFFLINE_ARTIFACT_20261006\nWritten by the actual Forge Write tool.\n' });
  }
  if (requestNumber === 3) {
    if (!String(latestToolContent).includes('Successfully wrote')) throw new Error('Expected actual Write output in the next SDK request');
    return toolResponse('Read', { file_path: path.join(projectDir, 'artifact.txt') });
  }
  if (requestNumber === 4) {
    if (!String(latestToolContent).includes('FORGE_OFFLINE_ARTIFACT_20261006')) throw new Error('Expected actual artifact Read output in the next SDK request');
    record({ type: 'fixture-response', kind: 'completion-text' });
    return sse({ role: 'assistant', content: 'Local transport fixture completed the Read/Write/Read protocol check.' }, 'stop');
  }
  throw new Error('Unexpected extra SDK request');
};

record({ type: 'transport-fixture-ready', scenario, noSocket: true, nonFixtureFetchBlocked: true, tcpBlocked: true, unexpectedSubprocessBlocked: true });
