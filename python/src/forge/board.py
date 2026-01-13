"""Read-only board projection from approved Task and Run rows."""

from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING, Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.drafts import TaskContract
from forge.persistence import ForgePersistence

if TYPE_CHECKING:
    from forge.final_acceptance import FinalAcceptanceService


class BoardError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class BoardTask(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: UUID
    projectId: UUID
    title: str = Field(min_length=1, max_length=120)
    state: Literal["todo", "active", "blocked", "awaiting_acceptance", "done"]
    boardColumn: Literal["todo", "development", "review", "verify", "done"]
    revision: int = Field(ge=1)
    contractRevision: int = Field(ge=1)
    approvedRevision: int = Field(ge=1)
    activeRunId: UUID | None
    blockReason: str | None
    allowedCommands: list[Literal["tasks.reorder"]]
    priority: Literal["low", "normal", "high", "urgent"]
    executorId: str | None
    position: int = Field(ge=0)
    createdAt: str


class BoardSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    tasks: list[BoardTask]
    eventCursor: str
    boardRevision: int = Field(ge=0)
    serverTime: str


class TaskSource(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    ref: str = Field(min_length=1)
    kind: Literal["message", "decision", "unknown"]
    status: Literal["available", "withdrawn"]
    text: str | None
    createdAt: str | None


class TaskDetail(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    task: BoardTask
    contract: TaskContract
    runIds: list[UUID]
    artifactIds: list[UUID]
    pendingApprovalIds: list[UUID]


class TaskDetailView(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    detail: TaskDetail
    sources: list[TaskSource]


class BoardReorderInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    taskId: UUID
    expectedBoardRevision: int = Field(ge=0)
    idempotencyKey: UUID
    beforeTaskId: UUID | None
    afterTaskId: UUID | None


class BoardService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage
        self.final_acceptance: FinalAcceptanceService | None = None

    def snapshot(self, project_id: str) -> BoardSnapshot:
        db = self.storage.session()
        if db.execute(
            "SELECT 1 FROM projects WHERE project_id=? AND archived_at IS NULL",
            (project_id,),
        ).fetchone() is None:
            raise BoardError("PROJECT_NOT_FOUND")
        state = db.execute(
            "SELECT revision FROM board_state WHERE project_id=?", (project_id,)
        ).fetchone()
        if state is None:
            raise BoardError("PROJECT_NOT_FOUND")
        rows = db.execute(
            "SELECT * FROM tasks WHERE project_id=? AND state='todo' "
            "ORDER BY position ASC,created_at ASC,task_id ASC",
            (project_id,),
        ).fetchall()
        has_review = self.storage.schema_version() >= 17
        tasks: list[BoardTask] = []
        for row in rows:
            contract = TaskContract.model_validate_json(row["contract_json"])
            run = db.execute(
                "SELECT r.run_id,r.state,a.executor_id FROM runs r "
                "JOIN run_attempts a ON a.run_id=r.run_id "
                "WHERE r.project_id=? AND r.task_id=? "
                "ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1",
                (project_id, row["task_id"]),
            ).fetchone()
            developing = run is not None and run["state"] not in ("failed", "cancelled")
            in_flight = run is not None and run["state"] not in (
                "succeeded", "failed", "cancelled", "interrupted"
            )
            reason = {
                "succeeded": "开发快照已生成；Review 与 Verify 尚未运行",
                "interrupted": "运行中断；进程状态需要对账",
                "failed": "上次开发运行失败；查看 Run 详情",
                "cancelled": "上次开发运行已取消；查看 Run 详情",
            }.get(run["state"]) if run else None
            if run is not None and run["state"] == "succeeded" and has_review:
                review = db.execute(
                    "SELECT j.state,j.error_code,r.outcome FROM review_jobs j "
                    "LEFT JOIN review_reports r ON r.review_id=j.report_id "
                    "WHERE j.development_run_id=? ORDER BY j.rowid DESC LIMIT 1",
                    (run["run_id"],),
                ).fetchone()
                if review is not None:
                    reason = {
                        "approved": "Review 已批准；Verify 与人工验收尚未运行",
                        "changes_requested": "Review 请求修改；需新的开发 Attempt",
                        "inconclusive": "Review 结果不确定；不能推进",
                    }.get(review["outcome"], {
                        "running": "Review 运行中；Verify 尚未运行",
                        "failed": "Review 运行失败；不能推进",
                        "interrupted": "Review 中断；需对账",
                    }.get(review["state"], reason))
            blocked = False
            accepted = False
            if self.storage.schema_version() >= 20:
                cycle = db.execute(
                    "SELECT c.state,c.reason_code,c.source_snapshot_id,c.next_run_id "
                    "FROM rework_cycles c WHERE c.project_id=? AND c.task_id=? "
                    "ORDER BY c.rowid DESC LIMIT 1", (project_id, row["task_id"]),
                ).fetchone()
                newest = db.execute(
                    "SELECT s.snapshot_id,s.run_id FROM code_snapshots s JOIN runs r "
                    "ON r.run_id=s.run_id WHERE r.project_id=? AND r.task_id=? "
                    "ORDER BY s.rowid DESC LIMIT 1", (project_id, row["task_id"]),
                ).fetchone()
                blocked = bool(cycle and cycle["state"] == "blocked" and newest and (
                    cycle["source_snapshot_id"] == newest["snapshot_id"] or
                    cycle["next_run_id"] == newest["run_id"]
                ))
                if blocked:
                    reason = "返工次数或总尝试次数达到上限；需要人工处理"
            if self.storage.schema_version() >= 21:
                final = db.execute(
                    "SELECT d.decision,d.snapshot_id,d.contract_revision "
                    "FROM final_acceptance_decisions d WHERE d.project_id=? AND d.task_id=? "
                    "ORDER BY d.rowid DESC LIMIT 1", (project_id, row["task_id"]),
                ).fetchone()
                newest = db.execute(
                    "SELECT s.snapshot_id FROM code_snapshots s JOIN runs r ON r.run_id=s.run_id "
                    "WHERE r.project_id=? AND r.task_id=? ORDER BY s.rowid DESC LIMIT 1",
                    (project_id, row["task_id"]),
                ).fetchone()
                accepted = bool(final and newest and final["decision"] == "accept"
                                and final["snapshot_id"] == newest["snapshot_id"]
                                and final["contract_revision"] == row["current_revision"])
                if accepted and self.final_acceptance is not None:
                    current = self.final_acceptance.get(UUID(project_id), UUID(row["task_id"]))
                    accepted = current.status == "accepted" and current.decision is not None
                if accepted:
                    assert newest is not None
                    reason = "当前快照已经由本地 Owner 最终验收；尚未合并或部署"
                    if self.storage.schema_version() >= 22:
                        merged = db.execute(
                            "SELECT 1 FROM merge_operations m JOIN delivery_records d "
                            "ON d.delivery_id=m.delivery_id WHERE d.project_id=? "
                            "AND d.task_id=? AND d.snapshot_id=? AND m.state='merged' LIMIT 1",
                            (project_id, row["task_id"], newest["snapshot_id"]),
                        ).fetchone()
                        if merged:
                            reason = "当前快照已由本地 Owner 验收并显式本地合并；尚未推送或部署"
            tasks.append(
                BoardTask.model_validate_json(
                    json.dumps(
                        {
                            "id": row["task_id"], "projectId": row["project_id"],
                            "title": contract.title,
                            "state": "done" if accepted else "blocked" if blocked else (
                                "active" if developing else "todo"),
                            "boardColumn": "done" if accepted else (
                                "development" if blocked or developing else "todo"),
                            "revision": row["revision"],
                            "contractRevision": row["current_revision"],
                            "approvedRevision": row["current_revision"],
                            "activeRunId": run["run_id"] if in_flight and run is not None else None,
                            "blockReason": reason,
                            "allowedCommands": (
                                [] if accepted or blocked or developing else ["tasks.reorder"]),
                            "priority": contract.priority,
                            "executorId": run["executor_id"] if run else None,
                            "position": row["position"], "createdAt": row["created_at"],
                        }
                    )
                )
            )
        cursor_row = db.execute(
            "SELECT COALESCE(MAX(seq),0) FROM board_events WHERE project_id=?", (project_id,)
        ).fetchone()
        assert cursor_row is not None
        cursor = cursor_row[0]
        return BoardSnapshot.model_validate_json(
            json.dumps(
                {
                    "projectId": project_id,
                    "tasks": [item.model_dump(mode="json") for item in tasks],
                    "eventCursor": str(cursor), "boardRevision": state["revision"],
                    "serverTime": timestamp(),
                }
            )
        )

    def detail(self, project_id: str, task_id: str) -> TaskDetailView:
        task = next(
            (item for item in self.snapshot(project_id).tasks if str(item.id) == task_id),
            None,
        )
        if task is None:
            raise BoardError("TASK_NOT_FOUND")
        db = self.storage.session()
        revision = db.execute(
            "SELECT r.contract_json,r.content_hash,t.source_draft_id,d.conversation_id "
            "FROM tasks t JOIN task_revisions r ON r.task_id=t.task_id "
            "AND r.revision=t.current_revision JOIN task_drafts d "
            "ON d.draft_id=t.source_draft_id WHERE t.project_id=? AND t.task_id=?",
            (project_id, task_id),
        ).fetchone()
        if revision is None:
            raise BoardError("TASK_NOT_FOUND")
        from forge.approvals import contract_digest

        contract = TaskContract.model_validate_json(revision["contract_json"])
        if (
            contract.taskId != task_id or contract.projectId != project_id
            or contract.revision != task.contractRevision
            or contract_digest(contract) != revision["content_hash"]
        ):
            raise BoardError("TASK_REVISION_INVALID")
        refs = dict.fromkeys([
            *contract.sourceRefs,
            *(ref for item in contract.acceptance for ref in item.sourceRefs),
        ])
        sources: list[TaskSource] = []
        for ref in refs:
            kind, _, identifier = ref.partition(":")
            found: Any = None
            if kind == "message" and identifier:
                found = db.execute(
                    "SELECT m.content_json,m.created_at FROM messages m JOIN conversations c "
                    "ON c.conversation_id=m.conversation_id WHERE c.project_id=? "
                    "AND c.conversation_id=? AND m.message_id=? AND m.role='user'",
                    (project_id, revision["conversation_id"], identifier),
                ).fetchone()
                if found:
                    content = json.loads(found["content_json"])
                    if isinstance(content, dict) and isinstance(content.get("text"), str):
                        sources.append(TaskSource(
                            ref=ref, kind="message", status="available",
                            text=content["text"], createdAt=found["created_at"]
                        ))
                        continue
            if kind == "decision" and identifier:
                found = db.execute(
                    "SELECT decision_summary,created_at FROM task_draft_revisions "
                    "WHERE draft_id=? AND decision_id=? AND revision<=?",
                    (revision["source_draft_id"], identifier, task.contractRevision),
                ).fetchone()
                if found and found["decision_summary"]:
                    sources.append(TaskSource(
                        ref=ref, kind="decision", status="available",
                        text=found["decision_summary"], createdAt=found["created_at"]
                    ))
                    continue
                if self.storage.schema_version() >= 23:
                    change = db.execute(
                        "SELECT reason,created_at FROM task_change_requests "
                        "WHERE project_id=? AND task_id=? AND decision_id=? AND state='applied'",
                        (project_id, task_id, identifier),
                    ).fetchone()
                    if change:
                        sources.append(TaskSource(
                            ref=ref, kind="decision", status="available",
                            text=change["reason"], createdAt=change["created_at"],
                        ))
                        continue
            source_kind: Literal["message", "decision", "unknown"] = (
                "message" if kind == "message" else "decision"
                if kind == "decision" else "unknown"
            )
            sources.append(TaskSource(
                ref=ref, kind=source_kind, status="withdrawn",
                text=None, createdAt=None,
            ))
        run_ids = [row["run_id"] for row in db.execute(
            "SELECT run_id FROM runs WHERE project_id=? AND task_id=? "
            "ORDER BY created_at DESC LIMIT 50", (project_id, task_id)
        ).fetchall()]
        return TaskDetailView.model_validate_json(json.dumps({
            "detail": {
                "task": task.model_dump(mode="json"),
                "contract": contract.model_dump(mode="json"),
                "runIds": run_ids, "artifactIds": [], "pendingApprovalIds": [],
            },
            "sources": [item.model_dump(mode="json") for item in sources],
        }))

    def reorder(self, request: BoardReorderInput) -> BoardSnapshot:
        project_id, task_id = str(request.projectId), str(request.taskId)
        before_id = str(request.beforeTaskId) if request.beforeTaskId else None
        after_id = str(request.afterTaskId) if request.afterTaskId else None
        body = {
            "projectId": project_id, "taskId": task_id,
            "expectedBoardRevision": request.expectedBoardRevision,
            "beforeTaskId": before_id, "afterTaskId": after_id,
        }
        fingerprint = hashlib.sha256(
            json.dumps(body, separators=(",", ":")).encode()
        ).hexdigest()
        with self.storage.transaction() as db:
            receipt = db.execute(
                "SELECT request_hash,result_json FROM board_reorder_receipts "
                "WHERE project_id=? AND idempotency_key=?",
                (project_id, str(request.idempotencyKey)),
            ).fetchone()
            if receipt:
                if receipt["request_hash"] != fingerprint:
                    raise BoardError("IDEMPOTENCY_CONFLICT")
                return BoardSnapshot.model_validate_json(receipt["result_json"])
            snapshot = self.snapshot(project_id)
            if snapshot.boardRevision != request.expectedBoardRevision:
                raise BoardError("REVISION_CONFLICT")
            target = next((item for item in snapshot.tasks if item.id == request.taskId), None)
            if target is None:
                raise BoardError("TASK_NOT_FOUND")
            if target.boardColumn != "todo":
                raise BoardError("BOARD_CROSS_COLUMN_FORBIDDEN")
            related = [item for item in (before_id, after_id) if item is not None]
            if len(related) != len(set(related)) or task_id in related:
                raise BoardError("BOARD_INVALID_REORDER")
            for neighbor_id in related:
                neighbor = db.execute(
                    "SELECT project_id,state FROM tasks WHERE task_id=?", (neighbor_id,)
                ).fetchone()
                if (
                    neighbor is None or neighbor["project_id"] != project_id
                    or neighbor["state"] != "todo"
                ):
                    raise BoardError("BOARD_CROSS_COLUMN_FORBIDDEN")
            # Position is meaningful within a column. A completed delivery may
            # still have an older position; it must not become a TODO neighbor.
            others = [item for item in snapshot.tasks
                      if item.boardColumn == target.boardColumn and item.id != target.id]
            previous_index = -1 if before_id is None else next(
                (index for index, item in enumerate(others) if str(item.id) == before_id), -2
            )
            next_index = len(others) if after_id is None else next(
                (index for index, item in enumerate(others) if str(item.id) == after_id), -2
            )
            if previous_index < -1 or next_index < 0 or next_index != previous_index + 1:
                raise BoardError("BOARD_INVALID_REORDER")
            others.insert(next_index, target)
            changed = any(item.position != index for index, item in enumerate(others))
            now = timestamp()
            if changed:
                for position, item in enumerate(others):
                    if item.position == position:
                        continue
                    db.execute(
                        "UPDATE tasks SET position=?,revision=revision+1,updated_at=? "
                        "WHERE task_id=? AND project_id=?",
                        (position, now, str(item.id), project_id),
                    )
                db.execute(
                    "UPDATE board_state SET revision=revision+1 WHERE project_id=?",
                    (project_id,),
                )
                db.execute(
                    "INSERT INTO board_events(event_id,project_id,task_id,type,payload_json,"
                    "created_at) VALUES(?,?,?,'tasks.reordered',?,?)",
                    (str(uuid4()), project_id, task_id,
                     json.dumps({"beforeTaskId": before_id, "afterTaskId": after_id}), now),
                )
            result = self.snapshot(project_id)
            db.execute(
                "INSERT INTO board_reorder_receipts(project_id,idempotency_key,request_hash,"
                "result_json,created_at) VALUES(?,?,?,?,?)",
                (project_id, str(request.idempotencyKey), fingerprint,
                 result.model_dump_json(), now),
            )
            return result
