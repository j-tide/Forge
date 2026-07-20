/** MIG-PY-09: real Electron Renderer -> Main -> Python Host -> Codex, isolated fixture. */
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const packagedAcceptance = process.env.FORGE_VERTICAL_PACKAGED === '1';
const p3Acceptance = process.env.FORGE_P3_ACCEPTANCE === '1';
const contextOnly = process.env.FORGE_VERTICAL_CONTEXT_ONLY === '1';
const customWorkflow = process.env.FORGE_VERTICAL_CUSTOM_WORKFLOW === '1';
const mergeOnly = process.env.FORGE_VERTICAL_MERGE_ONLY === '1';
const finalOnly = process.env.FORGE_VERTICAL_FINAL_ONLY === '1' || mergeOnly;
const requestedRoot = process.env.FORGE_VERTICAL_ROOT;
if (requestedRoot && (!isAbsolute(requestedRoot) || existsSync(requestedRoot))) {
  throw new Error('FORGE_VERTICAL_ROOT must be an absolute path that does not exist');
}
const root = requestedRoot ?? await mkdtemp(join(tmpdir(), 'forge-python-desktop-live-'));
if (requestedRoot) await mkdir(root, { recursive: true });
const artifactTag = process.env.FORGE_VERTICAL_ARTIFACT_TAG;
if (artifactTag && !/^[a-z0-9][a-z0-9-]{0,39}$/.test(artifactTag)) {
  throw new Error('FORGE_VERTICAL_ARTIFACT_TAG must be a short lowercase slug');
}
const packagedScreenshot = (part) => artifactTag ?
  join(repositoryRoot, 'output', 'playwright', `${artifactTag}-${part}-1440x900.png`) :
  fileURLToPath(new URL(`../output/playwright/p6-06-packaged-${part}-1440x900.png`, import.meta.url));
const source = join(root, 'Forge fixture 空格');
const packagedAppData = join(root, 'isolated-app-data');
const dataDir = packagedAcceptance ? join(packagedAppData, 'Forge', 'production') : join(root, 'data');
const screenshot = packagedAcceptance && artifactTag ? packagedScreenshot('delivery') :
  fileURLToPath(new URL(packagedAcceptance ?
  '../output/playwright/p6-06-packaged-delivery-1440x900.png' : p3Acceptance ?
  '../output/playwright/p3-12-python-desktop-handoff-1440x900.png' : mergeOnly ?
  '../output/playwright/p3-08-python-desktop-delivery-1440x900.png' : finalOnly ?
  '../output/playwright/p3-07-python-desktop-delivery-1440x900.png' : customWorkflow ?
  '../output/playwright/p5-11-workflow-run-desktop.png' : contextOnly ?
  '../output/playwright/p5-11-context-source-desktop.png' :
  '../output/playwright/mig-py-09-python-desktop-run-1440x900.png', import.meta.url));
let desktop;
let installRoot;
let mounted = false;
const mount = join(root, 'mounted-dmg');
let installedApp;
const lifecycleOnly = process.env.FORGE_P6_LIFECYCLE === '1';
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();

async function invoke(page, group, type, payload) {
  const result = await page.evaluate(async ({ group, type, payload }) => {
    const command = { schemaVersion: '1.0', commandId: crypto.randomUUID(), type,
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload };
    const bridge = globalThis.forge;
    switch (group) {
      case 'project': return bridge.invokeProject(command);
      case 'conversation': return bridge.invokeConversation(command);
      case 'draft': return bridge.invokeDraft(command);
      case 'approval': return bridge.invokeApproval(command);
      case 'run': return bridge.invokeRun(command);
      default: throw new Error('Invalid group');
    }
  }, { group, type, payload });
  assert.equal(result.ok, true, `${type}: ${JSON.stringify(result)}`);
  return result.data;
}

async function boardSnapshot(page, projectId) {
  const response = await page.evaluate(async ({projectId}) => globalThis.forge.invokeBoard({
    schemaVersion:'1.0',commandId:crypto.randomUUID(),type:'board.snapshot',
    createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',
    payload:{projectId},
  }),{projectId});
  assert.equal(response.ok,true,JSON.stringify(response));
  return response.data;
}

try {
  if (packagedAcceptance) {
    assert.equal(process.platform, 'darwin');
    assert.equal(process.arch, 'arm64');
    const version = JSON.parse(await readFile(join(desktopDirectory, 'package.json'), 'utf8')).version;
    const dmg = process.env.FORGE_VERTICAL_DMG || join(repositoryRoot, 'build', 'macos',
      `Forge-${version}-INTERNAL-ADHOC-UNNOTARIZED-darwin-arm64.dmg`);
    installRoot = await mkdtemp(join(repositoryRoot, 'build', 'macos', 'qa-install-'));
    installedApp = join(installRoot, 'Forge INTERNAL.app');
    await mkdir(mount);
    const attach = spawnSync('hdiutil', ['attach', '-readonly', '-nobrowse',
      '-mountpoint', mount, dmg], { encoding: 'utf8' });
    assert.equal(attach.status, 0, attach.stderr);
    mounted = true;
    execFileSync('ditto', [join(mount, 'Forge INTERNAL.app'), installedApp]);
    execFileSync('hdiutil', ['detach', mount]);
    mounted = false;
    execFileSync('codesign', ['--verify', '--deep', '--strict', installedApp]);
  }
  await mkdir(source);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Forge fixture');
  git('config', 'user.email', 'forge-fixture@example.invalid');
  await writeFile(join(source, 'math.js'), 'export const add = (a, b) => a + b;\n');
  await writeFile(join(source, 'test.js'), "import { add } from './math.js';\nimport assert from 'node:assert/strict';\nassert.equal(add(1, 2), 3);\nconsole.log('Forge fixture test completed');\n");
  await writeFile(join(source, 'hold.js'), 'setTimeout(() => {}, 120_000);\n');
  await writeFile(join(source, 'package.json'), '{"type":"module","scripts":{"test":"node test.js"}}\n');
  if (contextOnly) {
    await mkdir(join(source, 'docs'));
    await writeFile(join(source, 'docs', 'context.md'),
      '# Date API\nUse start_date for date filtering in this fixture.\n');
    await writeFile(join(source, 'docs', 'conflict.md'),
      '# Date API\nDo not use start_date for date filtering in this fixture.\n');
  }
  git('add', '.'); git('commit', '-m', 'fixture');
  const sourceHead = git('rev-parse', 'HEAD');
  const desktopExecutable = packagedAcceptance ? join(installedApp, 'Contents', 'MacOS', 'Forge') :
    requireDesktop('electron');
  const desktopArgs = packagedAcceptance ? [] : [desktopDirectory];
  const desktopEnv = { ...process.env, FORGE_DEV_SERVER_URL: '',
    ...(packagedAcceptance ? { FORGE_INTERNAL_TEST_HOME: packagedAppData } :
      { FORGE_HOST_DATA_DIR: dataDir }) };
  desktop = await electron.launch({ executablePath: desktopExecutable,
    args: desktopArgs, env: desktopEnv });
  if (process.env.FORGE_BRIDGE_DIAGNOSTIC === '1') {
    desktop.process().stderr?.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.includes('forge-python-bridge')) process.stderr.write(`${line}\n`);
      }
    });
  }
  if (mergeOnly) await desktop.evaluate(({dialog}) => {
    let confirmations = 0;
    dialog.showMessageBox = async () => ({response:++confirmations === 1 ? 0 : 1,
      checkboxChecked:false});
  });
  let page = await desktop.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  const hostHealth = await page.evaluate(() => globalThis.forge.hostHealth());
  assert.equal(hostHealth.ok, true);
  assert.equal(hostHealth.data.runtime.implementation, 'CPython');
  assert.equal(hostHealth.data.storage.schemaVersion, 32);
  if (packagedAcceptance) {
    const packagePaths = await desktop.evaluate(({ app }) => ({
      packaged: app.isPackaged, appData: app.getPath('appData'), resources: process.resourcesPath,
    }));
    assert.equal(packagePaths.packaged, true);
    assert.equal(packagePaths.appData, packagedAppData);
    assert.ok(packagePaths.resources.startsWith(installedApp));
    const hostCommand = execFileSync('ps', ['-p', String(hostHealth.data.pid), '-o', 'command='],
      { encoding: 'utf8' });
    assert.ok(hostCommand.includes(join(installedApp, 'Contents', 'Resources',
      'forge-python', 'runtime', 'bin', 'python3.12')));
    assert.ok(!hostCommand.includes(join(repositoryRoot, 'python', '.venv')));
  }

  await desktop.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () =>
    ({ canceled: false, filePaths: [path] }); }, source);
  assert.equal(await page.evaluate(() => globalThis.forge.chooseProjectFolder()), source);
  const probe = await invoke(page, 'project', 'project.probe', { rootPath: source });
  assert.equal(probe.repositoryType, 'git');
  const project = await invoke(page, 'project', 'project.create', {
    rootPath: source, fingerprint: probe.fingerprint, trustVersion: 'project-trust/v1',
    approved: true, expectedRevision: 0,
  });
  let contextSourceId;
  if (contextOnly) {
    const imported = await page.evaluate((projectId) => globalThis.forge.invokeKnowledge({
      type: 'import', payload: { projectId, relativePath: 'docs/context.md' },
    }), project.projectId);
    assert.equal(imported.status, 'active');
    contextSourceId = imported.sourceId;
  }
  let verifierPreset;
  if (process.env.FORGE_VERTICAL_VERIFY_ONLY === '1' || finalOnly) {
    const environment = await invoke(page, 'project', 'environment.get', {
      projectId: project.projectId, environmentId: project.environmentId,
    });
    const preset = await invoke(page, 'project', 'commandPreset.save', {
      projectId: project.projectId, expectedRevision: 0,
      environmentId: environment.environmentId, name: 'test',
      executable: process.execPath, argv: ['test.js'], cwdRelative: '.',
      envRefs: [], timeoutSeconds: 30, scriptsHash: probe.scriptsHash,
    });
    verifierPreset = await invoke(page, 'project', 'commandPreset.approve', {
      projectId: project.projectId, presetId: preset.presetId,
      expectedRevision: preset.revision, scriptsHash: probe.scriptsHash,
    });
    await invoke(page, 'project', 'environment.save', {
      projectId: project.projectId, environmentId: environment.environmentId,
      expectedRevision: environment.revision, name: environment.name,
      config: { commandPresetIds: [preset.presetId], envRefs: [], networkMode: 'trusted-local' },
    });
  }
  const conversation = await invoke(page, 'conversation', 'conversation.create', {
    projectId: project.projectId, title: 'Desktop Python run', expectedRevision: 0,
  });
  const sent = await invoke(page, 'conversation', 'conversation.send', {
    projectId: project.projectId, conversationId: conversation.conversationId,
    idempotencyKey: 'python-desktop-live-msg-01',
    text: 'Validate add inputs and add tests.', attachmentIds: [],
  });
  const draft = await invoke(page, 'draft', 'draft.manual', {
    projectId: project.projectId, conversationId: conversation.conversationId,
    sourceMessageId: sent.message.messageId, idempotencyKey: 'python-desktop-live-draft-01',
  });
  const modelId = process.env.FORGE_VERTICAL_MODEL ?? 'gpt-6-luna';
  let workflowRef = 'standard@1';
  if (customWorkflow) {
    const developer = await page.evaluate((modelId) => globalThis.forge.saveAgentProfile({
      profile: { schemaVersion:'1.0', id:'profile.fixture.workflow.developer', revision:1,
        name:'Fixture Workflow Developer', role:'developer', executorId:'executor.codex',
        modelId, promptTemplate:'Develop only in the isolated fixture workspace.',
        contextProviders:['task-contract','project-context'], policyProfile:'workspace-write',
        limits:{maxTurns:10,maxSeconds:180,maxOutputTokens:50000} }, expectedRevision:0,
    }), modelId);
    const reviewer = await page.evaluate((modelId) => globalThis.forge.saveAgentProfile({
      profile: { schemaVersion:'1.0', id:'profile.fixture.workflow.reviewer', revision:1,
        name:'Fixture Workflow Reviewer', role:'reviewer', executorId:'executor.codex',
        modelId, promptTemplate:'Review the fixed snapshot read-only.',
        contextProviders:['task-contract','snapshot-diff'], policyProfile:'read-only',
        limits:{maxTurns:10,maxSeconds:180,maxOutputTokens:50000} }, expectedRevision:0,
    }), modelId);
    const presets = await page.evaluate(() => globalThis.forge.invokeWorkflow({
      type:'presets',payload:{},
    }));
    const quick = presets.find((item) => item.id === 'quick');
    assert.ok(quick);
    const template = { ...quick, id:'workflow.fixture.quick',
      nodes:quick.nodes.map((node) => ({...node,binding:node.id === 'develop' ? developer.id :
        node.id === 'review' ? reviewer.id : node.binding})) };
    const saved = await page.evaluate((template) => globalThis.forge.invokeWorkflow({
      type:'saveDraft',payload:{template,expectedRevision:0},
    }), template);
    assert.equal(saved.compiled.launchable, true);
    const published = await page.evaluate((workflowId) => globalThis.forge.invokeWorkflow({
      type:'publish',payload:{workflowId,expectedDraftRevision:1},
    }), template.id);
    assert.equal(published.record.publishedRevision, 1);
    workflowRef = template.id;
  }
  const decisionId = crypto.randomUUID();
  const decisionRef = `decision:${decisionId}`;
  const contract = { schemaVersion: '1.0', taskId: draft.draftId, projectId: project.projectId,
    revision: 2, title: 'Validate add', type: 'feature',
    goal: 'In this tiny fixture, update math.js so add(a,b) rejects non-number inputs with TypeError. Add assertions in test.js for invalid inputs. Run npm test. Do not change package.json. Finish when tests pass.',
    acceptance: [{ id: 'AC-01', statement: 'Invalid inputs rejected', method: 'automated',
      required: true, sourceRefs: [decisionRef] }],
    constraints: [], scope: ['math.js', 'test.js'], outOfScope: [], dependencies: [],
    openQuestions: [], assumptions: [],
    sourceRefs: [`message:${sent.message.messageId}`, decisionRef],
    workflowRef, priority: 'normal' };
  const revised = await invoke(page, 'draft', 'draft.revise', {
    projectId: project.projectId, draftId: draft.draftId, expectedRevision: 1,
    contract, decisionId, decisionSummary: 'Fixture scope approved',
    resolvedQuestions: [], removedAcceptanceIds: [], confirmScopeChange: true,
  });
  assert.equal(revised.status, 'proposed');
  const pending = await invoke(page, 'approval', 'approval.request', {
    projectId: project.projectId, draftId: draft.draftId, expectedRevision: 2,
  });
  const approved = await invoke(page, 'approval', 'approval.decide', {
    projectId: project.projectId, decision: {
      schemaVersion: '1.0', approvalId: pending.request.approvalId, decision: 'approve',
      expectedRevision: 2, scopeHash: pending.request.scopeHash, reason: 'Fixture reviewed',
    },
  });
  assert.equal(approved.taskState, 'todo');
  if (packagedAcceptance) {
    const beforeStart = await boardSnapshot(page, project.projectId);
    assert.equal(beforeStart.tasks.find((item) => item.id === draft.draftId)?.state, 'todo');
    assert.equal(beforeStart.tasks.find((item) => item.id === draft.draftId)?.latestRunId ?? null, null);
  }
  const capabilities = await invoke(page, 'run', 'run.capabilities', {
    projectId: project.projectId, taskId: draft.draftId,
  });
  assert.equal(capabilities.available, true);
  assert.ok(capabilities.modelIds.includes(modelId));
  if (contextOnly) {
    const rejected = await page.evaluate(({projectId,taskId,modelId}) =>
      globalThis.forge.invokeRun({schemaVersion:'1.0',commandId:crypto.randomUUID(),
        type:'run.start',createdAt:new Date().toISOString(),
        protocolVersion:'forge-host-protocol/v5',payload:{projectId,taskId,
          expectedTaskRevision:2,modelId,idempotencyKey:crypto.randomUUID(),
          contextQuery:'no_matching_context_fixture_987654321'}}),
      {projectId:project.projectId,taskId:draft.draftId,modelId});
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'CONTEXT_NO_SOURCE');
    const conflicting = await page.evaluate((projectId) => globalThis.forge.invokeKnowledge({
      type:'import',payload:{projectId,relativePath:'docs/conflict.md'},
    }), project.projectId);
    assert.equal(conflicting.status, 'active');
    const conflict = await page.evaluate(({projectId,taskId,modelId}) =>
      globalThis.forge.invokeRun({schemaVersion:'1.0',commandId:crypto.randomUUID(),
        type:'run.start',createdAt:new Date().toISOString(),
        protocolVersion:'forge-host-protocol/v5',payload:{projectId,taskId,
          expectedTaskRevision:2,modelId,idempotencyKey:crypto.randomUUID(),
          contextQuery:'start_date'}}),
      {projectId:project.projectId,taskId:draft.draftId,modelId});
    assert.equal(conflict.ok, false);
    assert.equal(conflict.error.code, 'CONTEXT_REQUIRES_HUMAN');
    await page.evaluate(({projectId,sourceId}) => globalThis.forge.invokeKnowledge({
      type:'revoke',payload:{projectId,sourceId},
    }), {projectId:project.projectId,sourceId:conflicting.sourceId});
    console.log(JSON.stringify({stage:'p5-context-gates',noAnswer:rejected.error.code,
      conflict:conflict.error.code,sourceClean:git('status','--porcelain') === ''}));
  }
  let savedProfile = null;
  let savedReviewerProfile = null;
  if (process.env.FORGE_VERTICAL_PROFILE === '1') {
    const catalog = await page.evaluate(() => globalThis.forge.agentProfileCatalog());
    assert.equal(catalog.executors.find((item) => item.executorId === 'executor.claude').available, false);
    const base = {
      schemaVersion: '1.0', revision: 1, name: 'Fixture Developer', role: 'developer',
      executorId: 'executor.codex', promptTemplate: 'Develop only in the isolated workspace.',
      contextProviders: ['task-contract', 'project-context'], policyProfile: 'workspace-write',
      limits: { maxTurns: 10, maxSeconds: 180, maxOutputTokens: 50000 },
    };
    const bad = await page.evaluate((value) => globalThis.forge.saveAgentProfile(value), {
      profile: { ...base, id: 'profile.fixture.unsupported', modelId: 'unsupported-model' },
      expectedRevision: 0,
    });
    assert.equal(bad.modelId, 'unsupported-model');
    const refused = await page.evaluate(async (payload) => globalThis.forge.invokeRun({
      schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'run.start',
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload,
    }), { projectId: project.projectId, taskId: draft.draftId,
      expectedTaskRevision: 2, modelId: 'unsupported-model',
      idempotencyKey: crypto.randomUUID(), profileId: bad.id, profileRevision: 1 });
    assert.equal(refused.ok, false);
    assert.equal(refused.error.code, 'MODEL_UNAVAILABLE');
    savedProfile = await page.evaluate((value) => globalThis.forge.saveAgentProfile(value), {
      profile: { ...base, id: 'profile.fixture.developer', modelId }, expectedRevision: 0,
    });
    if (process.env.FORGE_VERTICAL_REVIEW_ONLY === '1') {
      savedReviewerProfile = await page.evaluate((value) =>
        globalThis.forge.saveAgentProfile(value), {
        profile: { ...base, id: 'profile.fixture.reviewer', name: 'Fixture Reviewer',
          role: 'reviewer', modelId, promptTemplate:
            'Review the fixed snapshot for correctness. Return the requested structured result.',
          contextProviders: ['task-contract', 'snapshot-diff'], policyProfile: 'read-only' },
        expectedRevision: 0,
      });
    }
  }
  let successResult;
  if (process.env.FORGE_VERTICAL_SKIP_SUCCESS !== '1') {
  const runId = crypto.randomUUID();
  const run = await invoke(page, 'run', 'run.start', {
    projectId: project.projectId, taskId: draft.draftId,
    expectedTaskRevision: 2, modelId, idempotencyKey: runId,
    ...(savedProfile ? { profileId: savedProfile.id, profileRevision: savedProfile.revision } : {}),
    ...(contextOnly ? { contextQuery: 'start_date' } : {}),
  });
  assert.equal(run.runId, runId);
  if (contextOnly) {
    const python = fileURLToPath(new URL('../python/.venv/bin/python', import.meta.url));
    const sourceEvidence = JSON.parse(execFileSync(python, ['-c',
      'import json,sqlite3,sys; c=sqlite3.connect(sys.argv[1]); r=c.execute("SELECT bundle_json FROM context_bundles WHERE run_id=?",(sys.argv[2],)).fetchone(); print(json.dumps([{"kind":i["kind"],"authority":i["authority"],"sourceRef":i["sourceRef"]} for i in json.loads(r[0])["items"]]))',
      join(dataDir, 'forge.sqlite'), runId], { encoding: 'utf8' }));
    assert.ok(sourceEvidence.some((item) => item.kind === 'retrieved_knowledge' &&
      item.authority === 'untrusted_project' && item.sourceRef.startsWith('knowledge:')));
    console.log(JSON.stringify({ stage: 'p5-context-run', runId,
      sources: sourceEvidence.filter((item) => item.kind === 'retrieved_knowledge') }));
  }
  let inspection;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await delay(1000);
    inspection = await invoke(page, 'run', 'run.inspect', {
      projectId: project.projectId, runId, afterCursor: 0, limit: 100,
    });
    if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(inspection.run.state)) break;
  }
  assert.equal(inspection?.run.state, 'succeeded', JSON.stringify(inspection));
  const pluginLockFile = packagedAcceptance ? join(installedApp, 'Contents', 'Resources',
    'forge-python', 'packages', 'forge', 'builtin_plugins', 'plugins.lock.json') :
    fileURLToPath(new URL('../python/src/forge/builtin_plugins/plugins.lock.json', import.meta.url));
  const pluginLock = JSON.parse(await readFile(pluginLockFile, 'utf8')).plugins[0];
  const snapshotText = execFileSync(packagedAcceptance ? 'python3' : 'uv', [
    ...(packagedAcceptance ? [] : ['--directory', fileURLToPath(new URL('../python/', import.meta.url)),
      'run', '--frozen', 'python']), '-c',
    "import sqlite3,sys,pathlib; p=pathlib.Path(sys.argv[1]); db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True); row=db.execute('SELECT snapshot_json FROM run_config_snapshots WHERE run_id=?',(sys.argv[2],)).fetchone(); print(row[0] if row else '')",
    join(dataDir, 'forge.sqlite'), runId,
  ], { encoding: 'utf8', timeout: 15_000 });
  const frozenPlugin = JSON.parse(snapshotText).plugins.find((entry) => entry.id === pluginLock.id);
  if (customWorkflow) {
    const frozen = JSON.parse(snapshotText);
    assert.equal(frozen.workflow.id, workflowRef);
    assert.equal(frozen.workflow.version, '1');
    assert.equal(frozen.profile.id, 'profile.fixture.workflow.developer');
    assert.equal(frozen.stageProfiles[0].id, 'profile.fixture.workflow.reviewer');
    const configSource = await invoke(page, 'run', 'run.config', {
      projectId:project.projectId,runId,
    });
    assert.equal(configSource.workflow.contentHash, frozen.workflow.contentHash);
    assert.equal(configSource.developerProfile.id, frozen.profile.id);
    assert.equal(configSource.actualNodeId, 'develop');
  }
  if (savedProfile) {
    assert.equal(JSON.parse(snapshotText).profile.id, savedProfile.id);
    assert.equal(JSON.parse(snapshotText).profile.version, String(savedProfile.revision));
  }
  assert.deepEqual(frozenPlugin, { id: pluginLock.id, version: pluginLock.version,
    contentHash: pluginLock.contentHash });
  let handoff = null;
  for (let attempt = 0; attempt < 75 && !handoff; attempt += 1) {
    handoff = await invoke(page, 'run', 'run.handoff', { projectId: project.projectId, runId });
    if (!handoff) await delay(200);
  }
  assert.ok(handoff?.snapshot && !handoff.snapshot.noChange,
    `Codex completed without requested fixture edits: ${JSON.stringify({ inspection, handoff })}`);
  assert.ok(handoff.stepResult.acceptanceResults.every((item) => item.status === 'unverified'));
  const changed = handoff.snapshot.files.map((file) => file.path).sort();
  assert.deepEqual(changed, ['math.js', 'test.js']);
  await page.reload();
  await page.getByRole('button', { name: /Forge fixture 空格/ }).waitFor();
  await page.getByRole('button', { name: '研发看板' }).click();
  await page.locator('.board-task').filter({ hasText: 'Validate add' }).click();
  await page.getByText('已冻结 CodeSnapshot', { exact: false }).waitFor({ timeout: 15_000 });
  await mkdir(fileURLToPath(new URL('../output/playwright/', import.meta.url)), { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: screenshot });
  const workspace = join(dataDir, 'workspaces', 'trees', handoff.snapshot.workspaceId);
  execFileSync('node', ['test.js'], { cwd: workspace, timeout: 20_000 });
  const fixtureDiff = execFileSync('git', ['-C', workspace, 'diff', '--', 'math.js', 'test.js'],
    { encoding: 'utf8' });
  assert.match(fixtureDiff, /diff --git a\/math\.js b\/math\.js/);
  assert.match(fixtureDiff, /diff --git a\/test\.js b\/test\.js/);
  const diffArtifact = fileURLToPath(new URL('../output/playwright/p2-10-vertical.diff',
    import.meta.url));
  await writeFile(diffArtifact, fixtureDiff);
  assert.equal(git('rev-parse', 'HEAD'), sourceHead);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(await readFile(join(source, 'math.js'), 'utf8'), 'export const add = (a, b) => a + b;\n');
  successResult = { successRunId: runId, successSnapshotId: handoff.snapshot.snapshotId,
    runState: inspection.run.state, changed, sourceClean: true,
    formalAcceptance: handoff.stepResult.acceptanceResults[0].status, screenshot,
    diffArtifact };
  if (contextOnly) {
    const initialSources = await invoke(page, 'run', 'context.sources', {
      projectId: project.projectId, runId,
    });
    assert.equal(initialSources.length, 1);
    assert.equal(initialSources[0].status, 'current');
    const revoked = await page.evaluate(({projectId,sourceId}) => globalThis.forge.invokeKnowledge({
      type: 'revoke', payload: { projectId, sourceId },
    }), {projectId:project.projectId,sourceId:contextSourceId});
    assert.equal(revoked.status, 'revoked');
    const after = await invoke(page, 'run', 'context.sources', {
      projectId: project.projectId, runId,
    });
    assert.equal(after[0].status, 'revoked');
    await page.getByRole('tab', { name: 'context' }).click();
    await page.getByText('历史 Run 输入已冻结', { exact: false }).waitFor();
    await page.getByText('retrieved_knowledge', { exact: false }).first().waitFor();
    await page.screenshot({ path: fileURLToPath(new URL(
      '../output/playwright/p5-11-context-source-desktop.png', import.meta.url)) });
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({stage:'p5-context-run-completed',runId,
      runState:inspection.run.state,sourceStatus:after[0].status,sourceClean:true}));
  }
  if (process.env.FORGE_VERTICAL_VERIFY_ONLY === '1' || finalOnly) {
    assert.ok(verifierPreset?.approvalHash);
    const verifyInput = {
      projectId: project.projectId, taskId: draft.draftId,
      developmentRunId: runId, expectedSnapshotId: handoff.snapshot.snapshotId,
      kind: 'test', presetId: verifierPreset.presetId, idempotencyKey: crypto.randomUUID(),
    };
    const startedCheck = await invoke(page, 'run', 'run.verifyStart', verifyInput);
    const replayed = await invoke(page, 'run', 'run.verifyStart', verifyInput);
    assert.equal(replayed.verificationId, startedCheck.verificationId);
    let check = startedCheck;
    for (let attempt = 0; attempt < 60 && check.state === 'running'; attempt += 1) {
      await delay(500);
      check = await invoke(page, 'run', 'run.verifyJob', {
        projectId: project.projectId, verificationId: startedCheck.verificationId,
      });
    }
    assert.equal(check.state, 'completed', JSON.stringify(check));
    const report = await invoke(page, 'run', 'run.verifyReport', {
      projectId: project.projectId, verificationId: startedCheck.verificationId,
    });
    assert.equal(report.status, 'passed', JSON.stringify(report));
    assert.equal(report.exitCode, 0);
    assert.equal(report.snapshotId, handoff.snapshot.snapshotId);
    assert.equal(report.approvalHash, verifierPreset.approvalHash);
    if (p3Acceptance) {
      assert.ok(report.stdoutArtifactId, 'Fixture test output artifact is missing');
      const evidence = page.locator('section[aria-label="验证报告"]');
      await evidence.getByRole('button', {name:'刷新报告'}).click();
      await evidence.getByText('test · passed · exit 0', {exact:false}).waitFor();
      await evidence.getByRole('button', {name:'查看 stdout 纯文本'}).click();
      await evidence.getByText('Forge fixture test completed', {exact:false}).waitFor();
      assert.equal(await evidence.locator('pre a, pre script').count(),0);
      await page.screenshot({path:fileURLToPath(new URL(
        '../output/playwright/p3-12-python-desktop-verify-report-1440x900.png',
        import.meta.url))});
    }
    const reworkCycles = await invoke(page, 'run', 'run.reworkCycles', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.deepEqual(reworkCycles, []);
    const beforeMatrix = await invoke(page, 'run', 'run.acceptanceMatrix', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(beforeMatrix.requiredCovered, false);
    assert.equal(beforeMatrix.evaluation, 'inconclusive');
    assert.equal(beforeMatrix.criteria[0].status, 'unverified');
    assert.equal(beforeMatrix.checkReports[0].reportId, report.reportId);
    const matrixPanel = page.locator('section[aria-label="逐条验收矩阵"]');
    await matrixPanel.getByRole('button', { name: '刷新真实证据' }).click();
    await matrixPanel.getByText(`未覆盖必需项：AC-01`).waitFor();
    await matrixPanel.getByLabel('当前快照报告（自动项验证必选）').selectOption(report.reportId);
    await matrixPanel.getByLabel('判断依据 / 未验证说明 / 风险接受原因').fill(
      'The fixed-snapshot node test exercises invalid inputs and exits zero.');
    await matrixPanel.getByRole('button', { name: '记录本快照的判断' }).click();
    await matrixPanel.getByText('必需项均有逐条决定；仍需最终人工验收').waitFor();
    const afterMatrix = await invoke(page, 'run', 'run.acceptanceMatrix', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(afterMatrix.criteria[0].status, 'verified');
    assert.equal(afterMatrix.criteria[0].reportId, report.reportId);
    assert.equal(afterMatrix.requiredCovered, true);
    assert.equal(afterMatrix.evaluation, 'covered');
    assert.equal(afterMatrix.finalAcceptanceRequired, true);
    const matrixScreenshot = packagedAcceptance && artifactTag ? packagedScreenshot('matrix') :
      fileURLToPath(new URL(packagedAcceptance ?
      '../output/playwright/p6-06-packaged-matrix-1440x900.png' : p3Acceptance ?
      '../output/playwright/p3-12-python-desktop-matrix-1440x900.png' : mergeOnly ?
      '../output/playwright/p3-08-python-desktop-matrix-1440x900.png' : finalOnly ?
      '../output/playwright/p3-07-python-desktop-matrix-1440x900.png' :
      '../output/playwright/p3-05-python-desktop-acceptance-1440x900.png', import.meta.url));
    await matrixPanel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: matrixScreenshot });
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({ stage: 'python-desktop-verify-live',
      developmentRunId: runId, verificationId: check.verificationId,
      snapshotId: report.snapshotId, status: report.status, exitCode: report.exitCode,
      acceptanceStatus: afterMatrix.criteria[0].status, matrixScreenshot,
      sourceClean: true }));
  }
  if (process.env.FORGE_VERTICAL_REVIEW_ONLY === '1' || finalOnly) {
    const reviewKey = crypto.randomUUID();
    const reviewInput = {
      projectId: project.projectId, taskId: draft.draftId,
      developmentRunId: runId, expectedSnapshotId: handoff.snapshot.snapshotId,
      modelId, idempotencyKey: reviewKey,
      ...(savedReviewerProfile ? { profileId: savedReviewerProfile.id,
        profileRevision: savedReviewerProfile.revision } : {}),
    };
    const startedReview = await invoke(page, 'run', 'run.reviewStart', reviewInput);
    const retriedReview = await invoke(page, 'run', 'run.reviewStart', reviewInput);
    assert.equal(retriedReview.reviewRunId, startedReview.reviewRunId);
    let reviewJob = startedReview;
    for (let attempt = 0; attempt < 240 && reviewJob.state === 'running'; attempt += 1) {
      await delay(1000);
      reviewJob = await invoke(page, 'run', 'run.reviewJob', {
        projectId: project.projectId, reviewRunId: startedReview.reviewRunId,
      });
    }
    assert.equal(reviewJob.state, 'completed', JSON.stringify(reviewJob));
    const reports = await invoke(page, 'run', 'run.reviewReports', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(reports.length, 1);
    assert.equal(reports[0].snapshotId, handoff.snapshot.snapshotId);
    if (savedReviewerProfile) {
      const storedProfile = execFileSync('uv', [
        '--directory', fileURLToPath(new URL('../python/', import.meta.url)),
        'run', '--frozen', 'python', '-c',
        "import sqlite3,sys,pathlib; p=pathlib.Path(sys.argv[1]); db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True); row=db.execute('SELECT profile_id,profile_revision FROM review_jobs WHERE review_run_id=?',(sys.argv[2],)).fetchone(); print((row[0] or '')+':'+str(row[1] or ''))",
        join(dataDir, 'forge.sqlite'), reviewJob.reviewRunId,
      ], { encoding: 'utf8', timeout: 15_000 }).trim();
      assert.equal(storedProfile, `${savedReviewerProfile.id}:${savedReviewerProfile.revision}`);
    }
    assert.ok(reports[0].result, `Review has no structured result: status=${reports[0].status}, jobError=${reviewJob.errorCode ?? 'none'}`);
    assert.notEqual(reports[0].status, 'stale');
    await page.reload();
    await page.getByText('Review 与问题历史').waitFor({ timeout: 15_000 });
    await page.getByText(`最近报告：${reports[0].status}`, { exact: false })
      .waitFor({ timeout: 15_000 });
    await page.getByText('Review 与问题历史').scrollIntoViewIfNeeded();
    const reviewScreenshot = packagedAcceptance && artifactTag ? packagedScreenshot('review') :
      fileURLToPath(new URL(packagedAcceptance ?
      '../output/playwright/p6-06-packaged-review-1440x900.png' : p3Acceptance ?
      '../output/playwright/p3-12-python-desktop-review-1440x900.png' : mergeOnly ?
      '../output/playwright/p3-08-python-desktop-review-1440x900.png' : finalOnly ?
      '../output/playwright/p3-07-python-desktop-review-1440x900.png' :
      '../output/playwright/p3-03-python-desktop-review-1440x900.png', import.meta.url));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: reviewScreenshot });
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({ stage: 'python-desktop-review-live',
      developmentRunId: runId, reviewRunId: reviewJob.reviewRunId,
      reviewStatus: reports[0].status, issueCount: reports[0].issues.length,
      snapshotId: reports[0].snapshotId, sourceClean: true,
      screenshot: reviewScreenshot }));
  }
  if (finalOnly) {
    const current = await invoke(page, 'run', 'run.finalAcceptance', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(current.status, 'ready', JSON.stringify(current));
    assert.equal(current.snapshotId, handoff.snapshot.snapshotId);
    const finalPanel = page.locator('section[aria-label="人类最终验收"]');
    await finalPanel.getByRole('button', { name: '重新读取交付' }).click();
    await finalPanel.getByText(`快照 ${handoff.snapshot.snapshotId.slice(0,8)}`, { exact: false })
      .waitFor({ timeout: 15_000 });
    await finalPanel.getByLabel('最终验收依据').fill(
      'I inspected the exact current diff, approved Review, passing test and AC report.');
    await finalPanel.getByLabel('我已检查当前快照与报告，并明确接受这一交付。').check();
    await finalPanel.getByRole('button', { name: '接受当前版本' }).click();
    await finalPanel.getByText('已由本地 Owner 验收', { exact: false })
      .waitFor({ timeout: 15_000 });
    const accepted = await invoke(page, 'run', 'run.finalAcceptance', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.decision?.actor, 'local-owner');
    const board = await page.evaluate(async ({ projectId }) => {
      const command = { schemaVersion: '1.0', commandId: crypto.randomUUID(),
        type: 'board.snapshot', createdAt: new Date().toISOString(),
        protocolVersion: 'forge-host-protocol/v5', payload: { projectId } };
      return globalThis.forge.invokeBoard(command);
    }, { projectId: project.projectId });
    assert.equal(board.ok, true);
    const task = board.data.tasks.find((item) => item.id === draft.draftId);
    assert.equal(task.state, 'done');
    assert.equal(task.boardColumn, 'done');
    await finalPanel.scrollIntoViewIfNeeded();
    const finalScreenshot = packagedAcceptance && artifactTag ? packagedScreenshot('accepted') :
      fileURLToPath(new URL(packagedAcceptance ?
      '../output/playwright/p6-06-packaged-accepted-1440x900.png' : p3Acceptance ?
      '../output/playwright/p3-12-python-desktop-accepted-1440x900.png' : mergeOnly ?
      '../output/playwright/p3-08-python-desktop-accepted-1440x900.png' :
      '../output/playwright/p3-07-python-desktop-accepted-1440x900.png', import.meta.url));
    await page.screenshot({ path: finalScreenshot });
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({ stage: 'python-desktop-final-acceptance',
      developmentRunId: runId, snapshotId: handoff.snapshot.snapshotId,
      decisionId: accepted.decision.decisionId, taskState: task.state,
      sourceClean: true, screenshot: finalScreenshot }));
    if (mergeOnly) {
      const record = await invoke(page, 'run', 'deliveries.get', {
        projectId:project.projectId, taskId:draft.draftId,
      });
      const target = await invoke(page, 'run', 'deliveries.preview', {
        projectId:project.projectId, taskId:draft.draftId,
      });
      assert.equal(record.snapshotId, handoff.snapshot.snapshotId);
      assert.equal(target.canMerge, true, JSON.stringify(target));
      assert.equal(target.targetHead, sourceHead);
      const cancelled = await page.evaluate(async ({projectId,taskId,deliveryId,snapshotId,
        expectedTargetHead,targetBranch}) => globalThis.forge.invokeRun({
        schemaVersion:'1.0',commandId:crypto.randomUUID(),
        createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',
        type:'deliveries.merge',payload:{projectId,taskId,deliveryId,
          expectedSnapshotId:snapshotId,expectedTargetHead,targetBranch,confirmed:true,
          idempotencyKey:crypto.randomUUID()},
      }),{projectId:project.projectId,taskId:draft.draftId,deliveryId:record.deliveryId,
        snapshotId:record.snapshotId,expectedTargetHead:target.targetHead,
        targetBranch:target.targetBranch});
      assert.equal(cancelled.ok,false);
      assert.equal(cancelled.error.code,'MERGE_CANCELLED');
      assert.equal(git('rev-parse','HEAD'),sourceHead);
      assert.equal((await invoke(page,'run','deliveries.preview',{
        projectId:project.projectId,taskId:draft.draftId,
      })).operationId,null);
      console.log(JSON.stringify({stage:'python-desktop-native-merge-cancelled',
        sourceHeadUnchanged:true}));
      const deliveryPanel = page.locator('section[aria-label="交付记录与显式合并"]');
      await deliveryPanel.getByText(`交付 ${record.deliveryId.slice(0,8)}`, {exact:false})
        .waitFor({timeout:15_000});
      await deliveryPanel.getByLabel('我确认将当前快照显式合并到上述本地分支；不推送或部署。')
        .check();
      await deliveryPanel.getByRole('button',{name:'合并当前交付'}).click();
      await deliveryPanel.getByText('已显式本地合并',{exact:false})
        .waitFor({timeout:25_000});
      const after = await invoke(page, 'run', 'deliveries.preview', {
        projectId:project.projectId, taskId:draft.draftId,
      });
      assert.equal(after.operationState, 'merged');
      assert.equal(git('rev-parse','HEAD'), after.resultCommit);
      assert.equal(git('status','--porcelain'), '');
      const parents = git('rev-list','--parents','-n','1',after.resultCommit).split(' ');
      assert.deepEqual(parents,[after.resultCommit,sourceHead,handoff.snapshot.commitSha]);
      await deliveryPanel.scrollIntoViewIfNeeded();
      const mergeScreenshot = fileURLToPath(new URL(p3Acceptance ?
        '../output/playwright/p3-12-python-desktop-merged-1440x900.png' :
        '../output/playwright/p3-08-python-desktop-merged-1440x900.png',import.meta.url));
      await page.screenshot({path:mergeScreenshot});
      console.log(JSON.stringify({stage:'python-desktop-explicit-merge',
        deliveryId:record.deliveryId,operationId:after.operationId,
        resultCommit:after.resultCommit,sourceHeadBefore:sourceHead,
        sourceClean:true,screenshot:mergeScreenshot}));
      if (p3Acceptance && process.env.FORGE_P3_VERTICAL_BOARD === '1') {
        const extraTaskIds = [];
        for (const index of [1, 2]) {
          const title = `P3 board fixture ${index}`;
          const message = await invoke(page,'conversation','conversation.send',{
            projectId:project.projectId,conversationId:conversation.conversationId,
            idempotencyKey:crypto.randomUUID(),text:`Manual TODO ${index} for board gate checks`,
            attachmentIds:[],
          });
          const extraDraft = await invoke(page,'draft','draft.manual',{
            projectId:project.projectId,conversationId:conversation.conversationId,
            sourceMessageId:message.message.messageId,idempotencyKey:crypto.randomUUID(),
          });
          const extraDecisionId=crypto.randomUUID();
          const extraRef=`decision:${extraDecisionId}`;
          const extraContract={...contract,taskId:extraDraft.draftId,title,
            goal:`Keep this approved fixture Task in TODO for board gate check ${index}.`,
            acceptance:[{id:'AC-01',statement:'No automatic execution',
              method:'inspection',required:true,sourceRefs:[extraRef]}],
            sourceRefs:[`message:${message.message.messageId}`,extraRef]};
          await invoke(page,'draft','draft.revise',{
            projectId:project.projectId,draftId:extraDraft.draftId,expectedRevision:1,
            contract:extraContract,decisionId:extraDecisionId,
            decisionSummary:'Board fixture scope reviewed',resolvedQuestions:[],
            removedAcceptanceIds:[],confirmScopeChange:true,
          });
          const requested=await invoke(page,'approval','approval.request',{
            projectId:project.projectId,draftId:extraDraft.draftId,expectedRevision:2,
          });
          const decided=await invoke(page,'approval','approval.decide',{
            projectId:project.projectId,decision:{schemaVersion:'1.0',
              approvalId:requested.request.approvalId,decision:'approve',
              expectedRevision:2,scopeHash:requested.request.scopeHash,
              reason:'Board fixture reviewed'},
          });
          assert.equal(decided.taskState,'todo');
          extraTaskIds.push(extraDraft.draftId);
        }
        await page.reload();
        await page.getByRole('button',{name:'关闭抽屉'}).click();
        await page.getByRole('button',{name:'研发看板'}).click();
        await page.locator('[aria-label="TODO 列"] .board-task').first().waitFor();
        const boardBefore=await boardSnapshot(page,project.projectId);
        assert.equal(boardBefore.tasks.filter((item)=>item.boardColumn==='todo').length,2);
        assert.equal(boardBefore.tasks.filter((item)=>item.boardColumn==='done').length,1);
        const todoCards=page.locator('[aria-label="TODO 列"] .board-task');
        const doneColumn=page.locator('[aria-label="Done 列"] .board-column-scroll');
        await todoCards.first().dragTo(doneColumn);
        await page.getByRole('alert').getByText('缺少 Review、Verify 与人工验收', {
          exact:false}).waitFor();
        assert.deepEqual((await boardSnapshot(page,project.projectId)).tasks
          .filter((item)=>extraTaskIds.includes(item.id)).map((item)=>item.boardColumn),
        ['todo','todo']);
        await page.reload();
        await page.locator('[aria-label="TODO 列"] .board-task').first().waitFor();
        const statusFilter=page.getByLabel('按状态筛选');
        await statusFilter.selectOption('done');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===1);
        assert.equal(await page.locator('.board-task').count(),1);
        await statusFilter.selectOption('todo');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===2);
        assert.equal(await page.locator('.board-task').count(),2);
        await statusFilter.selectOption('all');
        const priorityFilter=page.getByLabel('按优先级筛选');
        await priorityFilter.selectOption('high');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===0);
        assert.equal(await page.locator('.board-task').count(),0);
        await priorityFilter.selectOption('all');
        const executorFilter=page.getByLabel('按 Executor 筛选');
        await executorFilter.selectOption('');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===2);
        assert.equal(await page.locator('.board-task').count(),2);
        await executorFilter.selectOption('all');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===3);
        const firstTitle=await todoCards.first().locator('h3').textContent();
        const move=page.getByRole('button',{name:`下移 ${firstTitle}`});
        await move.focus();await move.press('Enter');
        await page.getByText(`已调整 ${firstTitle} 的 TODO 顺序。`).waitFor({timeout:10_000});
        const feedback=await page.locator('.board-feedback').allTextContents();
        assert.ok(feedback.some((item)=>item.includes(`已调整 ${firstTitle} 的 TODO 顺序。`)),
          `Keyboard reorder failed: ${JSON.stringify(feedback)}`);
        assert.notEqual(await todoCards.first().locator('h3').textContent(),firstTitle);
        await page.waitForFunction((ids)=>ids.includes(
          globalThis.document.activeElement?.getAttribute('data-task-id') ?? ''),extraTaskIds);
        const focusId=await page.evaluate(()=>globalThis.document.activeElement?.getAttribute('data-task-id'));
        assert.ok(extraTaskIds.includes(focusId));
        const boardAfter=await boardSnapshot(page,project.projectId);
        assert.equal(boardAfter.tasks.filter((item)=>item.boardColumn==='todo').length,2);
        assert.equal(boardAfter.tasks.filter((item)=>item.boardColumn==='done').length,1);
        assert.equal(git('status','--porcelain'),'');
        const boardScreenshot=fileURLToPath(new URL(
          '../output/playwright/p3-12-python-desktop-board-1440x900.png',
          import.meta.url));
        await page.screenshot({path:boardScreenshot});
        console.log(JSON.stringify({stage:'p3-board-gates',todoCount:2,doneCount:1,
          crossColumnRejected:true,filtersNonMutating:true,keyboardReorder:true,
          sourceClean:true,screenshot:boardScreenshot}));
      }
    }
  }
  }

  if ((packagedAcceptance || process.env.FORGE_VERTICAL_REVIEW_ONLY !== '1') &&
      process.env.FORGE_VERTICAL_VERIFY_ONLY !== '1' &&
      (packagedAcceptance || !finalOnly)) {
  if (!contextOnly) {
  // An owned, real Codex app-server is deliberately terminated mid-command.
  // This is a provider-failure path, not a simulated successful Agent result.
  const failureMessage = await invoke(page, 'conversation', 'conversation.send', {
    projectId: project.projectId, conversationId: conversation.conversationId,
    idempotencyKey: 'python-desktop-live-msg-02',
    text: 'Run the fixture hold command and report what happened.', attachmentIds: [],
  });
  const failureDraft = await invoke(page, 'draft', 'draft.manual', {
    projectId: project.projectId, conversationId: conversation.conversationId,
    sourceMessageId: failureMessage.message.messageId,
    idempotencyKey: 'python-desktop-live-draft-02',
  });
  const failureDecisionId = crypto.randomUUID();
  const failureRef = `decision:${failureDecisionId}`;
  const failureContract = { ...contract, taskId: failureDraft.draftId,
    title: 'Trace provider failure',
    goal: 'Run node hold.js in the isolated workspace. Wait for it to finish before doing anything else. Do not skip the command. After it finishes, add a comment to math.js.',
    acceptance: [{ id: 'AC-01', statement: 'Long command completes before edit',
      method: 'inspection', required: true, sourceRefs: [failureRef] }],
    scope: ['hold.js', 'math.js'],
    sourceRefs: [`message:${failureMessage.message.messageId}`, failureRef] };
  const failureRevised = await invoke(page, 'draft', 'draft.revise', {
    projectId: project.projectId, draftId: failureDraft.draftId, expectedRevision: 1,
    contract: failureContract, decisionId: failureDecisionId,
    decisionSummary: 'Provider failure fixture scope reviewed',
    resolvedQuestions: [], removedAcceptanceIds: [], confirmScopeChange: true,
  });
  assert.equal(failureRevised.status, 'proposed');
  const failureApproval = await invoke(page, 'approval', 'approval.request', {
    projectId: project.projectId, draftId: failureDraft.draftId, expectedRevision: 2,
  });
  const failureApproved = await invoke(page, 'approval', 'approval.decide', {
    projectId: project.projectId, decision: { schemaVersion: '1.0',
      approvalId: failureApproval.request.approvalId, decision: 'approve',
      expectedRevision: 2, scopeHash: failureApproval.request.scopeHash,
      reason: 'Failure fixture reviewed' },
  });
  assert.equal(failureApproved.taskState, 'todo');
  const failureRunId = crypto.randomUUID();
  await invoke(page, 'run', 'run.start', { projectId: project.projectId,
    taskId: failureDraft.draftId, expectedTaskRevision: 2,
    modelId, idempotencyKey: failureRunId });
  let failureInspection;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await delay(500);
    failureInspection = await invoke(page, 'run', 'run.inspect', {
      projectId: project.projectId, runId: failureRunId, afterCursor: 0, limit: 100,
    });
    if (failureInspection.observations.some((item) => item.type === 'command.started')) break;
    assert.ok(!['succeeded', 'failed', 'cancelled', 'interrupted'].includes(failureInspection.run.state),
      `Provider finished before the fault probe: ${JSON.stringify(failureInspection)}`);
  }
  assert.ok(failureInspection?.observations.some((item) => item.type === 'command.started'));
  const recordsDir = join(dataDir, 'process-records');
  const records = await Promise.all((await readdir(recordsDir)).filter((name) => name.endsWith('.json'))
    .map(async (name) => JSON.parse(await readFile(join(recordsDir, name), 'utf8'))));
  const owned = records.find((item) => item.runId === failureRunId && item.status === 'running');
  assert.ok(owned && Number.isInteger(owned.pid) && owned.pid > 0);
  if (lifecycleOnly) {
    const hostPid = hostHealth.data.pid;
    await desktop.evaluate(({ dialog }) => {
      globalThis.__forgeLifecycleDialogs = [];
      dialog.showMessageBox = async (...args) => {
        globalThis.__forgeLifecycleDialogs.push(args.at(-1));
        return { response: 0, checkboxChecked: false };
      };
    });
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    const firstDialog = await desktop.evaluate(() => globalThis.__forgeLifecycleDialogs.at(-1));
    assert.equal(firstDialog.title, 'Forge has active work');
    assert.deepEqual(firstDialog.buttons, ['Cancel', 'Keep running in tray', 'Stop safely and quit']);
    assert.match(firstDialog.detail, /computer and user session to remain awake/);
    assert.equal((await invoke(page, 'run', 'run.inspect', {
      projectId: project.projectId, runId: failureRunId, afterCursor: 0, limit: 100,
    })).run.state, 'running');
    await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = async (...args) => {
      globalThis.__forgeLifecycleDialogs.push(args.at(-1));
      return { response: 1, checkboxChecked: false };
    }; });
    const closed = page.waitForEvent('close');
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await closed;
    assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 0);
    assert.equal((await desktop.evaluate(() => globalThis.__forgeLifecycleDialogs.at(-1))).title,
      'Forge has active work');
    process.kill(hostPid, 0);
    process.kill(owned.pid, 0);
    const nextWindow = desktop.waitForEvent('window');
    const second = spawn(requireDesktop('electron'), [desktopDirectory], {
      env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir },
      stdio: 'ignore',
    });
    const secondExit = once(second, 'exit');
    page = await nextWindow;
    const [secondCode] = await secondExit;
    assert.equal(secondCode, 0);
    await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15_000 });
    const reopened = await page.evaluate(() => globalThis.forge.hostHealth());
    assert.equal(reopened.data.pid, hostPid);
    assert.equal((await invoke(page, 'run', 'run.inspect', {
      projectId: project.projectId, runId: failureRunId, afterCursor: 0, limit: 100,
    })).run.state, 'running');
    await desktop.evaluate(({ dialog }) => { dialog.showMessageBox = async (...args) => {
      globalThis.__forgeLifecycleDialogs.push(args.at(-1));
      return { response: 2, checkboxChecked: false };
    }; });
    const exit = desktop.waitForEvent('close');
    void desktop.evaluate(({ app }) => app.quit()).catch(() => {});
    await exit;
    desktop = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { process.kill(hostPid, 0); await delay(100); }
      catch (error) { if (error.code === 'ESRCH') break; throw error; }
    }
    assert.throws(() => process.kill(hostPid, 0), { code: 'ESRCH' });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { process.kill(owned.pid, 0); await delay(100); }
      catch (error) { if (error.code === 'ESRCH') break; throw error; }
    }
    assert.throws(() => process.kill(owned.pid, 0), { code: 'ESRCH' });
    const stopped = JSON.parse(await readFile(join(recordsDir, `${owned.processId}.json`), 'utf8'));
    assert.notEqual(stopped.status, 'running');
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({ stage: 'p6-lifecycle', hostPid, runId: failureRunId,
      cancelledCloseKeptWindow: true, trayKeptHost: true, secondInstanceReusedHost: true,
      safeQuitStoppedOwnedProcess: true, sourceClean: true }));
  } else {
  const cancelScenario = process.env.FORGE_VERTICAL_TERMINATION === 'cancel';
  if (cancelScenario) {
    const cancellation = await invoke(page, 'run', 'run.cancel', {
      projectId: project.projectId, runId: failureRunId,
    });
    assert.equal(cancellation.state, 'cancelled');
  } else {
    process.kill(owned.pid, 'SIGKILL');
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(500);
    failureInspection = await invoke(page, 'run', 'run.inspect', {
      projectId: project.projectId, runId: failureRunId, afterCursor: 0, limit: 100,
    });
    if ((cancelScenario ? ['cancelled', 'interrupted'] : ['failed', 'interrupted'])
      .includes(failureInspection.run.state)) break;
  }
  assert.ok((cancelScenario ? ['cancelled'] : ['failed', 'interrupted'])
    .includes(failureInspection.run.state),
  `Run did not reach expected terminal state: ${JSON.stringify(failureInspection)}`);
  assert.ok(failureInspection.observations.some((item) => item.type ===
    (cancelScenario ? 'run.cancelled' : 'run.failed')));
  if (cancelScenario) {
    const workspaceRecords = join(dataDir, 'workspaces', 'records');
    const workspaces = await Promise.all((await readdir(workspaceRecords))
      .filter((name) => name.endsWith('.json')).map(async (name) =>
        JSON.parse(await readFile(join(workspaceRecords, name), 'utf8'))));
    const ownedWorkspace = workspaces.find((item) => item.ownerRunId === failureRunId);
    assert.ok(ownedWorkspace, 'Run workspace ownership record is missing');
    const workspacePath = ownedWorkspace.rootPath;
    const before = await readFile(join(workspacePath, 'math.js'), 'utf8');
    await delay(2_000);
    assert.equal(await readFile(join(workspacePath, 'math.js'), 'utf8'), before,
      'Cancelled Run continued writing the workspace');
    const stopped = JSON.parse(await readFile(join(recordsDir,
      `${owned.processId}.json`), 'utf8'));
    assert.notEqual(stopped.status, 'running', 'Owned app-server remained active');
    if (packagedAcceptance) {
      const childExited = await new Promise((resolve) => {
        try { process.kill(owned.pid, 0); resolve(false); }
        catch (error) { resolve(error.code === 'ESRCH'); }
      });
      assert.equal(childExited, true, 'Cancelled packaged app-server process still exists');
    }
  }
  assert.equal(await invoke(page, 'run', 'run.handoff', {
    projectId: project.projectId, runId: failureRunId }), null);
  assert.equal(git('status', '--porcelain'), '');
  console.log(JSON.stringify({ stage: 'python-desktop-live', hostPid: hostHealth.data.pid,
    ...successResult,
    failureRunId,
    termination: cancelScenario ? 'user-cancel' : 'provider-kill',
    providerFailure: failureInspection.run.state, failureObservationTypes:
      failureInspection.observations.map((item) => item.type), screenshot }));
  if (packagedAcceptance) {
    await desktop.close();
    desktop = null;
    const reopened = await electron.launch({ executablePath: desktopExecutable,
      args: desktopArgs, env: desktopEnv });
    desktop = reopened;
    const reopenedPage = await reopened.firstWindow();
    await reopenedPage.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
    const restored = await boardSnapshot(reopenedPage, project.projectId);
    assert.equal(restored.tasks.find((item) => item.id === draft.draftId)?.state,
      finalOnly ? 'done' : 'active');
    assert.equal(restored.tasks.find((item) => item.id === failureDraft.draftId)?.state,
      'todo');
    const delivery = finalOnly ? await invoke(reopenedPage, 'run', 'deliveries.get', {
      projectId: project.projectId, taskId: draft.draftId,
    }) : null;
    if (delivery) assert.equal(delivery.snapshotId, successResult.successSnapshotId);
    if (customWorkflow) {
      const frozen = await invoke(reopenedPage, 'run', 'run.config', {
        projectId: project.projectId, runId: successResult.successRunId,
      });
      assert.equal(frozen.workflow.id, workflowRef);
      assert.equal(frozen.workflow.version, '1');
    }
    assert.equal(git('rev-parse', 'HEAD'), sourceHead);
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({ stage: 'packaged-business-restart',
      packagePath: installedApp, projectId: project.projectId,
      taskId: draft.draftId, deliveryId: delivery?.deliveryId ?? null,
      restoredState: finalOnly ? 'done' : 'active', cancelledRunNotDone: true,
      sourceClean: true }));
  }
  }
  }
  }
} finally {
  await desktop?.close();
  if (mounted) execFileSync('hdiutil', ['detach', mount]);
  if (installRoot) await rm(installRoot, { recursive: true, force: true });
  if (process.env.FORGE_VERTICAL_KEEP_FIXTURE === '1') {
    console.error(`Forge fixture retained for diagnosis: ${root}`);
  } else {
    await rm(root, { recursive: true, force: true });
  }
}
