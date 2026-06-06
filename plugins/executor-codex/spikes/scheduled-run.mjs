import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { HostExecutorRegistry } from '../../../apps/host/dist/executors.js';
import { HostRunResources } from '../../../apps/host/dist/run-resources.js';
import { HostRunScheduler } from '../../../apps/host/dist/run-scheduler.js';
import { HostSnapshotService } from '../../../apps/host/dist/snapshots.js';
import { ProjectService } from '../../../apps/host/dist/projects.js';
import { projectTrustVersion } from '../../../packages/contracts/dist/index.js';
import { buildContextBundle, executorContext } from '../../../packages/core/dist/context.js';
import { ForgePersistence } from '../../../packages/persistence/dist/index.js';
import { ProcessController } from '../../../packages/process/dist/index.js';
import { WorkspaceManager } from '../../../packages/workspace/dist/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixture');
const parent = await mkdtemp(join(tmpdir(), 'forge-p2-run-codex-'));
const source = join(parent, 'source project 中文 with spaces');
const canary = join(parent, 'outside-workspace.txt');
const runId = randomUUID();
const runtimeId = randomUUID();
const controller = new ProcessController(runtimeId, join(parent, 'process-records'));
const manager = new WorkspaceManager(join(parent, 'private workspaces'), runtimeId,
  (id) => controller.hasActive(id));
const registry = new HostExecutorRegistry(controller);
const resources = new HostRunResources(registry, manager, controller);
const dataDir = join(parent, 'data');
const storage = new ForgePersistence(dataDir);
let desktopApp;
try {
  await mkdir(source);
  await cp(fixture, source, { recursive: true });
  await writeFile(canary, 'outside unchanged\n');
  execFileSync('git', ['init', '-q', source]);
  execFileSync('git', ['-C', source, 'add', '.']);
  execFileSync('git', ['-C', source, '-c', 'user.name=Forge Fixture',
    '-c', 'user.email=forge-fixture@example.invalid', 'commit', '-qm', 'baseline']);
  const sourceHead = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceStatus = execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' });
  await storage.open(); storage.migrate();
  const projects = new ProjectService(storage);
  const probe = await projects.probe(source);
  const project = await projects.create(source, probe.fingerprint, projectTrustVersion, true, 0);
  const conversation = storage.createConversation(project.projectId, 'Live Run fixture', 0);
  const message = storage.recordUserMessage({ projectId: project.projectId,
    conversationId: conversation.conversationId, idempotencyKey: randomUUID(),
    text: 'Validate add inputs and test it', attachmentIds: [] }).message;
  const draft = storage.beginTaskDraft({ projectId: project.projectId,
    conversationId: conversation.conversationId, sourceMessageId: message.messageId,
    idempotencyKey: randomUUID() }, 'generating', 'fixture');
  const ref = `message:${message.messageId}`;
  const contract = { schemaVersion: '1.0', taskId: draft.draftId, projectId: project.projectId,
    revision: 1, title: 'Validate add inputs', type: 'feature', goal: 'In this fixture workspace, change src/add.js so add(a,b) rejects non-number and non-finite inputs with TypeError. Create a new tests/invalid.test.mjs file with invalid input tests and run npm test.',
    acceptance: [{ id: 'ac1', statement: 'Invalid numbers throw TypeError', method: 'automated',
      required: true, sourceRefs: [ref] }], constraints: [], scope: ['src', 'tests'], outOfScope: [],
    dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [ref],
    workflowRef: 'standard', priority: 'normal' };
  storage.finishTaskDraft(project.projectId, draft.draftId,
    { intent: 'new_task', contract, errorCode: null });
  const approval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 1 });
  storage.decideTaskApproval({ projectId: project.projectId, decision: {
    schemaVersion: '1.0', approvalId: approval.request.approvalId,
    decision: 'approve', expectedRevision: 1, scopeHash: approval.request.scopeHash, reason: '' } });
  const config = storage.createRunConfig({ runId, projectId: project.projectId,
    taskId: draft.draftId, expectedTaskRevision: 1,
    workflow: { id: 'standard', version: 'fixture-v1', contentHash: 'a'.repeat(64) },
    profile: { id: 'developer', version: 'fixture-v1', contentHash: 'b'.repeat(64),
      executorPluginId: 'executor.codex' },
    plugins: [{ id: 'executor.codex', version: '0.155.1', contentHash: 'c'.repeat(64) }],
    budget: { maxDurationMs: 180_000, maxTurns: 10, maxTokens: 50_000, maxToolCalls: 100 },
    environmentId: project.environmentId, expectedEnvironmentRevision: 1 });
  const bundle = storage.saveContextBundle(buildContextBundle(config, null));
  await manager.open();
  const created = await manager.create({ sourceRepo: source, ownerRunId: runId, mode: 'task-branch' });
  const workspace = await manager.acquire(created.workspaceId, runId);
  const capability = await registry.resolve('executor.codex').probe();
  assert.equal(capability.available, true, `Codex unavailable: ${capability.warnings.join('; ')}`);
  assert.equal(capability.workspaceControl, true, 'Codex workspace control has no matching live evidence');
  const model = capability.modelIds.includes('gpt-6-luna') ? 'gpt-6-luna' : capability.modelIds[0];
  assert.ok(model, 'Codex did not report an available model');
  const events = [];
  registry.onEvent((event) => events.push(event));
  const attemptId = randomUUID();
  const intent = { runId, projectId: project.projectId, taskId: draft.draftId, attemptId,
    workspaceId: workspace.workspaceId, workspaceLeaseId: workspace.activeLeaseId,
    leaseEpoch: workspace.leaseEpoch, baseRevision: workspace.baseRevision,
    nodeId: 'develop', executorId: 'executor.codex', configHash: config.snapshotHash,
    createdAt: new Date().toISOString() };
  const scheduler = new HostRunScheduler(storage, resources, manager, controller, registry);
  const run = await scheduler.execute(intent, workspace, {
    runId, taskId: draft.draftId, goal: bundle.goal,
    context: executorContext(bundle), permission: 'workspace-write', approval: 'never', model, maxDurationMs: 180_000,
    attempt: { attemptId, leaseEpoch: workspace.leaseEpoch,
      workspaceLeaseId: workspace.activeLeaseId, contractRevision: 1,
      contextBundleId: bundle.bundleId, profileRevision: 1,
      outputSchemaId: 'plain-text-v1' },
  });
  assert.equal(run.state, 'succeeded');
  assert.equal(run.attempt.state, 'succeeded');
  assert.ok(run.attempt.nativeSessionRef);
  const checkpoint = storage.latestWorkingCheckpoint(project.projectId,runId);
  assert.ok(checkpoint && checkpoint.sequence>=1);
  assert.equal(checkpoint.objective.text,bundle.goal);
  assert.ok(checkpoint.completedActions.length>0);
  assert.equal(manager.inspect(workspace.workspaceId).activeLeaseId, null);
  assert.equal(storage.boardSnapshot(project.projectId).tasks.find((task) => task.id === draft.draftId).state,
    'active', 'A real development Run projects as active until Review/Verify');
  const code = await readFile(join(workspace.rootPath, 'src/add.js'), 'utf8');
  assert.match(code, /TypeError/);
  const testOutput = execFileSync('npm', ['test'], { cwd: workspace.rootPath, encoding: 'utf8' });
  assert.match(testOutput, /pass/);
  const changedFiles = execFileSync('git', ['-C', workspace.rootPath, 'status', '--porcelain'],
    { encoding: 'utf8' }).trimEnd().split('\n').filter(Boolean).map((line) => line.slice(3)).sort();
  assert.ok(changedFiles.includes('src/add.js'));
  assert.ok(changedFiles.includes('tests/invalid.test.mjs'), 'Codex must create a new tracked-by-snapshot test file');
  assert.equal(execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHead);
  assert.equal(execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' }), sourceStatus);
  assert.equal(await readFile(canary, 'utf8'), 'outside unchanged\n');
  const types = new Set(events.map((event) => event.type));
  for (const required of ['run.started', 'assistant.message', 'command.started',
    'command.completed', 'file.changed', 'run.completed']) assert.ok(types.has(required), `${required} missing`);
  assert.ok(events.every((event, index) => event.runId === runId && event.sequence === index + 1));
  assert.equal(events.at(-1).providerSessionId, run.attempt.nativeSessionRef);
  const inspection = storage.inspectRun(project.projectId, runId, 0, 100);
  assert.equal(inspection.run.state, 'succeeded');
  let inspectionPage = inspection;
  const observedTypes = new Set(inspectionPage.observations.map((event) => event.type));
  while (inspectionPage.hasMore) {
    inspectionPage = storage.inspectRun(project.projectId, runId, inspectionPage.nextCursor, 100);
    for (const event of inspectionPage.observations) observedTypes.add(event.type);
  }
  assert.ok(observedTypes.has('run.completed'));
  assert.ok(inspection.contextSources.some((source) => source.sourceKind === 'approved_task/goal'));
  assert.deepEqual(inspection.diff.files.map((file) => file.path).sort(), changedFiles);
  assert.match(inspection.diff.text, /TypeError/);
  assert.equal(inspection.usage?.cost ?? null, null, 'unknown provider cost is never reported as zero');
  assert.equal(storage.listTaskRuns(project.projectId, draft.draftId)[0].runId,runId);
  const handoff=await new HostSnapshotService(storage,manager,controller).freeze({
    projectId:project.projectId,runId,workspaceId:workspace.workspaceId,
    contextBundleId:bundle.bundleId,workflowRevision:1 });
  assert.equal(handoff.snapshot.noChange,false);
  assert.deepEqual(handoff.snapshot.files.map((file)=>file.path).sort(),changedFiles);
  assert.equal(handoff.stepResult.outcome,'ready');
  assert.ok(handoff.stepResult.acceptanceResults.every((item)=>item.status==='unverified'),
    'fixture tests do not establish formal Verify results');
  assert.equal(execFileSync('git',['-C',source,'rev-parse',
    `refs/forge/snapshots/${handoff.snapshot.snapshotId}`],{encoding:'utf8'}).trim(),
  handoff.snapshot.commitSha);
  assert.equal(execFileSync('git',['-C',source,'rev-parse',
    `${handoff.snapshot.commitSha}^{tree}`],{encoding:'utf8'}).trim(),handoff.snapshot.treeSha);
  storage.close();
  const reopened = new ForgePersistence(dataDir); await reopened.open(); reopened.migrate();
  assert.deepEqual(reopened.getRun(project.projectId, runId), run);
  assert.deepEqual(reopened.getContextBundle(project.projectId, bundle.bundleId), bundle);
  assert.deepEqual(reopened.latestWorkingCheckpoint(project.projectId,runId),checkpoint);
  assert.deepEqual(reopened.inspectRun(project.projectId,runId,0,100),inspection);
  assert.deepEqual(reopened.getDevelopmentHandoff(project.projectId,runId),handoff);
  reopened.close();
  const desktopRequire=createRequire(new URL('../../../apps/desktop/package.json',import.meta.url));
  const desktopDirectory=fileURLToPath(new URL('../../../apps/desktop/',import.meta.url));
  desktopApp=await electron.launch({executablePath:desktopRequire('electron'),args:[desktopDirectory],
    env:{...process.env,FORGE_DEV_SERVER_URL:'',FORGE_HOST_DATA_DIR:dataDir}});
  const page=await desktopApp.firstWindow();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Host connected'}).waitFor({timeout:15000});
  await page.getByRole('button',{name:'研发看板'}).click();
  await page.locator('.board-task').first().waitFor();
  await page.locator('.board-task').first().click();
  await page.getByRole('dialog',{name:'任务详情'}).waitFor();
  await page.locator('.run-events').waitFor({timeout:10000});
  const completedEvent=page.locator('.run-events strong').filter({hasText:'run.completed'});
  for(let index=0;index<30 && await completedEvent.count()===0;index++) {
    await page.getByRole('button',{name:'加载更多'}).click();
  }
  await completedEvent.waitFor({timeout:10000});
  await page.getByRole('tab',{name:'diff'}).click();
  await page.getByText('TypeError',{exact:false}).first().waitFor();
  const output=resolve('output/playwright');await mkdir(output,{recursive:true});
  const screenshot=join(output,'p2-07-run-inspector-1440x900.png');
  await page.screenshot({path:screenshot});
  assert.equal(await page.locator('.run-inspector script').count(),0);
  await desktopApp.close();desktopApp=null;
  await manager.release(workspace.workspaceId, { discardChanges: true });
  console.log(JSON.stringify({ result: 'pass', model, runState: run.state,
    attemptState: run.attempt.state, taskNotDone: true,
    sessionRefPresent: Boolean(run.attempt.nativeSessionRef), eventTypes: [...types],
    eventCount: events.length, changedFiles, sourceHead, sourceUnchanged: true,
    fixtureTestsPassed: true, persistedAfterRestart: true, contextBundlePersisted: true,
    checkpointSequence:checkpoint.sequence,checkpointActions:checkpoint.completedActions.length,
    inspectionEvents:inspection.observations.length,diffFiles:inspection.diff.files.length,
    snapshotId:handoff.snapshot.snapshotId,snapshotFiles:handoff.snapshot.files.length,
    handoffArtifactId:handoff.artifact.artifactId,formalAcceptanceUnverified:true,
    usageCostKnown:inspection.usage?.cost !== null && inspection.usage?.cost !== undefined,
    desktopRunVisible:true,screenshot }));
} finally {
  await desktopApp?.close();
  storage.close();
  await registry.dispose().catch(() => {});
  await controller.dispose().catch(() => {});
  await manager.dispose().catch(() => {});
  await rm(parent, { recursive: true, force: true });
}
