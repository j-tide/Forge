import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Codex } from '@openai/codex-sdk';
import { execFileSync } from 'node:child_process';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const root = await mkdtemp(join(tmpdir(), 'forge-codex-sdk-'));
try {
  await cp(fixture, root, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  const codex = new Codex();
  const thread = codex.startThread({ workingDirectory: root, sandboxMode: 'read-only', approvalPolicy: 'never' });
  const streamed = await thread.runStreamed('Read package.json in this project. State its exact name in one sentence. Do not modify files.');
  const kinds = new Set();
  let usage = null;
  for await (const event of streamed.events) {
    kinds.add(event.type);
    if (event.type === 'turn.completed') usage = event.usage;
  }
  console.log(JSON.stringify({ kind: 'sdk-read-only', threadId: thread.id, methods: [...kinds], usage }, null, 2));
} finally {
  await rm(root, { recursive: true, force: true });
}
