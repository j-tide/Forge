import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { conversationMessageSchema, conversationSchema, conversationSendSchema,
  type Conversation, type ConversationMessage, type ConversationSend } from '@forge/contracts';

export class ConversationStorageError extends Error {
  constructor(readonly code: 'PROJECT_NOT_FOUND' | 'PROJECT_ARCHIVED' | 'CONVERSATION_NOT_FOUND' |
    'MESSAGE_NOT_FOUND' | 'CONVERSATION_BUSY' | 'REVISION_CONFLICT' | 'IDEMPOTENCY_CONFLICT') { super(code); }
}

interface ConversationRow {
  conversation_id: string; project_id: string; title: string; revision: number;
  created_at: string; updated_at: string; archived_at: string | null;
}
interface MessageRow {
  message_id: string; conversation_id: string; sequence: number; role: string;
  content_json: string; status: string; created_at: string; updated_at: string;
}

function conversation(row: ConversationRow): Conversation {
  return conversationSchema.parse({ conversationId: row.conversation_id, projectId: row.project_id,
    title: row.title, revision: row.revision, createdAt: row.created_at,
    updatedAt: row.updated_at, archivedAt: row.archived_at });
}
function message(row: MessageRow): ConversationMessage {
  const content: unknown = JSON.parse(row.content_json);
  if (!content || typeof content !== 'object' || !('text' in content)) throw new Error('Invalid message content');
  return conversationMessageSchema.parse({ messageId: row.message_id,
    conversationId: row.conversation_id, sequence: row.sequence, role: row.role,
    content: content.text, status: row.status, createdAt: row.created_at,
    updatedAt: row.updated_at });
}

export class ConversationDataStore {
  constructor(private readonly db: Database.Database) {}

  private project(projectId: string): void {
    const row = this.db.prepare('SELECT archived_at FROM projects WHERE project_id = ?')
      .get(projectId) as { archived_at: string | null } | undefined;
    if (!row) throw new ConversationStorageError('PROJECT_NOT_FOUND');
    if (row.archived_at) throw new ConversationStorageError('PROJECT_ARCHIVED');
  }

  get(projectId: string, conversationId: string): Conversation | null {
    this.project(projectId);
    const row = this.db.prepare(`SELECT * FROM conversations WHERE project_id = ?
      AND conversation_id = ? AND archived_at IS NULL`).get(projectId, conversationId) as ConversationRow | undefined;
    return row ? conversation(row) : null;
  }

  list(projectId: string): Conversation[] {
    this.project(projectId);
    return (this.db.prepare(`SELECT * FROM conversations WHERE project_id = ? AND archived_at IS NULL
      ORDER BY updated_at DESC, conversation_id DESC`).all(projectId) as ConversationRow[]).map(conversation);
  }

  create(projectId: string, title: string, expectedRevision: number): Conversation {
    return this.db.transaction(() => {
      this.project(projectId);
      if (expectedRevision !== 0) throw new ConversationStorageError('REVISION_CONFLICT');
      const id = randomUUID(); const now = new Date().toISOString();
      this.db.prepare(`INSERT INTO conversations(conversation_id,project_id,title,revision,created_at,updated_at)
        VALUES (?,?,?,1,?,?)`).run(id, projectId, title, now, now);
      const created = this.get(projectId, id);
      if (!created) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      return created;
    })();
  }

  archive(projectId: string, conversationId: string, expectedRevision: number): Conversation {
    return this.db.transaction(() => {
      const before = this.get(projectId, conversationId);
      if (!before) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      const now = new Date().toISOString();
      const changed = this.db.prepare(`UPDATE conversations SET archived_at = ?, updated_at = ?,
        revision = revision + 1 WHERE project_id = ? AND conversation_id = ?
        AND revision = ? AND archived_at IS NULL`).run(now, now, projectId, conversationId, expectedRevision).changes;
      if (!changed) throw new ConversationStorageError('REVISION_CONFLICT');
      return { ...before, archivedAt: now, updatedAt: now, revision: before.revision + 1 };
    })();
  }

  messages(projectId: string, conversationId: string): ConversationMessage[] {
    if (!this.get(projectId, conversationId)) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
    return (this.db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY sequence`)
      .all(conversationId) as MessageRow[]).map(message);
  }

  recordUserMessage(input: ConversationSend): { message: ConversationMessage; replay: boolean } {
    const checked = conversationSendSchema.parse(input);
    return this.db.transaction(() => {
      if (!this.get(checked.projectId, checked.conversationId)) {
        throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      }
      const hash = createHash('sha256').update(JSON.stringify([checked.text, checked.attachmentIds])).digest('hex');
      const existing = this.db.prepare(`SELECT content_hash, user_message_id FROM conversation_requests
        WHERE conversation_id = ? AND idempotency_key = ?`).get(checked.conversationId, checked.idempotencyKey) as
        { content_hash: string; user_message_id: string } | undefined;
      if (existing) {
        if (existing.content_hash !== hash) throw new ConversationStorageError('IDEMPOTENCY_CONFLICT');
        const row = this.db.prepare('SELECT * FROM messages WHERE message_id = ?')
          .get(existing.user_message_id) as MessageRow | undefined;
        if (!row) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
        return { message: message(row), replay: true };
      }
      const now = new Date().toISOString(); const messageId = randomUUID(); const requestId = randomUUID();
      const next = (this.db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS seq FROM messages WHERE conversation_id = ?')
        .get(checked.conversationId) as { seq: number }).seq;
      this.db.prepare(`INSERT INTO messages(message_id,conversation_id,sequence,role,content_json,status,created_at,updated_at)
        VALUES (?,?,?,'user',?,'completed',?,?)`).run(messageId, checked.conversationId,
        next, JSON.stringify({ text: checked.text }), now, now);
      this.db.prepare(`INSERT INTO conversation_requests(request_id,conversation_id,idempotency_key,
        content_hash,user_message_id,status,created_at,updated_at) VALUES (?,?,?,?,?,'pending',?,?)`)
        .run(requestId, checked.conversationId, checked.idempotencyKey, hash, messageId, now, now);
      this.db.prepare(`UPDATE conversations SET updated_at = ?, revision = revision + 1
        WHERE conversation_id = ?`).run(now, checked.conversationId);
      const row = this.db.prepare('SELECT * FROM messages WHERE message_id = ?')
        .get(messageId) as MessageRow;
      return { message: message(row), replay: false };
    })();
  }

  failRequest(projectId: string, conversationId: string, idempotencyKey: string): void {
    this.db.transaction(() => {
      if (!this.get(projectId, conversationId)) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      this.db.prepare(`UPDATE conversation_requests SET status = 'failed', updated_at = ?
        WHERE conversation_id = ? AND idempotency_key = ? AND status = 'pending'`)
        .run(new Date().toISOString(), conversationId, idempotencyKey);
    })();
  }

  beginAssistantMessage(projectId: string, conversationId: string,
    idempotencyKey: string): ConversationMessage {
    return this.db.transaction(() => {
      if (!this.get(projectId, conversationId)) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      const request = this.db.prepare(`SELECT assistant_message_id FROM conversation_requests
        WHERE conversation_id = ? AND idempotency_key = ?`).get(conversationId, idempotencyKey) as
        { assistant_message_id: string | null } | undefined;
      if (!request) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      if (request.assistant_message_id) {
        const previous = this.db.prepare('SELECT status FROM messages WHERE message_id = ?')
          .get(request.assistant_message_id) as { status: string } | undefined;
        if (!previous || !['failed', 'cancelled'].includes(previous.status)) {
          throw new ConversationStorageError('IDEMPOTENCY_CONFLICT');
        }
      }
      const now = new Date().toISOString(); const id = randomUUID();
      const next = (this.db.prepare('SELECT COALESCE(MAX(sequence),0)+1 AS seq FROM messages WHERE conversation_id = ?')
        .get(conversationId) as { seq: number }).seq;
      this.db.prepare(`INSERT INTO messages(message_id,conversation_id,sequence,role,content_json,status,created_at,updated_at)
        VALUES (?,?,?,'assistant','{"text":""}','streaming',?,?)`).run(id, conversationId, next, now, now);
      this.db.prepare(`UPDATE conversation_requests SET assistant_message_id = ?, status = 'streaming',
        updated_at = ? WHERE conversation_id = ? AND idempotency_key = ?`)
        .run(id, now, conversationId, idempotencyKey);
      const row = this.db.prepare('SELECT * FROM messages WHERE message_id = ?').get(id) as MessageRow;
      return message(row);
    })();
  }

  requestStatus(projectId: string, conversationId: string, idempotencyKey: string):
    'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled' | null {
    if (!this.get(projectId, conversationId)) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
    const row = this.db.prepare(`SELECT status FROM conversation_requests
      WHERE conversation_id = ? AND idempotency_key = ?`).get(conversationId, idempotencyKey) as
      { status: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled' } | undefined;
    return row?.status ?? null;
  }

  recoverInterrupted(): number {
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      const count = this.db.prepare(`UPDATE conversation_requests SET status = 'failed', updated_at = ?
        WHERE status = 'streaming'`).run(now).changes;
      this.db.prepare(`UPDATE messages SET status = 'failed', updated_at = ?
        WHERE role = 'assistant' AND status = 'streaming'`).run(now);
      return count;
    })();
  }

  appendAssistantChunk(projectId: string, conversationId: string, messageId: string,
    chunk: string): ConversationMessage {
    return this.db.transaction(() => {
      if (!this.get(projectId, conversationId)) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      const row = this.db.prepare(`SELECT * FROM messages WHERE message_id = ?
        AND conversation_id = ? AND role = 'assistant' AND status = 'streaming'`)
        .get(messageId, conversationId) as MessageRow | undefined;
      if (!row) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      const current = message(row);
      const content = current.content + chunk;
      conversationMessageSchema.shape.content.parse(content);
      this.db.prepare('UPDATE messages SET content_json = ?, updated_at = ? WHERE message_id = ?')
        .run(JSON.stringify({ text: content }), new Date().toISOString(), messageId);
      const updated = this.db.prepare('SELECT * FROM messages WHERE message_id = ?').get(messageId) as MessageRow;
      return message(updated);
    })();
  }

  finishAssistantMessage(projectId: string, conversationId: string, messageId: string,
    status: 'completed' | 'failed' | 'cancelled'): ConversationMessage {
    return this.db.transaction(() => {
      if (!this.get(projectId, conversationId)) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      const row = this.db.prepare(`SELECT * FROM messages WHERE message_id = ?
        AND conversation_id = ? AND role = 'assistant'`).get(messageId, conversationId) as MessageRow | undefined;
      if (!row) throw new ConversationStorageError('CONVERSATION_NOT_FOUND');
      if (row.status !== 'streaming') return message(row);
      const now = new Date().toISOString();
      this.db.prepare(`UPDATE messages SET status = ?, updated_at = ? WHERE message_id = ?`)
        .run(status, now, messageId);
      this.db.prepare(`UPDATE conversation_requests SET status = ?, updated_at = ?
        WHERE conversation_id = ? AND assistant_message_id = ?`).run(status, now, conversationId, messageId);
      this.db.prepare(`UPDATE conversations SET updated_at = ?, revision = revision + 1
        WHERE conversation_id = ?`).run(now, conversationId);
      const updated = this.db.prepare('SELECT * FROM messages WHERE message_id = ?').get(messageId) as MessageRow;
      return message(updated);
    })();
  }
}
