/** Installed-app QA: UI-published Workflow/Profile v2 affects only a new real Codex Run. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';
/* global window */

const repositoryRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const qaRoot = realpathSync(join(repositoryRoot, 'output', 'qa'));
const dmg = process.env.FORGE_WORKFLOW_UPGRADE_DMG;
const dataArg = process.env.FORGE_WORKFLOW_UPGRADE_DATA;
const oldRunId = process.env.FORGE_WORKFLOW_UPGRADE_OLD_RUN_ID;
const modelId = process.env.FORGE_WORKFLOW_UPGRADE_MODEL ?? 'gpt-6-sol';
const tag = process.env.FORGE_WORKFLOW_UPGRADE_TAG ?? 'desktop-workflow-upgrade-20260926';
if (process.platform !== 'darwin' || process.arch !== 'arm64' ||
    !dmg || !dataArg || !oldRunId || !/^[0-9a-f-]{36}$/.test(oldRunId) ||
    !/^[a-z0-9][a-z0-9-]{0,39}$/.test(tag)) {
  throw new Error('Require arm64 Mac, DMG, retained isolated QA data and old Run ID');
}
const dataRoot = realpathSync(dataArg);
if (!dataRoot.startsWith(qaRoot + sep) ||
    !existsSync(join(dataRoot,'Forge','production','forge.sqlite'))) {
  throw new Error('Only an existing Forge output/qa database may be used');
}
const source = join(dirname(dataRoot),'Forge fixture 空格');
const sourceHead = execFileSync('git',['-C',source,'rev-parse','HEAD'],
  {encoding:'utf8'}).trim();
const installRoot = mkdtempSync(join(repositoryRoot,'build','macos','qa-install-'));
const mount = join(installRoot,'mounted');
const installed = join(installRoot,'Forge INTERNAL.app');
mkdirSync(mount);
let attached = false;
let app;
function command(executable,argv) {
  execFileSync(executable,argv,{stdio:'pipe',timeout:30_000});
}
async function invoke(page,group,type,payload) {
  const response = await page.evaluate(async ({group,type,payload}) => {
    const envelope={schemaVersion:'1.0',commandId:crypto.randomUUID(),type,
      createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',payload};
    return group==='project' ? window.forge.invokeProject(envelope) :
      group==='conversation' ? window.forge.invokeConversation(envelope) :
      group==='draft' ? window.forge.invokeDraft(envelope) :
      group==='approval' ? window.forge.invokeApproval(envelope) :
      group==='board' ? window.forge.invokeBoard(envelope) : window.forge.invokeRun(envelope);
  },{group,type,payload});
  assert.equal(response.ok,true,type+': '+JSON.stringify(response));
  return response.data;
}
function screenshotPath(suffix) {
  return join(repositoryRoot,'output','playwright',tag+'-'+suffix+'-1440x900.png');
}
try {
  command('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
  attached=true;
  command('ditto',[join(mount,'Forge INTERNAL.app'),installed]);
  command('codesign',['--verify','--deep','--strict',installed]);
  command('hdiutil',['detach',mount]);
  attached=false;
  const launch=()=>electron.launch({
    executablePath:join(installed,'Contents','MacOS','Forge'),args:[],
    env:{...process.env,FORGE_DEV_SERVER_URL:'',FORGE_INTERNAL_TEST_HOME:dataRoot},
  });
  app=await launch();
  let page=await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  const projects=await invoke(page,'project','project.list',{});
  assert.equal(projects.length,1);
  const projectId=projects[0].projectId;
  const original=await invoke(page,'run','run.config',{projectId,runId:oldRunId});
  assert.equal(original.workflow.id,'workflow.fixture.quick');
  assert.equal(original.workflow.version,'1');
  assert.equal(original.developerProfile.id,'profile.fixture.workflow.developer');
  assert.equal(original.developerProfile.version,'1');
  const beforeWorkflow=await page.evaluate(() => window.forge.invokeWorkflow({
    type:'getPublished',payload:{workflowId:'workflow.fixture.quick',revision:1},
  }));
  assert.equal(beforeWorkflow.revision,1);

  await page.getByRole('button',{name:'Agents'}).click();
  const developerRow=page.locator('.agent-row')
    .filter({hasText:'Fixture Workflow Developer'});
  await developerRow.getByRole('button',{name:'编辑'}).click();
  await page.getByLabel('角色职责与提示词').fill(
    'Develop in the isolated fixture workspace. For subtract(a,b), test subtract(10,4)=6 and run node test.js.');
  await page.getByRole('button',{name:'保存新版本'}).click();
  await page.getByText('Profile 版本已保存',{exact:false}).waitFor({timeout:15_000});
  const catalog=await page.evaluate(() => window.forge.agentProfileCatalog());
  const developer=catalog.profiles.find((item)=>
    item.id==='profile.fixture.workflow.developer');
  assert.equal(developer?.revision,2);
  assert.equal(developer.modelId,modelId);

  await page.getByRole('button',{name:'工作流'}).click();
  await page.getByLabel('已保存草稿').selectOption('workflow.fixture.quick');
  await page.getByLabel('步骤 1 名称').fill('Develop arithmetic v2');
  await page.getByRole('button',{name:'保存草稿'}).click();
  await page.getByText('草稿已保存。',{exact:false}).waitFor({timeout:15_000});
  await page.getByRole('button',{name:'发布当前草稿'}).click();
  await page.getByText('版本已发布；',{exact:false}).waitFor({timeout:15_000});
  const diff=page.locator('section[aria-label="已发布版本差异"]');
  await diff.getByText('比较 v1 与当前已发布 v2',{exact:false}).waitFor();
  await diff.getByText('Develop arithmetic v2',{exact:false}).waitFor();
  const impact=await page.evaluate(() => window.forge.invokeWorkflow({
    type:'impact',payload:{workflowId:'workflow.fixture.quick'},
  }));
  assert.deepEqual(impact.publishedRevisions,[1,2]);
  assert.ok(impact.frozenRunCounts['1']>=2);
  const currentWorkflow=await page.evaluate(() => window.forge.invokeWorkflow({
    type:'getPublished',payload:{workflowId:'workflow.fixture.quick',revision:2},
  }));
  assert.equal(currentWorkflow.definition.nodes[0].label,'Develop arithmetic v2');
  assert.notEqual(currentWorkflow.contentHash,beforeWorkflow.contentHash);
  await diff.scrollIntoViewIfNeeded();
  await page.screenshot({path:screenshotPath('published-diff')});
  const stillFrozen=await invoke(page,'run','run.config',{projectId,runId:oldRunId});
  assert.deepEqual(stillFrozen.workflow,original.workflow);
  assert.deepEqual(stillFrozen.developerProfile,original.developerProfile);

  const conversation=await invoke(page,'conversation','conversation.create',{
    projectId,title:'Workflow v2 installed-app QA',expectedRevision:0,
  });
  const sent=await invoke(page,'conversation','conversation.send',{
    projectId,conversationId:conversation.conversationId,
    idempotencyKey:crypto.randomUUID(),
    text:'Add subtract(a,b) to the disposable fixture and test it.',attachmentIds:[],
  });
  const draft=await invoke(page,'draft','draft.manual',{
    projectId,conversationId:conversation.conversationId,
    sourceMessageId:sent.message.messageId,idempotencyKey:crypto.randomUUID(),
  });
  const decisionId=crypto.randomUUID();
  const decisionRef='decision:'+decisionId;
  const contract={schemaVersion:'1.0',taskId:draft.draftId,projectId,revision:2,
    title:'Add subtract',type:'feature',
    goal:'In the isolated fixture, add subtract(a,b) to math.js and assertions in test.js, including subtract(10,4)=6. Run node test.js. Do not change package.json.',
    acceptance:[{id:'AC-01',statement:'Subtract is implemented and tested',
      method:'automated',required:true,sourceRefs:[decisionRef]}],
    constraints:[],scope:['math.js','test.js'],outOfScope:[],dependencies:[],
    openQuestions:[],assumptions:[],
    sourceRefs:['message:'+sent.message.messageId,decisionRef],
    workflowRef:'workflow.fixture.quick',priority:'normal'};
  await invoke(page,'draft','draft.revise',{
    projectId,draftId:draft.draftId,expectedRevision:1,contract,decisionId,
    decisionSummary:'Fixture scope reviewed',resolvedQuestions:[],
    removedAcceptanceIds:[],confirmScopeChange:true,
  });
  const requested=await invoke(page,'approval','approval.request',{
    projectId,draftId:draft.draftId,expectedRevision:2,
  });
  const approved=await invoke(page,'approval','approval.decide',{
    projectId,decision:{schemaVersion:'1.0',approvalId:requested.request.approvalId,
      decision:'approve',expectedRevision:2,scopeHash:requested.request.scopeHash,
      reason:'Approved for isolated Workflow v2 fixture'},
  });
  assert.equal(approved.taskState,'todo');
  const beforeStart=await invoke(page,'board','board.snapshot',{projectId});
  assert.equal(beforeStart.tasks.find((item)=>item.id===draft.draftId)?.state,'todo');
  assert.equal(beforeStart.tasks.find((item)=>item.id===draft.draftId)?.latestRunId??null,null);
  const runId=crypto.randomUUID();
  const started=await invoke(page,'run','run.start',{
    projectId,taskId:draft.draftId,expectedTaskRevision:2,modelId,idempotencyKey:runId,
  });
  assert.equal(started.runId,runId);
  let inspection;
  for(let attempt=0;attempt<240;attempt+=1){
    await delay(1000);
    inspection=await invoke(page,'run','run.inspect',{projectId,runId,afterCursor:0,limit:100});
    if(['succeeded','failed','cancelled','interrupted'].includes(inspection.run.state))break;
  }
  assert.equal(inspection?.run.state,'succeeded',JSON.stringify(inspection));
  let handoff;
  for(let attempt=0;attempt<75&&!handoff;attempt+=1){
    handoff=await invoke(page,'run','run.handoff',{projectId,runId});
    if(!handoff)await delay(200);
  }
  assert.ok(handoff?.snapshot&&!handoff.snapshot.noChange);
  const frozen=await invoke(page,'run','run.config',{projectId,runId});
  assert.equal(frozen.workflow.version,'2');
  assert.equal(frozen.workflow.contentHash,currentWorkflow.contentHash);
  assert.equal(frozen.developerProfile.id,developer.id);
  assert.equal(frozen.developerProfile.version,'2');
  assert.notEqual(frozen.developerProfile.contentHash,original.developerProfile.contentHash);
  const priorAfter=await invoke(page,'run','run.config',{projectId,runId:oldRunId});
  assert.deepEqual(priorAfter.workflow,original.workflow);
  assert.deepEqual(priorAfter.developerProfile,original.developerProfile);
  const workspace=join(dataRoot,'Forge','production','workspaces','trees',
    handoff.snapshot.workspaceId);
  const fixtureTest=execFileSync('node',['test.js'],{cwd:workspace,encoding:'utf8',timeout:20_000});
  assert.match(fixtureTest,/Forge fixture test completed/);
  assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],
    {encoding:'utf8'}).trim(),sourceHead);
  assert.equal(execFileSync('git',['-C',source,'status','--porcelain'],
    {encoding:'utf8'}).trim(),'');
  await page.getByRole('button',{name:'研发看板'}).click();
  await page.locator('.board-task').filter({hasText:'Add subtract'}).click();
  await page.getByText('已冻结 CodeSnapshot',{exact:false}).waitFor({timeout:15_000});
  await page.screenshot({path:screenshotPath('v2-run')});
  await app.close();
  app=await launch();
  page=await app.firstWindow();
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  const afterRestart=await invoke(page,'run','run.config',{projectId,runId});
  assert.equal(afterRestart.workflow.version,'2');
  assert.equal(afterRestart.developerProfile.version,'2');
  assert.deepEqual((await invoke(page,'run','run.config',{projectId,runId:oldRunId})).workflow,
    original.workflow);
  const board=await invoke(page,'board','board.snapshot',{projectId});
  assert.notEqual(board.tasks.find((item)=>item.id===draft.draftId)?.state,'done',
    'Development success alone must not mark the new Task Done');
  console.log(JSON.stringify({stage:'packaged-workflow-v2-live',
    projectId,oldRunId,oldWorkflowVersion:'1',oldProfileVersion:'1',
    newRunId:runId,newTaskId:draft.draftId,newSnapshotId:handoff.snapshot.snapshotId,
    newWorkflowVersion:frozen.workflow.version,newProfileVersion:frozen.developerProfile.version,
    newTaskState:board.tasks.find((item)=>item.id===draft.draftId)?.state,
    sourceClean:true,screenshots:[screenshotPath('published-diff'),screenshotPath('v2-run')]}));
} finally {
  await app?.close();
  if(attached)command('hdiutil',['detach',mount]);
  rmSync(installRoot,{recursive:true,force:true});
}
