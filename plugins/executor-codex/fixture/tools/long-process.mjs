import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const role = process.argv[2];
if (!['parent', 'child', 'grandchild'].includes(role)) throw new Error('Invalid role');
await writeFile(join(process.cwd(), `${role}.pid`), String(process.pid));
if (role !== 'grandchild') {
  const next = role === 'parent' ? 'child' : 'grandchild';
  spawn(process.execPath, [fileURLToPath(import.meta.url), next], { cwd: process.cwd(), stdio: 'ignore', shell: false });
}
if (role === 'grandchild') {
  let count = 0;
  setInterval(() => { void writeFile(join(process.cwd(), 'heartbeat.txt'), String(++count)); }, 100);
} else setInterval(() => {}, 1000);
