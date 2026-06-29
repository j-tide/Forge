"""Host-owned linear Workflow drafts and explicitly published revisions."""

from __future__ import annotations

import json

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.run_config import VersionLock
from forge.workflow_compiler import CompiledWorkflow, WorkflowCatalog, compile_workflow
from forge.workflow_templates import WorkflowTemplate


class WorkflowDraftError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _stored_template(raw: str) -> WorkflowTemplate:
    try:
        value = json.loads(raw)
        if isinstance(value, dict) and value.get("schemaVersion") not in (None, "1.0"):
            raise WorkflowDraftError("WORKFLOW_DSL_VERSION_UNSUPPORTED")
        return WorkflowTemplate.model_validate(value)
    except (ValueError, TypeError) as error:
        raise WorkflowDraftError("WORKFLOW_CORRUPT") from error


class WorkflowSaveInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    template: WorkflowTemplate
    expectedRevision: int = Field(ge=0)


class WorkflowPublishInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workflowId: str = Field(pattern=r"^workflow\.[A-Za-z0-9._:-]{1,119}$")
    expectedDraftRevision: int = Field(ge=1)


class WorkflowGetInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workflowId: str = Field(pattern=r"^workflow\.[A-Za-z0-9._:-]{1,119}$")


class WorkflowPublishedInput(WorkflowGetInput):
    revision: int = Field(ge=1)


class WorkflowRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workflowId: str
    draftRevision: int
    draft: WorkflowTemplate
    draftHash: str
    publishedRevision: int | None
    updatedAt: str


class PublishedWorkflow(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workflowId: str
    revision: int = Field(ge=1)
    definition: WorkflowTemplate
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    createdAt: str


class WorkflowImpact(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workflowId: str
    publishedRevision: int | None
    draftRevision: int
    draftChangedSincePublish: bool
    publishedRevisions: list[int]
    frozenRunCounts: dict[str, int]
    nextRunRequiresExplicitVersionSelection: bool = True


class WorkflowDraftService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def get(self, workflow_id: str) -> WorkflowRecord | None:
        row = self.storage.session().execute(
            "SELECT workflow_id,draft_revision,draft_json,draft_hash,"
            "published_revision,updated_at FROM workflow_drafts WHERE workflow_id=?",
            (workflow_id,),
        ).fetchone()
        if row is None:
            return None
        draft = _stored_template(row["draft_json"])
        if compile_workflow(draft).contentHash != row["draft_hash"]:
            raise WorkflowDraftError("WORKFLOW_CORRUPT")
        return WorkflowRecord(
            workflowId=row["workflow_id"], draftRevision=row["draft_revision"],
            draft=draft, draftHash=row["draft_hash"],
            publishedRevision=row["published_revision"], updatedAt=row["updated_at"],
        )

    def list(self) -> list[WorkflowRecord]:
        ids = self.storage.session().execute(
            "SELECT workflow_id FROM workflow_drafts ORDER BY updated_at DESC,workflow_id"
        ).fetchall()
        return [record for row in ids if (record := self.get(row["workflow_id"])) is not None]

    def published(self, workflow_id: str, revision: int | None = None) -> PublishedWorkflow:
        if revision is None:
            record = self.get(workflow_id)
            if record is None or record.publishedRevision is None:
                raise WorkflowDraftError("WORKFLOW_NOT_PUBLISHED")
            revision = record.publishedRevision
        row = self.storage.session().execute(
            "SELECT revision,definition_json,content_hash,created_at,state "
            "FROM workflow_revisions WHERE id=? AND revision=?",
            (workflow_id, revision),
        ).fetchone()
        if row is None or row["state"] != "published":
            raise WorkflowDraftError("WORKFLOW_NOT_PUBLISHED")
        definition = _stored_template(row["definition_json"])
        if (definition.id != workflow_id or definition.revision != revision or
                compile_workflow(definition).contentHash != row["content_hash"]):
            raise WorkflowDraftError("WORKFLOW_CORRUPT")
        return PublishedWorkflow(
            workflowId=workflow_id, revision=revision, definition=definition,
            contentHash=row["content_hash"], createdAt=row["created_at"],
        )

    def published_lock(self, workflow_id: str, revision: int | None = None) -> VersionLock:
        publication = self.published(workflow_id, revision)
        return VersionLock(id=workflow_id, version=str(publication.revision),
                           contentHash=publication.contentHash)

    def impact(self, workflow_id: str) -> WorkflowImpact:
        record = self.get(workflow_id)
        if record is None:
            raise WorkflowDraftError("WORKFLOW_NOT_FOUND")
        rows = self.storage.session().execute(
            "SELECT json_extract(snapshot_json,'$.workflow.version') AS revision,"
            "COUNT(*) AS n FROM run_config_snapshots "
            "WHERE json_extract(snapshot_json,'$.workflow.id')=? "
            "GROUP BY revision ORDER BY revision",
            (workflow_id,),
        ).fetchall()
        revisions = self.storage.session().execute(
            "SELECT revision FROM workflow_revisions WHERE id=? AND state='published' "
            "ORDER BY revision", (workflow_id,),
        ).fetchall()
        return WorkflowImpact(
            workflowId=workflow_id, publishedRevision=record.publishedRevision,
            draftRevision=record.draftRevision,
            draftChangedSincePublish=(record.publishedRevision != record.draftRevision),
            publishedRevisions=[row["revision"] for row in revisions],
            frozenRunCounts={row["revision"]: row["n"] for row in rows},
        )

    def save(self, value: WorkflowSaveInput) -> WorkflowRecord:
        draft = value.template
        if (not draft.id.startswith("workflow.") or
                draft.revision != value.expectedRevision + 1):
            raise WorkflowDraftError("WORKFLOW_DRAFT_INVALID")
        compiled = compile_workflow(draft)
        raw = draft.model_dump_json(by_alias=True)
        now = timestamp()
        with self.storage.transaction() as db:
            current = db.execute(
                "SELECT draft_revision FROM workflow_drafts WHERE workflow_id=?",
                (draft.id,),
            ).fetchone()
            if (current["draft_revision"] if current else 0) != value.expectedRevision:
                raise WorkflowDraftError("WORKFLOW_DRAFT_STALE")
            if current is None:
                db.execute(
                    "INSERT INTO workflow_drafts"
                    "(workflow_id,draft_revision,draft_json,draft_hash,updated_at)"
                    " VALUES(?,?,?,?,?)",
                    (draft.id, draft.revision, raw, compiled.contentHash, now),
                )
            else:
                db.execute(
                    "UPDATE workflow_drafts SET draft_revision=?,draft_json=?,"
                    "draft_hash=?,updated_at=? WHERE workflow_id=?",
                    (draft.revision, raw, compiled.contentHash, now, draft.id),
                )
        result = self.get(draft.id)
        assert result is not None
        return result

    def publish(
        self, value: WorkflowPublishInput, catalog: WorkflowCatalog,
    ) -> tuple[WorkflowRecord, CompiledWorkflow]:
        record = self.get(value.workflowId)
        if record is None:
            raise WorkflowDraftError("WORKFLOW_NOT_FOUND")
        if record.draftRevision != value.expectedDraftRevision:
            raise WorkflowDraftError("WORKFLOW_DRAFT_STALE")
        compiled = compile_workflow(record.draft, catalog=catalog)
        if not compiled.launchable:
            return record, compiled
        with self.storage.transaction() as db:
            current = db.execute(
                "SELECT draft_revision,published_revision FROM workflow_drafts "
                "WHERE workflow_id=?", (value.workflowId,),
            ).fetchone()
            if current is None or current["draft_revision"] != value.expectedDraftRevision:
                raise WorkflowDraftError("WORKFLOW_DRAFT_STALE")
            if current["published_revision"] == value.expectedDraftRevision:
                return record, compiled
            db.execute(
                "INSERT INTO workflow_revisions"
                "(id,revision,name,definition_json,content_hash,state,created_at)"
                " VALUES(?,?,?,?,?,?,?)",
                (value.workflowId, record.draftRevision, record.draft.name,
                 record.draft.model_dump_json(by_alias=True),
                 compiled.contentHash, "published", timestamp()),
            )
            db.execute(
                "UPDATE workflow_drafts SET published_revision=? WHERE workflow_id=?",
                (record.draftRevision, value.workflowId),
            )
        published = self.get(value.workflowId)
        assert published is not None
        return published, compiled
