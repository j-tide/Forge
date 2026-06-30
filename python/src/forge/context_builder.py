"""Read-only Stage Context assembly from verified Host-owned sources."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from forge.context import ContextError
from forge.knowledge_ingestion import (
    SEARCH_INDEX_VERSION,
    KnowledgeChunk,
    KnowledgeIngestionService,
    KnowledgeSearchInput,
)
from forge.persistence import ForgePersistence
from forge.project_memory import MemoryQuery, ProjectMemoryService
from forge.run_config import RunConfigService
from forge.run_inspection import redact


class StageContextInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    runId: UUID
    query: str = Field(min_length=1, max_length=160)
    maxChars: int = Field(default=16_000, ge=1000, le=32_000)


class StageContextItem(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    priority: int = Field(ge=1, le=7)
    kind: Literal["approved_task", "human_decision", "code_snapshot", "stage_artifact",
                  "validated_memory", "retrieved_knowledge"]
    trust: Literal["approved", "human_decision", "observed", "untrusted"]
    sourceRef: str = Field(min_length=1, max_length=256)
    sourceHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    text: str = Field(min_length=1, max_length=100_000)


class StageContextConflict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    currentSourceRef: str
    otherSourceRef: str
    reason: Literal["SOURCE_VERSION_CHANGED", "SAME_HEADING_DIFFERENT_TEXT",
                    "CURRENT_OBSERVATION_CONFLICT"]
    question: str


class StageContextPreview(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    runId: UUID
    taskRevision: int = Field(ge=1)
    configHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    indexVersion: str
    query: str
    status: Literal["ready", "insufficient_sources", "budget_exceeded",
                    "needs_human_decision"]
    items: list[StageContextItem] = Field(max_length=96)
    sourceRefs: list[str]
    conflicts: list[StageContextConflict] = Field(max_length=16)
    omittedItems: int = Field(ge=0)
    usedChars: int = Field(ge=0)
    maxChars: int = Field(ge=1000, le=32_000)
    truncated: bool


def _size(item: StageContextItem) -> int:
    return (len(item.text.encode("utf-16-le")) // 2
            + len(item.sourceRef.encode("utf-16-le")) // 2 + 48)


def pack_context(
    required: list[StageContextItem], optional: list[StageContextItem], max_chars: int,
) -> tuple[list[StageContextItem], int, int, bool]:
    """Never truncate an approved Task; only complete lower-priority items may be omitted."""
    used = sum(_size(item) for item in required)
    if len(required) > 96 or used > max_chars:
        return [], 0, len(required) + len(optional), True
    items = required[:]
    omitted = 0
    for item in optional:
        if len(items) >= 96 or used + _size(item) > max_chars:
            omitted += 1
        else:
            items.append(item)
            used += _size(item)
    return items, used, omitted, False


class StageContextBuilder:
    def __init__(self, storage: ForgePersistence, configs: RunConfigService,
                 knowledge: KnowledgeIngestionService,
                 memories: ProjectMemoryService) -> None:
        self.storage = storage
        self.configs = configs
        self.knowledge = knowledge
        self.memories = memories

    def preview(self, value: StageContextInput) -> StageContextPreview:
        config = self.configs.get(value.projectId, value.runId)
        if config is None:
            raise ContextError("CONTEXT_RUN_NOT_FOUND")
        contract = config.taskContract
        task_ref = f"task:{config.taskId}@{config.taskRevision}"
        required = [StageContextItem(priority=1, kind="approved_task", sourceRef=task_ref,
                    trust="approved", sourceHash=config.taskContractHash, text=text)
                    for text in (
                        contract.goal,
                        *(item.statement for item in contract.acceptance),
                        *contract.constraints, *contract.scope, *contract.outOfScope,
                    )]
        snapshot = self.storage.session().execute(
            "SELECT snapshot_id,commit_sha,tree_sha,content_hash FROM code_snapshots "
            "WHERE project_id=? AND run_id=?",
            (str(value.projectId), str(value.runId)),
        ).fetchone()
        optional: list[StageContextItem] = []
        if snapshot is not None:
            decisions = self.storage.session().execute(
                "SELECT decision_id,decision,reason,basis_hash FROM final_acceptance_decisions "
                "WHERE project_id=? AND task_id=? AND snapshot_id=? AND contract_revision=? "
                "ORDER BY created_at,decision_id LIMIT 8",
                (str(value.projectId), str(config.taskId), snapshot["snapshot_id"],
                 config.taskRevision),
            ).fetchall()
            for decision in decisions:
                optional.append(StageContextItem(
                    priority=2, kind="human_decision",
                    trust="human_decision",
                    sourceRef=f"decision:{decision['decision_id']}",
                    sourceHash=decision["basis_hash"],
                    text=f"{decision['decision']}: {redact(decision['reason'])[:3800]}",
                ))
            optional.append(StageContextItem(
                priority=3, kind="code_snapshot",
                trust="observed",
                sourceRef=f"snapshot:{snapshot['snapshot_id']}",
                sourceHash=snapshot["content_hash"],
                text=f"Commit {snapshot['commit_sha']}; tree {snapshot['tree_sha']}",
            ))
            artifacts = self.storage.session().execute(
                "SELECT artifact_id,kind,content_hash FROM snapshot_artifacts "
                "WHERE snapshot_id=? ORDER BY created_at,artifact_id LIMIT 8",
                (snapshot["snapshot_id"],),
            ).fetchall()
            optional.extend(StageContextItem(
                priority=4, kind="stage_artifact",
                trust="observed",
                sourceRef=f"artifact:{artifact['artifact_id']}",
                sourceHash=artifact["content_hash"], text=artifact["kind"],
            ) for artifact in artifacts)
        remembered = self.memories.retrieve(MemoryQuery(
            projectId=value.projectId, environmentId=config.environment.environmentId,
            query=value.query, limit=20,
        ))
        optional.extend(StageContextItem(
            priority=5, kind="validated_memory",
            trust="human_decision",
            sourceRef=f"memory:{item.memoryId}@{item.revision}",
            sourceHash=item.contentHash, text=item.text,
        ) for item in remembered.items)
        found = self.knowledge.search(KnowledgeSearchInput(
            projectId=value.projectId, environmentId=config.environment.environmentId,
            query=value.query, limit=20,
        ))
        optional.extend(StageContextItem(
            priority=6, kind="retrieved_knowledge", sourceRef=item.sourceRef,
            trust="untrusted",
            sourceHash=item.contentHash, text=item.text[:4000],
        ) for item in found.results)
        conflicts = self._conflicts(found.results)
        conflicts.extend(StageContextConflict(
            currentSourceRef=f"memory:{item.candidateMemoryId}",
            otherSourceRef=f"memory:{item.validatedMemoryId}",
            reason="CURRENT_OBSERVATION_CONFLICT", question=item.question,
        ) for item in remembered.conflicts[:max(0, 16-len(conflicts))])
        items, used, omitted, required_exceeded = pack_context(
            required, optional, value.maxChars,
        )
        if not required_exceeded:
            status: Literal["ready", "insufficient_sources", "budget_exceeded",
                            "needs_human_decision"] = (
                "needs_human_decision" if conflicts else
                "insufficient_sources" if not found.results and not remembered.items else "ready"
            )
        else:
            status = "budget_exceeded"
        return StageContextPreview(
            projectId=value.projectId, runId=value.runId,
            taskRevision=config.taskRevision, configHash=config.snapshotHash,
            indexVersion=SEARCH_INDEX_VERSION, query=value.query,
            status=status, items=items,
            sourceRefs=list(dict.fromkeys(item.sourceRef for item in items)),
            conflicts=conflicts, omittedItems=omitted, usedChars=used,
            maxChars=value.maxChars, truncated=omitted > 0,
        )

    def _conflicts(self, results: list[KnowledgeChunk]) -> list[StageContextConflict]:
        conflicts: list[StageContextConflict] = []
        by_heading: dict[str, tuple[str, str]] = {}
        for item in results:
            heading = item.heading or ""
            if heading:
                seen = by_heading.get(heading)
                if seen is not None and seen[1] != item.contentHash:
                    conflicts.append(StageContextConflict(
                        currentSourceRef=item.sourceRef, otherSourceRef=seen[0],
                        reason="SAME_HEADING_DIFFERENT_TEXT",
                        question=f"同名章节“{heading[:80]}”内容不同；请选择适用版本。",
                    ))
                else:
                    by_heading[heading] = (item.sourceRef, item.contentHash)
            prior = self.storage.session().execute(
                "SELECT version,ordinal FROM knowledge_chunks WHERE source_id=? "
                "AND heading=? AND version<? AND content_hash<>? AND length(text)>0 "
                "ORDER BY version DESC,ordinal LIMIT 1",
                (str(item.sourceId), heading, item.version, item.contentHash),
            ).fetchone()
            if prior is not None:
                conflicts.append(StageContextConflict(
                    currentSourceRef=item.sourceRef,
                    otherSourceRef=f"knowledge:{item.sourceId}@{prior['version']}#{prior['ordinal']}",
                    reason="SOURCE_VERSION_CHANGED",
                    question="此来源的旧版本章节内容不同；请确认当前版本适用范围。",
                ))
            if len(conflicts) >= 16:
                break
        return conflicts
