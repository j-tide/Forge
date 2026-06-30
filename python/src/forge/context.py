"""Bounded, provenance-tagged Run context and durable working checkpoints."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from sqlite3 import Row
from typing import Annotated, Literal, cast
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError

from forge.approvals import canonical_json
from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.run_config import RunConfigService, RunConfigSnapshot, verify_snapshot


class ContextError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


EntryText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
SourceRef = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=256)]


class ContextEntry(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    text: EntryText
    sourceRef: SourceRef


class CheckpointBudget(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    elapsedMs: int = Field(ge=0)
    turnsUsed: int | None = Field(default=None, ge=0)
    tokensUsed: int | None = Field(default=None, ge=0)
    toolCallsUsed: int | None = Field(default=None, ge=0)


class WorkingCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    checkpointId: UUID
    projectId: UUID
    runId: UUID
    attemptId: UUID
    sequence: int = Field(ge=1)
    objective: ContextEntry
    completedActions: list[ContextEntry] = Field(max_length=16)
    openIssues: list[ContextEntry] = Field(max_length=16)
    budget: CheckpointBudget
    createdAt: str


class ContextItem(ContextEntry):
    kind: Literal[
        "goal", "acceptance", "constraint", "scope", "out_of_scope",
        "checkpoint_action", "checkpoint_issue", "rework_feedback",
        "retrieved_knowledge", "validated_memory",
    ]
    authority: Literal["approved_task", "run_observation", "review_evidence",
                       "verify_evidence", "human_decision", "untrusted_project",
                       "validated_memory"]


class ContextBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    bundleId: UUID
    projectId: UUID
    runId: UUID
    taskId: UUID
    configHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    taskRevision: int = Field(ge=1)
    checkpointId: UUID | None
    goal: EntryText
    items: list[ContextItem] = Field(min_length=1, max_length=96)
    omittedItems: int = Field(ge=0)
    maxChars: int = Field(ge=1000, le=32_000)
    createdAt: str
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class ContextSourceStatus(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    sourceRef: str
    kind: Literal["retrieved_knowledge", "validated_memory"]
    status: Literal["current", "revoked", "superseded", "expired", "missing"]


_KNOWLEDGE_REF = re.compile(r"^knowledge:([0-9a-f-]{36})@(\d+)#(\d+)$")
_MEMORY_REF = re.compile(r"^memory:([0-9a-f-]{36})@(\d+)$")
_TASK_REF = re.compile(r"^task:([0-9a-f-]{36})@(\d+)$")
_SNAPSHOT_REF = re.compile(r"^snapshot:([0-9a-f-]{36})$")


def _digest(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


def _size(item: ContextItem) -> int:
    # Match the historical TypeScript contract's String.length (UTF-16 code units).
    return (
        len(item.text.encode("utf-16-le")) // 2
        + len(item.sourceRef.encode("utf-16-le")) // 2 + 48
    )


def build_context_bundle(
    raw_config: RunConfigSnapshot, checkpoint: WorkingCheckpoint | None = None,
    max_chars: int = 16_000, bundle_id: UUID | None = None,
    created_at: str | None = None,
    rework_feedback: list[ContextItem] | None = None,
    retrieval_items: list[ContextItem] | None = None,
) -> ContextBundle:
    config = verify_snapshot(raw_config)
    if not 1000 <= max_chars <= 32_000:
        raise ContextError("CONTEXT_INVALID")
    if checkpoint and (
        checkpoint.projectId != config.projectId or checkpoint.runId != config.runId
        or checkpoint.objective.text != config.taskContract.goal
    ):
        raise ContextError("CONTEXT_INVALID")
    task_ref = f"task:{config.taskId}@{config.taskRevision}"
    required = [ContextItem(
        kind="goal", authority="approved_task", text=config.taskContract.goal,
        sourceRef=task_ref,
    )]
    required.extend(ContextItem(
        kind="acceptance", authority="approved_task", text=item.statement,
        sourceRef=item.sourceRefs[0] if item.sourceRefs else task_ref,
    ) for item in config.taskContract.acceptance)
    for kind, values in (
        ("constraint", config.taskContract.constraints),
        ("scope", config.taskContract.scope),
        ("out_of_scope", config.taskContract.outOfScope),
    ):
        required.extend(ContextItem(
            kind=cast(Literal["constraint", "scope", "out_of_scope"], kind),
            authority="approved_task", text=value, sourceRef=task_ref,
        ) for value in values)
    optional: list[ContextItem] = []
    if checkpoint:
        optional.extend(ContextItem(
            kind="checkpoint_action", authority="run_observation",
            text=item.text, sourceRef=item.sourceRef,
        ) for item in checkpoint.completedActions)
        optional.extend(ContextItem(
            kind="checkpoint_issue", authority="run_observation",
            text=item.text, sourceRef=item.sourceRef,
        ) for item in checkpoint.openIssues)
    if rework_feedback:
        if len(rework_feedback) > 16 or any(item.kind != "rework_feedback" or
                item.authority not in ("review_evidence", "verify_evidence", "human_decision")
                for item in rework_feedback):
            raise ContextError("CONTEXT_INVALID")
        required.extend(rework_feedback)
    if retrieval_items:
        if len(retrieval_items) > 40 or any(
            (item.kind, item.authority) not in (
                ("retrieved_knowledge", "untrusted_project"),
                ("validated_memory", "validated_memory"),
            ) for item in retrieval_items
        ):
            raise ContextError("CONTEXT_INVALID")
        optional.extend(retrieval_items)
    used = sum(_size(item) for item in required)
    if len(required) > 96 or used > max_chars:
        raise ContextError("CONTEXT_BUDGET_EXCEEDED")
    items = required[:]
    omitted = 0
    for item in optional:
        if len(items) >= 96 or used + _size(item) > max_chars:
            omitted += 1
        else:
            items.append(item)
            used += _size(item)
    body = {
        "bundleId": str(bundle_id or uuid4()), "projectId": str(config.projectId),
        "runId": str(config.runId), "taskId": str(config.taskId),
        "configHash": config.snapshotHash, "taskRevision": config.taskRevision,
        "checkpointId": str(checkpoint.checkpointId) if checkpoint else None,
        "goal": config.taskContract.goal,
        "items": [item.model_dump(mode="json") for item in items],
        "omittedItems": omitted, "maxChars": max_chars,
        "createdAt": created_at or timestamp(),
    }
    try:
        return ContextBundle.model_validate_json(json.dumps({
            **body, "contentHash": _digest(body)
        }, ensure_ascii=False))
    except ValidationError as error:
        raise ContextError("CONTEXT_INVALID") from error


def verify_context_bundle(value: ContextBundle | dict[str, object]) -> ContextBundle:
    try:
        bundle = (
            value if isinstance(value, ContextBundle)
            else ContextBundle.model_validate_json(json.dumps(value))
        )
        if (
            _digest(bundle.model_dump(mode="json", exclude={"contentHash"})) != bundle.contentHash
            or sum(_size(item) for item in bundle.items) > bundle.maxChars
            or bundle.items[0].kind != "goal"
            or bundle.items[0].authority != "approved_task"
        ):
            raise ContextError("CONTEXT_INVALID")
        return bundle
    except ValidationError as error:
        raise ContextError("CONTEXT_INVALID") from error


def executor_context(bundle: ContextBundle) -> list[str]:
    return [
        f"[{item.authority}; {item.sourceRef}; {item.kind}] {item.text}"
        for item in verify_context_bundle(bundle).items if item.kind != "goal"
    ]


class ContextService:
    def __init__(self, storage: ForgePersistence, configs: RunConfigService) -> None:
        self.storage = storage
        self.configs = configs

    def get_bundle(self, project_id: UUID, bundle_id: UUID) -> ContextBundle | None:
        row = self.storage.session().execute(
            "SELECT bundle_json FROM context_bundles WHERE project_id=? AND bundle_id=?",
            (str(project_id), str(bundle_id)),
        ).fetchone()
        return verify_context_bundle(json.loads(row["bundle_json"])) if row else None

    def _memory_sources_current(self, project_id: UUID, memory: Row) -> bool:
        source_json = memory["source_json"]
        environment_id = memory["environment_id"]
        for evidence in json.loads(source_json):
            ref, content_hash = evidence["sourceRef"], evidence["sourceHash"]
            knowledge = _KNOWLEDGE_REF.fullmatch(ref)
            task = _TASK_REF.fullmatch(ref)
            snapshot = _SNAPSHOT_REF.fullmatch(ref)
            if knowledge:
                row = self.storage.session().execute(
                    "SELECT c.content_hash FROM knowledge_chunks c JOIN knowledge_sources s "
                    "ON s.source_id=c.source_id WHERE s.project_id=? AND s.environment_id=? "
                    "AND s.status='active' AND s.source_id=? AND s.current_version=? "
                    "AND c.version=? AND c.ordinal=? AND length(c.text)>0",
                    (str(project_id), environment_id, knowledge[1], int(knowledge[2]),
                     int(knowledge[2]), int(knowledge[3])),
                ).fetchone()
            elif task:
                row = self.storage.session().execute(
                    "SELECT r.content_hash FROM task_revisions r JOIN tasks t "
                    "ON t.task_id=r.task_id WHERE t.project_id=? AND t.task_id=? "
                    "AND t.current_revision=? AND r.revision=?",
                    (str(project_id), task[1], int(task[2]), int(task[2])),
                ).fetchone()
            elif snapshot:
                row = self.storage.session().execute(
                    "SELECT content_hash FROM code_snapshots WHERE project_id=? AND snapshot_id=?",
                    (str(project_id), snapshot[1]),
                ).fetchone()
            else:
                return False
            if row is None or row["content_hash"] != content_hash:
                return False
        return True

    def run_sources(self, project_id: UUID, run_id: UUID) -> list[ContextSourceStatus]:
        row = self.storage.session().execute(
            "SELECT b.bundle_json FROM context_bundles b JOIN runs r ON r.run_id=b.run_id "
            "WHERE r.project_id=? AND b.project_id=? AND b.run_id=? "
            "ORDER BY b.created_at DESC,b.bundle_id DESC LIMIT 1",
            (str(project_id), str(project_id), str(run_id)),
        ).fetchone()
        if row is None:
            raise ContextError("CONTEXT_RUN_NOT_FOUND")
        bundle = verify_context_bundle(json.loads(row["bundle_json"]))
        result: list[ContextSourceStatus] = []
        for item in bundle.items:
            if item.kind == "retrieved_knowledge":
                ref = _KNOWLEDGE_REF.fullmatch(item.sourceRef)
                source = None
                if ref is not None:
                    source = self.storage.session().execute(
                        "SELECT s.status,s.current_version,c.text FROM knowledge_sources s "
                        "LEFT JOIN knowledge_chunks c ON c.source_id=s.source_id "
                        "AND c.version=? AND c.ordinal=? "
                        "WHERE s.project_id=? AND s.source_id=?",
                        (int(ref[2]), int(ref[3]), str(project_id), ref[1]),
                    ).fetchone()
                status: Literal["current", "revoked", "superseded", "expired", "missing"] = (
                    "missing" if source is None else
                    "revoked" if source["status"] == "revoked" else
                    "superseded" if ref is not None and
                    source["current_version"] != int(ref[2]) else
                    "missing" if not source["text"] else "current"
                )
            elif item.kind == "validated_memory":
                memory_ref = _MEMORY_REF.fullmatch(item.sourceRef)
                memory = None
                if memory_ref is not None:
                    memory = self.storage.session().execute(
                        "SELECT status,revision,expires_at,text,source_json,environment_id "
                        "FROM project_memory "
                        "WHERE project_id=? AND memory_id=?",
                        (str(project_id), memory_ref[1]),
                    ).fetchone()
                status = (
                    "missing" if memory is None else
                    "revoked" if memory["status"] == "revoked" else
                    "superseded" if (
                        memory_ref is not None and memory["revision"] != int(memory_ref[2])
                        or memory["status"] != "validated"
                    ) else
                    "expired" if memory["expires_at"] and datetime.fromisoformat(
                        memory["expires_at"].replace("Z", "+00:00")) <= datetime.now(UTC)
                    else "superseded" if not self._memory_sources_current(project_id, memory)
                    else "current"
                )
            else:
                continue
            result.append(ContextSourceStatus(sourceRef=item.sourceRef,
                                              kind=item.kind, status=status))
        return result

    def latest_checkpoint(self, project_id: UUID, run_id: UUID) -> WorkingCheckpoint | None:
        row = self.storage.session().execute(
            "SELECT state_json FROM working_checkpoints WHERE project_id=? AND run_id=? "
            "ORDER BY sequence DESC LIMIT 1", (str(project_id), str(run_id)),
        ).fetchone()
        return WorkingCheckpoint.model_validate_json(row["state_json"]) if row else None

    def _checkpoint_by_id(
        self, project_id: UUID, run_id: UUID, checkpoint_id: UUID
    ) -> WorkingCheckpoint | None:
        row = self.storage.session().execute(
            "SELECT state_json FROM working_checkpoints WHERE project_id=? "
            "AND run_id=? AND checkpoint_id=?",
            (str(project_id), str(run_id), str(checkpoint_id)),
        ).fetchone()
        return WorkingCheckpoint.model_validate_json(row["state_json"]) if row else None

    def save_bundle(self, value: ContextBundle,
                    rework_feedback: list[ContextItem] | None = None,
                    retrieval_items: list[ContextItem] | None = None) -> ContextBundle:
        bundle = verify_context_bundle(value)
        with self.storage.transaction() as db:
            config = self.configs.get(bundle.projectId, bundle.runId)
            if (
                config is None or config.taskId != bundle.taskId
                or config.taskRevision != bundle.taskRevision
                or config.snapshotHash != bundle.configHash
            ):
                raise ContextError("CONTEXT_CONFLICT")
            checkpoint = self._checkpoint_by_id(
                bundle.projectId, bundle.runId, bundle.checkpointId
            ) if bundle.checkpointId else None
            if bundle.checkpointId and checkpoint is None:
                raise ContextError("CONTEXT_CONFLICT")
            if checkpoint and bundle.createdAt < checkpoint.createdAt:
                raise ContextError("CONTEXT_CONFLICT")
            derived = build_context_bundle(
                config, checkpoint, bundle.maxChars, bundle.bundleId, bundle.createdAt,
                rework_feedback, retrieval_items,
            )
            if derived.contentHash != bundle.contentHash:
                raise ContextError("CONTEXT_CONFLICT")
            current = self.get_bundle(bundle.projectId, bundle.bundleId)
            if current:
                if current.contentHash == bundle.contentHash:
                    return current
                raise ContextError("CONTEXT_CONFLICT")
            db.execute(
                "INSERT INTO context_bundles(bundle_id,project_id,run_id,content_hash,"
                "bundle_json,created_at) VALUES(?,?,?,?,?,?)",
                (str(bundle.bundleId), str(bundle.projectId), str(bundle.runId),
                 bundle.contentHash, json.dumps(bundle.model_dump(mode="json"), ensure_ascii=False),
                 bundle.createdAt),
            )
            return bundle

    def append_checkpoint(self, state: WorkingCheckpoint) -> WorkingCheckpoint:
        with self.storage.transaction() as db:
            row = db.execute(
                "SELECT r.project_id,r.state AS run_state FROM runs r "
                "JOIN run_attempts a ON a.run_id=r.run_id "
                "WHERE r.run_id=? AND a.attempt_id=?",
                (str(state.runId), str(state.attemptId)),
            ).fetchone()
            if (
                row is None or row["project_id"] != str(state.projectId)
                or row["run_state"] not in (
                    "queued", "running", "waiting_input", "paused", "canceling", "interrupted"
                )
            ):
                raise ContextError("CONTEXT_CONFLICT")
            latest = self.latest_checkpoint(state.projectId, state.runId)
            if state.sequence != (latest.sequence if latest else 0) + 1:
                raise ContextError("CONTEXT_CONFLICT")
            config = self.configs.get(state.projectId, state.runId)
            if config is None or state.objective.text != config.taskContract.goal:
                raise ContextError("CONTEXT_CONFLICT")
            db.execute(
                "INSERT INTO working_checkpoints(checkpoint_id,project_id,run_id,attempt_id,"
                "sequence,state_json,created_at) VALUES(?,?,?,?,?,?,?)",
                (str(state.checkpointId), str(state.projectId), str(state.runId),
                 str(state.attemptId), state.sequence,
                 json.dumps(state.model_dump(mode="json"), ensure_ascii=False), state.createdAt),
            )
            return state
