import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
import { extractFile } from '@electron/asar';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(path.join(root, 'apps/desktop/package.json'), 'utf8'));
const packageRoot = path.join(root, 'apps/desktop/dist', metadata.version, 'mac-arm64', 'Forge Glass Preview.app');
const archive = path.join(packageRoot, 'Contents/Resources/app.asar');
const output = path.join(root, 'output/playwright/localization');
await mkdir(output, { recursive: true });
let checked = 0;
for (const directory of ['out/main', 'out/preload', 'out/renderer/assets']) {
  for (const file of await readdir(path.join(root, 'apps/desktop', directory))) {
    if (!/\.(js|css)$/.test(file)) continue;
    const entry = `${directory}/${file}`;
    assert.deepEqual(extractFile(archive, entry), await readFile(path.join(root, 'apps/desktop', entry)), `Packaged source differs: ${entry}`);
    checked++;
  }
}
assert.deepEqual(extractFile(archive, 'out/renderer/index.html'), await readFile(path.join(root, 'apps/desktop/out/renderer/index.html')));
const app = await electron.launch({ executablePath: path.join(packageRoot, 'Contents/MacOS/Forge Glass Preview'), env: { ...process.env, NODE_ENV: 'production' } });
try {
  await app.firstWindow();
  const page = app.windows().find((window) => !window.url().startsWith('devtools://'));
  assert.ok(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByText(/Forge Glass Preview/).first().waitFor({ timeout: 20000 });
  const runtime = await app.evaluate(({ app }) => ({ version: app.getVersion(), packaged: app.isPackaged, resources: process.resourcesPath }));
  assert.equal(runtime.version, metadata.version);
  assert.equal(runtime.packaged, true);
  assert.ok(runtime.resources.startsWith(packageRoot));
  await page.screenshot({ path: path.join(output, 'package-startup-1440.png'), animations: 'disabled' });
  const evidence = { ...runtime, checkedBuiltFiles: checked + 1, documentLanguage: await page.locator('html').getAttribute('lang'), screenshots: ['package-startup-1440.png'], note: 'Read-only startup using existing preview preferences; no provider call or preference change.' };
  await writeFile(path.join(output, 'packaged-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await app.close(); }
