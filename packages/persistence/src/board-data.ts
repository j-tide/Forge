import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { boardSnapshotSchema, boardTaskSchema, taskContractSchema, taskDetailViewSchema,
  type BoardReorderInput, type BoardSnapshot, type BoardTask, type TaskDetailView,
  type TaskSource } from '@forge/contracts';
import { contractDigest } from '@forge/core/approvals';
import { taskSourceRefs } from '@forge/core/task-queries';

export class BoardStorageError extends Error {
  constructor(readonly code: 'PROJECT_NOT_FOUND' | 'TASK_NOT_FOUND' | 'REVISION_CONFLICT' |
    'BOARD_CROSS_COLUMN_FORBIDDEN' | 'BOARD_INVALID_REORDER' | 'IDEMPOTENCY_CONFLICT') {
    super(code);
  }
}

interface TaskRow {
  task_id: string; project_id: string; state: string; current_revision: number;
  contract_json: string; position: number; revision: number; created_at: string;
}

export class BoardDataStore {
  constructor(private readonly db: Database.Database) {}

  detail(projectId: string, taskId: string): TaskDetailView {
    const task = this.snapshot(projectId).tasks.find((item) => item.id === taskId);
    if (!task) throw new BoardStorageError('TASK_NOT_FOUND');
    const revision = this.db.prepare(`SELECT r.contract_json,r.content_hash,t.source_draft_id,
      d.conversation_id FROM tasks t JOIN task_revisions r ON r.task_id=t.task_id
      AND r.revision=t.current_revision JOIN task_drafts d ON d.draft_id=t.source_draft_id
      WHERE t.project_id=? AND t.task_id=?`).get(projectId, taskId) as {
      contract_json: string; content_hash: string; source_draft_id: string;
      conversation_id: string;
    } | undefined;
    if (!revision) throw new BoardStorageError('TASK_NOT_FOUND');
    const contract = taskContractSchema.parse(JSON.parse(revision.contract_json));
    if (contract.taskId !== taskId || contract.projectId !== projectId ||
      contract.revision !== task.contractRevision || contractDigest(contract) !== revision.content_hash) {
      throw new Error('Approved task revision integrity check failed');
    }
    const sources: TaskSource[] = taskSourceRefs(contract).map((ref) => {
      const [kind, id] = ref.split(':', 2);
      if (kind === 'message' && id) {
        const row = this.db.prepare(`SELECT m.content_json,m.created_at FROM messages m
          JOIN conversations c ON c.conversation_id=m.conversation_id
          WHERE c.project_id=? AND c.conversation_id=? AND m.message_id=? AND m.role='user'`)
          .get(projectId, revision.conversation_id, id) as {
            content_json: string; created_at: string;
          } | undefined;
        if (row) {
          const content: unknown = JSON.parse(row.content_json);
          if (typeof content === 'object' && content !== null && 'text' in content &&
            typeof content.text === 'string') return { ref, kind, status: 'available' as const,
              text: content.text, createdAt: row.created_at };
        }
      }
      if (kind === 'decision' && id) {
        const row = this.db.prepare(`SELECT decision_summary,created_at FROM task_draft_revisions
          WHERE draft_id=? AND decision_id=? AND revision<=?`)
          .get(revision.source_draft_id, id, task.contractRevision) as {
            decision_summary: string | null; created_at: string;
          } | undefined;
        if (row?.decision_summary) return { ref, kind, status: 'available' as const,
          text: row.decision_summary, createdAt: row.created_at };
      }
      return { ref, kind: kind === 'message' || kind === 'decision' ? kind : 'unknown',
        status: 'withdrawn' as const, text: null, createdAt: null };
    });
    const runIds = (this.db.prepare(`SELECT run_id FROM runs WHERE project_id=? AND task_id=?
      ORDER BY created_at DESC LIMIT 50`).all(projectId, taskId) as {run_id:string}[]).map((row)=>row.run_id);
    return taskDetailViewSchema.parse({ detail: { task, contract, runIds, artifactIds: [],
      pendingApprovalIds: [] }, sources });
  }

  snapshot(projectId: string): BoardSnapshot {
    const project = this.db.prepare('SELECT 1 FROM projects WHERE project_id=? AND archived_at IS NULL')
      .get(projectId);
    if (!project) throw new BoardStorageError('PROJECT_NOT_FOUND');
    const state = this.db.prepare('SELECT revision FROM board_state WHERE project_id=?')
      .get(projectId) as { revision: number } | undefined;
    if (!state) throw new BoardStorageError('PROJECT_NOT_FOUND');
    const rows = this.db.prepare(`SELECT * FROM tasks WHERE project_id=? AND state='todo'
      ORDER BY position ASC, created_at ASC, task_id ASC`).all(projectId) as TaskRow[];
    const latestRun = this.db.prepare(`SELECT r.run_id,r.state,a.executor_id FROM runs r
      JOIN run_attempts a ON a.run_id=r.run_id WHERE r.project_id=? AND r.task_id=?
      ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1`);
    const tasks: BoardTask[] = rows.map((row) => {
      const contract = taskContractSchema.parse(JSON.parse(row.contract_json));
      const run = latestRun.get(projectId, row.task_id) as {
        run_id: string; state: string; executor_id: string;
      } | undefined;
      const developing = run && !['failed', 'cancelled'].includes(run.state);
      const inFlight = run && !['succeeded', 'failed', 'cancelled', 'interrupted'].includes(run.state);
      const blockReason = run?.state === 'succeeded' ? '开发快照已生成；Review 与 Verify 尚未运行' :
        run?.state === 'interrupted' ? '运行中断；进程状态需要对账' :
          run?.state === 'failed' ? '上次开发运行失败；查看 Run 详情' :
            run?.state === 'cancelled' ? '上次开发运行已取消；查看 Run 详情' : null;
      return boardTaskSchema.parse({ id: row.task_id, projectId: row.project_id,
        title: contract.title, state: developing ? 'active' : 'todo',
        boardColumn: developing ? 'development' : 'todo', revision: row.revision,
        contractRevision: row.current_revision, approvedRevision: row.current_revision,
        activeRunId: inFlight ? run.run_id : null, blockReason,
        allowedCommands: developing ? [] : ['tasks.reorder'],
        priority: contract.priority, executorId: run?.executor_id ?? null, position: row.position,
        createdAt: row.created_at });
    });
    const cursor = this.db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM board_events WHERE project_id=?')
      .get(projectId) as { seq: number };
    return boardSnapshotSchema.parse({ projectId, tasks, eventCursor: String(cursor.seq),
      boardRevision: state.revision, serverTime: new Date().toISOString() });
  }

  reorder(input: BoardReorderInput): BoardSnapshot {
    return this.db.transaction(() => {
      const fingerprint = createHash('sha256').update(JSON.stringify({ ...input,
        idempotencyKey: undefined })).digest('hex');
      const receipt = this.db.prepare(`SELECT request_hash,result_json FROM board_reorder_receipts
        WHERE project_id=? AND idempotency_key=?`).get(input.projectId, input.idempotencyKey) as
        { request_hash: string; result_json: string } | undefined;
      if (receipt) {
        if (receipt.request_hash !== fingerprint) throw new BoardStorageError('IDEMPOTENCY_CONFLICT');
        return boardSnapshotSchema.parse(JSON.parse(receipt.result_json));
      }
      const before = this.snapshot(input.projectId);
      if (before.boardRevision !== input.expectedBoardRevision) {
        throw new BoardStorageError('REVISION_CONFLICT');
      }
      const target = before.tasks.find((task) => task.id === input.taskId);
      if (!target) throw new BoardStorageError('TASK_NOT_FOUND');
      if (target.boardColumn !== 'todo') throw new BoardStorageError('BOARD_CROSS_COLUMN_FORBIDDEN');
      const related = [input.beforeTaskId, input.afterTaskId].filter((id): id is string => id !== null);
      if (new Set(related).size !== related.length || related.includes(target.id)) {
        throw new BoardStorageError('BOARD_INVALID_REORDER');
      }
      for (const id of related) {
        const neighbor = this.db.prepare('SELECT project_id,state FROM tasks WHERE task_id=?')
          .get(id) as { project_id: string; state: string } | undefined;
        if (!neighbor || neighbor.project_id !== input.projectId || neighbor.state !== target.state) {
          throw new BoardStorageError('BOARD_CROSS_COLUMN_FORBIDDEN');
        }
      }
      const others = before.tasks.filter((task) => task.id !== target.id &&
        task.boardColumn === target.boardColumn);
      const previousIndex = input.beforeTaskId === null ? -1 : others.findIndex((task) =>
        task.id === input.beforeTaskId);
      const nextIndex = input.afterTaskId === null ? others.length : others.findIndex((task) =>
        task.id === input.afterTaskId);
      if ((input.beforeTaskId !== null && previousIndex < 0) ||
        (input.afterTaskId !== null && nextIndex < 0) || nextIndex !== previousIndex + 1) {
        throw new BoardStorageError('BOARD_INVALID_REORDER');
      }
      others.splice(nextIndex, 0, target);
      const changed = others.some((task, index) => task.position !== index);
      const now = new Date().toISOString();
      if (changed) {
        for (const [position, task] of others.entries()) {
          if (task.position === position) continue;
          this.db.prepare(`UPDATE tasks SET position=?,revision=revision+1,updated_at=?
            WHERE task_id=? AND project_id=?`).run(position, now, task.id, input.projectId);
        }
        this.db.prepare('UPDATE board_state SET revision=revision+1 WHERE project_id=?')
          .run(input.projectId);
        this.db.prepare(`INSERT INTO board_events(event_id,project_id,task_id,type,payload_json,created_at)
          VALUES (?,?,?,'tasks.reordered',?,?)`).run(randomUUID(), input.projectId,
            target.id, JSON.stringify({ beforeTaskId: input.beforeTaskId,
              afterTaskId: input.afterTaskId }), now);
      }
      const result = this.snapshot(input.projectId);
      this.db.prepare(`INSERT INTO board_reorder_receipts(project_id,idempotency_key,request_hash,result_json,created_at)
        VALUES (?,?,?,?,?)`).run(input.projectId, input.idempotencyKey, fingerprint,
          JSON.stringify(result), now);
      return result;
    })();
  }
}
