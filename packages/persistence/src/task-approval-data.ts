import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { approvalDecisionSchema, taskApprovalSchema, type ApprovalDecideInput,
  type ApprovalRequestInput, type TaskApproval } from '@forge/contracts';
import { contractDigest, contractScopeHash,
  prepareTaskApproval } from '@forge/core/approvals';
import { approvalReadiness } from '@forge/core/task-revisions';
import { DraftDataStore } from './draft-data.js';

export class TaskApprovalStorageError extends Error {
  constructor(readonly code: 'APPROVAL_NOT_FOUND' | 'APPROVAL_STALE' | 'APPROVAL_EXPIRED' |
    'APPROVAL_ALREADY_DECIDED' | 'APPROVAL_NOT_READY') { super(code); }
}

interface ApprovalRow {
  approval_id: string; project_id: string; draft_id: string; expected_revision: number;
  scope_hash: string; action_digest: string; request_json: string;
  status: TaskApproval['status']; decision_json: string | null; task_id: string | null;
  created_at: string; decided_at: string | null;
}

function read(row: ApprovalRow): TaskApproval {
  return taskApprovalSchema.parse({ request: JSON.parse(row.request_json), draftId: row.draft_id,
    status: row.status, decision: row.decision_json ? JSON.parse(row.decision_json) : null,
    taskState: row.task_id ? 'todo' : null, createdAt: row.created_at, decidedAt: row.decided_at });
}

export class TaskApprovalDataStore {
  private readonly drafts: DraftDataStore;
  constructor(private readonly db: Database.Database) { this.drafts = new DraftDataStore(db); }

  forDraft(projectId: string, draftId: string): TaskApproval | null {
    if (!this.drafts.get(projectId, draftId)) return null;
    const row = this.db.prepare(`SELECT * FROM task_approvals WHERE project_id=? AND draft_id=?
      ORDER BY created_at DESC, rowid DESC LIMIT 1`).get(projectId, draftId) as ApprovalRow | undefined;
    return row ? read(row) : null;
  }

  request(input: ApprovalRequestInput): TaskApproval {
    return this.db.transaction(() => {
      const draft = this.drafts.get(input.projectId, input.draftId);
      if (!draft) throw new TaskApprovalStorageError('APPROVAL_NOT_FOUND');
      if (draft.revision !== input.expectedRevision) throw new TaskApprovalStorageError('APPROVAL_STALE');
      if (!approvalReadiness(draft).ready) throw new TaskApprovalStorageError('APPROVAL_NOT_READY');
      if (this.db.prepare('SELECT 1 FROM tasks WHERE source_draft_id=?').get(draft.draftId)) {
        throw new TaskApprovalStorageError('APPROVAL_ALREADY_DECIDED');
      }
      const current = this.db.prepare(`SELECT * FROM task_approvals WHERE draft_id=? AND status='pending'`)
        .get(draft.draftId) as ApprovalRow | undefined;
      const now = new Date().toISOString();
      if (current) {
        const currentRequest = JSON.parse(current.request_json) as TaskApproval['request'];
        if (current.expected_revision === draft.revision &&
          current.action_digest === contractDigest(draft.contract!) && currentRequest.expiresAt > now) {
          return read(current);
        }
        this.db.prepare(`UPDATE task_approvals SET status=?,decided_at=? WHERE approval_id=?`)
          .run(currentRequest.expiresAt <= now ? 'expired' : 'superseded', now, current.approval_id);
      }
      const request = prepareTaskApproval(draft);
      this.db.prepare(`INSERT INTO task_approvals(approval_id,project_id,draft_id,expected_revision,
        scope_hash,action_digest,request_json,status,created_at)
        VALUES (?,?,?,?,?,?,?,'pending',?)`).run(request.approvalId, draft.projectId,
        draft.draftId, draft.revision, request.scopeHash, request.actionDigest,
        JSON.stringify(request), now);
      return this.forDraft(draft.projectId, draft.draftId)!;
    })();
  }

  decide(input: ApprovalDecideInput): TaskApproval {
    const checked = approvalDecisionSchema.parse(input.decision);
    const outcome = this.db.transaction((): { result: TaskApproval } | { code: TaskApprovalStorageError['code'] } => {
      const row = this.db.prepare(`SELECT * FROM task_approvals WHERE project_id=? AND approval_id=?`)
        .get(input.projectId, checked.approvalId) as ApprovalRow | undefined;
      if (!row) return { code: 'APPROVAL_NOT_FOUND' };
      if (row.expected_revision !== checked.expectedRevision || row.scope_hash !== checked.scopeHash) {
        return { code: 'APPROVAL_STALE' };
      }
      if (row.status !== 'pending') {
        const prior = row.decision_json ? approvalDecisionSchema.parse(JSON.parse(row.decision_json)) : null;
        if (prior && JSON.stringify(prior) === JSON.stringify(checked)) return { result: read(row) };
        return { code: row.status === 'expired' ? 'APPROVAL_EXPIRED' :
          row.status === 'superseded' ? 'APPROVAL_STALE' : 'APPROVAL_ALREADY_DECIDED' };
      }
      const draft = this.drafts.get(input.projectId, row.draft_id);
      const now = new Date().toISOString();
      const request = read(row).request;
      if (request.expiresAt <= now) {
        this.db.prepare(`UPDATE task_approvals SET status='expired',decided_at=? WHERE approval_id=?`)
          .run(now, row.approval_id);
        return { code: 'APPROVAL_EXPIRED' };
      }
      if (!draft || draft.revision !== row.expected_revision || !approvalReadiness(draft).ready ||
        !draft.contract || contractDigest(draft.contract) !== row.action_digest ||
        contractScopeHash(draft.contract) !== row.scope_hash) {
        this.db.prepare(`UPDATE task_approvals SET status='superseded',decided_at=? WHERE approval_id=?`)
          .run(now, row.approval_id);
        return { code: 'APPROVAL_STALE' };
      }
      if (checked.decision === 'reject') {
        this.db.prepare(`UPDATE task_approvals SET status='rejected',decision_json=?,decided_at=?
          WHERE approval_id=? AND status='pending'`).run(JSON.stringify(checked), now, row.approval_id);
      } else {
        const position = (this.db.prepare(`SELECT COALESCE(MAX(position),-1)+1 AS position
          FROM tasks WHERE project_id=? AND state='todo'`).get(draft.projectId) as { position: number }).position;
        this.db.prepare(`INSERT INTO tasks(task_id,project_id,source_draft_id,current_revision,state,
          contract_json,approved_at,created_at,position,revision,updated_at)
          VALUES (?,?,?,?,'todo',?,?,?,?,1,?)`)
          .run(draft.contract.taskId, draft.projectId, draft.draftId, draft.revision,
            JSON.stringify(draft.contract), now, now, position, now);
        this.db.prepare(`INSERT INTO task_revisions(task_id,revision,contract_json,content_hash,created_at)
          VALUES (?,?,?,?,?)`).run(draft.contract.taskId, draft.revision,
            JSON.stringify(draft.contract), row.action_digest, now);
        const eventId = randomUUID();
        const payload = JSON.stringify({ approvalId: row.approval_id, revision: draft.revision,
          scopeHash: row.scope_hash });
        this.db.prepare(`INSERT INTO task_events(event_id,task_id,type,payload_json,created_at)
          VALUES (?,?,'task.approved_to_todo',?,?)`).run(eventId, draft.contract.taskId, payload, now);
        this.db.prepare(`INSERT INTO board_events(event_id,project_id,task_id,type,payload_json,created_at)
          VALUES (?,?,?,'task.approved_to_todo',?,?)`).run(eventId, draft.projectId,
            draft.contract.taskId, payload, now);
        this.db.prepare('UPDATE board_state SET revision=revision+1 WHERE project_id=?')
          .run(draft.projectId);
        this.db.prepare(`UPDATE task_approvals SET status='approved',decision_json=?,task_id=?,decided_at=?
          WHERE approval_id=? AND status='pending'`).run(JSON.stringify(checked),
          draft.contract.taskId, now, row.approval_id);
      }
      const updated = this.db.prepare('SELECT * FROM task_approvals WHERE approval_id=?')
        .get(row.approval_id) as ApprovalRow;
      return { result: read(updated) };
    })();
    if ('code' in outcome) throw new TaskApprovalStorageError(outcome.code);
    return outcome.result;
  }
}
