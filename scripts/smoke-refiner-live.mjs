import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'forge-refiner-desktop-'));
const repo = join(root, 'Refiner 真实测试项目');
const output = resolve('output/playwright');
mkdirSync(repo); mkdirSync(output, { recursive: true });
writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'refiner-fixture',
  scripts: { test: 'node --test' } }));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
git('init', '-q'); git('config', 'user.name', 'Forge Test'); git('config', 'user.email', 'forge@example.invalid');
git('add', '.'); git('commit', '-qm', 'fixture');
const before = readFileSync(join(repo, 'package.json'), 'utf8');
let app;
try {
  app = await electron.launch({ executablePath: requireDesktop('electron'), args: [desktopDirectory],
    env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: join(root, 'forge-data') } });
  app.process().stderr?.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.includes('"event":"refiner_model_failed"')) console.error(line);
    }
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /未选择项目/ }).click();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () =>
    ({ canceled: false, filePaths: [path] }); }, repo);
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByRole('button', { name: '继续查看信任范围' }).click();
  await page.getByRole('button', { name: 'Trust this project' }).click();
  await page.getByRole('button', { name: '进入 Forge Workspace' }).click();
  await page.locator('.conversation-panel textarea').fill('修复空邮箱也能通过登录校验的 bug，补充回归测试');
  await page.getByRole('button', { name: '保存输入' }).click();
  await page.getByRole('button', { name: '整理为草稿' }).click();
  await page.waitForFunction(() => {
    const text = globalThis.document.querySelector('.task-draft-card')?.textContent ?? '';
    return text.includes('Task Draft · proposed') || text.includes('Task Draft · needs_clarification') ||
      text.includes('Task Draft · invalid_output');
  }, null, { timeout: 240000 });
  const card = page.locator('.task-draft-card');
  await card.scrollIntoViewIfNeeded();
  assert.match(await card.textContent(), /Task Draft · (proposed|needs_clarification)/);
  assert.match(await card.textContent(), /bug|校验|登录/i);
  assert.equal(readFileSync(join(repo, 'package.json'), 'utf8'), before);
  assert.equal(git('status', '--porcelain'), '');
  await page.screenshot({ path: join(output, 'p1-04-generated-draft-1440x900.png') });
  console.log(JSON.stringify({ result: 'pass', status: 'proposal-or-clarification',
    card: (await card.textContent())?.slice(0, 400), sourceUnchanged: true }));
} finally { await app?.close(); rmSync(root, { recursive: true, force: true }); }
