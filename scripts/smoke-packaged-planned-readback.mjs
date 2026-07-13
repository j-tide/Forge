/** Finish an installed-app Plan acceptance without repeating an online model turn. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';
/* global window */

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(root, 'output', 'qa'));
const dataArg = process.env.FORGE_PLANNED_READBACK_DATA;
const dmg = process.env.FORGE_PLANNED_READBACK_DMG;
const tag = process.env.FORGE_PLANNED_READBACK_TAG ?? 'desktop-planned-readback';
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dataArg || !dmg ||
    !existsSync(dmg) || !/^[a-z0-9][a-z0-9-]{0,50}$/.test(tag)) {
  throw new Error('Requires macOS arm64, explicit QA data, installed DMG and safe tag');
}
const approve = process.env.FORGE_PLANNED_READBACK_APPROVE === '1';
if (approve && process.env.FORGE_PLANNED_LIVE !== '1') {
  throw new Error('Approving the Plan starts an online Codex Developer; explicit opt-in required');
}
const dataRoot = realpathSync(dataArg);
assert.ok(dataRoot.startsWith(qaRoot + sep));
assert.ok(existsSync(join(dataRoot, 'isolated-app-data', 'Forge', 'production', 'forge.sqlite')));
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(mount);
let attached = false;
let app;
function command(executable, args) {
  return execFileSync(executable, args, {encoding:'utf8', timeout:30_000}).trim();
}
async function invoke(page, group, type, payload) {
  const reply = await page.evaluate(async ({group,type,payload}) => {
    const envelope = {schemaVersion:'1.0',commandId:crypto.randomUUID(),type,
      createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',payload};
    return group === 'project' ? window.forge.invokeProject(envelope) :
      group === 'board' ? window.forge.invokeBoard(envelope) :
      window.forge.invokeRun(envelope);
  },{group,type,payload});
  assert.equal(reply.ok,true,`${type}: ${JSON.stringify(reply)}`);
  return reply.data;
}
async function launch() {
  app = await electron.launch({
    executablePath:join(installed,'Contents','MacOS','Forge'),args:[],
    env:{...process.env,FORGE_DEV_SERVER_URL:'',
      FORGE_INTERNAL_TEST_HOME:join(dataRoot,'isolated-app-data'),
      FORGE_MODEL_PROVIDER:'disabled'},
  });
  const page = await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  return page;
}
async function closeInstalled() {
  if (!app) return;
  await app.evaluate(({dialog}) => {dialog.showMessageBox = async (_window,options) => ({
    response:(options?.buttons ?? _window?.buttons)?.length === 3 ? 2 : 1,
  });});
  await app.close();
  app=undefined;
}
try {
  command('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
  attached=true;
  command('ditto',[join(mount,'Forge INTERNAL.app'),installed]);
  command('codesign',['--verify','--deep','--strict',installed]);
  command('hdiutil',['detach',mount]);
  attached=false;
  let page=await launch();
  const projects=await invoke(page,'project','project.list',{});
  assert.equal(projects.length,1);
  const project=projects[0];
  const source=realpathSync(project.rootPath);
  assert.ok(source.startsWith(dataRoot+sep),'QA Project escaped isolated directory');
  const baseline=command('git',['-C',source,'rev-parse','HEAD']);
  const board=await invoke(page,'board','board.snapshot',{projectId:project.projectId});
  assert.equal(board.tasks.length,1);
  const task=board.tasks[0];
  const runs=await invoke(page,'run','run.list',{
    projectId:project.projectId,taskId:task.id,
  });
  const run=runs.find((item)=>item.attempt.nodeId==='plan');
  assert.ok(run,'Retained Task has no Planner Run');
  const inspection=await invoke(page,'run','run.inspect',{
    projectId:project.projectId,runId:run.runId,afterCursor:0,limit:100,
  });
  assert.equal(inspection.run.state,'succeeded');
  assert.equal(inspection.run.attempt.nodeId,'plan');
  assert.ok(inspection.contextSources.some((item)=>
    item.sourceKind==='untrusted_project/retrieved_knowledge'));
  const gate=await invoke(page,'run','run.planGet',{
    projectId:project.projectId,taskId:task.id,runId:run.runId,
  });
  assert.ok(gate?.artifact?.result?.plan?.length);
  assert.equal(gate.artifact.baseRevision,baseline);
  assert.equal(gate.artifact.taskRevision,2);
  assert.equal(gate.requiresApproval,true);
  assert.ok(['pending','approved'].includes(gate.decision));
  if (gate.decision === 'pending') assert.equal(gate.developmentRunId,null);
  else assert.ok(gate.developmentRunId);
  const frozen=await invoke(page,'run','run.config',{
    projectId:project.projectId,runId:run.runId,
  });
  assert.equal(frozen.actualNodeId,'plan');
  assert.equal(frozen.developerProfile.id,'profile.qa.planned.planner');
  assert.equal(frozen.workflow.version,'1');
  await page.getByRole('button',{name:'看板', exact:true}).click();
  await page.locator('.board-task').filter({hasText:task.title}).click();
  await page.getByRole('tab',{name:'运行',exact:true}).click();
  await page.locator('nav.run-list').getByRole('button',{
    name:new RegExp(run.runId.slice(0,8)),
  }).click();
  const planPanel=page.getByRole('region',{name:'实施计划'});
  await planPanel.getByText(gate.decision === 'pending' ?
    'Strict 流程需要人工确认此计划' : 'Developer Run',{exact:false}).waitFor();
  await planPanel.scrollIntoViewIfNeeded();
  await page.screenshot({path:join(root,'output','playwright',
    `${tag}-strict-installed-plan-1440x900.png`)});
  await page.getByRole('tab',{name:'context'}).click();
  const knowledgeSource=page.getByText('untrusted_project/retrieved_knowledge',
    {exact:false}).first();
  await knowledgeSource.waitFor();
  await knowledgeSource.scrollIntoViewIfNeeded();
  await page.screenshot({path:join(root,'output','playwright',
    `${tag}-strict-frozen-context-1440x900.png`)});
  let developmentRunId = gate.developmentRunId;
  let developmentState = null;
  let developmentBudgetFailure = null;
  if (!approve && developmentRunId) {
    const development = await invoke(page,'run','run.inspect',{
      projectId:project.projectId,runId:developmentRunId,afterCursor:0,limit:10,
    });
    developmentState = development.run.state;
    developmentBudgetFailure = development.budgetFailure;
    assert.ok(development.contextSources.some((item)=>
      item.sourceKind==='untrusted_project/retrieved_knowledge'));
    assert.ok(development.contextSources.some((item)=>item.sourceRef.startsWith('plan:')));
    await page.locator('nav.run-list').getByRole('button',{
      name:new RegExp(developmentRunId.slice(0,8)),
    }).click();
    await page.getByText(developmentBudgetFailure ?? developmentState,{exact:false})
      .first().waitFor();
    await page.locator('.run-head').scrollIntoViewIfNeeded();
    await page.screenshot({path:join(root,'output','playwright',
      `${tag}-strict-developer-${developmentState}-1440x900.png`)});
  }
  if (approve) {
    if (gate.decision === 'pending') {
      await planPanel.getByRole('button',{name:'确认计划并启动开发'}).click();
    } else {
      assert.equal(gate.decision,'approved');
    }
    for (let attempt=0;attempt<30&&!developmentRunId;attempt+=1) {
      const updated=await invoke(page,'run','run.planGet',{
        projectId:project.projectId,taskId:task.id,runId:run.runId,
      });
      developmentRunId=updated.developmentRunId;
      if (!developmentRunId) await delay(1000);
    }
    assert.ok(developmentRunId,'Approved Plan did not start a Developer Run');
    console.log(JSON.stringify({stage:'strict-developer-started',developmentRunId}));
    let developed;
    for (let attempt=0;attempt<240;attempt+=1) {
      developed=await invoke(page,'run','run.inspect',{
        projectId:project.projectId,runId:developmentRunId,afterCursor:0,limit:10,
      });
      if (['succeeded','failed','cancelled','interrupted'].includes(developed.run.state)) break;
      await delay(2000);
    }
    assert.equal(developed?.run.state,'succeeded',JSON.stringify({
      state:developed?.run.state,budgetFailure:developed?.budgetFailure,
      planFailure:developed?.planFailure,
    }));
    assert.equal(developed.run.attempt.nodeId,'develop');
    assert.ok(developed.contextSources.some((item)=>
      item.sourceKind==='untrusted_project/retrieved_knowledge'),
    'The Developer did not receive the frozen retrieved knowledge');
    assert.ok(developed.contextSources.some((item)=>item.sourceRef.startsWith('plan:')),
      'The Developer did not receive the validated Plan Artifact');
    let handoff;
    for (let attempt=0;attempt<30&&!handoff;attempt+=1) {
      handoff=await invoke(page,'run','run.handoff',{
        projectId:project.projectId,runId:developmentRunId,
      });
      if (!handoff) await delay(1000);
    }
    assert.ok(handoff?.snapshot?.snapshotId,'No frozen Developer CodeSnapshot');
    const developerConfig=await invoke(page,'run','run.config',{
      projectId:project.projectId,runId:developmentRunId,
    });
    assert.equal(developerConfig.workflow.id,frozen.workflow.id);
    assert.equal(developerConfig.workflow.version,frozen.workflow.version);
    assert.equal(developerConfig.developerProfile.id,'profile.qa.planned.developer');
    await page.reload();
    await page.getByRole('button',{name:'Host connected'}).waitFor();
    await page.getByRole('button',{name:'看板', exact:true}).click();
    await page.locator('.board-task').filter({hasText:task.title}).click();
    await page.getByRole('tab',{name:'运行',exact:true}).click();
    await page.locator('nav.run-list').getByRole('button',{
      name:new RegExp(developmentRunId.slice(0,8)),
    }).click();
    const delivered=page.getByText('已冻结 CodeSnapshot',{exact:false});
    await delivered.waitFor({timeout:15_000});
    await delivered.scrollIntoViewIfNeeded();
    await page.screenshot({path:join(root,'output','playwright',
      `${tag}-strict-developer-handoff-1440x900.png`)});
    console.log(JSON.stringify({stage:'strict-developer-succeeded',developmentRunId,
      snapshotId:handoff.snapshot.snapshotId,
      screenshot:join(root,'output','playwright',
        `${tag}-strict-developer-handoff-1440x900.png`)}));
  }
  await closeInstalled();
  page=await launch();
  const restored=await invoke(page,'run','run.planGet',{
    projectId:project.projectId,taskId:task.id,runId:run.runId,
  });
  assert.equal(restored.artifact.contentHash,gate.artifact.contentHash);
  if (approve) assert.equal(restored.developmentRunId,developmentRunId);
  assert.equal(command('git',['-C',source,'status','--porcelain']),'');
  assert.equal(command('git',['-C',source,'rev-parse','HEAD']),baseline);
  console.log(JSON.stringify({stage:'installed-strict-plan-readback',qaRoot:dataRoot,
    projectId:project.projectId,taskId:task.id,runId:run.runId,
    artifactId:gate.artifact.artifactId,workflowId:frozen.workflow.id,
    sourceCount:inspection.contextSources.length,developmentRunId,
    developmentState,developmentBudgetFailure,sourceClean:true,
    screenshot:join(root,'output','playwright',
      `${tag}-strict-installed-plan-1440x900.png`)}));
} finally {
  await closeInstalled();
  if (attached) command('hdiutil',['detach',mount]);
  rmSync(installRoot,{recursive:true,force:true});
}
