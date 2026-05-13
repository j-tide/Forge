import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const electronBinary = requireDesktop('electron');
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const smokeDataDir = mkdtempSync(join(tmpdir(), 'forge-desktop-smoke-'));
process.once('exit', () => rmSync(smokeDataDir, { recursive: true, force: true }));

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function waitGone(pid) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!alive(pid)) return;
    await delay(100);
  }
  throw new Error('Owned Host PID remains after Desktop exit: ' + pid);
}

function launchDesktop(dataDir = smokeDataDir) {
  return electron.launch({
    executablePath: electronBinary,
    args: [desktopDirectory],
    env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir },
  });
}

let electronApp = await launchDesktop();
let ownedPid;
try {
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'What do you want to build?' }).waitFor();
  assert.match(await page.title(), /Forge/);
  assert.equal(await page.getByRole('button', { name: 'Agent runtime 尚未启用' }).isDisabled(), true);

  const renderer = await page.evaluate(() => ({
    bridgeKeys: Object.keys(window.forge ?? {}),
    platform: window.forge?.platform,
    requireType: typeof window.require,
    processType: typeof window.process,
    ipcRendererType: typeof window.ipcRenderer,
  }));
  assert.deepEqual(renderer.bridgeKeys, ['platform', 'hostStatus', 'hostHealth', 'invokeSystem', 'onHostStatus']);
  assert.equal(renderer.platform, process.platform);
  assert.equal(renderer.requireType, 'undefined');
  assert.equal(renderer.processType, 'undefined');
  assert.equal(renderer.ipcRendererType, 'undefined');

  const webPreferences = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences());
  assert.equal(webPreferences?.contextIsolation, true);
  assert.equal(webPreferences?.nodeIntegration, false);
  assert.equal(webPreferences?.sandbox, true);

  const health = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(health.ok, true);
  assert.equal(health.data.status, 'ready');
  assert.equal(health.data.protocolVersion, 'forge-host-protocol/v2');
  assert.equal(health.data.storage.status, 'ready');
  assert.equal(health.data.storage.schemaVersion, 2);
  assert.equal(health.data.storage.journalMode, 'wal');
  assert.equal(health.data.runtime.platform, process.platform);
  assert.equal(health.data.runtime.arch, process.arch);
  assert.equal(health.data.runtime.electron, '44.4.3');
  assert.equal(health.data.version, '0.0.1');
  assert.ok(health.data.pid > 0);
  assert.match(health.data.hostId, /^[0-9a-f-]{36}$/);
  ownedPid = health.data.pid;
  assert.equal(alive(ownedPid), true);

  await page.getByRole('button', { name: 'Host connected' }).click();
  const diagnostics = await page.locator('#host-diagnostics').evaluate((element) =>
    Object.fromEntries([...element.querySelectorAll('dt')].map((label) => [label.textContent, label.nextElementSibling?.textContent])));
  assert.equal(diagnostics['Host ID'], health.data.hostId);
  assert.equal(diagnostics['Host Version'], health.data.version);
  assert.equal(diagnostics.Protocol, health.data.protocolVersion);
  assert.equal(diagnostics.PID, String(ownedPid));
  assert.equal(diagnostics.Storage, 'Ready');
  assert.equal(diagnostics.Schema, '2');
  assert.notEqual(diagnostics['Last Health Check'], '—');
  const revisionBeforeRefresh = await page.evaluate(async () => (await window.forge.hostStatus()).revision);
  await page.getByRole('button', { name: '检查健康状态' }).click();
  await page.waitForFunction(async (previous) => (await window.forge.hostStatus()).revision > previous, revisionBeforeRefresh);
  await page.getByRole('button', { name: '关闭 Host 诊断' }).click();

  const unknown = await page.evaluate(() => window.forge.invokeSystem({
    schemaVersion: '1.0', commandId: 'smoke-unknown', type: 'shell.any',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v2', payload: {},
  }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'UNKNOWN_COMMAND');
  const forged = await page.evaluate(() => window.forge.invokeSystem({
    schemaVersion: '1.0', commandId: 'smoke-forged', type: 'system.ping',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v2', payload: {}, actor: 'owner',
  }));
  assert.equal(forged.ok, false);
  assert.equal(forged.error.code, 'VALIDATION_ERROR');

  await page.reload();
  await page.getByRole('button', { name: 'Host connected' }).waitFor();
  const afterReload = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(afterReload.data.hostId, health.data.hostId);
  assert.equal(afterReload.data.pid, ownedPid);

  if (process.env.FORGE_SMOKE_SCREENSHOT) {
    await page.locator('.board-pane').evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: process.env.FORGE_SMOKE_SCREENSHOT });
  }
  console.log(JSON.stringify({ stage: 'connected', hostId: health.data.hostId, pid: ownedPid,
    version: health.data.version, protocolVersion: health.data.protocolVersion,
    runtime: health.data.runtime, storage: health.data.storage, renderer, webPreferences: {
      contextIsolation: webPreferences.contextIsolation,
      nodeIntegration: webPreferences.nodeIntegration,
      sandbox: webPreferences.sandbox,
    } }, null, 2));
} finally {
  await electronApp.close();
}

const invalidDataDir = join(smokeDataDir, 'invalid-db');
mkdirSync(invalidDataDir);
writeFileSync(join(invalidDataDir, 'forge.sqlite'), 'not a SQLite database');
electronApp = await launchDesktop(invalidDataDir);
let degradedPid;
try {
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host degraded' }).waitFor({ timeout: 15000 });
  const degraded = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(degraded.ok, true);
  assert.equal(degraded.data.status, 'degraded');
  assert.equal(degraded.data.storage.status, 'unavailable');
  assert.equal(degraded.data.storage.error.code, 'DATABASE_CORRUPT');
  assert.doesNotMatch(JSON.stringify(degraded), new RegExp(invalidDataDir));
  degradedPid = degraded.data.pid;
  await page.getByRole('button', { name: 'Host degraded' }).click();
  assert.match(await page.locator('#host-diagnostics').textContent(), /Storage\s*Unavailable/);
  assert.match(await page.locator('#host-diagnostics').textContent(), /DATABASE_CORRUPT/);
  console.log(JSON.stringify({ stage: 'storage-degraded', pid: degradedPid,
    hostStatus: degraded.data.status, storage: degraded.data.storage.status,
    error: degraded.data.storage.error.code }, null, 2));
} finally {
  await electronApp.close();
}
if (degradedPid) await waitGone(degradedPid);
if (ownedPid) await waitGone(ownedPid);

electronApp = await launchDesktop();
try {
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  const beforeCrash = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(beforeCrash.ok, true);
  const crashPid = beforeCrash.data.pid;
  assert.equal(alive(crashPid), true);
  process.kill(crashPid, 'SIGKILL');
  await page.getByRole('button', { name: 'Host crashed' }).waitFor({ timeout: 10000 });
  const afterCrash = await page.evaluate(() => Promise.all([window.forge.hostStatus(), window.forge.hostHealth()]));
  assert.equal(afterCrash[0].state, 'crashed');
  assert.equal(afterCrash[0].health, null);
  assert.equal(afterCrash[0].info, null);
  assert.equal(afterCrash[1].ok, false);
  assert.equal(afterCrash[1].error.code, 'HOST_EXITED');
  await page.getByRole('button', { name: 'Host crashed' }).click();
  assert.equal(await page.locator('#host-diagnostics dd').first().textContent(), '—');
  await waitGone(crashPid);
  console.log(JSON.stringify({ stage: 'crash-detected', pid: crashPid, state: afterCrash[0].state,
    error: afterCrash[1].error.code }, null, 2));
} finally {
  await electronApp.close();
}
