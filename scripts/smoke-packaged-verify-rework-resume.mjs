/** Continue a retained installed-app Verify-triggered Codex rework without rerunning Develop. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
/* global window */

const repositoryRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(repositoryRoot, 'output', 'qa'));
const dmg = process.env.FORGE_VERIFY_REWORK_DMG;
const dataArg = process.env.FORGE_VERIFY_REWORK_DATA;
const tag = process.env.FORGE_VERIFY_REWORK_TAG ?? 'desktop-verify-rework-20260926';
const accept = process.env.FORGE_VERIFY_REWORK_ACCEPT === '1';
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dmg || !dataArg ||
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(tag)) {
  throw new Error('Require arm64 Mac, explicit DMG, retained QA data and safe screenshot tag');
}
const dataRoot = realpathSync(dataArg);
const database = join(dataRoot, 'Forge', 'production', 'forge.sqlite');
if (!dataRoot.startsWith(qaRoot + sep) || !existsSync(database)) {
  throw new Error('Only an existing Forge output/qa database may be read');
}
const source = join(dirname(dataRoot), 'Forge fixture 空格');
const sourceHead = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'],
  {encoding:'utf8'}).trim();
const installRoot = mkdtempSync(join(repositoryRoot,'build','macos','qa-install-'));
const mount = join(installRoot,'mounted');
const installed = join(installRoot,'Forge INTERNAL.app');
mkdirSync(mount);
let attached = false;
let app;
function command(executable, argv) {
  execFileSync(executable, argv, {stdio:'pipe',timeout:30_000});
}
async function invoke(page, group, type, payload) {
  const result = await page.evaluate(async ({group,type,payload}) => {
    const envelope = {schemaVersion:'1.0',commandId:crypto.randomUUID(),type,
      createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',payload};
    return group === 'project' ? window.forge.invokeProject(envelope) :
      group === 'board' ? window.forge.invokeBoard(envelope) :
      window.forge.invokeRun(envelope);
  },{group,type,payload});
  assert.equal(result.ok,true,type+': '+JSON.stringify(result));
  return result.data;
}
const screenshot = (suffix) => join(repositoryRoot,'output','playwright',
  tag+'-'+suffix+'-1440x900.png');
try {
  command('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
  attached = true;
  command('ditto',[join(mount,'Forge INTERNAL.app'),installed]);
  command('codesign',['--verify','--deep','--strict',installed]);
  command('hdiutil',['detach',mount]);
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
  assert.notEqual(task.state,'done');
  const cycles = await invoke(page,'run','run.reworkCycles',{
    projectId,taskId:task.id,
  });
  assert.equal(cycles.length,1);
  const cycle = cycles[0];
  assert.equal(cycle.triggerKind,'verify');
  assert.equal(cycle.state,'succeeded');
  assert.equal(cycle.cycleNo,1);
  assert.ok(cycle.nextRunId);
  const old = await invoke(page,'run','run.inspect',{
    projectId,runId:cycle.sourceRunId,afterCursor:0,limit:100,
  });
  const next = await invoke(page,'run','run.inspect',{
    projectId,runId:cycle.nextRunId,afterCursor:0,limit:100,
  });
  assert.equal(old.run.state,'succeeded');
  assert.equal(next.run.state,'succeeded');
  const [oldHandoff,nextHandoff] = await Promise.all([
    invoke(page,'run','run.handoff',{projectId,runId:cycle.sourceRunId}),
    invoke(page,'run','run.handoff',{projectId,runId:cycle.nextRunId}),
  ]);
  assert.equal(oldHandoff.snapshot.snapshotId,cycle.sourceSnapshotId);
  assert.notEqual(nextHandoff.snapshot.snapshotId,cycle.sourceSnapshotId);
  assert.equal(nextHandoff.snapshot.baseRevision,oldHandoff.snapshot.commitSha);
  const jobs = await invoke(page,'run','run.verifyJobs',{projectId,taskId:task.id});
  const firstJob = jobs.find((job) => job.developmentRunId === cycle.sourceRunId &&
    job.snapshotId === oldHandoff.snapshot.snapshotId);
  const nextJob = jobs.find((job) => job.developmentRunId === cycle.nextRunId &&
    job.snapshotId === nextHandoff.snapshot.snapshotId);
  assert.ok(firstJob && nextJob);
  const [failed,passed] = await Promise.all([
    invoke(page,'run','run.verifyReport',{
      projectId,verificationId:firstJob.verificationId,
    }),
    invoke(page,'run','run.verifyReport',{
      projectId,verificationId:nextJob.verificationId,
    }),
  ]);
  assert.equal(failed.status,'failed');
  assert.notEqual(failed.exitCode,0);
  assert.equal(cycle.triggerReportId,failed.reportId);
  assert.equal(passed.status,'passed');
  assert.equal(passed.exitCode,0);
  const readBundle = "import json,sqlite3,sys,pathlib; p=pathlib.Path(sys.argv[1]); d=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True); r=d.execute('SELECT bundle_json FROM context_bundles WHERE run_id=?',(sys.argv[2],)).fetchone(); print(r[0] if r else '{}')";
  const context = JSON.parse(execFileSync('python3',['-c',readBundle,database,cycle.nextRunId],
    {encoding:'utf8',timeout:15_000}));
  assert.ok(context.items?.some((item) => item.kind === 'rework_feedback' &&
    item.authority === 'verify_evidence' &&
    item.sourceRef === 'verify:'+failed.reportId));
  const workspace = join(dataRoot,'Forge','production','workspaces','trees',
    nextHandoff.snapshot.workspaceId);
  assert.match(readFileSync(join(workspace,'math.js'),'utf8'),
    /Forge numeric input required after verification/);
  command('node',['--check',join(workspace,'math.js')]);
  execFileSync('node',['test.js'],{cwd:workspace,stdio:'pipe',timeout:20_000});
  execFileSync('node',['verify.js'],{cwd:workspace,stdio:'pipe',timeout:20_000});
  assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],
    {encoding:'utf8'}).trim(),sourceHead);
  assert.equal(execFileSync('git',['-C',source,'status','--porcelain'],
    {encoding:'utf8'}).trim(),'');
  await page.getByRole('button',{name:'研发看板'}).click();
  await page.locator('.board-task').filter({hasText:task.title}).click();
  const panel = page.locator('section[aria-label="有限返工记录"]');
  await panel.getByText('已生成新快照',{exact:false}).waitFor({timeout:15_000});
  const reports = page.locator('section[aria-label="验证报告"]');
  await reports.getByText('test · failed',{exact:false}).waitFor();
  await reports.getByText('test · passed',{exact:false}).waitFor();
  await reports.getByText('test · failed',{exact:false}).scrollIntoViewIfNeeded();
  await page.screenshot({path:screenshot('verify-history')});
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({path:screenshot('rework-passed')});
  let review;
  let delivery;
  if (accept) {
    const existing = await invoke(page,'run','run.reviewReports',{
      projectId,taskId:task.id,
    });
    review = existing.find((item) => item.developmentRunId === cycle.nextRunId &&
      item.snapshotId === nextHandoff.snapshot.snapshotId);
    if (!review) {
      const startButton = page.getByRole('button',{name:'明确启动只读 Review'});
      await startButton.waitFor({timeout:15_000});
      assert.equal(await startButton.isEnabled(),true);
      await startButton.click();
      let job;
      for (let attempt=0;attempt<60&&!job;attempt+=1) {
        const jobs = await invoke(page,'run','run.reviewJobs',{projectId,taskId:task.id});
        job=jobs.find((item)=>item.developmentRunId===cycle.nextRunId &&
          item.snapshotId===nextHandoff.snapshot.snapshotId);
        if(!job)await new Promise((resolve)=>setTimeout(resolve,250));
      }
      assert.ok(job,'Desktop did not start a real Review job');
      for(let attempt=0;attempt<300&&job.state==='running';attempt+=1) {
        await new Promise((resolve)=>setTimeout(resolve,1000));
        job=await invoke(page,'run','run.reviewJob',{
          projectId,reviewRunId:job.reviewRunId,
        });
      }
      assert.equal(job.state,'completed',JSON.stringify(job));
      const current=await invoke(page,'run','run.reviewReports',{projectId,taskId:task.id});
      review=current.find((item)=>item.developmentRunId===cycle.nextRunId &&
        item.snapshotId===nextHandoff.snapshot.snapshotId);
    }
    assert.equal(review?.status,'approved',JSON.stringify(review));
    await page.reload();
    const matrix=page.locator('section[aria-label="逐条验收矩阵"]');
    await matrix.getByRole('button',{name:'刷新真实证据'}).click();
    await matrix.getByLabel('当前快照报告（自动项验证必选）')
      .selectOption(passed.reportId);
    await matrix.getByLabel('判断依据 / 未验证说明 / 风险接受原因').fill(
      'The new isolated snapshot passed the automatically repeated approved Verify, and independent Review approved it.');
    await matrix.getByRole('button',{name:'记录本快照的判断'}).click();
    await matrix.getByText('必需项均有逐条决定；仍需最终人工验收')
      .waitFor({timeout:15_000});
    const owner=page.locator('section[aria-label="人类最终验收"]');
    await owner.getByRole('button',{name:'重新读取交付'}).click();
    await owner.getByText('快照 '+nextHandoff.snapshot.snapshotId.slice(0,8),
      {exact:false}).waitFor({timeout:15_000});
    const ready=await invoke(page,'run','run.finalAcceptance',{
      projectId,taskId:task.id,
    });
    assert.equal(ready.status,'ready',JSON.stringify(ready));
    await owner.scrollIntoViewIfNeeded();
    await page.screenshot({path:screenshot('owner-ready')});
    await owner.getByLabel('最终验收依据').fill(
      'I inspected the new snapshot, passing frozen Verify, independent Review and current AC evidence.');
    await owner.getByLabel('我已检查当前快照与报告，并明确接受这一交付。').check();
    await owner.getByRole('button',{name:'接受当前版本'}).click();
    await owner.getByText('已由本地 Owner 验收',{exact:false})
      .waitFor({timeout:15_000});
    const accepted=await invoke(page,'run','run.finalAcceptance',{
      projectId,taskId:task.id,
    });
    assert.equal(accepted.status,'accepted');
    assert.equal((await invoke(page,'board','board.snapshot',{projectId})).tasks[0].state,
      'done');
    delivery=await invoke(page,'run','deliveries.get',{projectId,taskId:task.id});
    assert.equal(delivery.snapshotId,nextHandoff.snapshot.snapshotId);
    await owner.scrollIntoViewIfNeeded();
    await page.screenshot({path:screenshot('owner-accepted')});
  }
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  const restored = await invoke(page,'run','run.reworkCycles',{
    projectId,taskId:task.id,
  });
  assert.equal(restored[0].state,'succeeded');
  assert.equal((await invoke(page,'board','board.snapshot',{projectId})).tasks[0].state,
    accept?'done':'active');
  if (accept) {
    const recovered=await invoke(page,'run','deliveries.get',{projectId,taskId:task.id});
    assert.equal(recovered.deliveryId,delivery.deliveryId);
  }
  console.log(JSON.stringify({stage:'packaged-verify-auto-rework-retained',
    projectId,taskId:task.id,firstRunId:cycle.sourceRunId,
    nextRunId:cycle.nextRunId,failedReportId:failed.reportId,
    passedReportId:passed.reportId,reviewId:review?.reviewId??null,
    deliveryId:delivery?.deliveryId??null,sourceClean:true,
    taskState:accept?'done':'active',screenshots:accept?[
      screenshot('verify-history'),screenshot('rework-passed'),
      screenshot('owner-ready'),screenshot('owner-accepted')]:[
      screenshot('verify-history'),screenshot('rework-passed')]}));
} finally {
  await app?.close();
  if (attached) command('hdiutil',['detach',mount]);
  rmSync(installRoot,{recursive:true,force:true});
}
