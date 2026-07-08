import assert from 'node:assert/strict';
/* global window */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'forge-diagnostics-smoke-'));
let app;
try {
  const exportedPath = join(root, 'exported.json');
  const env = { ...process.env, FORGE_DEV_SERVER_URL: '',
    FORGE_HOST_DATA_DIR: join(root, 'data'), FORGE_MODEL_PROVIDER: 'disabled',
    OPENAI_API_KEY: '', CODEX_API_KEY: '', ANTHROPIC_API_KEY: '',
    CODEX_HOME: join(root, 'empty-codex-home') };
  mkdirSync(env.CODEX_HOME);
  mkdirSync(env.FORGE_HOST_DATA_DIR);
  writeFileSync(join(env.FORGE_HOST_DATA_DIR, 'fixture.log'),
    `Authorization: Bearer test-private-token\nProject path: ${root}/source\n`);
  app = await electron.launch({ executablePath: requireDesktop('electron'),
    args: [desktopDirectory], env });
  const page = await app.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '生成诊断预览' }).click();
  const preview = page.locator('pre.diagnostics-preview');
  await preview.waitFor();
  const visible = await preview.textContent();
  const bundle = JSON.parse(visible);
  assert.equal(bundle.format, 'forge-diagnostics/v1');
  assert.equal(bundle.storage.schemaVersion, 32);
  assert.equal(bundle.retention.automaticPurge, false);
  assert.equal(bundle.usage.status, 'unavailable');
  assert.ok(!visible.includes(root));
  assert.ok(!visible.includes('API_KEY'));
  assert.ok(!visible.includes('test-private-token'));
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
  const output = resolve('output/playwright'); mkdirSync(output, { recursive: true });
  await page.screenshot({ path: join(output, 'p6-04-diagnostics-preview-1440x900.png') });
  console.log(JSON.stringify({ stage: 'diagnostics-export', format: bundle.format,
    schemaVersion: bundle.storage.schemaVersion, exactPreviewBytes: true,
    artifactDays: bundle.retention.artifactDays }));
} finally {
  if (app) await app.close();
  rmSync(root, { recursive: true, force: true });
}
