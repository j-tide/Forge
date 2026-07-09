import assert from 'node:assert/strict';
/* global window */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The packaged smoke is macOS arm64 only');
}
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const appVersion = JSON.parse(readFileSync(join(root, 'apps', 'desktop', 'package.json'), 'utf8')).version;
const dmg = process.env.FORGE_PACKAGE_SMOKE_DMG || join(root, 'build', 'macos',
  `Forge-${appVersion}-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg`);
assert.ok(existsSync(dmg), 'Run pnpm package:mac:internal first');
const isolated = mkdtempSync(join(tmpdir(), 'Forge package smoke '));
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(isolated, 'mount');
const installed = join(installRoot, 'Forge INTERNAL.app');
const home = join(isolated, 'new user home');
const codexHome = join(isolated, 'empty-codex-home');
mkdirSync(mount, { recursive: true });
mkdirSync(home, { recursive: true });
mkdirSync(codexHome, { recursive: true });

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}${result.stdout}`);
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

let attached = false;
let app;
let hostPid;
try {
  run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  run('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', installed]);
  run('hdiutil', ['detach', mount]);
  attached = false;

  app = await electron.launch({
    executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
    args: [],
    env: { ...process.env, HOME: home, CODEX_HOME: codexHome,
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin', FORGE_DEV_SERVER_URL: '',
      FORGE_INTERNAL_TEST_HOME: join(home, 'Library', 'Application Support'),
      FORGE_HOST_DATA_DIR: join(isolated, 'ignored-dev-override'), FORGE_MODEL_PROVIDER: 'disabled',
      OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' },
  });
  const page = await app.firstWindow();
  try { await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 }); }
  catch (error) {
    console.error('Packaged Host state:', await page.evaluate(() => window.forge?.pythonHostStatus()));
    throw error;
  }
  await page.getByRole('heading', { name: 'What do you want to build?' }).waitFor();
  const health = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(health.ok, true);
  assert.equal(health.data.storage.status, 'ready');
  hostPid = health.data.pid;
  const details = await app.evaluate(({ app: electronApp }) => ({
    packaged: electronApp.isPackaged,
    appData: electronApp.getPath('appData'),
    resources: process.resourcesPath,
  }));
  assert.equal(details.packaged, true);
  assert.ok(details.appData.startsWith(home), 'Packaged test must use isolated user data');
  assert.ok(details.resources.startsWith(installed));
  const ownedCommand = spawnSync('ps', ['-p', String(hostPid), '-o', 'command='],
    { encoding: 'utf8' });
  assert.equal(ownedCommand.status, 0);
  assert.ok(ownedCommand.stdout.includes(join(installed, 'Contents', 'Resources',
    'forge-python', 'runtime', 'bin', 'python3.12')));
  assert.ok(!ownedCommand.stdout.includes(join(root, 'python', '.venv')));
  const catalog = await page.evaluate(() => window.forge.agentProfileCatalog());
  const codex = catalog.executors.find((entry) => entry.executorId === 'executor.codex');
  assert.ok(codex, 'Packaged Host did not load its built-in Executor manifest');
  assert.equal(codex.available, false,
    'A clean Finder-style PATH must not claim an unbundled Codex CLI is available');
  assert.equal(existsSync(join(installed, 'Contents', 'Resources', 'forge-python',
    'packages', 'forge', 'builtin_plugins', 'plugins.lock.json')), true);
  const preferences = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences());
  assert.equal(preferences?.contextIsolation, true);
  assert.equal(preferences?.nodeIntegration, false);
  assert.equal(preferences?.sandbox, true);
  const screenshot = process.env.FORGE_PACKAGE_SMOKE_SCREENSHOT ||
    join(root, 'output', 'playwright', 'p6-06-packaged-home-1440x900.png');
  mkdirSync(join(root, 'output', 'playwright'), { recursive: true });
  await page.screenshot({ path: screenshot });
  await app.close();
  app = undefined;
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=4', installed]);
  const database = join(details.appData, 'Forge', 'production', 'forge.sqlite');
  assert.ok(existsSync(database), 'Isolated packaged Host must create its own database');
  rmSync(installRoot, { recursive: true, force: true });
  assert.ok(existsSync(database), 'Removing the app must retain Forge user data');
  console.log(JSON.stringify({ stage: 'package-macos-internal', packaged: true,
    hostPid, schemaVersion: health.data.storage.schemaVersion,
    bundledPython: true, isolatedHome: true, appRemovalPreservedData: true,
    codexRequiresExternalInstall: true,
    signature: 'ad-hoc, unnotarized' }));
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1 });
    }).catch(() => undefined);
    await app.close().catch(() => undefined);
  }
  if (hostPid) assert.equal(alive(hostPid), false, 'Owned packaged Host still running');
  if (attached) run('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive: true, force: true });
  rmSync(isolated, { recursive: true, force: true });
}
