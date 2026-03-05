/** Open the separately installed, preserved internal recording demo. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The current internal Demo was verified only on macOS arm64');
}
const base = join(homedir(), 'Documents', 'Forge Demo Current');
const app = join(homedir(), 'Applications', 'Forge INTERNAL Current.app');
const executable = join(app, 'Contents', 'MacOS', 'Forge');
const data = join(base, 'recorded-acceptance', 'isolated-app-data');
const expected = '91595c5cbf5278ecc68227a3eb5a92ded84d26408b227d28371832e6de283eb6';
if (!existsSync(executable) || !existsSync(data) ||
    readFileSync(join(base, 'installed-dmg-sha256.txt'), 'utf8').trim() !== expected ||
    !existsSync(join(app, 'Contents', 'Resources', 'FORGE_INTERNAL_TEST_BUILD'))) {
  throw new Error('The verified internal Demo app, receipt or preserved data is missing');
}
const signature = spawnSync('codesign', ['--verify', '--deep', '--strict', app],
  { encoding: 'utf8' });
if (signature.status !== 0) throw new Error('Installed Demo signature verification failed');
const running = spawnSync('pgrep', ['-fl', executable], { encoding: 'utf8' });
if (running.status === 0 && running.stdout.split('\n').some((line) =>
  line.trim().endsWith(executable))) {
  console.log(JSON.stringify({ app, data, alreadyRunning: true }));
  process.exit(0);
}
const child = spawn(executable, [], {
  detached: true, stdio: 'ignore',
  env: { ...process.env, FORGE_INTERNAL_TEST_HOME: data, FORGE_DEV_SERVER_URL: '' },
});
child.unref();
await delay(3000);
try { process.kill(child.pid, 0); }
catch { throw new Error('The installed Demo exited during startup; its data was preserved'); }
console.log(JSON.stringify({ app, data, pid: child.pid, alreadyRunning: false }));
