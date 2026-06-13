/** Finish a retained, real Owner-return attempt after its Review has completed. No model call. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const repositoryRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(repositoryRoot, 'output', 'qa'));
const dmg = process.env.FORGE_RETURN_DMG;
const dataArg = process.env.FORGE_RETURN_DATA;
const runId = process.env.FORGE_RETURN_RUN_ID;
const artifactTag = process.env.FORGE_RETURN_TAG ?? 'desktop-owner-return-20260926';
const verifyDone = process.env.FORGE_RETURN_VERIFY_DONE === '1';
if (process.platform !== 'darwin' || process.arch !== 'arm64' ||
    !dmg || !dataArg || !runId || !/^[0-9a-f-]{36}$/.test(runId) ||
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(artifactTag)) {
  throw new Error('Require macOS arm64, explicit DMG, retained QA data, Run ID and safe tag');
}
const dataRoot = realpathSync(dataArg);
if (!dataRoot.startsWith(qaRoot + sep) ||
    !existsSync(join(dataRoot, 'Forge', 'production', 'forge.sqlite'))) {
  throw new Error('Only an existing Forge output/qa database may be used');
}
const fixtureRoot = dirname(dataRoot);
const source = join(fixtureRoot, 'Forge fixture 空格');
const sourceHead = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'],
  { encoding:'utf8' }).trim();
const installRoot = mkdtempSync(join(repositoryRoot, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
let attached = false;
let app;
function command(executable, argv) {
  execFileSync(executable, argv, { stdio:'pipe', timeout:30_000 });
}
async function invoke(page, group, type, payload) {
  const response = await page.evaluate(async ({group,type,payload}) => {
    const envelope = {schemaVersion:'1.0',commandId:crypto.randomUUID(),type,
      createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',payload};
    return group === 'project' ? window.forge.invokeProject(envelope) :
      group === 'board' ? window.forge.invokeBoard(envelope) :
      window.forge.invokeRun(envelope);
  }, {group,type,payload});
  assert.equal(response.ok, true, type + ': ' + JSON.stringify(response));
  return response.data;
}
function screenshotPath(suffix) {
  return join(repositoryRoot, 'output', 'playwright',
    artifactTag + '-' + suffix + '-1440x900.png');
}
try {
  command('hdiutil', ['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
  attached = true;
  command('ditto', [join(mount,'Forge INTERNAL.app'),installed]);
  command('codesign', ['--verify','--deep','--strict',installed]);
  command('hdiutil', ['detach',mount]);
  attached = false;
  const launch = () => electron.launch({
    executablePath:join(installed,'Contents','MacOS','Forge'),args:[],
    env:{...process.env,FORGE_DEV_SERVER_URL:'',FORGE_INTERNAL_TEST_HOME:dataRoot},
  });
  app = await launch();
  let page = await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  const projects = await invoke(page,'project','project.list',{});
  assert.equal(projects.length,1);
  const projectId = projects[0].projectId;
  const board = await invoke(page,'board','board.snapshot',{projectId});
  assert.equal(board.tasks.length,1);
  const task = board.tasks[0];
  if (verifyDone) assert.equal(task.state,'done');
  else assert.notEqual(task.state,'done','Returned work must not be Done before new acceptance');
  const handoff = await invoke(page,'run','run.handoff',{projectId,runId});
  assert.ok(handoff?.snapshot?.snapshotId);
  const config = await invoke(page,'run','run.config',{projectId,runId});
  assert.equal(config.workflow.id,'workflow.fixture.quick');
  assert.equal(config.stageProfileDetails[0].id,'profile.fixture.workflow.reviewer');
  const jobs = await invoke(page,'run','run.verifyJobs',{projectId,taskId:task.id});
  const check = jobs.find((item) => item.developmentRunId === runId &&
    item.snapshotId === handoff.snapshot.snapshotId && item.state === 'completed');
  assert.ok(check,'New attempt must have a completed Verify job');
  const report = await invoke(page,'run','run.verifyReport',{
    projectId,verificationId:check.verificationId,
  });
  assert.equal(report.status,'passed');
  assert.equal(report.exitCode,0);
  const reviews = await invoke(page,'run','run.reviewReports',{projectId,taskId:task.id});
  const review = reviews.find((item) => item.developmentRunId === runId &&
    item.snapshotId === handoff.snapshot.snapshotId);
  assert.equal(review?.status,'approved',JSON.stringify(reviews));
  await page.getByRole('button',{name:'研发看板'}).click();
  await page.locator('.board-task').filter({hasText:task.title}).click();
  let accepted;
  let delivery;
  if (!verifyDone) {
  const matrix = page.locator('section[aria-label="逐条验收矩阵"]');
  await matrix.getByRole('button',{name:'刷新真实证据'}).click();
  await matrix.getByLabel('当前快照报告（自动项验证必选）')
    .selectOption(report.reportId);
  await matrix.getByLabel('判断依据 / 未验证说明 / 风险接受原因').fill(
    'The returned attempt tests the exact TypeError message and its current snapshot passed Verify.');
  await matrix.getByRole('button',{name:'记录本快照的判断'}).click();
  await matrix.getByText('必需项均有逐条决定；仍需最终人工验收')
    .waitFor({timeout:15_000});
  const finalPanel = page.locator('section[aria-label="人类最终验收"]');
  await finalPanel.getByRole('button',{name:'重新读取交付'}).click();
  await finalPanel.getByText('快照 ' + handoff.snapshot.snapshotId.slice(0,8),
    {exact:false}).waitFor({timeout:15_000});
  const ready = await invoke(page,'run','run.finalAcceptance',{projectId,taskId:task.id});
  assert.equal(ready.status,'ready',JSON.stringify(ready));
  assert.equal(ready.snapshotId,handoff.snapshot.snapshotId);
  await finalPanel.scrollIntoViewIfNeeded();
  await page.screenshot({path:screenshotPath('rework-ready')});
  await finalPanel.getByLabel('最终验收依据').fill(
    'I inspected the returned attempt, current diff, Review, Verify and AC evidence.');
  await finalPanel.getByLabel('我已检查当前快照与报告，并明确接受这一交付。').check();
  await finalPanel.getByRole('button',{name:'接受当前版本'}).click();
  await finalPanel.getByText('已由本地 Owner 验收',{exact:false})
    .waitFor({timeout:15_000});
  accepted = await invoke(page,'run','run.finalAcceptance',{projectId,taskId:task.id});
  assert.equal(accepted.status,'accepted');
  const done = await invoke(page,'board','board.snapshot',{projectId});
  assert.equal(done.tasks[0].state,'done');
  delivery = await invoke(page,'run','deliveries.get',{projectId,taskId:task.id});
  assert.equal(delivery.snapshotId,handoff.snapshot.snapshotId);
  await finalPanel.scrollIntoViewIfNeeded();
  await page.screenshot({path:screenshotPath('rework-accepted')});
  } else {
    accepted = await invoke(page,'run','run.finalAcceptance',{projectId,taskId:task.id});
    assert.equal(accepted.status,'accepted');
    delivery = await invoke(page,'run','deliveries.get',{projectId,taskId:task.id});
    assert.equal(delivery.snapshotId,handoff.snapshot.snapshotId);
    const verifyPanel = page.locator('section[aria-label="验证报告"]');
    await verifyPanel.getByText(
      '任务已由 Owner 验收；已有验证报告仍可查看，不能再次启动验证。')
      .waitFor({timeout:15_000});
    assert.equal(await verifyPanel.getByText(
      '尚无可对当前任务执行验证的已冻结开发快照。').count(),0);
    await verifyPanel.getByText('test · passed · exit 0',{exact:false}).first().waitFor();
    await verifyPanel.scrollIntoViewIfNeeded();
    await page.screenshot({path:screenshotPath('done-verify-current')});
  }
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  const restored = await invoke(page,'board','board.snapshot',{projectId});
  assert.equal(restored.tasks[0].state,'done');
  assert.equal((await invoke(page,'run','deliveries.get',{
    projectId,taskId:task.id,
  })).snapshotId,handoff.snapshot.snapshotId);
  assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],
    {encoding:'utf8'}).trim(),sourceHead);
  assert.equal(execFileSync('git',['-C',source,'status','--porcelain'],
    {encoding:'utf8'}).trim(),'');
  console.log(JSON.stringify({stage:verifyDone ?
    'packaged-owner-return-current-build' : 'packaged-owner-return-rework-resumed',
    projectId,taskId:task.id,runId,snapshotId:handoff.snapshot.snapshotId,
    verifyReportId:report.reportId,reviewId:review.reviewId,
    decisionId:accepted.decision.decisionId,deliveryId:delivery.deliveryId,
    restoredState:restored.tasks[0].state,sourceClean:true,
    screenshots:verifyDone ? [screenshotPath('done-verify-current')] :
      [screenshotPath('rework-ready'),screenshotPath('rework-accepted')]}));
} finally {
  await app?.close();
  if (attached) command('hdiutil',['detach',mount]);
  rmSync(installRoot,{recursive:true,force:true});
}
