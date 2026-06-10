import assert from 'node:assert/strict';
/* global window */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'forge-plugin-control-'));
const source = join(root, 'Forge 插件 fixture');
const dmg = process.env.FORGE_PLUGIN_PACKAGED_DMG;
let packagedApp = process.env.FORGE_PLUGIN_PACKAGED_APP;
const screenshotPrefix = process.env.FORGE_PLUGIN_SCREENSHOT_TAG ||
  (packagedApp || dmg ? 'desktop-plugin-gate-20260926' : 'p4-plugin-control');
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(screenshotPrefix)) {
  throw new Error('Invalid plugin control screenshot tag');
}
const output = resolve('output/playwright');
mkdirSync(output, { recursive: true });
let app;
let installRoot;
let mounted=false;
let mount;

async function invoke(page, group, type, payload) {
  const response = await page.evaluate(async ({ group, type, payload }) => {
    const command = { schemaVersion:'1.0', commandId:crypto.randomUUID(), type,
      createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5', payload };
    const bridge = window.forge;
    return group === 'project' ? bridge.invokeProject(command) :
      group === 'conversation' ? bridge.invokeConversation(command) :
      group === 'draft' ? bridge.invokeDraft(command) :
      group === 'approval' ? bridge.invokeApproval(command) :
      group === 'board' ? bridge.invokeBoard(command) : bridge.invokeRun(command);
  }, { group, type, payload });
  assert.equal(response.ok, true, `${type}: ${JSON.stringify(response)}`);
  return response.data;
}

async function launch() {
  app = await electron.launch({ executablePath: packagedApp ?
    join(packagedApp, 'Contents', 'MacOS', 'Forge') : requireDesktop('electron'),
    args: packagedApp ? [] : [desktopDirectory], env: { ...process.env, FORGE_DEV_SERVER_URL: '',
      ...(packagedApp ? { FORGE_INTERNAL_TEST_HOME: join(root, 'data') } :
        { FORGE_HOST_DATA_DIR: join(root, 'data') }), FORGE_MODEL_PROVIDER: 'disabled' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '插件', exact:true }).click();
  await page.getByRole('heading', { name: '插件' }).waitFor();
  return page;
}

try {
  if (dmg) {
    assert.equal(process.platform,'darwin');
    assert.equal(process.arch,'arm64');
    assert.equal(packagedApp,undefined,'Choose a DMG or an app, not both');
    installRoot=mkdtempSync(join(resolve('build/macos'),'qa-install-'));
    mount=join(installRoot,'mounted');
    mkdirSync(mount);
    execFileSync('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg]);
    mounted=true;
    packagedApp=join(installRoot,'Forge INTERNAL.app');
    execFileSync('ditto',[join(mount,'Forge INTERNAL.app'),packagedApp]);
    execFileSync('codesign',['--verify','--deep','--strict',packagedApp]);
    execFileSync('hdiutil',['detach',mount]);
    mounted=false;
  }
  let page = await launch();
  await page.locator('.plugins-view .forge-status-tag').filter({ hasText: '已装配' }).waitFor();
  mkdirSync(source);
  const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
  git('init','-b','main');
  git('config','user.name','Forge fixture');
  git('config','user.email','forge-fixture@example.invalid');
  writeFileSync(join(source,'math.js'),'export const add = (a, b) => a + b;\n');
  writeFileSync(join(source,'package.json'),'{"type":"module"}\n');
  git('add','.'); git('commit','-m','Disposable fixture');
  const head=git('rev-parse','HEAD');
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({
    canceled:false,filePaths:[path],
  });},source);
  assert.equal(await page.evaluate(()=>window.forge.chooseProjectFolder()),source);
  const probe=await invoke(page,'project','project.probe',{rootPath:source});
  const project=await invoke(page,'project','project.create',{rootPath:source,
    fingerprint:probe.fingerprint,trustVersion:'project-trust/v1',approved:true,
    expectedRevision:0});
  const conversation=await invoke(page,'conversation','conversation.create',{
    projectId:project.projectId,title:'Plugin disable fixture',expectedRevision:0});
  const sent=await invoke(page,'conversation','conversation.send',{
    projectId:project.projectId,conversationId:conversation.conversationId,
    idempotencyKey:crypto.randomUUID(),text:'Validate add inputs.',attachmentIds:[]});
  const draft=await invoke(page,'draft','draft.manual',{
    projectId:project.projectId,conversationId:conversation.conversationId,
    sourceMessageId:sent.message.messageId,idempotencyKey:crypto.randomUUID()});
  const decisionId=crypto.randomUUID();
  await invoke(page,'draft','draft.revise',{projectId:project.projectId,
    draftId:draft.draftId,expectedRevision:1,decisionId,
    decisionSummary:'Disposable fixture scope approved',resolvedQuestions:[],
    removedAcceptanceIds:[],confirmScopeChange:true,
    contract:{schemaVersion:'1.0',taskId:draft.draftId,projectId:project.projectId,
      revision:2,title:'Plugin gate fixture',type:'feature',
      goal:'Validate add inputs in this disposable fixture.',
      acceptance:[{id:'AC-01',statement:'Invalid inputs rejected',method:'automated',
        required:true,sourceRefs:[`decision:${decisionId}`]}],
      constraints:[],scope:['math.js'],outOfScope:[],dependencies:[],
      openQuestions:[],assumptions:[],
      sourceRefs:[`message:${sent.message.messageId}`,`decision:${decisionId}`],
      workflowRef:'standard@1',priority:'normal'}});
  const pending=await invoke(page,'approval','approval.request',{
    projectId:project.projectId,draftId:draft.draftId,expectedRevision:2});
  const approval=await invoke(page,'approval','approval.decide',{
    projectId:project.projectId,decision:{schemaVersion:'1.0',
      approvalId:pending.request.approvalId,decision:'approve',expectedRevision:2,
      scopeHash:pending.request.scopeHash,reason:'Fixture owner confirmed'}});
  assert.equal(approval.taskState,'todo');
  assert.equal((await invoke(page,'board','board.snapshot',{
    projectId:project.projectId})).tasks[0].latestRunId ?? null,null);
  await page.screenshot({ path: join(output, `${screenshotPrefix}-active-1440x900.png`) });
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1 }); });
  await page.getByRole('button', { name: '停用 Codex 插件' }).click();
  await page.locator('.plugins-view .forge-status-tag').filter({ hasText: '已停用' }).waitFor();
  const disabled = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.active, false);
  const unavailable=await invoke(page,'run','run.capabilities',{
    projectId:project.projectId,taskId:draft.draftId});
  assert.equal(unavailable.available,false);
  assert.ok(unavailable.warnings.includes('RUN_PLUGIN_UNAVAILABLE'));
  const blocked=await page.evaluate(({projectId,taskId})=>window.forge.invokeRun({
    schemaVersion:'1.0',commandId:crypto.randomUUID(),type:'run.start',
    createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',
    payload:{projectId,taskId,expectedTaskRevision:2,modelId:'gpt-6-sol',
      idempotencyKey:crypto.randomUUID()},
  }),{projectId:project.projectId,taskId:draft.draftId});
  assert.equal(blocked.ok,false);
  assert.equal(blocked.error.code,'RUN_PLUGIN_UNAVAILABLE');
  const unchanged=await invoke(page,'board','board.snapshot',{projectId:project.projectId});
  assert.equal(unchanged.tasks[0].state,'todo');
  assert.equal(unchanged.tasks[0].latestRunId ?? null,null);
  const rejected = await page.evaluate(async () => {
    try { await window.forge.setBundledPluginEnabled('false'); return false; }
    catch { return true; }
  });
  assert.equal(rejected, true);
  await page.screenshot({ path: join(output, `${screenshotPrefix}-disabled-1440x900.png`) });
  await page.reload();
  await page.getByRole('button',{name:'Host connected'}).waitFor();
  await page.getByRole('button',{name:'研发看板'}).click();
  await page.locator('.board-task').filter({hasText:'Plugin gate fixture'}).click();
  const blockedNotice=page.getByText('Codex 插件已停用；请在「插件」中启用并重启 Forge',{
    exact:false});
  await blockedNotice.waitFor();
  await blockedNotice.scrollIntoViewIfNeeded();
  await page.screenshot({path:join(output,`${screenshotPrefix}-run-blocked-1440x900.png`)});
  await app.close(); app = undefined;

  page = await launch();
  await page.locator('.plugins-view .forge-status-tag').filter({ hasText: '已停用' }).waitFor();
  const afterRestart=await page.evaluate(({projectId,taskId})=>window.forge.invokeRun({
    schemaVersion:'1.0',commandId:crypto.randomUUID(),type:'run.capabilities',
    createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',
    payload:{projectId,taskId},
  }),{projectId:project.projectId,taskId:draft.draftId});
  assert.equal(afterRestart.ok,false);
  assert.equal(afterRestart.error.code,'RUN_PLUGIN_UNAVAILABLE');
  await page.getByRole('button', { name: '启用并在重启后生效' }).click();
  await page.getByText('启用偏好已保存。', { exact: false }).waitFor();
  const pendingEnable = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(pendingEnable.restartRequired, true);
  assert.equal(pendingEnable.active, false);
  await app.close(); app = undefined;

  page = await launch();
  await page.locator('.plugins-view .forge-status-tag').filter({ hasText: '已装配' }).waitFor();
  const restored = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(restored.enabled, true);
  assert.equal(restored.active, true);
  assert.equal(restored.restartRequired, false);
  const board=await invoke(page,'board','board.snapshot',{projectId:project.projectId});
  assert.equal(board.tasks[0].state,'todo');
  assert.equal(board.tasks[0].latestRunId ?? null,null);
  assert.equal(git('rev-parse','HEAD'),head);
  assert.equal(git('status','--porcelain'),'');
  console.log(JSON.stringify({ stage: 'plugin-control', disabledPersisted: true,
    enabledAfterRestart: true, arbitraryValueRejected: true,
    disabledRunError:blocked.error.code, todoWithoutRun:true, sourceClean:true,
    packaged: Boolean(packagedApp),
    screenshots: [`${screenshotPrefix}-active-1440x900.png`,
      `${screenshotPrefix}-disabled-1440x900.png`,
      `${screenshotPrefix}-run-blocked-1440x900.png`] }));
} finally {
  if (app) await app.close();
  if (mounted) execFileSync('hdiutil',['detach',mount]);
  if (installRoot) rmSync(installRoot,{recursive:true,force:true});
  rmSync(root, { recursive: true, force: true });
}
