/** Exercise installed Knowledge UI against a disposable DB and an existing disposable Git demo. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('The installed Knowledge probe is macOS arm64 only');
}
const appPath = join(homedir(), 'Applications', 'Forge INTERNAL Current.app');
const repo = join(homedir(), 'Documents', 'Forge Demo', 'project');
const data = mkdtempSync(join(tmpdir(), 'forge-packaged-knowledge-'));
const output = resolve('output/playwright');
mkdirSync(output, { recursive: true });
const before = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' });
let app;
try {
  app = await electron.launch({ executablePath: join(appPath, 'Contents', 'MacOS', 'Forge'),
    args: [], env: { ...process.env, FORGE_INTERNAL_TEST_HOME: data,
      FORGE_DEV_SERVER_URL: '', FORGE_MODEL_PROVIDER: 'disabled' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: /未选择项目/ }).click();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  }, repo);
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByText('Git repository', { exact: false }).waitFor();
  await page.getByRole('button', { name: '继续查看信任范围' }).click();
  await page.getByRole('button', { name: 'Trust this project' }).click();
  await page.getByText('PROJECT CONNECTED').waitFor();
  await page.getByRole('button', { name: '进入 Forge Workspace' }).click();
  await page.getByRole('button', { name: '项目资料' }).click();
  await page.getByRole('heading', { name: '导入来源' }).waitFor();
  await page.getByRole('textbox', { name: '项目内相对路径' }).fill('docs/add-contract.md');
  await page.getByRole('button', { name: '只读导入' }).click();
  await page.getByText('已只读导入 docs/add-contract.md', { exact: false }).waitFor();
  await page.getByRole('heading', { name: '原文定位' }).waitFor();
  await page.getByRole('textbox', { name: '关键词' }).fill('finite');
  await page.getByRole('button', { name: '检索', exact: true }).click();
  await page.getByText('1 个片段 · forge-knowledge-search', { exact: false }).waitFor();
  await page.screenshot({ path: join(output, 'p7-current-packaged-knowledge-search-1440x900.png') });
  await page.getByRole('button', { name: '从此来源提议记忆' }).click();
  await page.getByRole('textbox', { name: '主题键（小写字母开头）' }).fill('math.finite_numbers');
  await page.getByRole('button', { name: '保存候选' }).click();
  await page.getByText('已保存候选记忆', { exact: false }).waitFor();
  await page.getByRole('button', { name: '确认记忆' }).click();
  await page.getByRole('textbox', { name: '人工决定理由（至少 12 字符）' }).fill(
    'The checked source defines finite-number inputs for the demo.');
  await page.getByRole('button', { name: '确认此决定' }).click();
  await page.getByText('已确认该记忆', { exact: false }).waitFor();
  await page.getByRole('button', { name: '检索记忆' }).click();
  await page.getByText('当前查询返回 1 条有效记忆', { exact: false }).waitFor();
  await page.screenshot({ path: join(output, 'p7-current-packaged-memory-confirmed-1440x900.png') });
  await page.getByRole('button', { name: '撤销记忆' }).click();
  await page.getByRole('textbox', { name: '人工决定理由（至少 12 字符）' }).fill(
    'The demo is checking that revocation removes retrieval immediately.');
  await page.getByRole('button', { name: '确认此决定' }).click();
  await page.getByText('已撤销并清空索引', { exact: false }).waitFor();
  await page.getByRole('button', { name: '检索记忆' }).click();
  await page.getByText('当前查询返回 0 条有效记忆', { exact: false }).waitFor();
  assert.equal(execFileSync('git', ['-C', repo, 'status', '--porcelain'],
    { encoding: 'utf8' }), before);
  console.log(JSON.stringify({ stage: 'packaged-knowledge-memory', imported: true,
    sourceLocated: true, searchMatches: 1, validatedMemoryRetrieved: 1,
    revokedMemoryRetrieved: 0, sourceGitUntouched: true }));
} finally {
  await app?.close();
  rmSync(data, { recursive: true, force: true });
}
