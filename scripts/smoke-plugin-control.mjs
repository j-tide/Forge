import assert from 'node:assert/strict';
/* global window */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'forge-plugin-control-'));
const packagedApp = process.env.FORGE_PLUGIN_PACKAGED_APP;
const screenshotPrefix = packagedApp ? 'p7-current-plugin-control' : 'p4-plugin-control';
const output = resolve('output/playwright');
mkdirSync(output, { recursive: true });
let app;

async function launch() {
  app = await electron.launch({ executablePath: packagedApp ?
    join(packagedApp, 'Contents', 'MacOS', 'Forge') : requireDesktop('electron'),
    args: packagedApp ? [] : [desktopDirectory], env: { ...process.env, FORGE_DEV_SERVER_URL: '',
      ...(packagedApp ? { FORGE_INTERNAL_TEST_HOME: join(root, 'data') } :
        { FORGE_HOST_DATA_DIR: join(root, 'data') }), FORGE_MODEL_PROVIDER: 'disabled' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '插件' }).click();
  await page.getByRole('heading', { name: '插件' }).waitFor();
  return page;
}

try {
  let page = await launch();
  await page.locator('.plugins-view .forge-status-tag').filter({ hasText: '已装配' }).waitFor();
  await page.screenshot({ path: join(output, `${screenshotPrefix}-active-1440x900.png`) });
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  await page.getByRole('button', { name: '停用 Codex 插件' }).click();
  await page.locator('.plugins-view .forge-status-tag').filter({ hasText: '已停用' }).waitFor();
  const disabled = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.active, false);
  const rejected = await page.evaluate(async () => {
    try { await window.forge.setBundledPluginEnabled('false'); return false; }
    catch { return true; }
  });
  assert.equal(rejected, true);
  await page.screenshot({ path: join(output, `${screenshotPrefix}-disabled-1440x900.png`) });
  await app.close(); app = undefined;

  page = await launch();
  await page.locator('.plugins-view .forge-status-tag').filter({ hasText: '已停用' }).waitFor();
  await page.getByRole('button', { name: '启用并在重启后生效' }).click();
  await page.getByText('启用偏好已保存。', { exact: false }).waitFor();
  const pending = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(pending.restartRequired, true);
  assert.equal(pending.active, false);
  await app.close(); app = undefined;

  page = await launch();
  await page.locator('.plugins-view .forge-status-tag').filter({ hasText: '已装配' }).waitFor();
  const restored = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(restored.enabled, true);
  assert.equal(restored.active, true);
  assert.equal(restored.restartRequired, false);
  console.log(JSON.stringify({ stage: 'plugin-control', disabledPersisted: true,
    enabledAfterRestart: true, arbitraryValueRejected: true,
    packaged: Boolean(packagedApp),
    screenshots: [`${screenshotPrefix}-active-1440x900.png`,
      `${screenshotPrefix}-disabled-1440x900.png`] }));
} finally {
  if (app) await app.close();
  rmSync(root, { recursive: true, force: true });
}
