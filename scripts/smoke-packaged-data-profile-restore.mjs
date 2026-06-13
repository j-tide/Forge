/** Isolated installed-app backup -> restored profile -> renewed trust -> original profile. */
/* global window */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync,
  rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const dmg = process.env.FORGE_PROFILE_RESTORE_DMG;
const evidenceTag = process.env.FORGE_PROFILE_RESTORE_TAG || 'desktop-profile-restore-20260926';
if (process.platform !== 'darwin' || process.arch !== 'arm64' || !dmg || !existsSync(dmg)) {
  throw new Error('Require an explicit internal macOS arm64 DMG');
}
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(evidenceTag)) {
  throw new Error('Evidence tag must be a bounded local build identifier');
}
const qaRoot = mkdtempSync(join(root, 'output', 'qa', 'desktop-profile-restore-'));
const appData = join(qaRoot, 'isolated-app-data');
const source = join(qaRoot, 'Forge 恢复测试项目');
const backup = join(qaRoot, 'exported-forge.sqlite');
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(source); mkdirSync(mount);

function command(executable, argv, cwd = root) {
  return execFileSync(executable, argv, { cwd, encoding:'utf8', timeout:30_000 }).trim();
}
command('git', ['init', '-b', 'main'], source);
command('git', ['config', 'user.name', 'Forge fixture'], source);
command('git', ['config', 'user.email', 'forge@example.invalid'], source);
writeFileSync(join(source, 'package.json'), '{"name":"restore-fixture","type":"module"}\n');
command('git', ['add', '.'], source);
command('git', ['commit', '-m', 'Disposable restore fixture'], source);
const sourceHead = command('git', ['rev-parse', 'HEAD'], source);
let attached = false;
let app;
let page;
let restoredId;

async function launch() {
  app = await electron.launch({
    executablePath:join(installed, 'Contents', 'MacOS', 'Forge'), args:[],
    env:{...process.env, FORGE_DEV_SERVER_URL:'', FORGE_INTERNAL_TEST_HOME:appData,
      FORGE_MODEL_PROVIDER:'disabled'},
  });
  page = await app.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button', {name:'Host connected'}).waitFor({timeout:20_000});
}

async function project(type, payload) {
  const response = await page.evaluate(async ({type,payload}) => window.forge.invokeProject({
    schemaVersion:'1.0', commandId:crypto.randomUUID(), type,
    createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5', payload,
  }), {type,payload});
  assert.equal(response.ok,true,`${type}: ${JSON.stringify(response)}`);
  return response.data;
}

async function invoke(group, type, payload) {
  const response = await page.evaluate(async ({group,type,payload}) => {
    const command = {schemaVersion:'1.0',commandId:crypto.randomUUID(),type,
      createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',payload};
    switch (group) {
      case 'conversation': return window.forge.invokeConversation(command);
      case 'draft': return window.forge.invokeDraft(command);
      case 'approval': return window.forge.invokeApproval(command);
      case 'board': return window.forge.invokeBoard(command);
      case 'run': return window.forge.invokeRun(command);
      default: throw new Error('Unknown fixed Host command group');
    }
  }, {group,type,payload});
  return response;
}

async function approvedFixtureTask(projectId) {
  const created = await invoke('conversation','conversation.create',{
    projectId,title:'Restore QA task history',expectedRevision:0,
  });
  assert.equal(created.ok,true,JSON.stringify(created));
  const sent = await invoke('conversation','conversation.send',{
    projectId,conversationId:created.data.conversationId,
    idempotencyKey:crypto.randomUUID(),text:'Prepare a disposable Restore QA task.',
    attachmentIds:[],
  });
  assert.equal(sent.ok,true,JSON.stringify(sent));
  const draft = await invoke('draft','draft.manual',{
    projectId,conversationId:created.data.conversationId,
    sourceMessageId:sent.data.message.messageId,idempotencyKey:crypto.randomUUID(),
  });
  assert.equal(draft.ok,true,JSON.stringify(draft));
  const decisionId=crypto.randomUUID();
  const contract={schemaVersion:'1.0',taskId:draft.data.draftId,projectId,revision:2,
    title:'Restore history fixture',type:'feature',
    goal:'Keep this disposable TODO in the restored data history; do not start it.',
    acceptance:[{id:'AC-01',statement:'The TODO remains visible after restore',
      method:'manual',required:true,sourceRefs:[`decision:${decisionId}`]}],
    constraints:[],scope:['math.js'],outOfScope:[],dependencies:[],
    openQuestions:[],assumptions:[],
    sourceRefs:[`message:${sent.data.message.messageId}`,`decision:${decisionId}`],
    workflowRef:'standard@1',priority:'normal'};
  const revised=await invoke('draft','draft.revise',{
    projectId,draftId:draft.data.draftId,expectedRevision:1,contract,decisionId,
    decisionSummary:'Disposable history fixture',resolvedQuestions:[],
    removedAcceptanceIds:[],confirmScopeChange:true,
  });
  assert.equal(revised.ok,true,JSON.stringify(revised));
  const requested=await invoke('approval','approval.request',{
    projectId,draftId:draft.data.draftId,expectedRevision:2,
  });
  assert.equal(requested.ok,true,JSON.stringify(requested));
  const decided=await invoke('approval','approval.decide',{
    projectId,decision:{schemaVersion:'1.0',approvalId:requested.data.request.approvalId,
      decision:'approve',expectedRevision:2,scopeHash:requested.data.request.scopeHash,
      reason:'Disposable QA task only; no execution authorized'},
  });
  assert.equal(decided.ok,true,JSON.stringify(decided));
  assert.equal(decided.data.taskState,'todo');
  return draft.data.draftId;
}

async function profile() {
  return page.evaluate(() => window.forge.databaseProfileStatus());
}

async function waitProfile(id) {
  for (let index=0; index<100; index+=1) {
    const status = await profile().catch(() => null);
    if (status?.profileId === id) return status;
    await new Promise((resolve) => setTimeout(resolve,200));
  }
  throw new Error(`Data profile did not switch to ${id ?? 'original'}`);
}

async function chooseAndTrust() {
  await app.evaluate(({dialog}, path) => { dialog.showOpenDialog = async () => ({
    canceled:false, filePaths:[path],
  }); }, source);
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByRole('button',{name:/Choose folder|重新选择并探测/}).first().click();
  await page.getByRole('button',{name:'继续查看信任范围'}).waitFor();
  await page.getByRole('button',{name:'继续查看信任范围'}).click();
  await page.getByRole('heading',{name:'Trust this project?'}).waitFor();
  await page.getByRole('button',{name:'Trust this project'}).click();
  await page.getByText('PROJECT CONNECTED').waitFor({timeout:15_000});
}

const screenshot = (name) => join(root,'output','playwright',
  `${evidenceTag}-${name}-1440x900.png`);
const checkRunBudget = process.env.FORGE_PROFILE_RESTORE_CHECK_BUDGET === '1';
const checkUncertainJournal = process.env.FORGE_PROFILE_RESTORE_CHECK_JOURNAL === '1';
try {
  command('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
  attached = true;
  command('ditto',[join(mount,'Forge INTERNAL.app'),installed]);
  command('codesign',['--verify','--deep','--strict',installed]);
  command('hdiutil',['detach',mount]); attached = false;
  await launch();
  await chooseAndTrust();
  const original = (await project('project.list',{}))[0];
  assert.ok(original?.trusted);
  const savedPath=page.locator('.saved-project p[title]').first();
  assert.equal(await savedPath.getAttribute('title'),source,
    'A truncated Unicode project path must retain its full value');
  const removeTrigger=page.getByRole('button',{name:'Remove from Forge'}).first();
  await removeTrigger.click();
  const removeDialog=page.getByRole('dialog',{name:/Remove/});
  await removeDialog.waitFor();
  const dialogButtons=removeDialog.getByRole('button');
  assert.ok(await dialogButtons.count()>=2);
  await dialogButtons.first().focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialogButtons.last().evaluate((button)=>button===globalThis.document.activeElement),
    true,'Shift+Tab must wrap inside the modal');
  await page.keyboard.press('Tab');
  assert.equal(await dialogButtons.first().evaluate((button)=>button===globalThis.document.activeElement),
    true,'Tab must stay inside the modal');
  await page.keyboard.press('Escape');
  await removeDialog.waitFor({state:'hidden'});
  assert.equal(await removeTrigger.evaluate((button)=>button===globalThis.document.activeElement),true,
    'Closing the modal must restore focus to its trigger');
  const taskId=await approvedFixtureTask(original.projectId);
  const originalBoard=await invoke('board','board.snapshot',{projectId:original.projectId});
  assert.equal(originalBoard.ok,true,JSON.stringify(originalBoard));
  assert.equal(originalBoard.data.tasks.find((item)=>item.id===taskId)?.state,'todo');
  assert.equal(originalBoard.data.tasks.find((item)=>item.id===taskId)?.latestRunId??null,null);
  if (checkRunBudget) {
    await page.getByRole('button',{name:'工作台',exact:true}).click();
    await page.locator('.board-task').filter({hasText:'Restore history fixture'}).click();
    const choice=page.getByLabel('本次总 Token 观测上限');
    await choice.waitFor({timeout:20_000});
    assert.equal(await choice.inputValue(),'50000');
    await choice.selectOption('200000');
    assert.equal(await choice.inputValue(),'200000');
    await choice.scrollIntoViewIfNeeded();
    await page.screenshot({path:screenshot('explicit-run-budget')});
    assert.equal((await invoke('run','run.list',{
      projectId:original.projectId,taskId,
    })).data.length,0,'Choosing a budget must not start a Run');
    await page.keyboard.press('Escape');
    await page.locator('.forge-overlay--drawer').waitFor({state:'hidden'});
  }
  assert.equal((await profile()).profileId,null);
  await page.getByRole('button',{name:'设置'}).click();
  await app.evaluate(({dialog}, path) => {
    dialog.showSaveDialog = async () => ({canceled:false,filePath:path});
    dialog.showMessageBox = async () => ({response:1});
  },backup);
  await page.getByRole('button',{name:'选择位置并导出数据库备份'}).click();
  await page.getByText('数据库备份已导出', {exact:false}).waitFor({timeout:20_000});
  assert.ok(existsSync(backup));
  const backupHash = createHash('sha256').update(readFileSync(backup)).digest('hex');
  await app.evaluate(({dialog}, path) => { dialog.showOpenDialog = async () => ({
    canceled:false,filePaths:[path],
  }); },backup);
  await page.getByRole('button',{name:'选择备份并恢复到独立数据集'}).click();
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:30_000});
  for (let index=0; index<100; index+=1) {
    const status = await profile().catch(() => null);
    if (status?.profileId) { restoredId=status.profileId; break; }
    await new Promise((resolve) => setTimeout(resolve,200));
  }
  assert.ok(restoredId, 'Main did not switch to the staged restored profile');
  const imported = (await project('project.list',{}))[0];
  assert.equal(imported.projectId,original.projectId);
  assert.equal(imported.trusted,false);
  assert.equal(imported.trustVersion,'project-trust/restored-pending');
  const restoredBoard=await invoke('board','board.snapshot',{projectId:original.projectId});
  assert.equal(restoredBoard.ok,true,JSON.stringify(restoredBoard));
  assert.equal(restoredBoard.data.tasks.find((item)=>item.id===taskId)?.state,'todo');
  await page.getByRole('button',{name:'工作台',exact:true}).click();
  await page.getByRole('heading',{name:'Restore history fixture'}).waitFor();
  await page.screenshot({path:screenshot('restored-todo')});
  const blocked=await invoke('run','run.start',{
    projectId:original.projectId,taskId,expectedTaskRevision:2,
    modelId:'gpt-6-sol',idempotencyKey:crypto.randomUUID(),
  });
  assert.equal(blocked.ok,false,JSON.stringify(blocked));
  assert.match(JSON.stringify(blocked),/PROJECT_TRUST_REQUIRED/);
  await page.getByRole('button',{name:'项目',exact:true}).click();
  await page.getByText('需重新信任').first().waitFor();
  await page.screenshot({path:screenshot('needs-trust')});
  await app.close(); app=undefined;

  await launch();
  await waitProfile(restoredId);
  assert.equal((await project('project.list',{}))[0].trusted,false,
    'Imported project trust must remain revoked after Desktop restart');
  const restartedBoard=await invoke('board','board.snapshot',{projectId:original.projectId});
  assert.equal(restartedBoard.ok,true,JSON.stringify(restartedBoard));
  assert.equal(restartedBoard.data.tasks.find((item)=>item.id===taskId)?.state,'todo');
  await chooseAndTrust();
  const renewed=(await project('project.list',{}))[0];
  assert.equal(renewed.projectId,original.projectId);
  assert.equal(renewed.trusted,true);
  await page.screenshot({path:screenshot('renewed-trust')});
  await page.getByRole('button',{name:'设置'}).click();
  await app.evaluate(({dialog}) => { dialog.showMessageBox = async () => ({response:1}); });
  await page.getByRole('button',{name:'返回原数据集'}).click();
  await waitProfile(null);
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:20_000});
  const originalAgain=(await project('project.list',{}))[0];
  assert.equal(originalAgain.projectId,original.projectId);
  assert.equal(originalAgain.trusted,true);
  const returnedBoard=await invoke('board','board.snapshot',{projectId:original.projectId});
  assert.equal(returnedBoard.ok,true,JSON.stringify(returnedBoard));
  assert.equal(returnedBoard.data.tasks.find((item)=>item.id===taskId)?.state,'todo');
  assert.equal(createHash('sha256').update(readFileSync(backup)).digest('hex'),backupHash);
  assert.ok(existsSync(join(appData,'Forge','restored',restoredId,'forge.sqlite')));
  assert.equal(command('git',['rev-parse','HEAD'],source),sourceHead);
  assert.equal(command('git',['status','--porcelain'],source),'');
  await page.getByRole('button',{name:'设置'}).click();
  await page.locator('[data-testid="database-backup"]').scrollIntoViewIfNeeded();
  await page.locator('.app-shell').evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await page.screenshot({path:screenshot('original-returned')});
  if (checkUncertainJournal) {
    const journal = join(appData,'Forge','production','process-records');
    const damaged = join(journal,'damaged.json');
    const beforeHost = await page.evaluate(() => window.forge.hostHealth());
    mkdirSync(journal,{recursive:true});
    writeFileSync(damaged,'{');
    try {
      await app.evaluate(({dialog},path) => {
        dialog.showOpenDialog = async () => ({canceled:false,filePaths:[path]});
        dialog.showMessageBox = async () => ({response:1});
      },backup);
      await page.getByRole('button',{name:'选择备份并恢复到独立数据集'}).click();
      await page.getByText('当前数据集仍有中断的开发、审查或验证记录',{
        exact:false,
      }).waitFor({timeout:20_000});
      assert.equal((await profile()).profileId,null);
      assert.equal((await page.evaluate(() => window.forge.hostHealth())).data.pid,
        beforeHost.data.pid);
      assert.equal(createHash('sha256').update(readFileSync(backup)).digest('hex'),backupHash);
      assert.equal((await project('project.list',{}))[0].projectId,original.projectId);
      await page.screenshot({path:screenshot('journal-restore-refused')});
    } finally { rmSync(damaged,{force:true}); }
  }
  console.log(JSON.stringify({stage:'packaged-profile-restore',dmg,qaRoot,
    restoredId,projectId:original.projectId,taskId,backupHash,
    trustReconfirmed:true,originalPreserved:true,sourceClean:true,
    uncertainJournalRefused:checkUncertainJournal,
    screenshots:[...(checkRunBudget?['explicit-run-budget']:[]),
      'restored-todo','needs-trust','renewed-trust','original-returned',
      ...(checkUncertainJournal?['journal-restore-refused']:[])].map(screenshot)}));
} finally {
  await app?.close();
  if (attached) command('hdiutil',['detach',mount]);
  rmSync(installRoot,{recursive:true,force:true});
}
