"""P1 conversation boundary. User text is durable; no reply is fabricated offline."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.persistence import ForgePersistence


def timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class ConversationError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class Conversation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    conversationId: UUID
    projectId: UUID
    title: str = Field(min_length=1, max_length=160)
    revision: int = Field(ge=1)
    createdAt: str
    updatedAt: str
    archivedAt: str | None


class ConversationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    messageId: UUID
    conversationId: UUID
    sequence: int = Field(ge=1)
    role: Literal["user", "assistant", "system", "tool"]
    content: str = Field(max_length=100_000)
    status: Literal["pending", "streaming", "completed", "failed", "cancelled"]
    createdAt: str
    updatedAt: str


class ConversationSend(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    conversationId: UUID
    idempotencyKey: str = Field(min_length=16, max_length=128)
    text: str = Field(min_length=1, max_length=100_000)
    attachmentIds: list[UUID] = Field(max_length=16)


class ControlProposal(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    proposalId: UUID
    projectId: UUID
    conversationId: UUID
    sourceMessageId: UUID
    kind: Literal["lower_priority", "pause_run", "revise_draft", "restricted", "unrecognized"]
    state: Literal["needs_target", "requires_confirmation", "unavailable", "unsupported"]
    targetKind: Literal["task", "run", "draft"] | None
    summary: str = Field(min_length=1, max_length=240)
    requiresHumanConfirmation: bool
    executionAllowed: Literal[False]
    createdAt: str


class ConversationService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def _project(self, project_id: str) -> None:
        row = self.storage.session().execute(
            "SELECT archived_at FROM projects WHERE project_id=?", (project_id,)
        ).fetchone()
        if row is None:
            raise ConversationError("PROJECT_NOT_FOUND")
        if row["archived_at"] is not None:
            raise ConversationError("PROJECT_ARCHIVED")

    @staticmethod
    def _conversation(row: object) -> Conversation:
        from sqlite3 import Row

        assert isinstance(row, Row)
        return Conversation.model_validate_json(
            json.dumps(
                {
                    "conversationId": row["conversation_id"],
                    "projectId": row["project_id"],
                    "title": row["title"],
                    "revision": row["revision"],
                    "createdAt": row["created_at"],
                    "updatedAt": row["updated_at"],
                    "archivedAt": row["archived_at"],
                }
            )
        )

    @staticmethod
    def _message(row: object) -> ConversationMessage:
        from sqlite3 import Row

        assert isinstance(row, Row)
        content = json.loads(row["content_json"])
        if not isinstance(content, dict) or not isinstance(content.get("text"), str):
            raise ConversationError("INVALID_MESSAGE_CONTENT")
        return ConversationMessage.model_validate_json(
            json.dumps(
                {
                    "messageId": row["message_id"],
                    "conversationId": row["conversation_id"],
                    "sequence": row["sequence"],
                    "role": row["role"],
                    "content": content["text"],
                    "status": row["status"],
                    "createdAt": row["created_at"],
                    "updatedAt": row["updated_at"],
                }
            )
        )

    def create(self, project_id: str, title: str, expected_revision: int) -> Conversation:
        with self.storage.transaction() as db:
            self._project(project_id)
            if expected_revision != 0:
                raise ConversationError("REVISION_CONFLICT")
            conversation_id = str(uuid4())
            now = timestamp()
            db.execute(
                "INSERT INTO conversations(conversation_id,project_id,title,revision,"
                "created_at,updated_at) "
                "VALUES(?,?,?,1,?,?)",
                (conversation_id, project_id, title, now, now),
            )
        created = self.get(project_id, conversation_id)
        if created is None:
            raise ConversationError("CONVERSATION_NOT_FOUND")
        return created

    def get(self, project_id: str, conversation_id: str) -> Conversation | None:
        self._project(project_id)
        row = self.storage.session().execute(
            "SELECT * FROM conversations WHERE project_id=? AND conversation_id=? "
            "AND archived_at IS NULL",
            (project_id, conversation_id),
        ).fetchone()
        return self._conversation(row) if row is not None else None

    def list_conversations(self, project_id: str) -> list[Conversation]:
        self._project(project_id)
        rows = self.storage.session().execute(
            "SELECT * FROM conversations WHERE project_id=? AND archived_at IS NULL "
            "ORDER BY updated_at DESC,conversation_id DESC",
            (project_id,),
        ).fetchall()
        return [self._conversation(row) for row in rows]

    def messages(self, project_id: str, conversation_id: str) -> list[ConversationMessage]:
        if self.get(project_id, conversation_id) is None:
            raise ConversationError("CONVERSATION_NOT_FOUND")
        rows = self.storage.session().execute(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY sequence", (conversation_id,)
        ).fetchall()
        return [self._message(row) for row in rows]

    def propose(self, project_id: str, conversation_id: str, message_id: str) -> ControlProposal:
        message = next(
            (item for item in self.messages(project_id, conversation_id)
             if str(item.messageId) == message_id and item.role == "user"),
            None,
        )
        if message is None:
            raise ConversationError("MESSAGE_NOT_FOUND")
        value = message.content[:20_000]
        restricted = re.search(
            r"合并|推送|部署|发布|删除|跳过审批|忽略审批|"
            r"\b(?:merge|push|deploy|publish|delete|skip approval|bypass approval)\b",
            value, re.I,
        )
        lower = re.search(
            r"降.{0,8}优先级|优先级.{0,8}(?:降|低)|"
            r"\b(?:lower\s+priority|deprioriti[sz]e)\b", value, re.I,
        )
        pause = re.search(r"暂停|中断|\b(?:pause|interrupt)\b", value, re.I)
        revise = re.search(
            r"(?:修改|修订|编辑).{0,8}草稿|草稿.{0,8}(?:修改|修订|编辑)|"
            r"\b(?:revise|edit)\s+(?:the\s+)?draft\b", value, re.I,
        )
        kind: Literal[
            "lower_priority", "pause_run", "revise_draft", "restricted", "unrecognized"
        ] = "unrecognized"
        state: Literal[
            "needs_target", "requires_confirmation", "unavailable", "unsupported"
        ] = "unsupported"
        target: Literal["task", "run", "draft"] | None = None
        summary = "未识别为受支持的控制指令；原始消息仍保留。"
        if restricted:
            kind, state = "restricted", "requires_confirmation"
            summary = "请求涉及合并、推送、部署、删除或跳过审批；聊天不能授权或执行。"
        elif lower:
            kind, state, target = "lower_priority", "needs_target", "task"
            summary = "建议降低指定任务优先级；需选择 Task、创建新修订并按规则批准。"
        elif pause:
            kind, state, target = "pause_run", "unavailable", "run"
            summary = "建议暂停指定 Run；当前尚无 Run 控制能力，不能从聊天直接停止进程。"
        elif revise:
            kind, state, target = "revise_draft", "needs_target", "draft"
            summary = "建议打开现有草稿编辑；保存新 revision 需要明确的用户决定。"
        return ControlProposal(
            proposalId=message.messageId, projectId=UUID(project_id),
            conversationId=UUID(conversation_id), sourceMessageId=message.messageId,
            kind=kind, state=state, targetKind=target, summary=summary,
            requiresHumanConfirmation=kind != "unrecognized", executionAllowed=False,
            createdAt=message.createdAt,
        )

    def send(self, data: ConversationSend) -> dict[str, object]:
        project_id, conversation_id = str(data.projectId), str(data.conversationId)
        content_hash = hashlib.sha256(
            json.dumps(
                [data.text, [str(item) for item in data.attachmentIds]], separators=(",", ":")
            ).encode()
        ).hexdigest()
        with self.storage.transaction() as db:
            if self.get(project_id, conversation_id) is None:
                raise ConversationError("CONVERSATION_NOT_FOUND")
            existing = db.execute(
                "SELECT content_hash,user_message_id,status FROM conversation_requests "
                "WHERE conversation_id=? AND idempotency_key=?",
                (conversation_id, data.idempotencyKey),
            ).fetchone()
            if existing is not None:
                if existing["content_hash"] != content_hash:
                    raise ConversationError("IDEMPOTENCY_CONFLICT")
                row = db.execute(
                    "SELECT * FROM messages WHERE message_id=?", (existing["user_message_id"],)
                ).fetchone()
                if row is None:
                    raise ConversationError("MESSAGE_NOT_FOUND")
                return {
                    "message": self._message(row), "replay": True,
                    "replyStatus": "completed" if existing["status"] == "completed"
                    else "unavailable",
                }
            now = timestamp()
            message_id = str(uuid4())
            request_id = str(uuid4())
            sequence_row = db.execute(
                "SELECT COALESCE(MAX(sequence),0)+1 FROM messages WHERE conversation_id=?",
                (conversation_id,),
            ).fetchone()
            assert sequence_row is not None
            sequence = sequence_row[0]
            db.execute(
                "INSERT INTO messages(message_id,conversation_id,sequence,role,content_json,status,"
                "created_at,updated_at) VALUES(?,?,?,'user',?,'completed',?,?)",
                (message_id, conversation_id, sequence, json.dumps({"text": data.text}), now, now),
            )
            db.execute(
                "INSERT INTO conversation_requests(request_id,conversation_id,idempotency_key,"
                "content_hash,user_message_id,status,created_at,updated_at) "
                "VALUES(?,?,?,?,?,'failed',?,?)",
                (
                    request_id,
                    conversation_id,
                    data.idempotencyKey,
                    content_hash,
                    message_id,
                    now,
                    now,
                ),
            )
            db.execute(
                "UPDATE conversations SET updated_at=?,revision=revision+1 WHERE conversation_id=?",
                (now, conversation_id),
            )
            row = db.execute("SELECT * FROM messages WHERE message_id=?", (message_id,)).fetchone()
            assert row is not None
            return {"message": self._message(row), "replay": False, "replyStatus": "unavailable"}

    def archive(self, project_id: str, conversation_id: str, revision: int) -> Conversation:
        with self.storage.transaction() as db:
            before = self.get(project_id, conversation_id)
            if before is None:
                raise ConversationError("CONVERSATION_NOT_FOUND")
            now = timestamp()
            changed = db.execute(
                "UPDATE conversations SET archived_at=?,updated_at=?,revision=revision+1 "
                "WHERE project_id=? AND conversation_id=? AND revision=? AND archived_at IS NULL",
                (now, now, project_id, conversation_id, revision),
            ).rowcount
            if changed != 1:
                raise ConversationError("REVISION_CONFLICT")
            return before.model_copy(
                update={"archivedAt": now, "updatedAt": now, "revision": revision + 1}
            )

    def recover_interrupted(self) -> int:
        with self.storage.transaction() as db:
            now = timestamp()
            changed = db.execute(
                "UPDATE conversation_requests SET status='failed',updated_at=? "
                "WHERE status='streaming'", (now,)
            ).rowcount
            db.execute(
                "UPDATE messages SET status='failed',updated_at=? "
                "WHERE role='assistant' AND status='streaming'", (now,)
            )
            return changed
