import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const [mode, behavior] = process.argv.slice(2);
if (behavior === 'ignore-term') process.on('SIGTERM', () => {});

if (mode === 'grandchild') {
  const server = createServer(() => {});
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    console.log(JSON.stringify({ role: 'grandchild', pid: process.pid, port: address.port }));
  });
} else if (mode === 'child' || mode === 'parent') {
  const next = mode === 'parent' ? 'child' : 'grandchild';
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), next, behavior], {
    stdio: ['ignore', 'pipe', 'inherit'], shell: false,
  });
  child.stdout.pipe(process.stdout);
  console.log(JSON.stringify({ role: mode, pid: process.pid, childPid: child.pid }));
  if (behavior === 'exit-parent' && mode === 'parent') setTimeout(() => process.exit(0), 250);
} else throw new Error('Unknown fixture role');
