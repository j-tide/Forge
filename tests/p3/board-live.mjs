/** Real Electron and Python Host board gates over a disposable mixed-state SQLite fixture. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireDesktop = createRequire(join(root, 'apps/desktop/package.json'));
const temporary = await mkdtemp(join(tmpdir(), 'forge-p3-board-live-'));
const source = join(temporary, 'Forge 验证 fixture with spaces');
const output = join(root, 'output/playwright/p3-12-python-desktop-board-1440x900.png');
let desktop;
const git = (...args) => execFileSync('git', ['-C', source, ...args],
  {encoding:'utf8'}).trim();
try {
  const fixture = JSON.parse(execFileSync('uv', [
    '--directory', 'python', 'run', '--frozen', 'python',
    'scripts/p3_board_fixture.py', temporary,
  ], {cwd:root,encoding:'utf8'}));
  const sourceHead = git('rev-parse','HEAD');
  assert.equal(git('status','--porcelain'),'');
  desktop = await electron.launch({executablePath:requireDesktop('electron'),
    args:[join(root,'apps/desktop')],env:{...process.env,FORGE_DEV_SERVER_URL:'',
      FORGE_HOST_DATA_DIR:join(temporary,'data')}});
  const page = await desktop.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:15_000});
  await page.getByRole('button',{name:'研发看板'}).click();
  const todoCards=page.locator('[aria-label="TODO 列"] .board-task');
  const doneColumn=page.locator('[aria-label="Done 列"] .board-column-scroll');
  await page.waitForFunction(()=>globalThis.document.querySelectorAll(
    '[aria-label="TODO 列"] .board-task').length===2);
  assert.equal(await page.locator('[aria-label="Done 列"] .board-task').count(),1);
  await todoCards.first().dragTo(doneColumn);
  await page.getByRole('alert').getByText('缺少 Review、Verify 与人工验收',
    {exact:false}).waitFor();
  await page.reload();
  await page.waitForFunction(()=>globalThis.document.querySelectorAll(
    '[aria-label="TODO 列"] .board-task').length===2);
  const status=page.getByLabel('按状态筛选');
  await status.selectOption('done');
  await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===1);
  await status.selectOption('todo');
  await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===2);
  await status.selectOption('all');
  const priority=page.getByLabel('按优先级筛选');
  await priority.selectOption('high');
  await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===0);
  await priority.selectOption('all');
  const executor=page.getByLabel('按 Executor 筛选');
  await executor.selectOption('');
  await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===2);
  await executor.selectOption('all');
  await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===3);
  const firstTitle=await todoCards.first().locator('h3').textContent();
  const move=page.getByRole('button',{name:`下移 ${firstTitle}`});
  await move.focus();await move.press('Enter');
  try {
    await page.getByText(`已调整 ${firstTitle} 的 TODO 顺序。`).waitFor({timeout:10_000});
  } catch {
    throw new Error(`Reorder feedback: ${JSON.stringify(
      await page.locator('.board-feedback').allTextContents())}`);
  }
  const feedback=await page.locator('.board-feedback').allTextContents();
  assert.ok(feedback.some((value)=>value.includes(`已调整 ${firstTitle} 的 TODO 顺序。`)),
    `Reorder failed: ${JSON.stringify(feedback)}`);
  await page.waitForFunction((ids)=>ids.includes(
    globalThis.document.activeElement?.getAttribute('data-task-id') ?? ''),fixture.todoIds);
  assert.notEqual(await todoCards.first().locator('h3').textContent(),firstTitle);
  const response=await page.evaluate(async(projectId)=>globalThis.forge.invokeBoard({
    schemaVersion:'1.0',commandId:crypto.randomUUID(),type:'board.snapshot',
    createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',
    payload:{projectId},
  }),fixture.projectId);
  assert.equal(response.ok,true);
  assert.equal(response.data.tasks.find((task)=>task.id===fixture.doneId).boardColumn,'done');
  assert.ok(fixture.todoIds.every((id)=>response.data.tasks.find((task)=>
    task.id===id)?.boardColumn==='todo'));
  assert.equal(git('rev-parse','HEAD'),sourceHead);
  assert.equal(git('status','--porcelain'),'');
  await mkdir(dirname(output),{recursive:true});
  await page.screenshot({path:output});
  console.log(JSON.stringify({stage:'p3-board-gates',todoCount:2,doneCount:1,
    crossColumnRejected:true,filtersNonMutating:true,keyboardReorder:true,
    sourceClean:true,screenshot:output}));
} finally {
  await desktop?.close();
  await rm(temporary,{recursive:true,force:true});
}
