import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { projectTrustVersion } from '@forge/contracts';
import { retry429 } from '@forge/core/run';
import { buildContextBundle, describeRecoveredProgress, executorContext } from '@forge/core/context';
import { ExecutorError } from '@forge/plugin-api';
import { ForgePersistence } from '@forge/persistence';
import { ProcessController } from '@forge/process';
import { WorkspaceManager } from '@forge/workspace';
import { HostExecutorRegistry } from '../dist/executors.js';
import { ProjectService } from '../dist/projects.js';
import { HostRunResources } from '../dist/run-resources.js';
import { HostRunScheduler } from '../dist/run-scheduler.js';
import { HostSnapshotService } from '../dist/snapshots.js';
import { launchWithFiniteRateLimitRetry } from '../dist/run-scheduler.js';
import { RunObservationRecorder, captureRunDiff, redactRunText } from '../dist/run-observation.js';

const Database = createRequire(new URL('../../../packages/persistence/package.json', import.meta.url))('better-sqlite3');

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'forge-run-scheduler-'));
  const source = join(root, 'source repo 中文'); await mkdir(source);
  execFileSync('git', ['init', '-q', source]);
  await writeFile(join(source, 'source.txt'), 'unchanged\n');
  execFileSync('git', ['-C', source, 'add', '.']);
  execFileSync('git', ['-C', source, '-c', 'user.name=Forge Fixture',
    '-c', 'user.email=forge-fixture@example.invalid', 'commit', '-qm', 'baseline']);
  const storage = new ForgePersistence(join(root, 'data')); await storage.open(); storage.migrate();
  t.after(() => storage.close());
  const projects = new ProjectService(storage);
  const probe = await projects.probe(source);
  const project = await projects.create(source, probe.fingerprint, projectTrustVersion, true, 0);
  const conversation = storage.createConversation(project.projectId, 'Run source', 0);
  const message = storage.recordUserMessage({ projectId: project.projectId,
    conversationId: conversation.conversationId, idempotencyKey: randomUUID(),
    text: 'Improve input validation', attachmentIds: [] }).message;
  const draft = storage.beginTaskDraft({ projectId: project.projectId,
    conversationId: conversation.conversationId, sourceMessageId: message.messageId,
    idempotencyKey: randomUUID() }, 'generating', 'fixture');
  const ref = `message:${message.messageId}`;
  const contract = { schemaVersion: '1.0', taskId: draft.draftId, projectId: project.projectId,
    revision: 1, title: 'Input validation', type: 'feature', goal: 'Reject invalid input',
    acceptance: [{ id: 'ac1', statement: 'Invalid input yields error', method: 'automated',
      required: true, sourceRefs: [ref] }], constraints: [], scope: ['src'], outOfScope: [],
    dependencies: [], openQuestions: [], assumptions: [], sourceRefs: [ref],
    workflowRef: 'standard', priority: 'normal' };
  storage.finishTaskDraft(project.projectId, draft.draftId,
    { intent: 'new_task', contract, errorCode: null });
  const approval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 1 });
  storage.decideTaskApproval({ projectId: project.projectId, decision: {
    schemaVersion: '1.0', approvalId: approval.request.approvalId, decision: 'approve',
    expectedRevision: 1, scopeHash: approval.request.scopeHash, reason: '' } });
  const manager = new WorkspaceManager(join(root, 'managed'), randomUUID(), () => false);
  await manager.open();
  t.after(async () => { await manager.dispose(); await rm(root, { recursive: true, force: true }); });
  const selection = (runId, maxDurationMs = 60_000) => ({ runId,
    projectId: project.projectId, taskId: draft.draftId,
    expectedTaskRevision: 1,
    workflow: { id: 'standard', version: '1.0', contentHash: 'a'.repeat(64) },
    profile: { id: 'developer', version: '1.0', contentHash: 'b'.repeat(64),
      executorPluginId: 'executor.codex' },
    plugins: [{ id: 'executor.codex', version: '0.155.1', contentHash: 'c'.repeat(64) }],
    budget: { maxDurationMs, maxTurns: 3, maxTokens: 10_000, maxToolCalls: 20 },
    environmentId: project.environmentId, expectedEnvironmentRevision: 1 });
  const prepare = async (maxDurationMs = 60_000) => {
    const runId = randomUUID();
    const config = storage.createRunConfig(selection(runId, maxDurationMs));
    const bundle = storage.saveContextBundle(buildContextBundle(config, null));
    const created = await manager.create({ sourceRepo: source, ownerRunId: runId, mode: 'task-branch' });
    const workspace = await manager.acquire(created.workspaceId, runId);
    const intent = { runId, projectId: project.projectId, taskId: draft.draftId,
      attemptId: randomUUID(), workspaceId: workspace.workspaceId,
      workspaceLeaseId: workspace.activeLeaseId, leaseEpoch: workspace.leaseEpoch,
      baseRevision: workspace.baseRevision, nodeId: 'develop', executorId: 'executor.codex',
      configHash: config.snapshotHash, createdAt: new Date().toISOString() };
    return { config, bundle, workspace, intent };
  };
  return { root, source, storage, project, manager, prepare };
}

test('durable queued intent, one writer and stale result cannot advance newer Run', async (t) => {
  const { root, storage, project, manager, prepare, source } = await fixture(t);
  const first = await prepare();
  const queued = storage.beginRun(first.intent);
  assert.equal(queued.state, 'queued');
  assert.equal(queued.attempt.state, 'pending');
  assert.deepEqual(storage.beginRun(first.intent), queued);
  const reopened = new ForgePersistence(join(root, 'data'));
  await reopened.open(); reopened.migrate();
  assert.deepEqual(reopened.getRun(project.projectId, first.intent.runId), queued);
  reopened.close();
  const next = await prepare();
  assert.throws(() => storage.beginRun(next.intent), { code: 'RUN_CONFLICT' });
  const running = storage.markRunLaunched(project.projectId, first.intent.runId,
    first.intent.attemptId, 'fixture-session');
  assert.equal(running.state, 'running');
  assert.equal(running.attempt.nativeSessionRef, 'fixture-session');
  assert.throws(() => storage.markRunLaunched(project.projectId, first.intent.runId,
    first.intent.attemptId, 'duplicate-session'), { code: 'RUN_STALE' });
  const result = { runId: first.intent.runId, attemptId: first.intent.attemptId,
    workspaceLeaseId: first.workspace.activeLeaseId, leaseEpoch: first.workspace.leaseEpoch,
    contractRevision: 1, configHash: first.config.snapshotHash, outcome: 'completed',
    providerSessionRef: 'fixture-session', lastEventSequence: 7, timestamp: new Date().toISOString() };
  assert.throws(() => storage.completeRun(project.projectId, first.intent.runId, result, false),
    { code: 'RUN_PROCESS_UNCONFIRMED' });
  assert.equal(storage.getRun(project.projectId, first.intent.runId).state, 'running');
  assert.equal(storage.completeRun(project.projectId, first.intent.runId,
    { ...result, leaseEpoch: 999 }, true).disposition, 'STALE_RESULT');
  assert.equal(storage.completeRun(project.projectId, first.intent.runId, result, true).disposition, 'APPLIED');
  assert.equal(storage.completeRun(project.projectId, first.intent.runId, result, true).disposition,
    'DUPLICATE_RESULT');
  await manager.release(first.workspace.workspaceId);
  const second = storage.beginRun(next.intent);
  assert.equal(second.state, 'queued');
  storage.markRunLaunched(project.projectId, next.intent.runId, next.intent.attemptId, 'second-session');
  assert.equal(storage.completeRun(project.projectId, next.intent.runId, result, true).disposition,
    'STALE_RESULT');
  assert.equal(storage.getRun(project.projectId, next.intent.runId).state, 'running');
  assert.equal(execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' }), '');
});

test('cancel intent is durable and only a confirmed stop can release the writer lease', async (t) => {
  const { root, storage, project, manager, prepare } = await fixture(t);
  const { config, workspace, intent } = await prepare();
  storage.beginRun(intent);
  const canceling = storage.requestRunCancellation(project.projectId, intent.runId,
    intent.attemptId, 'user');
  assert.equal(canceling.state, 'canceling');
  assert.equal(storage.requestRunCancellation(project.projectId, intent.runId,
    intent.attemptId, 'user').revision, canceling.revision);
  assert.equal(storage.markRunLaunched(project.projectId, intent.runId,
    intent.attemptId, 'provider-session').state, 'canceling');
  const reopened = new ForgePersistence(join(root, 'data'));
  await reopened.open(); reopened.migrate();
  assert.equal(reopened.getRun(project.projectId, intent.runId).state, 'canceling');
  reopened.close();
  const result = { runId: intent.runId, attemptId: intent.attemptId,
    workspaceLeaseId: intent.workspaceLeaseId, leaseEpoch: intent.leaseEpoch,
    contractRevision: 1, configHash: config.snapshotHash, outcome: 'cancelled',
    providerSessionRef: 'provider-session', lastEventSequence: 1,
    timestamp: new Date().toISOString() };
  assert.throws(() => storage.completeRun(project.projectId, intent.runId, result, false),
    { code: 'RUN_PROCESS_UNCONFIRMED' });
  assert.equal(storage.getRun(project.projectId, intent.runId).state, 'canceling');
  assert.equal(storage.completeRun(project.projectId, intent.runId,
    { ...result, outcome: 'completed' }, true).disposition, 'STALE_RESULT');
  assert.equal(storage.completeRun(project.projectId, intent.runId, result, true).run.state,
    'cancelled');
  assert.equal(storage.completeRun(project.projectId, intent.runId, result, true).disposition,
    'DUPLICATE_RESULT');
  await manager.releaseLease(workspace.workspaceId, intent.workspaceLeaseId);
  assert.equal(manager.inspect(workspace.workspaceId).status, 'ready');
});

test('working checkpoint survives restart, stays project-scoped and never claims process resumed', async (t) => {
  const { root, storage, project, prepare } = await fixture(t);
  const { config, bundle, intent } = await prepare();
  assert.deepEqual(storage.getContextBundle(project.projectId,bundle.bundleId),bundle);
  assert.deepEqual(storage.saveContextBundle(bundle),bundle);
  assert.throws(()=>storage.saveContextBundle({...bundle,goal:'tampered'}),
    {code:'CONTEXT_INVALID'});
  assert.equal(storage.getContextBundle(randomUUID(),bundle.bundleId),null);
  storage.beginRun(intent);
  storage.markRunLaunched(project.projectId,intent.runId,intent.attemptId,'fixture-session');
  const checkpoint={checkpointId:randomUUID(),projectId:project.projectId,runId:intent.runId,
    attemptId:intent.attemptId,sequence:1,
    objective:{text:config.taskContract.goal,sourceRef:`task:${intent.taskId}@1`},
    completedActions:[{text:'Read src and identified input path',sourceRef:'event:1'}],
    openIssues:[{text:'Validation still pending',sourceRef:'event:2'}],
    budget:{elapsedMs:1000,turnsUsed:1,tokensUsed:null,toolCallsUsed:1},
    createdAt:new Date().toISOString()};
  assert.deepEqual(storage.appendWorkingCheckpoint(checkpoint),checkpoint);
  const resumedBundle=storage.saveContextBundle(buildContextBundle(config,checkpoint));
  assert.equal(resumedBundle.checkpointId,checkpoint.checkpointId);
  assert.ok(executorContext(resumedBundle).some(line=>line.includes('event:1')));
  assert.throws(()=>storage.appendWorkingCheckpoint(checkpoint),{code:'CONTEXT_CONFLICT'});
  assert.throws(()=>storage.appendWorkingCheckpoint({...checkpoint,checkpointId:randomUUID(),
    sequence:2,projectId:randomUUID()}),{code:'CONTEXT_CONFLICT'});
  const reopened=new ForgePersistence(join(root,'data')); await reopened.open(); reopened.migrate();
  assert.deepEqual(reopened.latestWorkingCheckpoint(project.projectId,intent.runId),checkpoint);
  const recovered=describeRecoveredProgress(reopened.latestWorkingCheckpoint(project.projectId,intent.runId));
  assert.equal(recovered.objective,config.taskContract.goal);
  assert.deepEqual(recovered.completedActions,['Read src and identified input path']);
  assert.equal(recovered.processState,'unverified');
  assert.deepEqual(reopened.getContextBundle(project.projectId,bundle.bundleId),bundle);
  assert.deepEqual(reopened.getContextBundle(project.projectId,resumedBundle.bundleId),resumedBundle);
  assert.equal(reopened.latestWorkingCheckpoint(randomUUID(),intent.runId),null);
  assert.equal(reopened.getRun(project.projectId,intent.runId).state,'running',
    'persisted Run state is historical; no provider process is inferred from it');
  reopened.close();
  const db = new Database(join(root,'data','forge.sqlite'));
  assert.throws(()=>db.prepare('UPDATE context_bundles SET content_hash=? WHERE bundle_id=?')
    .run('f'.repeat(64),bundle.bundleId),/immutable/);
  assert.throws(()=>db.prepare('DELETE FROM working_checkpoints WHERE checkpoint_id=?')
    .run(checkpoint.checkpointId),/immutable/);
  db.close();
});

test('Run inspection persists bounded redacted events, cursor pages, real usage and real diff', async (t) => {
  const { root, source, storage, project, prepare } = await fixture(t);
  const { workspace, intent } = await prepare();
  storage.beginRun(intent);
  const failures = [];
  const recorder = new RunObservationRecorder(storage, project.projectId, intent.runId,
    intent.attemptId, (error) => failures.push(error));
  const at = new Date().toISOString();
  const event = (sequence, type, fields = {}) => ({ runId:intent.runId,sequence,timestamp:at,type,...fields });
  recorder.accept(event(1,'run.started',{providerSessionId:'real-session'}));
  recorder.accept(event(2,'assistant.message',{text:'Output <script>globalThis.pwned=1</script> '}));
  recorder.accept(event(3,'assistant.message',{text:'API_KEY=sk-abcdefghijklmnopqrstuvwxyz'}));
  recorder.accept(event(4,'command.started',{commandId:'cmd1',command:'echo password=private'}));
  recorder.accept(event(5,'usage.updated',{inputTokens:12,outputTokens:4,
    cachedInputTokens:null,cost:null,currency:null}));
  recorder.flush(); recorder.dispose();
  assert.deepEqual(failures,[]);
  await writeFile(join(workspace.rootPath,'source.txt'),'changed\n');
  await writeFile(join(workspace.rootPath,'new.txt'),'new file\n');
  await writeFile(join(workspace.rootPath,'large.txt'),'x'.repeat(20_000));
  await writeFile(join(workspace.rootPath,'.env'),'API_KEY=private\n');
  storage.saveRunDiff(project.projectId,intent.runId,await captureRunDiff(workspace));
  const first = storage.inspectRun(project.projectId,intent.runId,0,2);
  assert.equal(first.run.runId,intent.runId);
  assert.equal(first.observations.length,2);
  assert.equal(first.hasMore,true);
  assert.equal(first.observations[1].sourceSequenceFrom,2);
  assert.equal(first.observations[1].sourceSequenceTo,3);
  assert.match(first.observations[1].text,/\[REDACTED\]/);
  const second = storage.inspectRun(project.projectId,intent.runId,first.nextCursor,10);
  assert.equal(second.observations[0].type,'command.started');
  assert.doesNotMatch(second.observations[0].text,/password=private/);
  assert.equal(second.usage.inputTokens,12);
  assert.equal(second.usage.cost,null);
  assert.throws(()=>storage.appendRunObservation(project.projectId,{runId:intent.runId,
    attemptId:intent.attemptId,sourceSequenceFrom:3,sourceSequenceTo:3,type:'run.status',
    text:'reordered',timestamp:at}),{code:'RUN_CONFLICT'});
  assert.ok(second.diff.files.some((file)=>file.path==='source.txt'));
  assert.ok(second.diff.files.some((file)=>file.path==='new.txt'));
  assert.ok(second.diff.files.some((file)=>file.path==='large.txt'));
  assert.equal(second.diff.truncated,true);
  assert.ok(!second.diff.files.some((file)=>file.path==='.env'));
  assert.match(second.diff.text,/changed/);
  assert.doesNotMatch(second.diff.text,/API_KEY=private/);
  assert.equal(execFileSync('git',['-C',source,'status','--porcelain'],{encoding:'utf8'}),'');
  assert.deepEqual(storage.listTaskRuns(project.projectId,intent.taskId).map((run)=>run.runId),[intent.runId]);
  assert.equal(storage.listTaskRuns(randomUUID(),intent.taskId).length,0);
  assert.throws(()=>storage.inspectRun(randomUUID(),intent.runId,0,10),{code:'RUN_NOT_FOUND'});
  const reopened = new ForgePersistence(join(root,'data')); await reopened.open(); reopened.migrate();
  assert.equal(reopened.inspectRun(project.projectId,intent.runId,0,10).observations.length,4);
  reopened.close();
  assert.equal(redactRunText('Authorization: Bearer private'), 'Authorization: Bearer [REDACTED]');
  assert.equal(redactRunText('Cookie: sid=private'), 'Cookie: [REDACTED]');
  assert.equal(redactRunText('OPENAI_API_KEY=private'), 'OPENAI_API_KEY=[REDACTED]');
});

test('100+ events per second are coalesced and terminal state remains observable',async(t)=>{
  const {storage,project,prepare}=await fixture(t);
  const {intent}=await prepare();storage.beginRun(intent);
  const errors=[];const recorder=new RunObservationRecorder(storage,project.projectId,intent.runId,
    intent.attemptId,(error)=>errors.push(error));
  const at=new Date().toISOString();
  recorder.accept({runId:intent.runId,sequence:1,timestamp:at,type:'run.started',providerSessionId:'fixture'});
  for(let sequence=2;sequence<=501;sequence++) recorder.accept({runId:intent.runId,sequence,
    timestamp:at,type:'assistant.message',text:'x'});
  recorder.accept({runId:intent.runId,sequence:502,timestamp:at,type:'run.completed',
    providerSessionId:'fixture',structuredOutput:null});
  recorder.dispose();assert.deepEqual(errors,[]);
  const page=storage.inspectRun(project.projectId,intent.runId,0,100);
  assert.equal(page.observations.length,3);
  assert.equal(page.observations[1].sourceSequenceFrom,2);
  assert.equal(page.observations[1].sourceSequenceTo,501);
  assert.equal(page.observations[2].type,'run.completed');
});

test('checkpoint records observed budget overage instead of hiding real usage', async (t) => {
  const { storage, project, prepare } = await fixture(t);
  const { config, intent } = await prepare();
  storage.beginRun(intent);
  storage.markRunLaunched(project.projectId,intent.runId,intent.attemptId,'fixture-session');
  const observed={checkpointId:randomUUID(),projectId:project.projectId,runId:intent.runId,
    attemptId:intent.attemptId,sequence:1,
    objective:{text:config.taskContract.goal,sourceRef:`task:${intent.taskId}@1`},
    completedActions:[],openIssues:[],budget:{elapsedMs:61_000,turnsUsed:null,
      tokensUsed:11_000,toolCallsUsed:21},createdAt:new Date().toISOString()};
  assert.deepEqual(storage.appendWorkingCheckpoint(observed),observed);
  assert.deepEqual(storage.latestWorkingCheckpoint(project.projectId,intent.runId).budget,
    observed.budget);
});

test('unknown launch quarantines DB lease and blocks another write Run', async (t) => {
  const { storage, project, prepare } = await fixture(t);
  const first = await prepare();
  storage.beginRun(first.intent);
  const unknown = storage.interruptRunUncertain(project.projectId, first.intent.runId,
    first.intent.attemptId, 'launch_unknown');
  assert.equal(unknown.state, 'interrupted');
  assert.equal(unknown.attempt.state, 'interrupted');
  const next = await prepare();
  assert.throws(() => storage.beginRun(next.intent), { code: 'RUN_CONFLICT' });
});

test('exhausted no-side-effect rate limit blocks without claiming a launched process', async (t) => {
  const { storage, project, manager, prepare } = await fixture(t);
  const first = await prepare();
  storage.beginRun(first.intent);
  const blocked = storage.blockRunWithoutSideEffect(project.projectId, first.intent.runId,
    first.intent.attemptId, 'rate_limit_exhausted');
  assert.equal(blocked.state, 'waiting_input');
  assert.equal(blocked.attempt.state, 'failed');
  assert.equal(blocked.attempt.nativeSessionRef, null);
  await manager.releaseLease(first.workspace.workspaceId, first.workspace.activeLeaseId);
  const next = await prepare();
  assert.throws(() => storage.beginRun(next.intent), { code: 'RUN_CONFLICT' });
});

test('only explicit no-side-effect 429 retries with finite budget', () => {
  assert.equal(retry429({ status: 429, sideEffect: 'none', retryNo: 0,
    maxRetries: 2, remainingDurationMs: 5000 }), 1000);
  assert.equal(retry429({ status: 429, sideEffect: 'none', retryNo: 2,
    maxRetries: 2, remainingDurationMs: 5000 }), null);
  assert.equal(retry429({ status: 429, sideEffect: 'possible', retryNo: 0,
    maxRetries: 2, remainingDurationMs: 5000 }), null);
  assert.equal(retry429({ status: 429, sideEffect: 'none', retryNo: 0,
    maxRetries: 2, remainingDurationMs: 500 }), null);
});

test('scheduler retries explicit no-side-effect rate limits but never uncertain side effects', async () => {
  let attempts = 0;
  const waits = [];
  const safeLimit = () => new ExecutorError('EXECUTOR_RATE_LIMITED', 'rate limited',
    { httpStatus: 429, sideEffect: 'none' });
  const result = await launchWithFiniteRateLimitRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw safeLimit();
    return 'launched';
  }, Date.now() + 20_000, 2, async (ms) => { waits.push(ms); });
  assert.equal(result, 'launched');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [1000, 2000]);
  await assert.rejects(launchWithFiniteRateLimitRetry(async () => {
    throw new ExecutorError('EXECUTOR_RATE_LIMITED', 'unknown side effect',
      { httpStatus: 429, sideEffect: 'possible' });
  }, Date.now() + 20_000, 3, async () => { throw new Error('must not wait'); }),
  { code: 'EXECUTOR_RATE_LIMITED' });
  await assert.rejects(launchWithFiniteRateLimitRetry(async () => { throw safeLimit(); },
    Date.now() + 100, 3, async () => { throw new Error('must not wait'); }),
  { code: 'EXECUTOR_RATE_LIMITED' });
});

test('Host scheduler persists bounded 429 block without a provider process or false completion', async (t) => {
  const { storage, project, manager, prepare } = await fixture(t);
  const { workspace, intent, bundle } = await prepare();
  const processes = new ProcessController();
  const registry = new HostExecutorRegistry(processes);
  let calls = 0;
  registry.adapters.set('executor.codex', { id: 'executor.codex', dispose: async () => {},
    probe: async () => ({ available: true, workspaceControl: true, streaming: true, modelIds: [] }),
    start: async () => { calls += 1; throw new ExecutorError('EXECUTOR_RATE_LIMITED', 'fixture 429',
      { httpStatus: 429, sideEffect: 'none' }); },
  });
  const scheduler = new HostRunScheduler(storage,
    new HostRunResources(registry, manager, processes), manager, processes, registry);
  try {
    const request = { runId: intent.runId,
      taskId: intent.taskId, goal: bundle.goal, context: executorContext(bundle), permission: 'read-only',
      approval: 'never', maxDurationMs: 60_000,
      attempt: { attemptId: intent.attemptId, leaseEpoch: intent.leaseEpoch,
        workspaceLeaseId: intent.workspaceLeaseId, contractRevision: 1,
        contextBundleId: bundle.bundleId, profileRevision: 1, outputSchemaId: 'plain-text' } };
    await assert.rejects(scheduler.execute(intent,workspace,{...request,context:['forged instruction']}),
      /do not match/);
    assert.equal(calls,0);
    assert.equal(storage.getRun(project.projectId,intent.runId),null);
    const run = await scheduler.execute(intent, workspace, request);
    assert.equal(calls, 3);
    assert.equal(run.state, 'waiting_input');
    assert.equal(run.attempt.state, 'failed');
    assert.equal(run.attempt.nativeSessionRef, null);
    assert.equal(manager.inspect(workspace.workspaceId).status, 'ready');
    assert.equal(storage.getRun(project.projectId, intent.runId).state, 'waiting_input');
  } finally { await registry.dispose(); }
});

test('a provider failure with confirmed process exit remains a failed Run with saved trace', async (t) => {
  const { storage, project, manager, prepare } = await fixture(t);
  const { workspace, intent, bundle } = await prepare();
  const processes = new ProcessController();
  const registry = new HostExecutorRegistry(processes);
  registry.adapters.set('executor.codex', { id:'executor.codex', dispose:async()=>{},
    probe:async()=>({available:true,workspaceControl:true,streaming:true,modelIds:[]}),
    start:async(request)=>{
      const listeners = new Set();
      let rejectCompletion;
      const completion = new Promise((_,reject)=>{ rejectCompletion=reject; });
      const events = [
        {type:'run.started',runId:request.runId,sequence:1,timestamp:new Date().toISOString(),
          providerSessionId:'failed-provider-fixture'},
        {type:'run.failed',runId:request.runId,sequence:2,timestamp:new Date().toISOString(),
          code:'EXECUTOR_RUNTIME_ERROR',message:'Fixture provider failed'},
      ];
      setTimeout(()=>{
        for(const event of events) for(const listener of listeners) listener(event);
        rejectCompletion(new ExecutorError('EXECUTOR_RUNTIME_ERROR','Fixture provider failed'));
      },20);
      return {runId:request.runId,providerSessionId:'failed-provider-fixture',completion,
        cancel:async()=>{},interrupt:async()=>{},dispose:async()=>{},
        subscribe:(listener)=>{listeners.add(listener);return()=>listeners.delete(listener)} };
    },
  });
  const scheduler = new HostRunScheduler(storage,
    new HostRunResources(registry,manager,processes),manager,processes,registry);
  try {
    const run=await scheduler.execute(intent,workspace,{runId:intent.runId,taskId:intent.taskId,
      goal:bundle.goal,context:executorContext(bundle),permission:'read-only',approval:'never',
      maxDurationMs:60_000,attempt:{attemptId:intent.attemptId,leaseEpoch:intent.leaseEpoch,
        workspaceLeaseId:intent.workspaceLeaseId,contractRevision:1,
        contextBundleId:bundle.bundleId,profileRevision:1,outputSchemaId:'plain-text'}});
    assert.equal(run.state,'failed');
    assert.equal(run.attempt.state,'failed');
    assert.equal(processes.hasActive(intent.runId),false);
    assert.equal(manager.inspect(workspace.workspaceId).status,'ready');
    assert.ok(storage.inspectRun(project.projectId,intent.runId,0,100).observations
      .some((item)=>item.type==='run.failed'));
    assert.equal(storage.getDevelopmentHandoff(project.projectId,intent.runId),null);
  } finally { await registry.dispose(); }
});

test('scheduler cancellation stops an owned process tree before releasing the workspace', async (t) => {
  const { root, source, storage, project, manager, prepare } = await fixture(t);
  const { workspace, intent, bundle } = await prepare();
  const processes = new ProcessController();
  const registry = new HostExecutorRegistry(processes);
  const heartbeat = join(workspace.rootPath, 'heartbeat.txt');
  const worker = join(root, 'nested-worker.cjs');
  await writeFile(worker, `const { spawn } = require('node:child_process');
const { appendFileSync } = require('node:fs');
const depth = Number(process.argv[2]);
if (depth > 0) spawn(process.execPath, [__filename, String(depth - 1), process.argv[3]],
  { stdio: 'ignore' });
setInterval(() => appendFileSync(process.argv[3], String(depth)), 40);
`);
  registry.adapters.set('executor.codex', { id: 'executor.codex', dispose: async () => {},
    probe: async () => ({ available: true, workspaceControl: true, streaming: true, modelIds: [] }),
    start: async (request) => {
      const session = await processes.spawn({ runId: request.runId, executable: process.execPath,
        argv: [worker, '2', heartbeat], cwd: request.workspace });
      const listeners = new Set();
      const completion = session.exit.then(() => {
        for (const listener of listeners) listener({ type: 'run.cancelled', runId: request.runId,
          sequence: 1, timestamp: new Date().toISOString() });
        return 'cancelled';
      });
      return { runId: request.runId, providerSessionId: 'owned-process-fixture', completion,
        cancel: async () => {}, interrupt: async () => {},
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        dispose: async () => {} };
    },
  });
  const scheduler = new HostRunScheduler(storage,
    new HostRunResources(registry, manager, processes), manager, processes, registry);
  const request = { runId: intent.runId, taskId: intent.taskId, goal: bundle.goal,
    context: executorContext(bundle), permission: 'read-only', approval: 'never',
    maxDurationMs: 60_000, attempt: { attemptId: intent.attemptId,
      leaseEpoch: intent.leaseEpoch, workspaceLeaseId: intent.workspaceLeaseId,
      contractRevision: 1, contextBundleId: bundle.bundleId, profileRevision: 1,
      outputSchemaId: 'plain-text' } };
  try {
    const executing = scheduler.execute(intent, workspace, request);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (storage.getRun(project.projectId, intent.runId)?.state === 'running' &&
        (await readFile(heartbeat, 'utf8').catch(() => '')).includes('0')) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    assert.ok(processes.hasActive(intent.runId));
    assert.match(await readFile(heartbeat, 'utf8'), /0/);
    const first = scheduler.cancel(project.projectId, intent.runId);
    const duplicate = scheduler.cancel(project.projectId, intent.runId);
    assert.equal(first, duplicate);
    assert.equal(storage.getRun(project.projectId, intent.runId).state, 'canceling');
    const cancelled = await first;
    assert.equal((await executing).state, 'cancelled');
    assert.equal(cancelled.state, 'cancelled');
    assert.equal(cancelled.attempt.state, 'cancelled');
    assert.equal(processes.hasActive(intent.runId), false);
    assert.equal(manager.inspect(workspace.workspaceId).status, 'ready');
    const atStop = await readFile(heartbeat, 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(await readFile(heartbeat, 'utf8'), atStop, 'no descendant writes after cancellation');
    assert.equal(execFileSync('git', ['-C', source, 'status', '--porcelain'],
      { encoding: 'utf8' }), '', 'source repository remains untouched');
  } finally { await registry.dispose(); }
});

test('Run deadline requests durable cancellation and does not claim success', async (t) => {
  const { root, storage, manager, prepare } = await fixture(t);
  const { workspace, intent, bundle } = await prepare(1_000);
  const processes = new ProcessController();
  const registry = new HostExecutorRegistry(processes);
  registry.adapters.set('executor.codex', { id: 'executor.codex', dispose: async () => {},
    probe: async () => ({ available: true, workspaceControl: true, streaming: true, modelIds: [] }),
    start: async (request) => {
      const listeners = new Set();
      let finish;
      const completion = new Promise((resolve) => { finish = resolve; });
      return { runId: request.runId, providerSessionId: 'deadline-fixture', completion,
        cancel: async () => {
          for (const listener of listeners) listener({ type: 'run.cancelled', runId: request.runId,
            sequence: 1, timestamp: new Date().toISOString() });
          finish('cancelled');
        }, interrupt: async () => {},
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        dispose: async () => {} };
    },
  });
  const scheduler = new HostRunScheduler(storage,
    new HostRunResources(registry, manager, processes), manager, processes, registry);
  try {
    const run = await scheduler.execute(intent, workspace, {
      runId: intent.runId, taskId: intent.taskId, goal: bundle.goal,
      context: executorContext(bundle), permission: 'read-only', approval: 'never',
      maxDurationMs: 1_000, attempt: { attemptId: intent.attemptId,
        leaseEpoch: intent.leaseEpoch, workspaceLeaseId: intent.workspaceLeaseId,
        contractRevision: 1, contextBundleId: bundle.bundleId, profileRevision: 1,
        outputSchemaId: 'plain-text' },
    });
    assert.equal(run.state, 'cancelled');
    assert.equal(manager.inspect(workspace.workspaceId).status, 'ready');
    const db = new Database(join(root, 'data', 'forge.sqlite'));
    const row = db.prepare('SELECT reason FROM run_cancel_intents WHERE run_id=?')
      .get(intent.runId);
    assert.equal(row.reason, 'timeout');
    db.close();
  } finally { await registry.dispose(); }
});

test('unconfirmed process exit interrupts Run and quarantines its workspace lease', async (t) => {
  const { storage, project, manager, prepare } = await fixture(t);
  const { workspace, intent, bundle } = await prepare();
  const processes = new ProcessController();
  processes.hasActive = () => true; // A fixture for an ownership backend that cannot confirm exit.
  processes.cancel = async (runId) => ({ runId, confirmed: false, forced: true,
    processIds: [randomUUID()] });
  const registry = new HostExecutorRegistry(processes);
  registry.adapters.set('executor.codex', { id: 'executor.codex', dispose: async () => {},
    probe: async () => ({ available: true, workspaceControl: true, streaming: true, modelIds: [] }),
    start: async (request) => ({ runId: request.runId, providerSessionId: 'unknown-exit',
      completion: new Promise(() => {}), cancel: async () => {}, interrupt: async () => {},
      subscribe: () => () => {}, dispose: async () => {} }),
  });
  const scheduler = new HostRunScheduler(storage,
    new HostRunResources(registry, manager, processes), manager, processes, registry);
  try {
    const execution = scheduler.execute(intent, workspace, {
      runId: intent.runId, taskId: intent.taskId, goal: bundle.goal,
      context: executorContext(bundle), permission: 'read-only', approval: 'never',
      maxDurationMs: 60_000, attempt: { attemptId: intent.attemptId,
        leaseEpoch: intent.leaseEpoch, workspaceLeaseId: intent.workspaceLeaseId,
        contractRevision: 1, contextBundleId: bundle.bundleId, profileRevision: 1,
        outputSchemaId: 'plain-text' },
    });
    void execution.catch(() => {});
    while (storage.getRun(project.projectId, intent.runId)?.state !== 'running') {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const cancellation = scheduler.cancel(project.projectId, intent.runId);
    assert.equal((await cancellation).state, 'interrupted');
    await assert.rejects(execution, /Owned process tree exit could not be confirmed/);
    assert.equal(manager.inspect(workspace.workspaceId).status, 'failed');
    const next = await prepare();
    assert.throws(() => storage.beginRun(next.intent), { code: 'RUN_CONFLICT' });
  } finally { await registry.dispose(); }
});

test('frozen CodeSnapshot and structured handoff survive restart without claiming Verify passed', async (t) => {
  const { root, source, storage, project, manager, prepare } = await fixture(t);
  const processes = new ProcessController();
  const snapshots = new HostSnapshotService(storage, manager, processes);
  const first = await prepare();
  storage.beginRun(first.intent);
  storage.markRunLaunched(project.projectId, first.intent.runId, first.intent.attemptId,
    'real-fixture-session');
  await writeFile(join(first.workspace.rootPath, 'source.txt'), 'changed source\n');
  await writeFile(join(first.workspace.rootPath, 'new file 中文.txt'), 'new file\n');
  storage.completeRun(project.projectId, first.intent.runId, {
    runId:first.intent.runId,attemptId:first.intent.attemptId,
    workspaceLeaseId:first.intent.workspaceLeaseId,leaseEpoch:first.intent.leaseEpoch,
    contractRevision:1,configHash:first.config.snapshotHash,outcome:'completed',
    providerSessionRef:'real-fixture-session',lastEventSequence:3,
    timestamp:new Date().toISOString() }, true);
  await manager.releaseLease(first.workspace.workspaceId, first.intent.workspaceLeaseId);
  const handoff = await snapshots.freeze({projectId:project.projectId,runId:first.intent.runId,
    workspaceId:first.workspace.workspaceId,contextBundleId:first.bundle.bundleId,
    workflowRevision:1});
  assert.deepEqual(handoff.snapshot.files.map((file)=>file.path),
    ['new file 中文.txt','source.txt']);
  assert.equal(handoff.stepResult.outcome,'ready');
  assert.ok(handoff.stepResult.acceptanceResults.every((item)=>item.status==='unverified'));
  assert.match(handoff.stepResult.summary,/Review and Verify have not run/);
  assert.deepEqual(handoff.bundle.artifactIds,[handoff.artifact.artifactId]);
  assert.deepEqual(await snapshots.freeze({projectId:project.projectId,runId:first.intent.runId,
    workspaceId:first.workspace.workspaceId,contextBundleId:first.bundle.bundleId,
    workflowRevision:1}),handoff);
  assert.equal(storage.getDevelopmentHandoff(randomUUID(),first.intent.runId),null);
  assert.equal(execFileSync('git',['-C',source,'rev-parse',
    `refs/forge/snapshots/${handoff.snapshot.snapshotId}`],{encoding:'utf8'}).trim(),
  handoff.snapshot.commitSha);
  const reopened=new ForgePersistence(join(root,'data'));await reopened.open();reopened.migrate();
  assert.deepEqual(reopened.getDevelopmentHandoff(project.projectId,first.intent.runId),handoff);
  reopened.close();
  const db = new Database(join(root,'data','forge.sqlite'));
  assert.throws(()=>db.prepare('DELETE FROM code_snapshots WHERE snapshot_id=?')
    .run(handoff.snapshot.snapshotId),/immutable/);
  assert.throws(()=>db.prepare('UPDATE run_handoffs SET bundle_json=? WHERE run_id=?')
    .run('{}',first.intent.runId),/immutable/);
  db.close();
  execFileSync('git',['-C',source,'update-ref',
    `refs/forge/snapshots/${handoff.snapshot.snapshotId}`,first.workspace.baseRevision]);
  await assert.rejects(snapshots.freeze({projectId:project.projectId,runId:first.intent.runId,
    workspaceId:first.workspace.workspaceId,contextBundleId:first.bundle.bundleId,
    workflowRevision:1}),/no longer matches/);
  assert.equal(execFileSync('git',['-C',source,'status','--porcelain'],
    {encoding:'utf8'}),'');

  const second=await prepare();
  storage.beginRun(second.intent);
  storage.markRunLaunched(project.projectId,second.intent.runId,second.intent.attemptId,
    'second-session');
  await writeFile(join(second.workspace.rootPath,'.env'),'SECRET=blocked\n');
  storage.completeRun(project.projectId,second.intent.runId,{
    runId:second.intent.runId,attemptId:second.intent.attemptId,
    workspaceLeaseId:second.intent.workspaceLeaseId,leaseEpoch:second.intent.leaseEpoch,
    contractRevision:1,configHash:second.config.snapshotHash,outcome:'completed',
    providerSessionRef:'second-session',lastEventSequence:1,
    timestamp:new Date().toISOString()},true);
  await manager.releaseLease(second.workspace.workspaceId,second.intent.workspaceLeaseId);
  await assert.rejects(snapshots.freeze({projectId:project.projectId,runId:second.intent.runId,
    workspaceId:second.workspace.workspaceId,contextBundleId:second.bundle.bundleId,
    workflowRevision:1}),{code:'SNAPSHOT_SECRET_BLOCKED'});
  assert.equal(storage.getDevelopmentHandoff(project.projectId,second.intent.runId),null);
  await rm(join(second.workspace.rootPath,'.env'));
  await assert.rejects(snapshots.freeze({projectId:project.projectId,runId:second.intent.runId,
    workspaceId:second.workspace.workspaceId,contextBundleId:second.bundle.bundleId,
    workflowRevision:1}),{code:'SNAPSHOT_NO_CHANGE_EXPLANATION_REQUIRED'});
  // A no-change handoff must say why no code was captured.
  const noChange=await snapshots.freeze({projectId:project.projectId,runId:second.intent.runId,
    workspaceId:second.workspace.workspaceId,contextBundleId:second.bundle.bundleId,
    workflowRevision:1,noChangeExplanation:'The requested change was already present.'});
  assert.equal(noChange.snapshot.noChange,true);
  assert.equal(noChange.stepResult.outcome,'inconclusive');
});
