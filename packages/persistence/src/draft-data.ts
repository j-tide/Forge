import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { draftGenerationRequestSchema, draftRevisionSchema, taskDraftSchema, type DraftGenerationRequest,
  type DraftRevision, type DraftReviseInput, type TaskContract, type TaskDraft } from '@forge/contracts';

export class DraftStorageError extends Error {
  constructor(readonly code: 'DRAFT_SOURCE_NOT_FOUND' | 'DRAFT_NOT_FOUND' | 'IDEMPOTENCY_CONFLICT' |
    'REVISION_CONFLICT' | 'DRAFT_APPROVED') { super(code); }
}

interface DraftRow { draft_id: string; project_id: string; conversation_id: string;
  source_message_id: string; revision: number; intent: TaskDraft['intent']; status: TaskDraft['status'];
  contract_json: string | null; editable_text: string; error_code: TaskDraft['errorCode'];
  model_provider: string | null; created_at: string; updated_at: string; idempotency_key: string }
interface RevisionRow { draft_id: string; revision: number; contract_json: string | null;
  editable_text: string; changed_fields_json: string; decision_id: string | null;
  decision_summary: string | null; resolved_questions_json: string; created_at: string }

function read(row: DraftRow): TaskDraft {
  return taskDraftSchema.parse({ draftId: row.draft_id, projectId: row.project_id,
    conversationId: row.conversation_id, sourceMessageId: row.source_message_id,
    revision: row.revision, intent: row.intent, status: row.status,
    contract: row.contract_json ? JSON.parse(row.contract_json) : null,
    editableText: row.editable_text, errorCode: row.error_code,
    modelProvider: row.model_provider, createdAt: row.created_at, updatedAt: row.updated_at });
}

export class DraftDataStore {
  constructor(private readonly db: Database.Database) {}

  list(projectId: string, conversationId: string): TaskDraft[] {
    return (this.db.prepare(`SELECT d.* FROM task_drafts d JOIN conversations c ON c.conversation_id=d.conversation_id
      JOIN projects p ON p.project_id=d.project_id WHERE d.project_id=? AND d.conversation_id=?
      AND c.project_id=? AND c.archived_at IS NULL AND p.archived_at IS NULL ORDER BY d.created_at DESC`)
      .all(projectId, conversationId, projectId) as DraftRow[]).map(read);
  }

  get(projectId: string, draftId: string): TaskDraft | null {
    const row = this.db.prepare(`SELECT d.* FROM task_drafts d JOIN conversations c ON c.conversation_id=d.conversation_id
      JOIN projects p ON p.project_id=d.project_id WHERE d.project_id=? AND d.draft_id=?
      AND c.project_id=? AND c.archived_at IS NULL AND p.archived_at IS NULL`)
      .get(projectId, draftId, projectId) as DraftRow | undefined;
    return row ? read(row) : null;
  }

  history(projectId: string, draftId: string): DraftRevision[] {
    if (!this.get(projectId, draftId)) throw new DraftStorageError('DRAFT_NOT_FOUND');
    return (this.db.prepare(`SELECT * FROM task_draft_revisions WHERE draft_id=? ORDER BY revision DESC`)
      .all(draftId) as RevisionRow[]).map((row) => draftRevisionSchema.parse({
      draftId: row.draft_id, revision: row.revision,
      contract: row.contract_json ? JSON.parse(row.contract_json) : null,
      editableText: row.editable_text, changedFields: JSON.parse(row.changed_fields_json),
      decisionId: row.decision_id, decisionSummary: row.decision_summary,
      resolvedQuestions: JSON.parse(row.resolved_questions_json), createdAt: row.created_at,
    }));
  }

  private snapshot(draft: TaskDraft, changedFields: string[], decisionId: string | null,
    decisionSummary: string | null, resolvedQuestions: DraftReviseInput['resolvedQuestions']): void {
    this.db.prepare(`INSERT INTO task_draft_revisions(draft_id,revision,contract_json,editable_text,
      changed_fields_json,decision_id,decision_summary,resolved_questions_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(draft_id,revision) DO UPDATE SET
      contract_json=excluded.contract_json,editable_text=excluded.editable_text,
      changed_fields_json=excluded.changed_fields_json,created_at=excluded.created_at`)
      .run(draft.draftId, draft.revision, draft.contract ? JSON.stringify(draft.contract) : null,
        draft.editableText, JSON.stringify(changedFields), decisionId, decisionSummary,
        JSON.stringify(resolvedQuestions), draft.updatedAt);
  }

  begin(input: DraftGenerationRequest, mode: 'generating' | 'manual', provider: string | null): TaskDraft {
    const checked = draftGenerationRequestSchema.parse(input);
    return this.db.transaction(() => {
      const source = this.db.prepare(`SELECT m.content_json FROM messages m
        JOIN conversations c ON c.conversation_id=m.conversation_id
        JOIN projects p ON p.project_id=c.project_id
        WHERE p.project_id=? AND p.archived_at IS NULL AND c.conversation_id=?
        AND c.archived_at IS NULL AND m.message_id=? AND m.role='user'`)
        .get(checked.projectId, checked.conversationId, checked.sourceMessageId) as
        { content_json: string } | undefined;
      if (!source) throw new DraftStorageError('DRAFT_SOURCE_NOT_FOUND');
      const existing = this.db.prepare(`SELECT * FROM task_drafts WHERE conversation_id=?
        AND (idempotency_key=? OR source_message_id=?)`)
        .get(checked.conversationId, checked.idempotencyKey, checked.sourceMessageId) as DraftRow | undefined;
      if (existing) {
        if (existing.idempotency_key !== checked.idempotencyKey || existing.source_message_id !== checked.sourceMessageId) {
          throw new DraftStorageError('IDEMPOTENCY_CONFLICT');
        }
        return read(existing);
      }
      const text = JSON.parse(source.content_json) as { text: string };
      const now = new Date().toISOString(); const draftId = randomUUID();
      this.db.prepare(`INSERT INTO task_drafts(draft_id,project_id,conversation_id,source_message_id,
        idempotency_key,revision,intent,status,contract_json,editable_text,error_code,model_provider,created_at,updated_at)
        VALUES (?,?,?,?,?,1,'new_task',?,NULL,?,?,?, ?,?)`)
        .run(draftId, checked.projectId, checked.conversationId, checked.sourceMessageId,
          checked.idempotencyKey, mode, text.text, mode === 'manual' ? 'REFINER_UNAVAILABLE' : null,
          provider, now, now);
      const created = this.get(checked.projectId, draftId);
      if (!created) throw new DraftStorageError('DRAFT_NOT_FOUND');
      this.snapshot(created, [], null, null, []);
      return created;
    })();
  }

  finish(projectId: string, draftId: string, result: { intent: TaskDraft['intent'];
    contract: TaskContract | null; errorCode: TaskDraft['errorCode'] }): TaskDraft {
    return this.db.transaction(() => {
      const beforeRow = this.db.prepare('SELECT * FROM task_drafts WHERE project_id=? AND draft_id=?')
        .get(projectId, draftId) as DraftRow | undefined;
      const before = beforeRow ? read(beforeRow) : null;
      if (!before) throw new DraftStorageError('DRAFT_NOT_FOUND');
      if (before.status !== 'generating') return before;
      const status = result.errorCode ? 'invalid_output' : result.contract ?
        result.contract.openQuestions.length ? 'needs_clarification' : 'proposed' : 'needs_clarification';
      this.db.prepare(`UPDATE task_drafts SET intent=?,status=?,contract_json=?,error_code=?,updated_at=?
        WHERE draft_id=? AND project_id=? AND status='generating'`)
        .run(result.intent, status, result.contract ? JSON.stringify(result.contract) : null,
          result.errorCode, new Date().toISOString(), draftId, projectId);
      const updated = this.db.prepare('SELECT * FROM task_drafts WHERE project_id=? AND draft_id=?')
        .get(projectId, draftId) as DraftRow | undefined;
      if (!updated) throw new DraftStorageError('DRAFT_NOT_FOUND');
      const resultDraft = read(updated);
      this.snapshot(resultDraft, resultDraft.contract ? ['contract'] : [], null, null, []);
      return resultDraft;
    })();
  }

  updateText(projectId: string, draftId: string, expectedRevision: number, editableText: string): TaskDraft {
    return this.db.transaction(() => {
      const before = this.get(projectId, draftId);
      if (!before) throw new DraftStorageError('DRAFT_NOT_FOUND');
      if (this.db.prepare(`SELECT 1 FROM task_approvals WHERE draft_id=? AND status='approved'`)
        .get(draftId)) throw new DraftStorageError('DRAFT_APPROVED');
      if (before.revision !== expectedRevision || !['manual', 'invalid_output'].includes(before.status)) {
        throw new DraftStorageError('REVISION_CONFLICT');
      }
      const changed = this.db.prepare(`UPDATE task_drafts SET editable_text=?,revision=revision+1,
        status='manual',error_code=NULL,updated_at=? WHERE draft_id=? AND project_id=?
        AND revision=? AND status IN ('manual','invalid_output')`)
        .run(editableText, new Date().toISOString(), draftId, projectId, expectedRevision).changes;
      if (!changed) throw new DraftStorageError('REVISION_CONFLICT');
      const updated = this.get(projectId, draftId);
      if (!updated) throw new DraftStorageError('DRAFT_NOT_FOUND');
      this.snapshot(updated, ['editableText'], null, null, []);
      return updated;
    })();
  }

  revise(input: DraftReviseInput, changedFields: string[]): TaskDraft {
    return this.db.transaction(() => {
      const before = this.get(input.projectId, input.draftId);
      if (!before) throw new DraftStorageError('DRAFT_NOT_FOUND');
      if (this.db.prepare(`SELECT 1 FROM task_approvals WHERE draft_id=? AND status='approved'`)
        .get(input.draftId)) throw new DraftStorageError('DRAFT_APPROVED');
      if (before.revision !== input.expectedRevision) throw new DraftStorageError('REVISION_CONFLICT');
      const now = new Date().toISOString();
      const status = input.contract.openQuestions.length ? 'needs_clarification' : 'proposed';
      const changed = this.db.prepare(`UPDATE task_drafts SET contract_json=?,revision=revision+1,
        status=?,error_code=NULL,updated_at=? WHERE draft_id=? AND project_id=? AND revision=?`)
        .run(JSON.stringify(input.contract), status, now, input.draftId,
          input.projectId, input.expectedRevision).changes;
      if (!changed) throw new DraftStorageError('REVISION_CONFLICT');
      const updated = this.get(input.projectId, input.draftId);
      if (!updated) throw new DraftStorageError('DRAFT_NOT_FOUND');
      this.snapshot(updated, changedFields, input.decisionId, input.decisionSummary,
        input.resolvedQuestions);
      return updated;
    })();
  }

  recoverInterrupted(): number {
    const now = new Date().toISOString();
    return this.db.prepare(`UPDATE task_drafts SET status='invalid_output',error_code='REFINER_FAILED',updated_at=?
      WHERE status='generating'`).run(now).changes;
  }
}
