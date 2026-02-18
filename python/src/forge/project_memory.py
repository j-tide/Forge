"""Host-owned, source-bound Project Memory with explicit human promotion."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from sqlite3 import Row
from typing import Literal
from uuid import UUID, uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from forge.approvals import canonical_json
from forge.conversations import timestamp
from forge.persistence import ForgePersistence, PersistenceSession
from forge.projects import Project, ProjectService
from forge.run_inspection import redact

_KNOWLEDGE_REF = re.compile(r"^knowledge:([0-9a-f-]{36})@(\d+)#(\d+)$")
_TASK_REF = re.compile(r"^task:([0-9a-f-]{36})@(\d+)$")
_SNAPSHOT_REF = re.compile(r"^snapshot:([0-9a-f-]{36})$")
_KEY = r"^[a-z][a-z0-9_.-]{2,127}$"
MEMORY_INDEX_VERSION = "forge-project-memory/v1-fts5-trigram"


class MemoryError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class MemoryEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    sourceRef: str = Field(min_length=1, max_length=256)
    sourceHash: str = Field(pattern=r"^[a-f0-9]{64}$")


class MemoryProposal(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    environmentId: UUID | None
    scope: Literal["project", "environment"]
    kind: Literal["environment_fact", "project_convention", "confirmed_decision",
                  "workflow_hint"]
    subjectKey: str = Field(pattern=_KEY)
    text: str = Field(min_length=1, max_length=2000)
    sources: list[MemoryEvidence] = Field(min_length=1, max_length=8)
    expiresAt: AwareDatetime | None = None
    idempotencyKey: UUID


class MemoryDecision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    memoryId: UUID
    expectedRevision: int = Field(ge=1)
    decision: Literal["validate", "deprecate", "revoke"]
    reason: str = Field(min_length=12, max_length=2000)
    confirmed: Literal[True]
    decisionId: UUID
    replaceMemoryId: UUID | None = None


class MemoryQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    environmentId: UUID
    query: str = Field(min_length=1, max_length=160)
    limit: int = Field(default=20, ge=1, le=50)


class MemoryEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    memoryId: UUID
    expectedRevision: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=2000)
    expiresAt: AwareDatetime | None = None


class MemoryProjectInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID


class MemoryIdInput(MemoryProjectInput):
    memoryId: UUID


class ProjectMemory(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    memoryId: UUID
    projectId: UUID
    environmentId: UUID | None
    scope: Literal["project", "environment"]
    kind: Literal["environment_fact", "project_convention", "confirmed_decision",
                  "workflow_hint"]
    subjectKey: str
    text: str
    status: Literal["candidate", "validated", "stale", "revoked"]
    revision: int = Field(ge=1)
    sources: list[MemoryEvidence]
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    expiresAt: str | None
    lastVerifiedAt: str | None
    createdAt: str
    updatedAt: str


class MemoryConflict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    validatedMemoryId: UUID
    candidateMemoryId: UUID
    subjectKey: str
    question: str


class MemorySearchResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    indexVersion: str
    items: list[ProjectMemory]
    conflicts: list[MemoryConflict]


def _iso(value: AwareDatetime | None) -> str | None:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z") if value else None


class ProjectMemoryService:
    def __init__(self, storage: ForgePersistence, projects: ProjectService) -> None:
        self.storage = storage
        self.projects = projects

    def _project(self, project_id: UUID) -> Project:
        project = self.projects.get(str(project_id))
        if project is None or project.archivedAt is not None or not project.trusted:
            raise MemoryError("MEMORY_PROJECT_UNAVAILABLE")
        return project

    def _evidence_valid(self, project_id: UUID, environment_id: UUID | None,
                        scope: str, evidence: MemoryEvidence) -> bool:
        ref = evidence.sourceRef
        knowledge = _KNOWLEDGE_REF.fullmatch(ref)
        if knowledge:
            if scope != "environment" or environment_id is None:
                return False
            row = self.storage.session().execute(
                "SELECT c.content_hash FROM knowledge_chunks c JOIN knowledge_sources s "
                "ON s.source_id=c.source_id WHERE s.project_id=? AND s.environment_id=? "
                "AND s.status='active' AND s.source_id=? AND s.current_version=? "
                "AND c.version=? AND c.ordinal=? AND length(c.text)>0",
                (str(project_id), str(environment_id), knowledge[1], int(knowledge[2]),
                 int(knowledge[2]), int(knowledge[3])),
            ).fetchone()
            return bool(row and row["content_hash"] == evidence.sourceHash)
        task = _TASK_REF.fullmatch(ref)
        if task:
            row = self.storage.session().execute(
                "SELECT r.content_hash FROM task_revisions r JOIN tasks t ON t.task_id=r.task_id "
                "WHERE t.project_id=? AND t.task_id=? AND t.current_revision=? AND r.revision=?",
                (str(project_id), task[1], int(task[2]), int(task[2])),
            ).fetchone()
            return bool(row and row["content_hash"] == evidence.sourceHash)
        snapshot = _SNAPSHOT_REF.fullmatch(ref)
        if snapshot:
            row = self.storage.session().execute(
                "SELECT content_hash FROM code_snapshots WHERE project_id=? AND snapshot_id=?",
                (str(project_id), snapshot[1]),
            ).fetchone()
            return bool(row and row["content_hash"] == evidence.sourceHash)
        return False

    def _record(self, row: Row) -> ProjectMemory:
        return ProjectMemory(
            memoryId=UUID(row["memory_id"]), projectId=UUID(row["project_id"]),
            environmentId=UUID(row["environment_id"]) if row["environment_id"] else None,
            scope=row["scope"], kind=row["kind"], subjectKey=row["subject_key"],
            text=row["text"], status=row["status"], revision=row["revision"],
            sources=[MemoryEvidence.model_validate(item)
                     for item in json.loads(row["source_json"])],
            contentHash=row["content_hash"], expiresAt=row["expires_at"],
            lastVerifiedAt=row["last_verified_at"], createdAt=row["created_at"],
            updatedAt=row["updated_at"],
        )

    def _event(self, db: PersistenceSession, memory_id: str, action: str, reason: str,
               event_id: str | None = None) -> None:
        db.execute(
            "INSERT INTO memory_events(event_id,memory_id,action,reason,created_at) "
            "VALUES(?,?,?,?,?)", (event_id or str(uuid4()), memory_id, action, reason, timestamp()),
        )

    def propose(self, value: MemoryProposal) -> ProjectMemory:
        project = self._project(value.projectId)
        if (value.scope == "environment") != (value.environmentId is not None):
            raise MemoryError("MEMORY_SCOPE_INVALID")
        if value.environmentId is not None and project.environmentId != value.environmentId:
            raise MemoryError("MEMORY_SCOPE_INVALID")
        if redact(value.text) != value.text:
            raise MemoryError("MEMORY_SENSITIVE_CONTENT")
        if len({item.sourceRef for item in value.sources}) != len(value.sources):
            raise MemoryError("MEMORY_SOURCE_INVALID")
        if not all(self._evidence_valid(value.projectId, value.environmentId,
                                        value.scope, item) for item in value.sources):
            raise MemoryError("MEMORY_SOURCE_INVALID")
        existing = self.storage.session().execute(
            "SELECT * FROM project_memory WHERE idempotency_key=?",
            (str(value.idempotencyKey),),
        ).fetchone()
        body = value.model_dump(mode="json", exclude={"idempotencyKey"})
        digest = hashlib.sha256(canonical_json(body).encode()).hexdigest()
        if existing:
            if existing["content_hash"] != digest or existing["project_id"] != str(value.projectId):
                raise MemoryError("MEMORY_CONFLICT")
            return self._record(existing)
        now = timestamp()
        memory_id = str(uuid4())
        with self.storage.transaction() as db:
            db.execute(
                "INSERT INTO project_memory(memory_id,project_id,environment_id,scope,kind,"
                "subject_key,text,status,revision,source_json,content_hash,expires_at,"
                "last_verified_at,idempotency_key,created_at,updated_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (memory_id, str(value.projectId), str(value.environmentId)
                 if value.environmentId else None, value.scope, value.kind, value.subjectKey,
                 value.text, "candidate", 1,
                 json.dumps([item.model_dump(mode="json") for item in value.sources]),
                 digest, _iso(value.expiresAt), None, str(value.idempotencyKey), now, now),
            )
            self._event(db, memory_id, "proposed", "source-bound candidate")
        return self.get(MemoryIdInput(projectId=value.projectId, memoryId=UUID(memory_id)))

    def get(self, value: MemoryIdInput) -> ProjectMemory:
        self._project(value.projectId)
        row = self.storage.session().execute(
            "SELECT * FROM project_memory WHERE project_id=? AND memory_id=?",
            (str(value.projectId), str(value.memoryId)),
        ).fetchone()
        if row is None:
            raise MemoryError("MEMORY_NOT_FOUND")
        return self._record(row)

    def edit(self, value: MemoryEdit) -> ProjectMemory:
        current = self.get(MemoryIdInput(projectId=value.projectId,
                                         memoryId=value.memoryId))
        if current.status != "candidate":
            raise MemoryError("MEMORY_INVALID_TRANSITION")
        if current.revision != value.expectedRevision:
            raise MemoryError("MEMORY_STALE")
        if redact(value.text) != value.text:
            raise MemoryError("MEMORY_SENSITIVE_CONTENT")
        body = {
            "projectId": str(current.projectId), "environmentId":
                str(current.environmentId) if current.environmentId else None,
            "scope": current.scope, "kind": current.kind,
            "subjectKey": current.subjectKey, "text": value.text,
            "sources": [item.model_dump(mode="json") for item in current.sources],
            "expiresAt": _iso(value.expiresAt),
        }
        digest = hashlib.sha256(canonical_json(body).encode()).hexdigest()
        with self.storage.transaction() as db:
            changed = db.execute(
                "UPDATE project_memory SET text=?,expires_at=?,content_hash=?,"
                "revision=revision+1,updated_at=? WHERE project_id=? AND memory_id=? "
                "AND status='candidate' AND revision=?",
                (value.text, _iso(value.expiresAt), digest, timestamp(),
                 str(value.projectId), str(value.memoryId), value.expectedRevision),
            )
            if changed.rowcount != 1:
                raise MemoryError("MEMORY_STALE")
        return self.get(MemoryIdInput(projectId=value.projectId, memoryId=value.memoryId))

    def list(self, value: MemoryProjectInput) -> list[ProjectMemory]:
        self._project(value.projectId)
        self._refresh(value.projectId)
        rows = self.storage.session().execute(
            "SELECT * FROM project_memory WHERE project_id=? ORDER BY created_at,memory_id",
            (str(value.projectId),),
        ).fetchall()
        return [self._record(row) for row in rows]

    def _refresh(self, project_id: UUID) -> None:
        rows = self.storage.session().execute(
            "SELECT * FROM project_memory WHERE project_id=? AND status='validated'",
            (str(project_id),),
        ).fetchall()
        now = datetime.now(UTC)
        stale = []
        for row in rows:
            expired = bool(row["expires_at"] and
                           datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")) <= now)
            sources = [MemoryEvidence.model_validate(item)
                       for item in json.loads(row["source_json"])]
            invalid = not all(self._evidence_valid(project_id,
                              UUID(row["environment_id"]) if row["environment_id"] else None,
                              row["scope"], item) for item in sources)
            if expired or invalid:
                stale.append((row["memory_id"], "expired" if expired else "source stale"))
        if stale and not self.storage.read_only:
            with self.storage.transaction() as db:
                for memory_id, reason in stale:
                    stale_row = db.execute("SELECT rowid FROM project_memory WHERE memory_id=?",
                                           (memory_id,)).fetchone()
                    assert stale_row is not None
                    db.execute("DELETE FROM memory_fts WHERE rowid=?", (stale_row["rowid"],))
                    db.execute("UPDATE project_memory SET status='stale',revision=revision+1,"
                               "updated_at=? WHERE memory_id=? AND status='validated'",
                               (timestamp(), memory_id))
                    self._event(db, memory_id, "stale", reason)

    def decide(self, value: MemoryDecision) -> ProjectMemory:
        current = self.get(MemoryIdInput(projectId=value.projectId, memoryId=value.memoryId))
        if redact(value.reason) != value.reason:
            raise MemoryError("MEMORY_SENSITIVE_CONTENT")
        prior_event = self.storage.session().execute(
            "SELECT 1 FROM memory_events WHERE event_id=? AND memory_id=?",
            (str(value.decisionId), str(value.memoryId)),
        ).fetchone()
        if prior_event:
            return current
        if current.revision != value.expectedRevision:
            raise MemoryError("MEMORY_STALE")
        if value.decision == "validate":
            if current.status != "candidate" or not current.text:
                raise MemoryError("MEMORY_INVALID_TRANSITION")
            if current.expiresAt and datetime.fromisoformat(
                current.expiresAt.replace("Z", "+00:00")) <= datetime.now(UTC):
                raise MemoryError("MEMORY_EXPIRED")
            if not all(self._evidence_valid(current.projectId, current.environmentId,
                                            current.scope, item) for item in current.sources):
                raise MemoryError("MEMORY_SOURCE_INVALID")
            duplicate = self.storage.session().execute(
                "SELECT memory_id,rowid FROM project_memory WHERE project_id=? "
                "AND subject_key=? AND status='validated' AND "
                "((environment_id IS NULL AND ? IS NULL) OR environment_id=?)",
                (str(value.projectId), current.subjectKey,
                 str(current.environmentId) if current.environmentId else None,
                 str(current.environmentId) if current.environmentId else None),
            ).fetchall()
            if duplicate and (len(duplicate) != 1 or value.replaceMemoryId is None
                              or str(value.replaceMemoryId) != duplicate[0]["memory_id"]):
                raise MemoryError("MEMORY_CONFLICT")
            if not duplicate and value.replaceMemoryId is not None:
                raise MemoryError("MEMORY_CONFLICT")
        elif current.status == "revoked" or (value.decision == "deprecate"
                                              and current.status != "validated"):
            raise MemoryError("MEMORY_INVALID_TRANSITION")
        else:
            duplicate = []
        with self.storage.transaction() as db:
            now = timestamp()
            if value.decision == "validate":
                for old in duplicate:
                    db.execute("DELETE FROM memory_fts WHERE rowid=?", (old["rowid"],))
                    db.execute("UPDATE project_memory SET status='stale',revision=revision+1,"
                               "updated_at=? WHERE memory_id=?", (now, old["memory_id"]))
                    self._event(db, old["memory_id"], "stale", "explicit replacement")
                row = db.execute("SELECT rowid FROM project_memory WHERE memory_id=?",
                                 (str(value.memoryId),)).fetchone()
                assert row is not None
                db.execute("UPDATE project_memory SET status='validated',revision=revision+1,"
                           "last_verified_at=?,updated_at=? WHERE memory_id=?",
                           (now, now, str(value.memoryId)))
                db.execute("INSERT INTO memory_fts(rowid,text) VALUES(?,?)",
                           (row["rowid"], current.text))
                self._event(db, str(value.memoryId), "validated", value.reason,
                            str(value.decisionId))
            elif value.decision == "deprecate":
                row = db.execute("SELECT rowid FROM project_memory WHERE memory_id=?",
                                 (str(value.memoryId),)).fetchone()
                assert row is not None
                db.execute("DELETE FROM memory_fts WHERE rowid=?", (row["rowid"],))
                db.execute("UPDATE project_memory SET status='stale',revision=revision+1,"
                           "updated_at=? WHERE memory_id=?", (now, str(value.memoryId)))
                self._event(db, str(value.memoryId), "stale", value.reason,
                            str(value.decisionId))
            else:
                row = db.execute("SELECT rowid FROM project_memory WHERE memory_id=?",
                                 (str(value.memoryId),)).fetchone()
                assert row is not None
                if current.status == "validated":
                    db.execute("DELETE FROM memory_fts WHERE rowid=?", (row["rowid"],))
                db.execute("UPDATE project_memory SET status='revoked',revision=revision+1,"
                           "text='',updated_at=? WHERE memory_id=?", (now, str(value.memoryId)))
                self._event(db, str(value.memoryId), "revoked", value.reason,
                            str(value.decisionId))
        return self.get(MemoryIdInput(projectId=value.projectId, memoryId=value.memoryId))

    def retrieve(self, value: MemoryQuery) -> MemorySearchResult:
        self._project(value.projectId)
        self._refresh(value.projectId)
        query = value.query.strip()
        if not query:
            return MemorySearchResult(indexVersion=MEMORY_INDEX_VERSION, items=[], conflicts=[])
        clauses = ["project_id=?", "status='validated'",
                   "(environment_id IS NULL OR environment_id=?)", "length(text)>0"]
        args: list[str | int] = [str(value.projectId), str(value.environmentId)]
        if len(query) >= 3 and re.fullmatch(r"[\w\u3400-\u9fff ]+", query):
            clauses.append("rowid IN (SELECT rowid FROM memory_fts WHERE memory_fts MATCH ?)")
            args.append(f'"{query}"')
        clauses.append("instr(lower(text),?)>0")
        args.append(query.lower())
        rows = self.storage.session().execute(
            "SELECT * FROM project_memory WHERE " + " AND ".join(clauses)
            + " ORDER BY updated_at DESC,memory_id LIMIT ?", (*args, value.limit),
        ).fetchall()
        items: list[ProjectMemory] = []
        conflicts: list[MemoryConflict] = []
        for row in rows:
            if row["expires_at"] and datetime.fromisoformat(
                row["expires_at"].replace("Z", "+00:00")) <= datetime.now(UTC):
                continue
            if not all(self._evidence_valid(value.projectId,
                           UUID(row["environment_id"]) if row["environment_id"] else None,
                           row["scope"], item) for item in
                       [MemoryEvidence.model_validate(raw)
                        for raw in json.loads(row["source_json"])]):
                continue
            candidates = self.storage.session().execute(
                "SELECT * FROM project_memory WHERE project_id=? AND subject_key=? "
                "AND status='candidate' AND content_hash<>? "
                "AND ((environment_id IS NULL AND ? IS NULL) OR environment_id=?) "
                "ORDER BY created_at DESC,memory_id LIMIT 8",
                (str(value.projectId), row["subject_key"], row["content_hash"],
                 row["environment_id"], row["environment_id"]),
            ).fetchall()
            current_candidate = next((candidate for candidate in candidates
                if candidate["source_json"] != row["source_json"]
                if all(self._evidence_valid(value.projectId,
                    UUID(candidate["environment_id"]) if candidate["environment_id"] else None,
                    candidate["scope"], item) for item in
                    [MemoryEvidence.model_validate(raw)
                     for raw in json.loads(candidate["source_json"])])
                and candidate["text"] != row["text"]), None)
            if current_candidate is not None:
                conflicts.append(MemoryConflict(
                    validatedMemoryId=UUID(row["memory_id"]),
                    candidateMemoryId=UUID(current_candidate["memory_id"]),
                    subjectKey=row["subject_key"],
                    question="当前观察与已验证记忆不同；请确认并选择适用事实。",
                ))
            else:
                items.append(self._record(row))
        return MemorySearchResult(indexVersion=MEMORY_INDEX_VERSION,
                                  items=items, conflicts=conflicts)
