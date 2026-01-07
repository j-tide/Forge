import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectTrustVersion } from '@forge/contracts';
import { ForgePersistence } from '@forge/persistence';
import { ProjectService } from '../dist/projects.js';
const Database = createRequire(new URL('../../../packages/persistence/package.json', import.meta.url))('better-sqlite3');

async function fixture(t, questions = []) {
  const root = await mkdtemp(join(tmpdir(), 'forge-approval-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = join(root, 'repo'); await mkdir(projectRoot);
  const storage = new ForgePersistence(join(root, 'data')); await storage.open(); storage.migrate();
  t.after(() => storage.close());
  const projects = new ProjectService(storage);
  const probe = await projects.probe(projectRoot);
  const project = await projects.create(projectRoot, probe.fingerprint, projectTrustVersion, true, 0);
  const conversation = storage.createConversation(project.projectId, 'Approval', 0);
  const sent = storage.recordUserMessage({ projectId: project.projectId,
    conversationId: conversation.conversationId, idempotencyKey: randomUUID(),
    text: 'Add filter', attachmentIds: [] });
  const draft = storage.beginTaskDraft({ projectId: project.projectId,
    conversationId: conversation.conversationId, sourceMessageId: sent.message.messageId,
    idempotencyKey: randomUUID() }, 'generating', 'fixture');
  const sourceRef = `message:${sent.message.messageId}`;
  const contract = { schemaVersion: '1.0', taskId: draft.draftId, projectId: project.projectId,
    revision: 1, title: 'Add filter', type: 'feature', goal: 'Filter records',
    acceptance: [{ id: 'ac1', statement: 'Shows only matches', method: 'automated',
      required: true, sourceRefs: [sourceRef] }], constraints: [], scope: ['UI'],
    outOfScope: [], dependencies: [], openQuestions: questions, assumptions: [],
    sourceRefs: [sourceRef], workflowRef: 'standard', priority: 'normal' };
  storage.finishTaskDraft(project.projectId, draft.draftId,
    { intent: 'new_task', contract, errorCode: null });
  return { storage, project, draft, contract, root };
}

function decision(approval, value = 'approve') {
  return { projectId: approval.request.projectId, decision: { schemaVersion: '1.0',
    approvalId: approval.request.approvalId, decision: value,
    expectedRevision: approval.request.expectedRevision, scopeHash: approval.request.scopeHash,
    reason: value === 'reject' ? 'Needs changes' : '' } };
}

test('approval uses one frozen revision, one TODO and one event even after duplicate requests', async (t) => {
  const { storage, project, draft, root } = await fixture(t);
  const input = { projectId: project.projectId, draftId: draft.draftId, expectedRevision: 1 };
  const approval = storage.requestTaskApproval(input);
  assert.equal(storage.requestTaskApproval(input).request.approvalId, approval.request.approvalId);
  assert.equal(approval.status, 'pending');
  const approved = storage.decideTaskApproval(decision(approval));
  assert.equal(approved.status, 'approved'); assert.equal(approved.taskState, 'todo');
  assert.deepEqual(storage.decideTaskApproval(decision(approval)), approved);
  const db = new Database(join(root, 'data', 'forge.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_revisions').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_events').get().n, 1);
  assert.equal(db.prepare('SELECT state FROM tasks WHERE task_id=?').get(draft.draftId).state, 'todo');
  db.close();
  assert.throws(() => storage.requestTaskApproval(input), { code: 'APPROVAL_ALREADY_DECIDED' });
  storage.close();
  const reopened = new ForgePersistence(join(root, 'data')); await reopened.open(); reopened.migrate();
  assert.equal(reopened.taskApprovalForDraft(project.projectId, draft.draftId)?.status, 'approved');
  reopened.close();
});

test('blocking question cannot request approval; rejection does not create task', async (t) => {
  const blocked = await fixture(t, ['Which timezone?']);
  assert.throws(() => blocked.storage.requestTaskApproval({ projectId: blocked.project.projectId,
    draftId: blocked.draft.draftId, expectedRevision: 1 }), { code: 'APPROVAL_NOT_READY' });
  const ready = await fixture(t);
  const approval = ready.storage.requestTaskApproval({ projectId: ready.project.projectId,
    draftId: ready.draft.draftId, expectedRevision: 1 });
  const rejected = ready.storage.decideTaskApproval(decision(approval, 'reject'));
  assert.equal(rejected.status, 'rejected'); assert.equal(rejected.taskState, null);
  assert.throws(() => ready.storage.decideTaskApproval(decision(approval)),
    { code: 'APPROVAL_ALREADY_DECIDED' });
  const db = new Database(join(ready.root, 'data', 'forge.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0); db.close();
});

test('new draft revision makes prior approval stale; expired request stays expired', async (t) => {
  const { storage, project, draft, contract, root } = await fixture(t);
  const old = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 1 });
  const ref = `decision:${randomUUID()}`;
  storage.reviseTaskDraft({ projectId: project.projectId, draftId: draft.draftId,
    expectedRevision: 1, contract: { ...contract, revision: 2, goal: 'Changed',
      sourceRefs: [...contract.sourceRefs, ref] }, decisionId: ref.slice('decision:'.length),
    decisionSummary: 'Changed goal', resolvedQuestions: [], removedAcceptanceIds: [],
    confirmScopeChange: false }, ['goal', 'sourceRefs']);
  assert.throws(() => storage.decideTaskApproval(decision(old)), { code: 'APPROVAL_STALE' });
  assert.equal(storage.taskApprovalForDraft(project.projectId, draft.draftId)?.status, 'superseded');
  const fresh = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 2 });
  const db = new Database(join(root, 'data', 'forge.sqlite'));
  db.prepare('UPDATE task_approvals SET request_json=? WHERE approval_id=?').run(
    JSON.stringify({ ...fresh.request, expiresAt: new Date(0).toISOString() }), fresh.request.approvalId);
  db.close();
  assert.throws(() => storage.decideTaskApproval(decision(fresh)), { code: 'APPROVAL_EXPIRED' });
  assert.equal(storage.taskApprovalForDraft(project.projectId, draft.draftId)?.status, 'expired');
  assert.equal(storage.taskApprovalForDraft(randomUUID(), draft.draftId), null);
});

test('event insertion failure rolls back task, revision and approval decision together', async (t) => {
  const { storage, project, draft, root } = await fixture(t);
  const approval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 1 });
  const db = new Database(join(root, 'data', 'forge.sqlite'));
  db.exec(`CREATE TRIGGER fixture_reject_task_event BEFORE INSERT ON task_events
    BEGIN SELECT RAISE(ABORT, 'fixture event failure'); END`);
  assert.throws(() => storage.decideTaskApproval(decision(approval)));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_revisions').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM task_events').get().n, 0);
  assert.equal(storage.taskApprovalForDraft(project.projectId, draft.draftId)?.status, 'pending');
  db.exec('DROP TRIGGER fixture_reject_task_event');
  db.close();
  assert.equal(storage.decideTaskApproval(decision(approval)).status, 'approved');
});

test('approved TODO appears once in the authoritative board and survives restart', async (t) => {
  const { storage, project, draft, root } = await fixture(t);
  const empty = storage.boardSnapshot(project.projectId);
  assert.deepEqual(empty.tasks, []);
  assert.equal(empty.eventCursor, '0');
  const approval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 1 });
  storage.decideTaskApproval(decision(approval));
  const board = storage.boardSnapshot(project.projectId);
  assert.equal(board.tasks.length, 1);
  assert.equal(board.tasks[0].id, draft.draftId);
  assert.equal(board.tasks[0].boardColumn, 'todo');
  assert.equal(board.tasks[0].priority, 'normal');
  assert.equal(board.boardRevision, 1);
  const db = new Database(join(root, 'data', 'forge.sqlite'));
  const event = db.prepare('SELECT * FROM board_events WHERE task_id=?').get(draft.draftId);
  assert.throws(() => db.prepare(`INSERT INTO board_events(event_id,project_id,task_id,type,payload_json,created_at)
    VALUES (?,?,?,?,?,?)`).run(event.event_id, project.projectId, draft.draftId,
    event.type, event.payload_json, event.created_at), /UNIQUE/);
  assert.equal(storage.boardSnapshot(project.projectId).tasks.length, 1);
  db.close(); storage.close();
  const reopened = new ForgePersistence(join(root, 'data')); await reopened.open(); reopened.migrate();
  assert.deepEqual(reopened.boardSnapshot(project.projectId).tasks, board.tasks);
  reopened.close();
});

test('same-column reorder is CAS/idempotent and rejects cross-project targets', async (t) => {
  const { storage, project, draft, contract } = await fixture(t);
  const firstApproval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 1 });
  storage.decideTaskApproval(decision(firstApproval));
  const conversation = storage.createConversation(project.projectId, 'Second', 0);
  const message = storage.recordUserMessage({ projectId: project.projectId,
    conversationId: conversation.conversationId, idempotencyKey: randomUUID(),
    text: 'Second task', attachmentIds: [] }).message;
  const second = storage.beginTaskDraft({ projectId: project.projectId,
    conversationId: conversation.conversationId, sourceMessageId: message.messageId,
    idempotencyKey: randomUUID() }, 'manual', null);
  const decisionId = randomUUID();
  const refs = [`message:${message.messageId}`, `decision:${decisionId}`];
  storage.reviseTaskDraft({ projectId: project.projectId, draftId: second.draftId,
    expectedRevision: 1, contract: { ...contract, taskId: second.draftId, revision: 2,
      title: 'Second task', sourceRefs: refs,
      acceptance: [{ ...contract.acceptance[0], sourceRefs: refs }] },
    decisionId, decisionSummary: 'Fixture manual task', resolvedQuestions: [],
    removedAcceptanceIds: [], confirmScopeChange: false }, ['contract']);
  const secondApproval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: second.draftId, expectedRevision: 2 });
  storage.decideTaskApproval(decision(secondApproval));
  const before = storage.boardSnapshot(project.projectId);
  assert.deepEqual(before.tasks.map((task) => task.id), [draft.draftId, second.draftId]);
  const input = { projectId: project.projectId, taskId: second.draftId,
    expectedBoardRevision: before.boardRevision, idempotencyKey: randomUUID(),
    beforeTaskId: null, afterTaskId: draft.draftId };
  const moved = storage.reorderBoard(input);
  assert.deepEqual(moved.tasks.map((task) => task.id), [second.draftId, draft.draftId]);
  assert.equal(storage.reorderBoard(input).boardRevision, moved.boardRevision);
  assert.throws(() => storage.reorderBoard({ ...input, idempotencyKey: randomUUID() }),
    { code: 'REVISION_CONFLICT' });
  assert.throws(() => storage.reorderBoard({ ...input, afterTaskId: second.draftId }),
    { code: 'IDEMPOTENCY_CONFLICT' });
  assert.throws(() => storage.reorderBoard({ ...input, expectedBoardRevision: moved.boardRevision,
    idempotencyKey: randomUUID(), beforeTaskId: randomUUID(), afterTaskId: null }),
    { code: 'BOARD_CROSS_COLUMN_FORBIDDEN' });
  assert.deepEqual(storage.boardSnapshot(project.projectId).tasks.map((task) => task.id),
    [second.draftId, draft.draftId]);
});

test('approved task detail resolves each AC to original message or user decision from immutable revision', async (t) => {
  const { storage, project, draft, contract, root } = await fixture(t);
  const decisionId = randomUUID();
  const decisionRef = `decision:${decisionId}`;
  storage.reviseTaskDraft({ projectId: project.projectId, draftId: draft.draftId,
    expectedRevision: 1, contract: { ...contract, revision: 2,
      acceptance: [...contract.acceptance, { id: 'ac2', statement: 'Uses project timezone',
        method: 'manual', required: true, sourceRefs: [decisionRef] }],
      sourceRefs: [...contract.sourceRefs, decisionRef] },
    decisionId, decisionSummary: 'Use project timezone', resolvedQuestions: [],
    removedAcceptanceIds: [], confirmScopeChange: false }, ['acceptance', 'sourceRefs']);
  const approval = storage.requestTaskApproval({ projectId: project.projectId,
    draftId: draft.draftId, expectedRevision: 2 });
  storage.decideTaskApproval(decision(approval));
  const detail = storage.taskDetail(project.projectId, draft.draftId);
  assert.equal(detail.detail.contract.revision, 2);
  assert.deepEqual(detail.detail.runIds, []);
  assert.deepEqual(detail.sources.map((source) => [source.kind, source.status, source.text]), [
    ['message', 'available', 'Add filter'], ['decision', 'available', 'Use project timezone'],
  ]);
  assert.deepEqual(detail.detail.contract.acceptance.map((item) => item.sourceRefs), [
    [`message:${detail.sources[0].ref.slice(8)}`], [decisionRef],
  ]);
  assert.throws(() => storage.taskDetail(randomUUID(), draft.draftId),
    { code: 'PROJECT_NOT_FOUND' });
  assert.throws(() => storage.taskDetail(project.projectId, randomUUID()),
    { code: 'TASK_NOT_FOUND' });
  const db = new Database(join(root, 'data', 'forge.sqlite'));
  db.prepare('UPDATE tasks SET contract_json=? WHERE task_id=?').run(
    JSON.stringify({ ...detail.detail.contract, title: 'Mutable cache must not win' }), draft.draftId);
  assert.equal(storage.taskDetail(project.projectId, draft.draftId).detail.contract.title, 'Add filter');
  db.prepare("UPDATE messages SET role='assistant' WHERE message_id=?")
    .run(detail.sources[0].ref.slice(8));
  assert.equal(storage.taskDetail(project.projectId, draft.draftId).sources[0].status, 'withdrawn');
  db.close();
  storage.close();
  const reopened = new ForgePersistence(join(root, 'data')); await reopened.open(); reopened.migrate();
  assert.equal(reopened.taskDetail(project.projectId, draft.draftId).sources[1].text,
    'Use project timezone');
  reopened.close();
});
