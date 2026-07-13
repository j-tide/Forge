/** Opt-in installed-app Planner acceptance against a disposable Git repository. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync,
  rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';
/* global window */

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const dmg = process.env.FORGE_PLANNED_LIVE_DMG;
const preset = process.env.FORGE_PLANNED_LIVE_PRESET ?? 'strict';
const tag = process.env.FORGE_PLANNED_LIVE_TAG ?? 'desktop-planned-live';
const model = process.env.FORGE_PLANNED_LIVE_MODEL;
const maxTokens = process.env.FORGE_PLANNED_LIVE_MAX_TOKENS;
if (process.env.FORGE_PLANNED_LIVE !== '1' || process.platform !== 'darwin' ||
    process.arch !== 'arm64' || !dmg || !existsSync(dmg) ||
    !['standard', 'strict'].includes(preset) ||
    !model || !['50000','100000','200000'].includes(maxTokens) ||
    !/^[a-z0-9][a-z0-9-]{0,50}$/.test(tag)) {
  throw new Error('Requires live opt-in, explicit model/budget, macOS arm64, installed DMG, preset and safe tag');
}
const qaRoot = mkdtempSync(join(root, 'output', 'qa', `${tag}-`));
const source = join(qaRoot, 'Planner fixture 项目');
const appData = join(qaRoot, 'isolated-app-data');
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(source);
mkdirSync(mount);
mkdirSync(join(source, 'docs'));
function command(executable, args, cwd = root) {
  return execFileSync(executable, args, { cwd, encoding: 'utf8', timeout: 30_000 }).trim();
}
const git = (...args) => command('git', ['-C', source, ...args]);
git('init', '-b', 'main');
git('config', 'user.name', 'Forge fixture');
git('config', 'user.email', 'forge-fixture@example.invalid');
writeFileSync(join(source, 'math.js'), 'export function add(a, b) { return a + b; }\n');
writeFileSync(join(source, 'test.js'),
  "import { strict as assert } from 'node:assert';\nimport { add } from './math.js';\nassert.equal(add(2, 3), 5);\nconsole.log('fixture tests passed');\n");
writeFileSync(join(source, 'package.json'),
  '{"name":"forge-planner-fixture","type":"module","scripts":{"test":"node test.js"}}\n');
writeFileSync(join(source, 'docs', 'guide.md'),
  '# Numeric inputs\nThe add function must reject non-numeric inputs with TypeError. Keep valid sums unchanged.\n');
git('add', '.');
git('commit', '-m', 'Disposable baseline');
const baseline = git('rev-parse', 'HEAD');
let app;
let attached = false;
let activeRunId = null;
let activeDeveloperRunId = null;
let projectId = null;

async function invoke(page, group, type, payload) {
  const response = await page.evaluate(async ({ group, type, payload }) => {
    const envelope = { schemaVersion:'1.0', commandId:crypto.randomUUID(), type,
      createdAt:new Date().toISOString(), protocolVersion:'forge-host-protocol/v5', payload };
    const bridge = window.forge;
    return group === 'project' ? bridge.invokeProject(envelope) :
      group === 'conversation' ? bridge.invokeConversation(envelope) :
      group === 'draft' ? bridge.invokeDraft(envelope) :
      group === 'approval' ? bridge.invokeApproval(envelope) :
      group === 'board' ? bridge.invokeBoard(envelope) : bridge.invokeRun(envelope);
  }, { group, type, payload });
  assert.equal(response.ok, true, `${type}: ${JSON.stringify(response)}`);
  return response.data;
}
function screenshotPath(suffix) {
  return join(root, 'output', 'playwright', `${tag}-${preset}-${suffix}-1440x900.png`);
}
async function launch() {
  app = await electron.launch({
    executablePath: join(installed, 'Contents', 'MacOS', 'Forge'), args: [],
    env: { ...process.env, FORGE_DEV_SERVER_URL:'', FORGE_INTERNAL_TEST_HOME:appData,
      FORGE_MODEL_PROVIDER:'disabled' },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width:1440, height:900 });
  await page.getByRole('button', { name:'Host connected' }).waitFor({ timeout:20_000 });
  return page;
}
async function closeInstalled() {
  if (!app) return;
  await app.evaluate(({dialog}) => { dialog.showMessageBox = async (_window, options) => ({
    response: (options?.buttons ?? _window?.buttons)?.length === 3 ? 2 : 1,
  }); }).catch(() => undefined);
  await app.close();
  app = undefined;
}
try {
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  command('hdiutil', ['detach', mount]);
  attached = false;
  let page = await launch();
  const catalog = await page.evaluate(() => window.forge.agentProfileCatalog());
  const codex = catalog.executors.find((entry) => entry.executorId === 'executor.codex');
  assert.equal(codex?.available, true, 'Installed Codex CLI/auth/capability unavailable');
  assert.equal(codex.readOnlyEnforced, true, 'Planner requires enforced read-only');
  assert.equal(codex.structuredOutput, true);
  assert.ok(codex.modelIds.includes(model), 'The explicitly selected model is unavailable');
  const profileIds = {};
  for (const [role, policy, providers, prompt] of [
    ['planner', 'read-only', ['task-contract', 'project-context'],
      'Inspect the approved Task, docs/guide.md and baseline read-only. Return a concise structured plan without changing files.'],
    ['developer', 'workspace-write', ['task-contract', 'project-context'],
      'Implement the approved Task in this isolated fixture, follow the frozen Plan and run node test.js.'],
    ['reviewer', 'read-only', ['task-contract', 'snapshot-diff'],
      'Review the frozen snapshot independently without changing files.'],
  ]) {
    const profile = { schemaVersion:'1.0', id:`profile.qa.planned.${role}`,
      revision:1, name:`QA ${role}`, role, executorId:'executor.codex', modelId:model,
      promptTemplate:prompt, contextProviders:providers, policyProfile:policy,
      limits:{ maxTurns:5, maxSeconds:240, maxOutputTokens:12000 } };
    const saved = await page.evaluate((value) => window.forge.saveAgentProfile({
      profile:value, expectedRevision:0,
    }), profile);
    assert.equal(saved.role, role);
    profileIds[role] = saved.id;
  }
  await page.getByRole('button', { name:'工作流', exact:true }).click();
  await page.getByRole('button', { name:`从${preset === 'strict' ? '严格流程' : '标准流程'}新建` }).click();
  const nodes = page.locator('.workflow-node');
  const bindings = preset === 'strict' ? [
    [0, profileIds.planner], [2, profileIds.developer], [3, profileIds.reviewer],
  ] : [[0, profileIds.planner], [1, profileIds.developer], [2, profileIds.reviewer]];
  for (const [index, id] of bindings) {
    const details=nodes.nth(index).locator('details');
    if (!await details.evaluate((element)=>element.open)) await details.locator('summary').click();
    await details.getByLabel('角色配置').selectOption(id);
  }
  await page.getByRole('button', { name:'检查能力' }).click();
  await page.getByText('发布预检通过', { exact:false }).waitFor();
  await page.getByRole('button', { name:'保存草稿' }).click();
  await page.getByRole('button', { name:'发布版本' }).click();
  await page.getByText('版本已发布', { exact:false }).waitFor();
  const workflows = await page.evaluate(() => window.forge.invokeWorkflow({
    type:'list', payload:{},
  }));
  const published = workflows.find((entry) => entry.publishedRevision === 1 &&
    entry.draft.name === (preset === 'strict' ?
      '严格研发流程（计划后增加人工门禁）' : '标准研发流程'));
  assert.ok(published);
  assert.equal(published.draft.start, 'plan');
  console.log(JSON.stringify({stage:'planned-workflow-published',preset,
    workflowId:published.workflowId,model}));

  await page.getByRole('button', { name:'项目管理', exact:true }).click();
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({
    canceled:false, filePaths:[path],
  }); }, source);
  await page.getByRole('button', { name:'选择文件夹' }).click();
  await page.locator('.project-overview-facts').getByText('Git', { exact: true }).waitFor();
  await page.getByRole('button', { name:'继续' }).click();
  await page.getByRole('button', { name:'信任并打开' }).click();
  await page.getByText('已切换到', { exact: false }).waitFor();
  const projects = await invoke(page, 'project', 'project.list', {});
  assert.equal(projects.length, 1);
  projectId = projects[0].projectId;
  const probe = await invoke(page,'project','project.probe',{rootPath:source});
  const environment = await invoke(page,'project','environment.get',{
    projectId,environmentId:projects[0].environmentId,
  });
  const savedPreset = await invoke(page,'project','commandPreset.save',{
    projectId,environmentId:environment.environmentId,expectedRevision:0,
    name:'test',executable:process.execPath,argv:['test.js'],cwdRelative:'.',
    envRefs:[],timeoutSeconds:30,scriptsHash:probe.scriptsHash,
  });
  const approvedPreset = await invoke(page,'project','commandPreset.approve',{
    projectId,presetId:savedPreset.presetId,
    expectedRevision:savedPreset.revision,scriptsHash:probe.scriptsHash,
  });
  assert.equal(approvedPreset.approvalHash?.length,64);
  await invoke(page,'project','environment.save',{
    projectId,environmentId:environment.environmentId,
    expectedRevision:environment.revision,name:environment.name,
    config:{commandPresetIds:[approvedPreset.presetId],envRefs:[],
      networkMode:'trusted-local'},
  });
  const imported = await page.evaluate((id) => window.forge.invokeKnowledge({
    type:'import', payload:{projectId:id, relativePath:'docs/guide.md'},
  }), projectId);
  assert.equal(imported.status, 'active');
  const conversation = await invoke(page, 'conversation', 'conversation.create', {
    projectId, title:'Installed planned-run QA', expectedRevision:0,
  });
  const sent = await invoke(page, 'conversation', 'conversation.send', {
    projectId, conversationId:conversation.conversationId,
    idempotencyKey:crypto.randomUUID(),
    text:'Add numeric input validation to add(a,b).', attachmentIds:[],
  });
  const draft = await invoke(page, 'draft', 'draft.manual', {
    projectId, conversationId:conversation.conversationId,
    sourceMessageId:sent.message.messageId, idempotencyKey:crypto.randomUUID(),
  });
  const decisionId = crypto.randomUUID();
  const decisionRef = `decision:${decisionId}`;
  const contract = { schemaVersion:'1.0', taskId:draft.draftId, projectId,
    revision:2, title:`Installed ${preset} plan`, type:'feature',
    goal:'Make add(a,b) reject non-numeric values with TypeError, keep valid sums, add assertions to test.js and run node test.js.',
    acceptance:[{id:'AC-01',statement:'Invalid inputs throw TypeError and valid sums remain unchanged',
      method:'automated',required:true,sourceRefs:[decisionRef]}],
    constraints:[],scope:['math.js','test.js'],outOfScope:[],dependencies:[],
    openQuestions:[],assumptions:[],
    sourceRefs:[`message:${sent.message.messageId}`, decisionRef],
    workflowRef:published.workflowId,priority:'normal' };
  await invoke(page, 'draft', 'draft.revise', {
    projectId, draftId:draft.draftId, expectedRevision:1, contract, decisionId,
    decisionSummary:'Approved isolated fixture scope', resolvedQuestions:[],
    removedAcceptanceIds:[], confirmScopeChange:true,
  });
  const request = await invoke(page, 'approval', 'approval.request', {
    projectId, draftId:draft.draftId, expectedRevision:2,
  });
  const approved = await invoke(page, 'approval', 'approval.decide', {
    projectId, decision:{schemaVersion:'1.0',approvalId:request.request.approvalId,
      decision:'approve',expectedRevision:2,scopeHash:request.request.scopeHash,
      reason:'Fixture owner approved this version'},
  });
  assert.equal(approved.taskState, 'todo');
  assert.deepEqual(await invoke(page, 'run', 'run.list', {
    projectId, taskId:draft.draftId,
  }), [], 'Approval must not start a Run');
  await page.getByRole('button', { name:'看板', exact:true }).click();
  const taskCard = page.locator('.board-task').filter({hasText:contract.title});
  await taskCard.waitFor();
  await taskCard.click();
  const drawer = page.locator('.forge-dialog:has(> .task-detail)');
  await drawer.getByRole('tab',{name:'运行',exact:true}).click();
  await drawer.getByLabel('运行时资料检索词（可选）').fill('non-numeric');
  await drawer.getByLabel('本次总 Token 观测上限').selectOption(maxTokens);
  await drawer.getByRole('button', { name:'明确启动只读计划' }).click();
  await drawer.getByText('这是只读 Planner Run', {exact:false}).waitFor({timeout:30_000});
  const runs = await invoke(page, 'run', 'run.list', {
    projectId, taskId:draft.draftId,
  });
  activeRunId = runs[0]?.runId;
  assert.ok(activeRunId, 'UI Start did not create a Run');
  console.log(JSON.stringify({stage:'planned-run-started',runId:activeRunId}));
  let inspection;
  for (let attempt=0;attempt<150;attempt+=1) {
    inspection = await invoke(page, 'run', 'run.inspect', {
      projectId, runId:activeRunId, afterCursor:0, limit:100,
    });
    if (['succeeded','failed','cancelled','interrupted'].includes(inspection.run.state)) break;
    await delay(2000);
  }
  assert.equal(inspection?.run.state, 'succeeded',
    `Plan failed: ${JSON.stringify({state:inspection?.run.state,
      planFailure:inspection?.planFailure,budgetFailure:inspection?.budgetFailure})}`);
  activeRunId = null;
  const gate = await invoke(page, 'run', 'run.planGet', {
    projectId, taskId:draft.draftId, runId:inspection.run.runId,
  });
  assert.ok(gate?.artifact?.result?.plan?.length, 'No validated Plan Artifact');
  assert.equal(gate.artifact.baseRevision, baseline);
  assert.equal(gate.artifact.taskRevision, 2);
  assert.equal(gate.requiresApproval, preset === 'strict');
  const frozen = await invoke(page, 'run', 'run.config', {
    projectId, runId:inspection.run.runId,
  });
  assert.equal(frozen.actualNodeId, 'plan');
  assert.equal(frozen.workflow.id, published.workflowId);
  assert.equal(frozen.workflow.version, '1');
  assert.equal(frozen.developerProfile.id, profileIds.planner);
  assert.ok(inspection.contextSources.some((item) =>
    item.sourceKind === 'untrusted_project/retrieved_knowledge'),
  'Imported knowledge was not frozen as a Planner source');
  assert.equal(git('status','--porcelain'), '');
  assert.equal(git('rev-parse','HEAD'), baseline);
  let developerSnapshotId = null;
  if (preset === 'standard') {
    let continued = gate;
    for (let attempt=0;attempt<30&&!continued.developmentRunId;attempt+=1) {
      await delay(1000);
      continued = await invoke(page, 'run', 'run.planGet', {
        projectId, taskId:draft.draftId, runId:inspection.run.runId,
      });
    }
    assert.equal(continued.decision, 'automatic', 'Standard must use the automatic route');
    assert.ok(continued.developmentRunId, 'Plan did not hand off to Developer');
    activeDeveloperRunId = continued.developmentRunId;
    console.log(JSON.stringify({stage:'standard-developer-started',
      planRunId:inspection.run.runId,developmentRunId:activeDeveloperRunId}));
    let developed;
    for (let attempt=0;attempt<240;attempt+=1) {
      developed = await invoke(page, 'run', 'run.inspect', {
        projectId,runId:activeDeveloperRunId,afterCursor:0,limit:100,
      });
      if (['succeeded','failed','cancelled','interrupted'].includes(developed.run.state)) break;
      await delay(2000);
    }
    assert.ok(developed && ['succeeded','failed','cancelled','interrupted'].includes(
      developed.run.state), 'Developer did not reach a terminal state');
    activeDeveloperRunId = null;
    console.log(JSON.stringify({stage:'standard-developer-terminal',
      developmentRunId:continued.developmentRunId,state:developed.run.state,
      budgetFailure:developed.budgetFailure}));
    assert.equal(developed.run.state,'succeeded',
      `Developer failed: ${JSON.stringify({state:developed.run.state,
        budgetFailure:developed.budgetFailure})}`);
    assert.equal(developed.run.attempt.nodeId,'develop');
    assert.ok(developed.contextSources.some((item)=>item.sourceRef.startsWith('plan:')),
      'Developer did not receive the validated Plan Artifact');
    assert.ok(developed.contextSources.some((item)=>
      item.sourceKind === 'untrusted_project/retrieved_knowledge'),
    'Developer did not receive the frozen retrieved knowledge');
    let handoff;
    for (let attempt=0;attempt<30&&!handoff;attempt+=1) {
      handoff = await invoke(page,'run','run.handoff',{
        projectId,runId:continued.developmentRunId,
      });
      if (!handoff) await delay(1000);
    }
    assert.ok(handoff?.snapshot?.snapshotId,'Developer did not produce a CodeSnapshot');
    developerSnapshotId = handoff.snapshot.snapshotId;
    const developerConfig = await invoke(page,'run','run.config',{
      projectId,runId:continued.developmentRunId,
    });
    assert.equal(developerConfig.workflow.id,published.workflowId);
    assert.equal(developerConfig.workflow.version,'1');
    assert.equal(developerConfig.developerProfile.id,profileIds.developer);
    assert.deepEqual(developerConfig.commandPresetIds,[approvedPreset.presetId]);
    assert.equal(developerConfig.commandPresetLocks?.[0]?.approvalHash,
      approvedPreset.approvalHash);
    assert.equal(git('status','--porcelain'), '');
    assert.equal(git('rev-parse','HEAD'), baseline);
  }
  await page.reload();
  await page.getByRole('button', { name:'Host connected' }).waitFor();
  await page.getByRole('button', { name:'看板', exact:true }).click();
  await page.locator('.board-task').filter({hasText:contract.title}).click();
  await page.getByRole('tab',{name:'运行',exact:true}).click();
  await page.locator('nav.run-list').getByRole('button', {
    name:new RegExp(inspection.run.runId.slice(0,8)),
  }).click();
  await page.getByText('这是只读 Planner Run',{exact:false}).waitFor();
  await page.screenshot({path:screenshotPath('validated-plan')});
  if (preset === 'strict') {
    assert.equal(gate.decision, 'pending');
    assert.equal(gate.developmentRunId, null);
    await page.getByRole('button', { name:'Host connected' }).waitFor();
  }
  await closeInstalled();
  page = await launch();
  const persisted = await invoke(page, 'run', 'run.planGet', {
    projectId, taskId:draft.draftId, runId:inspection.run.runId,
  });
  assert.equal(persisted.artifact.contentHash, gate.artifact.contentHash);
  if (preset === 'standard') {
    assert.equal(persisted.decision,'automatic');
    assert.ok(persisted.developmentRunId);
    assert.ok(developerSnapshotId);
    assert.equal((await invoke(page,'run','run.handoff',{
      projectId,runId:persisted.developmentRunId,
    }))?.snapshot?.snapshotId,developerSnapshotId);
  }
  console.log(JSON.stringify({stage:'installed-planned-live',preset,model,
    qaRoot,projectId,taskId:draft.draftId,planRunId:inspection.run.runId,
    artifactId:gate.artifact.artifactId,workflowId:published.workflowId,
    sourceId:imported.sourceId,sourceClean:true,
    approvedTestPresetId:approvedPreset.presetId,
    developmentRunId:persisted.developmentRunId,
    developerSnapshotId,
    screenshot:screenshotPath('validated-plan')}));
} finally {
  if (app && activeRunId && projectId) {
    try { await invoke(await app.firstWindow(), 'run', 'run.cancel', {
      projectId, runId:activeRunId,
    }); } catch { /* Preserve the isolated QA directory for recovery inspection. */ }
  }
  if (app && activeDeveloperRunId && projectId) {
    try { await invoke(await app.firstWindow(), 'run', 'run.cancel', {
      projectId, runId:activeDeveloperRunId,
    }); } catch { /* Keep the isolated workspace when exit cannot be confirmed. */ }
  }
  await closeInstalled();
  if (attached) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, {recursive:true,force:true});
  assert.equal(git('status','--porcelain'), '', 'Disposable source Git was modified');
  assert.equal(git('rev-parse','HEAD'), baseline);
  assert.ok(existsSync(qaRoot), 'Isolated QA evidence was lost');
}
