/** Resume an existing packaged model draft through user clarification and TODO. No model call. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const repositoryRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(repositoryRoot, 'output', 'qa'));
const dmg = process.env.FORGE_REFINER_DMG;
const dataArg = process.env.FORGE_REFINER_DATA;
const artifactTag = process.env.FORGE_REFINER_TAG ?? 'desktop-refiner-resume';
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dmg || !dataArg ||
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(artifactTag)) {
  throw new Error('Require macOS arm64, explicit DMG, retained QA data and safe artifact tag');
}
const dataRoot = realpathSync(dataArg);
if (!dataRoot.startsWith(qaRoot + sep) ||
    !existsSync(join(dataRoot, 'Forge', 'production', 'forge.sqlite'))) {
  throw new Error('Only an existing Forge output/qa database may be used');
}
const fixtureRoot = dirname(dataRoot);
const source = join(fixtureRoot, 'Refiner 真实测试项目');
const before = readFileSync(join(source, 'package.json'), 'utf8');
const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const installRoot = mkdtempSync(join(repositoryRoot, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
let mounted = false;
let app;
const command = (executable, argv) => execFileSync(executable, argv,
  { stdio: 'pipe', timeout: 30_000 });
const screenshot = (suffix) => join(repositoryRoot, 'output', 'playwright',
  `${artifactTag}-${suffix}-1440x900.png`);
function databaseState() {
  const script = `import json,sqlite3,sys
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
print(json.dumps({'integrity':c.execute('pragma quick_check').fetchone()[0],
 'drafts':c.execute('select count(*) from task_drafts').fetchone()[0],
 'revision':c.execute('select max(revision) from task_drafts').fetchone()[0],
 'status':c.execute('select status from task_drafts').fetchone()[0],
 'tasks':c.execute('select count(*) from tasks').fetchone()[0],
 'states':[r[0] for r in c.execute('select state from tasks')],
 'runs':c.execute('select count(*) from runs').fetchone()[0]}))`;
  return JSON.parse(execFileSync('python3', ['-c', script,
    join(dataRoot, 'Forge', 'production', 'forge.sqlite')], { encoding: 'utf8' }));
}
try {
  const initial = databaseState();
  assert.equal(initial.integrity, 'ok');
  assert.equal(initial.drafts, 1);
  assert.ok([1, 2].includes(initial.revision), 'Expected a generated or manual draft');
  assert.ok(['needs_clarification', 'proposed'].includes(initial.status));
  assert.deepEqual([initial.tasks, initial.runs], [0, 0]);
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  mounted = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  command('hdiutil', ['detach', mount]);
  mounted = false;
  const launch = () => electron.launch({ executablePath: join(installed, 'Contents', 'MacOS', 'Forge'),
    args: [], env: { ...process.env, FORGE_DEV_SERVER_URL: '',
      FORGE_INTERNAL_TEST_HOME: dataRoot } });
  app = await launch();
  let page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name:'新建任务' }).click();
  const composer = page.getByRole('dialog', { name:'新建任务' });
  await composer.locator('.conversation-history button').first().click();
  let revision = initial.revision;
  await composer.getByRole('button', { name:'审阅并编辑任务' }).click();
  const editing = composer.locator('.draft-sheet[aria-label="任务草稿编辑"]');
  if (initial.status === 'needs_clarification') {
    const questions = editing.locator('.draft-question');
    const questionCount = await questions.count();
    assert.ok(questionCount >= 1, 'A needs_clarification draft must show a real question');
    for (let index = 0; index < questionCount; index += 1) {
      const row = questions.nth(index);
      const question = await row.locator('p').first().innerText();
      const answer = /空格|空白字符/.test(question) ?
        '是，仅包含空白字符的邮箱也必须判为无效，并加入回归测试。' :
        /测试框架|回归测试|测试.*位置/.test(question) ?
          '沿用项目 package.json 中的 node --test，并在 tests/login.test.js 放置回归测试。' : null;
      assert.ok(answer, `Unexpected clarification question in this fixed QA fixture: ${question}`);
      await row.getByLabel('你的回答（留空则仍阻塞批准）').fill(answer);
    }
    await editing.getByLabel('本次用户决定 / 修改原因').fill(
      '已确认空白字符邮箱属于无效输入；本次修订记录澄清决定。');
    await editing.screenshot({ path: screenshot('clarification') });
    if (process.env.FORGE_REFINER_EXPECT_GUARD === '1') {
      await editing.getByRole('button', { name: '保存新 revision' }).click();
      await editing.getByRole('alert').getByText(
        '请把澄清答案写入目标、验收条件或其他正式合同字段',
        { exact: false }).waitFor();
      await editing.screenshot({ path: screenshot('contract-guard') });
    }
    await editing.getByLabel('目标').fill(
      '阻止空邮箱及仅包含空白字符的邮箱通过登录校验；沿用 package.json 的 node --test，在 tests/login.test.js 补充两种输入的回归测试。');
    await editing.locator('.draft-criterion textarea').first().fill(
      '邮箱为空或仅包含空白字符时，登录校验均判定失败；tests/login.test.js 使用 node --test 覆盖这两种输入。');
    await editing.getByRole('button', { name: '保存新 revision' }).click();
    await editing.getByText(`修订 v${revision + 1}`, { exact:false }).waitFor();
    revision += 1;
  }
  const drawer = editing;
  await drawer.getByText('0 项仍未回答；未解问题阻塞后续批准。').waitFor();
  await drawer.locator('.draft-history-entry summary').filter({ hasText: `v${revision} ·` }).click();
  await drawer.getByText('澄清：', { exact: false }).first().waitFor();
  await drawer.screenshot({ path: screenshot('revision') });
  await drawer.getByRole('button', { name: '提交审批请求' }).click();
  await drawer.getByText(`待确认：v${revision}`, { exact: false }).waitFor();
  await drawer.getByLabel('我已审阅当前目标、验收和范围').check();
  await drawer.getByRole('button', { name: '批准并加入 TODO' }).click();
  await composer.waitFor({ state:'hidden' });
  await page.getByRole('button', { name: '看板', exact:true }).click();
  await page.locator('.board-task').filter({ hasText: /邮箱|登录|校验/ }).waitFor();
  await page.screenshot({ path: screenshot('todo') });
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: '看板', exact:true }).click();
  await page.locator('.board-task').filter({ hasText: /邮箱|登录|校验/ }).waitFor();
  await page.screenshot({ path: screenshot('todo-restored') });
  await app.close(); app = undefined;
  const restored = databaseState();
  assert.deepEqual([restored.integrity, restored.drafts, restored.revision,
    restored.tasks, restored.runs], ['ok', 1, revision, 1, 0]);
  assert.deepEqual(restored.states, ['todo']);
  assert.equal(readFileSync(join(source, 'package.json'), 'utf8'), before);
  assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' }).trim(), head);
  assert.equal(execFileSync('git', ['-C', source, 'status', '--porcelain'],
    { encoding: 'utf8' }).trim(), '');
  console.log(JSON.stringify({ result: 'pass', packaged: true, noModelCall: true,
    restored, sourceClean: true, screenshots: ['clarification', 'revision', 'todo',
      'todo-restored'].map(screenshot) }));
} finally {
  await app?.close();
  if (mounted) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive: true, force: true });
}
