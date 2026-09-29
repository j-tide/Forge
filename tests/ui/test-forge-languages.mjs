import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const data = await mkdtemp(path.join(tmpdir(), 'forge-language-qa-'));
const output = process.env.FORGE_QA_OUTPUT_DIR ? path.resolve(process.env.FORGE_QA_OUTPUT_DIR) : path.join(root, 'output', 'playwright', 'localization');
await mkdir(output, { recursive: true });
const executablePath = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
async function launch(profile) {
  const app = await electron.launch({ executablePath, args: [root], env: { ...process.env, NODE_ENV: 'test', FORGE_GLASS_PREVIEW_USER_DATA_DIR: profile } });
  await app.firstWindow();
  const page = app.windows().find((window) => !window.url().startsWith('devtools://'));
  if (!page) { await app.close(); throw new Error('Application window missing'); }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.forge-glass-welcome').waitFor({ timeout: 20000 });
  return { app, page };
}
async function shot(page, name) { await page.screenshot({ path: path.join(output, name), animations: 'disabled' }); }
async function settings(page, language) {
  await page.getByRole('button', { name: language === 'zh-CN' ? '设置' : 'Settings', exact: true }).click();
  await shot(page, `settings-open-${language}.png`);
  await page.getByRole('button', { name: language === 'zh-CN' ? /^语言/ : /^Language/ }).click();
}
for (const theme of ['light', 'dark']) {
  const profile = path.join(data, theme);
  await mkdir(profile, { recursive: true });
  const file = path.join(profile, 'settings.json');
  await writeFile(file, JSON.stringify({ onboardingCompleted: true, theme, colorTheme: 'forge-glass', sentryEnabled: false }));
  let { app, page } = await launch(profile);
  try {
    await page.getByRole('button', { name: '打开项目', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    await shot(page, `home-zh-${theme}-1440.png`);
    await settings(page, 'zh-CN');
    await shot(page, `settings-language-zh-${theme}-1440.png`);
    await page.getByRole('button', { name: 'English English', exact: true }).click();
    await page.getByText('Saved automatically. No restart required.', { exact: true }).waitFor();
    assert.equal(JSON.parse(await readFile(file, 'utf8')).language, 'en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await shot(page, `settings-language-en-${theme}-1440.png`);
  } finally { await app.close(); }
  ({ app, page } = await launch(profile));
  try {
    await page.getByRole('button', { name: 'Open Project', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await shot(page, `home-en-${theme}-1440.png`);
    await settings(page, 'en');
    await page.getByRole('button', { name: '中文 简体中文', exact: true }).click();
    await page.getByText('自动保存，无需重启。', { exact: true }).waitFor();
    assert.equal(JSON.parse(await readFile(file, 'utf8')).language, 'zh-CN');
  } finally { await app.close(); }
  ({ app, page } = await launch(profile));
  try {
    await page.getByRole('button', { name: '打开项目', exact: true }).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    console.log(`${theme}: default Chinese → English → restart → Chinese → restart passed`);
  } finally { await app.close(); }
}
console.log(`Isolated profiles: ${data}\nActual Electron screenshots: ${output}`);
