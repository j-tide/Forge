import assert from 'node:assert/strict';
/* global document, Node, window */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync,
  rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const repository = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const packageArgument = process.env.FORGE_DIAGNOSTICS_DMG;
const packaged = Boolean(packageArgument);
if (packaged && (process.platform !== 'darwin' || process.arch !== 'arm64')) {
  throw new Error('Installed diagnostics QA requires macOS arm64');
}
const dmg = packageArgument ? realpathSync(packageArgument) : null;
if (dmg && (!dmg.startsWith(`${join(repository,'build','macos')}${sep}`) || !existsSync(dmg))) {
  throw new Error('Only an explicit Forge internal DMG under build/macos is accepted');
}
const tag = process.env.FORGE_DIAGNOSTICS_TAG ||
  (packaged ? 'desktop-diagnostics-packaged-20260926' : 'p6-04-diagnostics-preview');
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(tag)) throw new Error('Invalid diagnostics QA tag');
const root = mkdtempSync(packaged ? join(repository,'output','qa','desktop-diagnostics-') :
  join(tmpdir(), 'forge-diagnostics-smoke-'));
const appData = join(root, 'isolated-app-data');
const hostData = packaged ? join(appData, 'Forge', 'production') : join(root, 'data');
const installRoot = packaged ? mkdtempSync(join(repository,'build','macos','qa-install-')) : null;
const mount = installRoot ? join(installRoot,'mounted') : null;
const installed = installRoot ? join(installRoot,'Forge INTERNAL.app') : null;
let app;
let attached = false;
function command(executable, args) {
  execFileSync(executable, args, { stdio:'pipe', timeout:30_000 });
}
try {
  const exportedPath = join(root, 'exported.json');
  const env = { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_MODEL_PROVIDER: 'disabled',
    OPENAI_API_KEY: '', CODEX_API_KEY: '', ANTHROPIC_API_KEY: '',
    CODEX_HOME: join(root, 'empty-codex-home') };
  if (packaged) env.FORGE_INTERNAL_TEST_HOME = appData;
  else env.FORGE_HOST_DATA_DIR = hostData;
  mkdirSync(env.CODEX_HOME);
  writeFileSync(join(env.CODEX_HOME, 'auth.json'),
    '{"token":"test-auth-file-private-value"}\n');
  mkdirSync(hostData, {recursive:true});
  writeFileSync(join(hostData, 'fixture.log'),
    `Authorization: Bearer test-private-token\nProject path: ${root}/source\n`);
  if (dmg && mount && installed) {
    mkdirSync(mount);
    command('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
    attached = true;
    command('ditto',[join(mount,'Forge INTERNAL.app'),installed]);
    command('codesign',['--verify','--deep','--strict',installed]);
    command('hdiutil',['detach',mount]);
    attached = false;
  }
  app = await electron.launch({ executablePath: installed ? join(installed,'Contents','MacOS','Forge') :
    requireDesktop('electron'), args: installed ? [] : [desktopDirectory], env });
  const page = await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '设置' }).click();
  assert.equal(await page.locator('#settings-title').textContent(), '设置');
  const desktopSettingsFirst = await page.evaluate(() => {
    const diagnostics = [...document.querySelectorAll('.diagnostics-settings')]
      .find((item) => item.textContent?.includes('诊断与数据保留'));
    const backup = document.querySelector('[data-testid="database-backup"]');
    const remote = document.querySelector('.remote-devices');
    return Boolean(diagnostics && backup && remote &&
      (diagnostics.compareDocumentPosition(backup) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (backup.compareDocumentPosition(remote) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  assert.equal(desktopSettingsFirst, true);
  const output = resolve('output/playwright'); mkdirSync(output, { recursive: true });
  const settingsScreenshot = join(output, `${tag}-settings-top-1440x900.png`);
  await page.screenshot({ path:settingsScreenshot });
  await page.getByRole('button', { name: '生成诊断预览' }).click();
  const preview = page.locator('pre.diagnostics-preview');
  await preview.waitFor();
  const visible = await preview.textContent();
  const bundle = JSON.parse(visible);
  assert.equal(bundle.format, 'forge-diagnostics/v1');
  assert.equal(bundle.storage.schemaVersion, 37);
  assert.equal(bundle.retention.automaticPurge, false);
  assert.equal(bundle.usage.status, 'unavailable');
  assert.ok(!visible.includes(root));
  assert.ok(!visible.includes('API_KEY'));
  assert.ok(!visible.includes('test-private-token'));
  assert.ok(!visible.includes('test-auth-file-private-value'));
  assert.ok(!visible.includes('auth.json'));
  const noArbitraryHostMethod = await page.evaluate(async () => {
    try { const result = await window.forge.invokeSystem({ type: 'diagnostics.exportArbitraryPath',
      commandId: crypto.randomUUID(), createdAt: new Date().toISOString(),
      protocolVersion: 'forge-host-protocol/v5', schemaVersion: '1.0', payload: {} });
      return result.ok === false;
    } catch { return true; }
  });
  assert.equal(noArbitraryHostMethod, true);
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, exportedPath);
  await page.getByRole('button', { name: '导出所示诊断包' }).click();
  await page.getByText('诊断包已保存。').waitFor();
  assert.equal(readFileSync(exportedPath, 'utf8'), visible);
  const screenshot = join(output, `${tag}-1440x900.png`);
  await page.screenshot({ path:screenshot });
  console.log(JSON.stringify({ stage: 'diagnostics-export', format: bundle.format,
    schemaVersion: bundle.storage.schemaVersion, exactPreviewBytes: true,
    artifactDays: bundle.retention.artifactDays, packaged, dmg, qaRoot:root,
    screenshot, settingsScreenshot, desktopSettingsFirst }));
} finally {
  if (app) await app.close();
  if (attached && mount) command('hdiutil',['detach',mount]);
  if (installRoot) rmSync(installRoot,{recursive:true,force:true});
  if (!packaged) rmSync(root, { recursive: true, force: true });
}
