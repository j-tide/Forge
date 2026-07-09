/** Internal Windows ZIP smoke; must run on a real Windows x64 runner. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Windows installed-app smoke requires a real Windows x64 runner');
}
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const version = JSON.parse(readFileSync(join(root, 'apps', 'desktop', 'package.json'), 'utf8')).version;
const name = `Forge-${version}-INTERNAL-UNSIGNED-win32-x64`;
const zip = join(root, 'build', 'windows', `${name}.zip`);
assert.ok(existsSync(zip), 'Run pnpm package:windows:internal first');
const isolated = mkdtempSync(join(tmpdir(), 'Forge Windows QA '));
const installed = join(isolated, 'Installed Forge 测试');
const appData = join(isolated, 'Forge application data');
mkdirSync(installed, { recursive: true });
mkdirSync(appData, { recursive: true });
const extracted = spawnSync('tar.exe', ['-x', '-f', zip, '-C', installed],
  { encoding: 'utf8' });
assert.equal(extracted.status, 0, extracted.stderr);
const exe = join(installed, name, 'Forge.exe');
assert.ok(existsSync(exe));
let app;
let hostPid;
try {
  app = await electron.launch({ executablePath: exe, args: [], env: {
    ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_INTERNAL_TEST_HOME: appData,
    FORGE_MODEL_PROVIDER: 'disabled', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '',
  } });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 30_000 });
  await page.getByRole('heading', { name: 'What do you want to build?' }).waitFor();
  const health = await page.evaluate(() => globalThis.forge.hostHealth());
  assert.equal(health.ok, true);
  assert.equal(health.data.runtime.implementation, 'CPython');
  assert.equal(health.data.storage.status, 'ready');
  hostPid = health.data.pid;
  const info = await app.evaluate(({ app: electronApp }) => ({
    packaged: electronApp.isPackaged, appData: electronApp.getPath('appData'),
    resources: process.resourcesPath,
  }));
  assert.equal(info.packaged, true);
  assert.equal(info.appData, appData);
  assert.ok(info.resources.startsWith(join(installed, name)));
  const preferences = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences());
  assert.equal(preferences?.contextIsolation, true);
  assert.equal(preferences?.nodeIntegration, false);
  assert.equal(preferences?.sandbox, true);
  await app.close();
  app = undefined;
  assert.ok(existsSync(join(appData, 'Forge', 'production', 'forge.sqlite')));
  assert.throws(() => process.kill(hostPid, 0), { code: 'ESRCH' });
  console.log(JSON.stringify({ stage: 'windows-internal-package-smoke',
    packaged: true, bundledHost: true, schemaVersion: health.data.storage.schemaVersion,
    isolatedAppData: true, ownedHostStopped: true,
    signed: false, installer: false }));
} finally {
  if (app) await app.close().catch(() => undefined);
  rmSync(isolated, { recursive: true, force: true });
}
