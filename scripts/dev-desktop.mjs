import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const devUrl = 'http://127.0.0.1:5173/';
let build;
let web;
let desktop;
let webBanner = '';
let webListening = false;
let stopping = false;

function stop() {
  stopping = true;
  build?.kill();
  desktop?.kill();
  web?.kill();
}

async function buildPackage(name) {
  if (stopping) throw new Error('Desktop development startup interrupted');
  build = spawn(pnpm, ['--filter', name, 'build'], { stdio: 'inherit' });
  const exitCode = await new Promise((resolve) => build.once('exit', (code) => resolve(code ?? 1)));
  build = undefined;
  if (stopping) throw new Error('Desktop development startup interrupted');
  if (exitCode !== 0) throw new Error(`${name} build exited with ${exitCode}`);
}

async function syncPython() {
  if (stopping) throw new Error('Desktop development startup interrupted');
  build = spawn(pnpm, ['py:sync'], { stdio: 'inherit' });
  const exitCode = await new Promise((resolve) => build.once('exit', (code) => resolve(code ?? 1)));
  build = undefined;
  if (stopping) throw new Error('Desktop development startup interrupted');
  if (exitCode !== 0) throw new Error(`Python frozen sync exited with ${exitCode}`);
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  await syncPython();
  for (const name of ['@forge/contracts', '@forge/client', '@forge/ui', '@forge/web']) {
    await buildPackage(name);
  }
  web = spawn(pnpm, ['--filter', '@forge/web', 'dev'], { stdio: ['inherit', 'pipe', 'pipe'] });
  web.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    webBanner = (webBanner + chunk.toString()).slice(-2048);
    if (webBanner.includes(`Local:   ${devUrl}`)) webListening = true;
  });
  web.stderr.on('data', (chunk) => process.stderr.write(chunk));
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (web.exitCode !== null) throw new Error(`Web dev server exited with ${web.exitCode}`);
    if (!webListening) {
      await delay(200);
      continue;
    }
    try {
      const response = await fetch(devUrl);
      if (response.ok && (await response.text()).includes('id="app"')) {
        ready = true;
        break;
      }
    } catch {
      // The fixed loopback dev server has not started yet.
    }
    await delay(200);
  }
  if (!ready) throw new Error('Web dev server did not become ready on 127.0.0.1:5173');

  desktop = spawn(pnpm, ['--filter', '@forge/desktop', 'dev:electron'], {
    stdio: 'inherit',
    env: { ...process.env, FORGE_DEV_SERVER_URL: devUrl },
  });
  const exitCode = await new Promise((resolve) => desktop.once('exit', (code) => resolve(code ?? 1)));
  process.exitCode = exitCode;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stop();
}
