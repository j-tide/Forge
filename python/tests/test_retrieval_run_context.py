"""Explicit retrieval is frozen as lower-trust Run input with real source refs."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from test_workflow_versioning import approved_task, selection

from forge.context import (
    ContextError,
    ContextItem,
    ContextService,
    build_context_bundle,
    executor_context,
)
from forge.context_builder import StageContextBuilder, StageContextInput
from forge.conversations import timestamp
from forge.environments import EnvironmentService
from forge.knowledge_ingestion import (
    KnowledgeChunkInput,
    KnowledgeImportInput,
    KnowledgeIngestionService,
    KnowledgeSearchInput,
    KnowledgeSourceInput,
)
from forge.persistence import ForgePersistence
from forge.project_memory import (
    MemoryDecision,
    MemoryEvidence,
    MemoryProposal,
    MemoryQuery,
    ProjectMemoryService,
)
from forge.projects import ProjectService
from forge.run_config import RunConfigService, VersionLock
from forge.runs import RunService, RunStartIntent


def test_real_source_is_optional_bounded_and_revocation_does_not_rewrite_run(
    tmp_path: Path,
) -> None:
    root = tmp_path / "repo"
    root.mkdir()
    (root / "docs").mkdir()
    (root / "docs" / "guide.md").write_text(
        "# Date API\nUse start_date for date filtering.\n", encoding="utf-8")
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(29)
    project, draft, env = approved_task(storage, root, "standard")
    configs = RunConfigService(storage, EnvironmentService(storage))
    config = configs.create(selection(project, draft, env,
                                      VersionLock(id="standard", version="1",
                                                  contentHash="a" * 64)))
    knowledge = KnowledgeIngestionService(storage, ProjectService(storage))
    source = knowledge.import_source(KnowledgeImportInput(
        projectId=project.projectId, relativePath="docs/guide.md"))
    preview = StageContextBuilder(
        storage, configs, knowledge, ProjectMemoryService(storage, ProjectService(storage)),
    ).preview(StageContextInput(projectId=project.projectId, runId=config.runId,
                                query="start_date"))
    assert preview.status == "ready" and not preview.conflicts
    document = next(item for item in preview.items if item.kind == "retrieved_knowledge")
    low_trust = ContextItem(kind="retrieved_knowledge", authority="untrusted_project",
                            text=document.text, sourceRef=document.sourceRef)
    bundle = ContextService(storage, configs).save_bundle(
        build_context_bundle(config, retrieval_items=[low_trust]),
        retrieval_items=[low_trust])
    assert bundle.items[0].kind == "goal"
    assert bundle.items[-1] == low_trust
    assert f"[untrusted_project; {document.sourceRef}; retrieved_knowledge]" in "\n".join(
        executor_context(bundle))
    assert source.sourceId.hex in document.sourceRef.replace("-", "")
    RunService(storage, configs).begin(RunStartIntent(
        runId=config.runId, projectId=project.projectId, taskId=draft.draftId,
        attemptId=uuid4(), workspaceId=uuid4(), workspaceLeaseId=uuid4(),
        leaseEpoch=1, baseRevision="a" * 40, nodeId="develop",
        executorId="forge.executor.codex", configHash=config.snapshotHash,
        createdAt=timestamp(),
    ))
    assert ContextService(storage, configs).run_sources(
        project.projectId, config.runId)[0].status == "current"
    with pytest.raises(ContextError, match="CONTEXT_CONFLICT"):
        ContextService(storage, configs).save_bundle(bundle)
    knowledge.revoke(KnowledgeSourceInput(projectId=project.projectId,
                                          sourceId=source.sourceId))
    assert ContextService(storage, configs).run_sources(
        project.projectId, config.runId)[0].status == "revoked"
    frozen = ContextService(storage, configs).get_bundle(project.projectId, bundle.bundleId)
    assert frozen is not None and frozen.contentHash == bundle.contentHash
    assert frozen.items[-1].sourceRef == document.sourceRef
    assert knowledge.search(KnowledgeSearchInput(  # current retrieval authority is gone
        projectId=project.projectId, environmentId=env.environmentId,
        query="start_date")).results == []
    storage.close()


def test_historical_run_marks_validated_memory_revoked_without_erasing_frozen_input(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory repo"
    root.mkdir()
    (root / "docs").mkdir()
    original = "# Convention\nDate filters use start_date.\n"
    (root / "docs" / "convention.md").write_text(original, encoding="utf-8")
    storage = ForgePersistence(tmp_path / "memory-data")
    storage.open()
    storage.migrate(29)
    project, draft, env = approved_task(storage, root, "standard")
    configs = RunConfigService(storage, EnvironmentService(storage))
    config = configs.create(selection(project, draft, env, VersionLock(
        id="standard", version="1", contentHash="a" * 64,
    )))
    projects = ProjectService(storage)
    knowledge = KnowledgeIngestionService(storage, projects)
    source = knowledge.import_source(KnowledgeImportInput(
        projectId=project.projectId, relativePath="docs/convention.md"))
    chunk = knowledge.chunk(KnowledgeChunkInput(
        projectId=project.projectId, sourceId=source.sourceId,
        version=source.version, ordinal=0,
    ))
    memories = ProjectMemoryService(storage, projects)
    candidate = memories.propose(MemoryProposal(
        projectId=project.projectId, environmentId=env.environmentId,
        scope="environment", kind="project_convention", subjectKey="date.filter",
        text="Date filters use start_date.",
        sources=[MemoryEvidence(sourceRef=chunk.sourceRef, sourceHash=chunk.contentHash)],
        idempotencyKey=uuid4(),
    ))
    validated = memories.decide(MemoryDecision(
        projectId=project.projectId, memoryId=candidate.memoryId,
        expectedRevision=candidate.revision, decision="validate",
        reason="Confirmed by local project owner", confirmed=True,
        decisionId=uuid4(),
    ))
    preview = StageContextBuilder(storage, configs, knowledge, memories).preview(
        StageContextInput(projectId=project.projectId, runId=config.runId,
                          query="start_date"))
    memory = next(item for item in preview.items if item.kind == "validated_memory")
    frozen_item = ContextItem(kind="validated_memory", authority="validated_memory",
                              text=memory.text, sourceRef=memory.sourceRef)
    contexts = ContextService(storage, configs)
    bundle = contexts.save_bundle(
        build_context_bundle(config, retrieval_items=[frozen_item]),
        retrieval_items=[frozen_item],
    )
    RunService(storage, configs).begin(RunStartIntent(
        runId=config.runId, projectId=project.projectId, taskId=draft.draftId,
        attemptId=uuid4(), workspaceId=uuid4(), workspaceLeaseId=uuid4(),
        leaseEpoch=1, baseRevision="a" * 40, nodeId="develop",
        executorId="forge.executor.codex", configHash=config.snapshotHash,
        createdAt=timestamp(),
    ))
    assert contexts.run_sources(project.projectId, config.runId)[0].status == "current"
    revoked = memories.decide(MemoryDecision(
        projectId=project.projectId, memoryId=validated.memoryId,
        expectedRevision=validated.revision, decision="revoke",
        reason="Project owner withdrew this guidance", confirmed=True,
        decisionId=uuid4(),
    ))
    assert revoked.status == "revoked" and revoked.text == ""
    assert contexts.run_sources(project.projectId, config.runId)[0].status == "revoked"
    assert memories.retrieve(MemoryQuery(
        projectId=project.projectId, environmentId=env.environmentId,
        query="start_date",
    )).items == []
    saved = contexts.get_bundle(project.projectId, bundle.bundleId)
    assert saved is not None and saved.contentHash == bundle.contentHash
    assert saved.items[-1] == frozen_item
    assert (root / "docs" / "convention.md").read_text() == original
    storage.close()
