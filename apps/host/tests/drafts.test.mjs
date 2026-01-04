import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectTrustVersion } from '@forge/contracts';
import { ForgePersistence } from '@forge/persistence';
import { ProjectService } from '../dist/projects.js';
import { DraftService } from '../dist/drafts.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'forge-draft-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const projectRoot = join(root, 'repo'); await mkdir(projectRoot);
  const storage = new ForgePersistence(join(root, 'data')); await storage.open(); storage.migrate();
  t.after(() => storage.close());
  const projects = new ProjectService(storage);
  const probe = await projects.probe(projectRoot);
  const project = await projects.create(projectRoot, probe.fingerprint, projectTrustVersion, true, 0);
  const conversation = storage.createConversation(project.projectId, 'Feature', 0);
  const sent = storage.recordUserMessage({ projectId: project.projectId,
    conversationId: conversation.conversationId, idempotencyKey: randomUUID(),
    text: 'Add search filtering', attachmentIds: [] });
  const request = { projectId: project.projectId, conversationId: conversation.conversationId,
    sourceMessageId: sent.message.messageId, idempotencyKey: randomUUID() };
  return { storage, project, conversation, request, root };
}

test('draft generation is idempotent and survives Host restart', async (t) => {
  const { storage, project, conversation, request, root } = await fixture(t);
  let calls = 0;
  const model = { providerId: 'fixture', dispose: async () => {}, request: async () => {
    calls += 1;
    if (calls === 1) return { intent: 'new_task' };
    return { title: 'Add search', type: 'feature', goal: 'Filter results by query',
      acceptance: [{ statement: 'Only matching rows are shown', method: 'automated', required: true }],
      constraints: [], scope: [], outOfScope: [], openQuestions: [], assumptions: [], priority: 'normal' };
  } };
  const service = new DraftService(storage, model);
  const first = service.generate(request);
  assert.equal(service.generate(request).draftId, first.draftId);
  await service.dispose();
  assert.equal(calls, 2);
  const result = service.get(project.projectId, first.draftId);
  assert.equal(result.status, 'proposed');
  assert.equal(result.contract.taskId, first.draftId);
  assert.equal(result.contract.sourceRefs[0], `message:${request.sourceMessageId}`);
  assert.equal(service.list(project.projectId, conversation.conversationId).length, 1);
  assert.throws(() => service.manual({ ...request, idempotencyKey: randomUUID() }),
    { code: 'IDEMPOTENCY_CONFLICT' });
  storage.close();
  const reopened = new ForgePersistence(join(root, 'data'));
  await reopened.open(); reopened.migrate();
  assert.equal(reopened.getTaskDraft(project.projectId, first.draftId)?.contract?.title, 'Add search');
  reopened.close();
});

test('manual draft persists without model and source ownership is enforced', async (t) => {
  const { storage, project, conversation, request } = await fixture(t);
  const model = { providerId: 'unused', dispose: async () => {}, request: async () => { throw new Error('must not call'); } };
  const service = new DraftService(storage, model);
  const manual = service.manual(request);
  assert.equal(manual.status, 'manual');
  assert.equal(manual.contract, null);
  assert.equal(manual.editableText, 'Add search filtering');
  assert.equal(service.manual(request).draftId, manual.draftId);
  const edited = service.updateText(project.projectId, manual.draftId, manual.revision,
    'Manually clarified acceptance text');
  assert.equal(edited.editableText, 'Manually clarified acceptance text');
  assert.equal(edited.revision, manual.revision + 1);
  assert.throws(() => service.updateText(project.projectId, manual.draftId, manual.revision,
    'Stale overwrite'), { code: 'REVISION_CONFLICT' });
  assert.equal(service.get(randomUUID(), manual.draftId), null);
  assert.deepEqual(service.list(randomUUID(), conversation.conversationId), []);
  assert.throws(() => service.manual({ ...request, sourceMessageId: randomUUID(),
    idempotencyKey: randomUUID() }), { code: 'DRAFT_SOURCE_NOT_FOUND' });
  await service.dispose();
  assert.equal(storage.getProject(project.projectId)?.trusted, true);
});

test('interrupted draft is marked failed on restart, not shown as generating forever', async (t) => {
  const { storage, project, request } = await fixture(t);
  const draft = storage.beginTaskDraft(request, 'generating', 'fixture');
  assert.equal(storage.recoverInterruptedTaskDrafts(), 1);
  const recovered = storage.getTaskDraft(project.projectId, draft.draftId);
  assert.equal(recovered.status, 'invalid_output');
  assert.equal(recovered.errorCode, 'REFINER_FAILED');
  assert.equal(storage.recoverInterruptedTaskDrafts(), 0);
});

test('confirmed edits create immutable revisions, survive restart, and reject stale writes', async (t) => {
  const { storage, project, request, root } = await fixture(t);
  const model = { providerId: 'unused', dispose: async () => {}, request: async () => { throw Error('unused'); } };
  const service = new DraftService(storage, model);
  const manual = service.manual(request);
  const messageRef = `message:${request.sourceMessageId}`;
  const decisionId = randomUUID(); const decisionRef = `decision:${decisionId}`;
  const contract = { schemaVersion: '1.0', taskId: manual.draftId, projectId: project.projectId,
    revision: 2, title: 'Search', type: 'feature', goal: 'Search by email',
    acceptance: [{ id: 'ac1', statement: 'Matching email appears', method: 'automated',
      required: true, sourceRefs: [decisionRef] }], constraints: [], scope: ['UI'],
    outOfScope: [], dependencies: [], openQuestions: ['Case sensitive?'], assumptions: [],
    sourceRefs: [messageRef, decisionRef], workflowRef: 'standard', priority: 'normal' };
  const input = { projectId: project.projectId, draftId: manual.draftId, expectedRevision: 1,
    contract, decisionId, decisionSummary: 'User defined initial contract',
    resolvedQuestions: [], removedAcceptanceIds: [], confirmScopeChange: true };
  const first = service.revise(input);
  assert.equal(first.revision, 2); assert.equal(first.status, 'needs_clarification');
  assert.deepEqual(service.history(project.projectId, manual.draftId).map((item) => item.revision), [2, 1]);
  assert.throws(() => service.revise(input), { code: 'REVISION_CONFLICT' });
  const answerDecision = randomUUID();
  const second = service.revise({ ...input, expectedRevision: 2, decisionId: answerDecision,
    decisionSummary: 'Case-insensitive', resolvedQuestions: [{ question: 'Case sensitive?',
      answer: 'No' }], contract: { ...contract, revision: 3, openQuestions: [],
      sourceRefs: [...contract.sourceRefs, `decision:${answerDecision}`] } });
  assert.equal(second.status, 'proposed');
  assert.equal(service.history(project.projectId, manual.draftId)[0].resolvedQuestions[0].answer, 'No');
  assert.throws(() => service.history(randomUUID(), manual.draftId), { code: 'DRAFT_NOT_FOUND' });
  await service.dispose(); storage.close();
  const reopened = new ForgePersistence(join(root, 'data')); await reopened.open(); reopened.migrate();
  assert.equal(reopened.getTaskDraft(project.projectId, manual.draftId)?.revision, 3);
  assert.equal(reopened.listTaskDraftRevisions(project.projectId, manual.draftId).length, 3);
  assert.equal(reopened.listTaskDraftRevisions(project.projectId, manual.draftId)[1].contract.openQuestions[0],
    'Case sensitive?');
  reopened.close();
});
