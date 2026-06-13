/** Continue one retained development Run through the installed Desktop UI. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';
/* global window */

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(root, 'output', 'qa'));
const dmg = process.env.FORGE_WORKFLOW_CLOSEOUT_DMG;
const dataArg = process.env.FORGE_WORKFLOW_CLOSEOUT_DATA;
const runId = process.env.FORGE_WORKFLOW_CLOSEOUT_RUN_ID;
const taskId = process.env.FORGE_WORKFLOW_CLOSEOUT_TASK_ID;
const tag = process.env.FORGE_WORKFLOW_CLOSEOUT_TAG ?? 'desktop-workflow-v2-closeout-20260926';
const expectedWorkflowId = process.env.FORGE_WORKFLOW_CLOSEOUT_EXPECT_WORKFLOW ?? 'workflow.fixture.quick';
const expectedWorkflowVersion = process.env.FORGE_WORKFLOW_CLOSEOUT_EXPECT_VERSION ?? '2';
const expectedProfileVersion = process.env.FORGE_WORKFLOW_CLOSEOUT_EXPECT_PROFILE ?? '2';
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dmg || !dataArg ||
    !runId || !taskId || !/^[0-9a-f-]{36}$/.test(runId) ||
    !/^[0-9a-f-]{36}$/.test(taskId) ||
    !/^[a-z0-9][a-z0-9-]{0,48}$/.test(tag)) {
  throw new Error('Require macOS arm64, explicit DMG, retained QA data, Run ID and Task ID');
}
const dataRoot = realpathSync(dataArg);
if (!dataRoot.startsWith(qaRoot + sep) ||
    !existsSync(join(dataRoot, 'Forge', 'production', 'forge.sqlite'))) {
  throw new Error('Only an existing Forge output/qa database may be used');
}
let source;
const git = (...argv) => execFileSync('git', ['-C', source, ...argv],
  { encoding:'utf8', timeout:20_000 }).trim();
let sourceHead;
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
let mounted = false;
let app;
function command(executable, argv) {
  execFileSync(executable, argv, { stdio:'pipe', timeout:30_000 });
}
async function invoke(page, group, type, payload) {
  for (let attempt=0;attempt<3;attempt+=1) {
    const response = await page.evaluate(async ({group,type,payload}) => {
      const envelope = {schemaVersion:'1.0',commandId:crypto.randomUUID(),type,
        createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',payload};
      return group === 'project' ? window.forge.invokeProject(envelope) :
        group === 'board' ? window.forge.invokeBoard(envelope) :
        window.forge.invokeRun(envelope);
    }, {group,type,payload});
    if (response.ok) return response.data;
    // Only this list query may be retried: a timed-out write may already have committed.
    if (type !== 'run.verifyJobs' || response.error?.code !== 'TRANSPORT_TIMEOUT' ||
        attempt === 2) {
      assert.equal(response.ok,true,type + ': ' + JSON.stringify(response));
    }
    await delay(750*(attempt+1));
  }
  throw new Error('run.verifyJobs remained unavailable');
}
async function until(read, done, attempts = 120) {
  for (let attempt=0;attempt<attempts;attempt+=1) {
    const value = await read();
    if (done(value)) return value;
    await delay(1_000);
  }
  throw new Error('Timed out waiting for a real Host result');
}
const screenshot = (name) => join(root, 'output', 'playwright',
  `${tag}-${name}-1440x900.png`);
async function openTask(page, title, id) {
  const drawer = page.locator('.forge-overlay--drawer');
  if (await page.evaluate(() => window.location.hash) === `#/tasks/${id}`) {
    await drawer.waitFor({state:'visible',timeout:20_000});
    return;
  }
  if (await drawer.isVisible()) {
    await page.keyboard.press('Escape');
    await drawer.waitFor({state:'hidden',timeout:10_000});
  }
  await page.getByRole('button',{name:'研发看板'}).click();
  if (await drawer.isVisible() &&
      await page.evaluate(() => window.location.hash) === `#/tasks/${id}`) return;
  await page.locator('.board-task').filter({hasText:title}).click();
}
try {
  command('hdiutil', ['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
  mounted = true;
  command('ditto', [join(mount,'Forge INTERNAL.app'),installed]);
  command('codesign', ['--verify','--deep','--strict',installed]);
  command('hdiutil', ['detach',mount]);
  mounted = false;
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
  source = realpathSync(projects[0].rootPath);
  assert.equal(dirname(source),dirname(dataRoot),
    'The Project must be the sibling of the isolated QA data directory');
  assert.ok(source.startsWith(qaRoot+sep), 'The Project must stay in Forge QA');
  sourceHead = git('rev-parse','HEAD');
  assert.equal(git('status','--porcelain'),'', 'Fixture source must start clean');
  const task = (await invoke(page,'board','board.snapshot',{projectId}))
    .tasks.find((item) => item.id === taskId);
  assert.ok(task, 'The retained Task must still exist');
  const config = await invoke(page,'run','run.config',{projectId,runId});
  assert.equal(config.workflow.id,expectedWorkflowId);
  assert.equal(config.workflow.version,expectedWorkflowVersion);
  assert.equal(config.developerProfile.version,expectedProfileVersion);
  const workflowLabel = `${config.workflow.id}@${config.workflow.version}`;
  const handoff = await invoke(page,'run','run.handoff',{projectId,runId});
  assert.ok(handoff?.snapshot?.snapshotId);
  const snapshotId = handoff.snapshot.snapshotId;
  const run = await invoke(page,'run','run.inspect',{
    projectId,runId,afterCursor:0,limit:1,
  });
  assert.equal(run.run.state,'succeeded');
  assert.notEqual(task.state,'done','Develop success does not complete the Task');
  await openTask(page,task.title,taskId);

  let reviews = await invoke(page,'run','run.reviewReports',{projectId,taskId});
  let review = reviews.find((item) => item.developmentRunId === runId &&
    item.snapshotId === snapshotId);
  if (!review) {
    let job = (await invoke(page,'run','run.reviewJobs',{projectId,taskId}))
      .find((item) => item.developmentRunId === runId && item.snapshotId === snapshotId);
    if (!job || job.state === 'failed' || job.state === 'interrupted') {
      const previousReviewRunId = job?.reviewRunId;
      const start = page.getByRole('button',{name:'明确启动只读 Review'});
      await start.waitFor({timeout:20_000});
      assert.equal(await start.isEnabled(),true,'Review must be available from the normal UI');
      await start.click();
      job = await until(async () => (await invoke(page,'run','run.reviewJobs',{
        projectId,taskId,
      })).find((item) => item.developmentRunId === runId &&
        item.snapshotId === snapshotId && item.reviewRunId !== previousReviewRunId),
      Boolean, 30);
    }
    job = await until(() => invoke(page,'run','run.reviewJob',{
      projectId,reviewRunId:job.reviewRunId,
    }), (value) => value.state !== 'running', 300);
    assert.equal(job.state,'completed',JSON.stringify(job));
    reviews = await invoke(page,'run','run.reviewReports',{projectId,taskId});
    review = reviews.find((item) => item.developmentRunId === runId &&
      item.snapshotId === snapshotId);
  }
  assert.ok(review, 'The current frozen snapshot needs a real Review report');
  console.log(JSON.stringify({stage:'review',reviewId:review.reviewId,
    status:review.status,runId,snapshotId}));
  if (review.status !== 'approved') {
    // The Host may start a bounded rework attempt after a Review rejection.
    await until(async () => {
      const board = await invoke(page,'board','board.snapshot',{projectId});
      const newest = board.tasks.find((item) => item.id === taskId)?.latestRunId;
      if (!newest || newest === runId) return {settled:true};
      const current = await invoke(page,'run','run.inspect',{
        projectId,runId:newest,afterCursor:0,limit:1,
      });
      return {settled:['succeeded','failed','cancelled','interrupted'].includes(
        current.run.state)};
    }, (value) => value.settled, 300);
    throw new Error(`Review returned ${review.status}; preserve the real rework state`);
  }
  await page.reload();
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  await openTask(page,task.title,taskId);
  const verifyPanel = page.locator('section[aria-label="验证报告"]');
  let jobs = await invoke(page,'run','run.verifyJobs',{projectId,taskId});
  let check = jobs.find((item) => item.developmentRunId === runId &&
    item.snapshotId === snapshotId && item.kind === 'test');
  if (!check) {
    const preset = verifyPanel.getByLabel('本次冻结环境的验证命令');
    await preset.waitFor({timeout:20_000});
    const presetId = await preset.inputValue();
    assert.ok(config.commandPresetIds?.includes(presetId),
      'The UI-selected approved test preset must belong to the frozen Run');
    await preset.selectOption(presetId);
    const start = verifyPanel.getByRole('button',{name:'明确启动验证'});
    assert.equal(await start.isEnabled(),true,'Verify must be available from the normal UI');
    await start.click();
    check = await until(async () => (await invoke(page,'run','run.verifyJobs',{
      projectId,taskId,
    })).find((item) => item.developmentRunId === runId &&
      item.snapshotId === snapshotId && item.kind === 'test'), Boolean, 30);
  }
  check = await until(() => invoke(page,'run','run.verifyJob',{
    projectId,verificationId:check.verificationId,
  }), (value) => value.state !== 'running', 120);
  assert.equal(check.state,'completed',JSON.stringify(check));
  const report = await invoke(page,'run','run.verifyReport',{
    projectId,verificationId:check.verificationId,
  });
  assert.equal(report.status,'passed',JSON.stringify(report));
  assert.equal(report.exitCode,0);
  await page.reload();
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  await openTask(page,task.title,taskId);
  const matrix = page.locator('section[aria-label="逐条验收矩阵"]');
  const accepted = await invoke(page,'run','run.finalAcceptance',{projectId,taskId});
  if (accepted.status !== 'accepted') {
    await matrix.getByRole('button',{name:'刷新真实证据'}).click();
    await matrix.getByLabel('当前快照报告（自动项验证必选）')
      .selectOption(report.reportId);
    await matrix.getByLabel('判断依据 / 未验证说明 / 风险接受原因').fill(
      `I checked the exact ${workflowLabel} snapshot, independent Review and approved fixture test.`);
    await matrix.getByRole('button',{name:'记录本快照的判断'}).click();
    await matrix.getByText('必需项均有逐条决定；仍需最终人工验收')
      .waitFor({timeout:15_000});
    const owner = page.locator('section[aria-label="人类最终验收"]');
    await owner.getByRole('button',{name:'重新读取交付'}).click();
    const ready = await invoke(page,'run','run.finalAcceptance',{projectId,taskId});
    assert.equal(ready.status,'ready',JSON.stringify(ready));
    await owner.scrollIntoViewIfNeeded();
    await page.screenshot({path:screenshot('owner-ready')});
    await owner.getByLabel('最终验收依据').fill(
      `I inspected the ${workflowLabel} code, current Diff, Review, Verify and AC evidence.`);
    await owner.getByLabel('我已检查当前快照与报告，并明确接受这一交付。').check();
    await owner.getByRole('button',{name:'接受当前版本'}).click();
    await owner.getByText('已由本地 Owner 验收',{exact:false})
      .waitFor({timeout:15_000});
  }
  const final = await invoke(page,'run','run.finalAcceptance',{projectId,taskId});
  assert.equal(final.status,'accepted');
  const delivery = await invoke(page,'run','deliveries.get',{projectId,taskId});
  assert.equal(delivery.snapshotId,snapshotId);
  await page.locator('section[aria-label="人类最终验收"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:screenshot('owner-accepted')});
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  const restored = (await invoke(page,'board','board.snapshot',{projectId}))
    .tasks.find((item) => item.id === taskId);
  assert.equal(restored?.state,'done');
  assert.equal((await invoke(page,'run','deliveries.get',{projectId,taskId}))
    .snapshotId,snapshotId);
  assert.equal(git('rev-parse','HEAD'),sourceHead);
  assert.equal(git('status','--porcelain'),'');
  console.log(JSON.stringify({stage:'packaged-retained-run-closeout',projectId,taskId,
    runId,snapshotId,workflowVersion:config.workflow.version,
    developerProfileVersion:config.developerProfile.version,
    reviewId:review.reviewId,verifyReportId:report.reportId,
    decisionId:final.decision.decisionId,deliveryId:delivery.deliveryId,
    restoredState:restored.state,sourceClean:true,
    screenshots:[screenshot('owner-ready'),screenshot('owner-accepted')]}));
} finally {
  await app?.close();
  if (mounted) command('hdiutil',['detach',mount]);
  rmSync(installRoot,{recursive:true,force:true});
}
