import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const dmg = process.env.FORGE_REFINER_DMG;
const requestedRoot = process.env.FORGE_REFINER_ROOT;
const artifactTag = process.env.FORGE_REFINER_TAG;
const manualClarification = process.env.FORGE_REFINER_MANUAL_CLARIFICATION === '1';
const resumeExisting = process.env.FORGE_REFINER_RESUME_EXISTING === '1';
if (resumeExisting && !requestedRoot) throw new Error('Resume requires FORGE_REFINER_ROOT');
if (dmg && (process.platform !== 'darwin' || process.arch !== 'arm64')) {
  throw new Error('Packaged refiner QA requires a macOS arm64 installation');
}
if (requestedRoot && (!isAbsolute(requestedRoot) ||
    existsSync(requestedRoot) !== resumeExisting)) {
  throw new Error('FORGE_REFINER_ROOT must be an absolute directory with the requested state');
}
if (artifactTag && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(artifactTag)) {
  throw new Error('FORGE_REFINER_TAG must be a short lowercase slug');
}
const root = requestedRoot ?? mkdtempSync(join(tmpdir(), 'forge-refiner-desktop-'));
if (requestedRoot && !resumeExisting) mkdirSync(root, { recursive: true });
const repo = join(root, 'Refiner 真实测试项目');
const output = resolve('output/playwright');
if (!resumeExisting) {
  mkdirSync(repo);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'refiner-fixture',
    scripts: { test: 'node --test' } }));
}
mkdirSync(output, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
if (!resumeExisting) {
  git('init', '-q'); git('config', 'user.name', 'Forge Test'); git('config', 'user.email', 'forge@example.invalid');
  git('add', '.'); git('commit', '-qm', 'fixture');
}
const before = readFileSync(join(repo, 'package.json'), 'utf8');
let app;
let installRoot;
let mount;
let mounted = false;
try {
  let executable = requireDesktop('electron');
  let args = [desktopDirectory];
  const env = { ...process.env, FORGE_DEV_SERVER_URL: '',
    FORGE_HOST_DATA_DIR: join(root, 'forge-data') };
  if (dmg) {
    installRoot = mkdtempSync(join(repositoryRoot, 'build', 'macos', 'qa-install-'));
    mount = join(installRoot, 'mounted');
    mkdirSync(mount);
    execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
    mounted = true;
    const installed = join(installRoot, 'Forge INTERNAL.app');
    execFileSync('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
    execFileSync('codesign', ['--verify', '--deep', '--strict', installed]);
    execFileSync('hdiutil', ['detach', mount]);
    mounted = false;
    executable = join(installed, 'Contents', 'MacOS', 'Forge');
    args = [];
    env.FORGE_INTERNAL_TEST_HOME = join(root, 'isolated-app-data');
  }
  app = await electron.launch({ executablePath: executable, args, env });
  app.process().stderr?.on('data', (chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.includes('"event":"refiner_model_failed"')) console.error(line);
    }
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  if (!resumeExisting) {
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () =>
      ({ canceled: false, filePaths: [path] }); }, repo);
    await page.locator('.project-picker').click();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '信任并打开' }).click();
  }
  await page.locator('.sidebar-new-task').click();
  const selectedModelId = manualClarification ? null : await page.getByLabel('需求整理模型').inputValue();
  if (!manualClarification) assert.ok(selectedModelId, 'The refiner must show its selected model before sending');
  if (resumeExisting) {
    await page.locator('.conversation-history button').first().click();
  } else {
    await page.locator('.conversation-panel textarea').fill('修复空邮箱也能通过登录校验的 bug，补充回归测试');
  }
  if (manualClarification) {
    if (resumeExisting) await page.getByRole('button', { name: '手工填写草稿' }).click();
    else await page.getByRole('button', { name: '手工填写', exact: true }).click();
    const editor = page.locator('.draft-sheet[aria-label="任务草稿编辑"]');
    await editor.waitFor();
    await editor.getByLabel('标题').fill('修复空邮箱通过登录校验的问题');
    await editor.getByLabel('验收条件 ac1').fill('空邮箱必须被登录校验拒绝。');
    await editor.getByLabel('新增问题').fill('是否也应拒绝仅包含空白字符的邮箱？');
    await editor.getByRole('button', { name: '添加问题' }).click();
    await editor.getByLabel('本次用户决定 / 修改原因').fill('手工建立待澄清合同');
    await editor.getByRole('button', { name: '保存新 revision' }).click();
    await page.getByRole('button', { name: '返回讨论' }).click();
    await page.getByRole('button', { name: '审阅并编辑任务' }).waitFor();
  } else {
    if (resumeExisting) await page.getByRole('button', { name: '用 AI 整理这条需求' }).click();
    else await page.getByRole('button', { name: '发送并整理' }).click();
  }
  await page.waitForFunction(() => {
    if (globalThis.document.querySelector('.conversation-editor-stage')) return true;
    const card = globalThis.document.querySelector('.task-draft-card');
    return !!card?.querySelector('h3') && !card.textContent?.includes('正在整理需求');
  }, null, { timeout: 240000 });
  if (await page.locator('.conversation-editor-stage').isVisible()) {
    if (selectedModelId) {
      assert.equal(await page.locator('.conversation-editor-header small').textContent(),
        `Codex · ${selectedModelId}`);
      assert.ok((await page.locator('.conversation-editor-reply').innerText()).trim().length > 0,
        'The selected Codex model must answer in the task editor');
    }
    await page.getByRole('button', { name: '返回讨论' }).click();
  }
  const card = page.locator('.task-draft-card');
  await card.scrollIntoViewIfNeeded();
  assert.equal(await card.locator('h3').count(), 1);
  assert.match(await card.textContent(), /bug|校验|登录/i);
  if (selectedModelId) {
    assert.match(await card.locator('small').first().textContent(),
      new RegExp(`Codex · ${selectedModelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.ok((await card.locator('.assistant-reply').innerText()).trim().length > 0,
      'The real Codex refiner must display an assistant reply');
  }
  assert.equal(readFileSync(join(repo, 'package.json'), 'utf8'), before);
  assert.equal(git('status', '--porcelain'), '');
  const screenshot = join(output, artifactTag ?
    `${artifactTag}-generated-draft-1440x900.png` : 'p1-04-generated-draft-1440x900.png');
  await page.screenshot({ path: screenshot });
  console.log(JSON.stringify({ result: 'pass', status: 'proposal-or-clarification',
    packaged: Boolean(dmg), manualClarification,
    card: (await card.textContent())?.slice(0, 400),
    sourceUnchanged: true, screenshot }));
} finally {
  await app?.close();
  if (mounted && mount) execFileSync('hdiutil', ['detach', mount]);
  if (installRoot) rmSync(installRoot, { recursive: true, force: true });
  if (process.env.FORGE_REFINER_KEEP_FIXTURE === '1') {
    console.error(`Forge refiner fixture retained: ${root}`);
  } else {
    rmSync(root, { recursive: true, force: true });
  }
}
