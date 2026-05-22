import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppServerConnection } from '../dist/app-server.js';
import assert from 'node:assert/strict';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const root = await mkdtemp(join(tmpdir(), 'forge-codex-read-'));
const connection = new AppServerConnection();
let timer;
try {
  await cp(fixture, root, { recursive: true });
  await connection.connect();
  const kinds = new Set();
  let finalText = '';
  let finish;
  let fail;
  const completed = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  timer = setTimeout(() => fail(new Error(`Codex read-only turn timed out; notifications: ${[...kinds].join(',')}`)), 120_000);
  connection.onMessage((message) => {
    kinds.add(message.method);
    if (message.method === 'error') console.log(JSON.stringify({ upstreamEvent: 'error', info: message.params?.error?.codexErrorInfo ?? null }));
    if (message.method === 'warning') console.log(JSON.stringify({ upstreamEvent: 'warning' }));
    if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') finalText = message.params.item.text;
    if (message.method === 'turn/completed') finish(message.params);
    if (message.method === 'forge/processExited') fail(new Error(`Codex app-server exited; notifications: ${[...kinds].join(',')}`));
    if (typeof message.id === 'number') connection.respond(message.id, { decision: 'decline' });
  });
  const modelList = await connection.request('model/list', { limit: 100 });
  const model = modelList.data.find((entry) => !entry.hidden)?.id;
  assert.ok(model);
  const started = await connection.request('thread/start', {
    cwd: root, approvalPolicy: 'never', sandbox: 'read-only', serviceName: 'forge_spike', model,
  });
  const threadId = started.thread.id;
  const turn = await connection.request('turn/start', {
    threadId, input: [{ type: 'text', text: 'Read package.json in this project. Return only JSON with the exact package name as the name field. Do not modify files.' }],
    outputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
  });
  const result = await completed;
  assert.equal(JSON.parse(finalText).name, 'forge-codex-spike-fixture');
  console.log(JSON.stringify({ kind: 'app-server-read-only', threadId, turnId: turn.turn.id, status: result.turn.status,
    model, structuredOutput: true,
    methods: [...kinds].filter((kind) => kind.startsWith('item/') || kind.startsWith('turn/') || kind.includes('tokenUsage')) }, null, 2));
} finally {
  clearTimeout(timer);
  await connection.dispose();
  await rm(root, { recursive: true, force: true });
}
