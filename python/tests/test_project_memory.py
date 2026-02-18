"""Project memory authority is earned by current evidence and explicit decisions."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from test_workflow_versioning import approved_task, selection

from forge.context_builder import StageContextBuilder, StageContextInput
from forge.environments import EnvironmentService
from forge.host import HostRuntime
from forge.knowledge_ingestion import (
    KnowledgeChunkInput,
    KnowledgeImportInput,
    KnowledgeIngestionService,
    KnowledgeSourceInput,
)
from forge.persistence import ForgePersistence
from forge.project_memory import (
    MemoryDecision,
    MemoryEdit,
    MemoryError,
    MemoryEvidence,
    MemoryIdInput,
    MemoryProposal,
    MemoryQuery,
    ProjectMemoryService,
)
from forge.projects import ProjectService
from forge.protocol import ProtocolError, RpcRequest
from forge.run_config import RunConfigService, VersionLock


def _setup(tmp_path: Path):
    root = tmp_path / "项目 one"
    root.mkdir()
    (root / "docs").mkdir()
    (root / "docs" / "rules.md").write_text(
        "# API\nUse start_date for date filtering.\n", encoding="utf-8",
    )
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    assert storage.migrate(29) == 29
    project, draft, environment = approved_task(storage, root, "standard")
    knowledge = KnowledgeIngestionService(storage, ProjectService(storage))
    source = knowledge.import_source(KnowledgeImportInput(
        projectId=project.projectId, relativePath="docs/rules.md",
    ))
    chunk = knowledge.chunk(KnowledgeChunkInput(
        projectId=project.projectId, sourceId=source.sourceId,
        version=source.version, ordinal=0,
    ))
    memories = ProjectMemoryService(storage, ProjectService(storage))
    evidence = MemoryEvidence(sourceRef=chunk.sourceRef, sourceHash=chunk.contentHash)
    return root, storage, project, draft, environment, knowledge, source, memories, evidence


def _proposal(project, environment, evidence, text="Use start_date for date filtering.",
              *, expires_at=None):
    return MemoryProposal(
        projectId=project.projectId, environmentId=environment.environmentId,
        scope="environment", kind="project_convention", subjectKey="date.filtering",
        text=text, sources=[evidence], expiresAt=expires_at, idempotencyKey=uuid4(),
    )


def _decide(project, memory, decision="validate", replace=None):
    return MemoryDecision(
        projectId=project.projectId, memoryId=memory.memoryId,
        expectedRevision=memory.revision, decision=decision,
        reason="Confirmed by local project owner", confirmed=True,
        decisionId=uuid4(), replaceMemoryId=replace,
    )


def _search(memories, project, environment):
    return memories.retrieve(MemoryQuery(
        projectId=project.projectId, environmentId=environment.environmentId,
        query="date filtering",
    ))


def test_candidate_is_not_authority_then_human_validation_survives_restart(
    tmp_path: Path,
) -> None:
    _, storage, project, _, env, _, _, memories, evidence = _setup(tmp_path)
    proposal = _proposal(project, env, evidence)
    candidate = memories.propose(proposal)
    assert candidate.status == "candidate"
    assert memories.propose(proposal).memoryId == candidate.memoryId
    assert _search(memories, project, env).items == []
    decision = _decide(project, candidate)
    validated = memories.decide(decision)
    assert validated.status == "validated" and validated.revision == 2
    assert memories.decide(decision).revision == 2
    assert [item.memoryId for item in _search(memories, project, env).items] == [candidate.memoryId]
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    reopened.migrate(29)
    assert len(_search(ProjectMemoryService(reopened, ProjectService(reopened)),
                       project, env).items) == 1
    reopened.close()


@pytest.mark.asyncio
async def test_host_memory_rpc_rejects_unknown_and_invalid_payload(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "host-data"))
    host = HostRuntime()
    try:
        assert host.storage_health()["status"] == "ready"
        root = tmp_path / "rpc project"
        root.mkdir()
        (root / "docs").mkdir()
        (root / "docs" / "rules.md").write_text("# Rule\ndate filtering uses start_date.\n")
        project, _, _ = approved_task(host.storage, root, "standard")
        source = host.knowledge.import_source(KnowledgeImportInput(
            projectId=project.projectId, relativePath="docs/rules.md"))
        chunk = host.knowledge.chunk(KnowledgeChunkInput(
            projectId=project.projectId, sourceId=source.sourceId,
            version=source.version, ordinal=0))
        proposal = MemoryProposal(
            projectId=project.projectId, environmentId=project.environmentId,
            scope="environment", kind="project_convention", subjectKey="date.filtering",
            text="date filtering uses start_date", sources=[MemoryEvidence(
                sourceRef=chunk.sourceRef, sourceHash=chunk.contentHash)],
            idempotencyKey=uuid4())

        async def call(method: str, params: dict[str, object]):
            return await host.dispatch_async(RpcRequest(
                jsonrpc="2.0", id=str(uuid4()), method=method, params=params,
                transportVersion="forge-local-jsonrpc/v1"))

        proposed = await call("memory.propose", proposal.model_dump(mode="json"))
        assert proposed["data"]["status"] == "candidate"
        query = MemoryQuery(projectId=project.projectId,
                            environmentId=project.environmentId, query="date filtering")
        assert (await call("memory.retrieve", query.model_dump(mode="json")))["data"]["items"] == []
        with pytest.raises(ProtocolError) as invalid:
            await call("memory.propose", {**proposal.model_dump(mode="json"),
                                          "shell": "rm -rf /"})
        assert invalid.value.code == "INVALID_REQUEST"
        with pytest.raises(ProtocolError) as unknown:
            await call("memory.execute", {})
        assert unknown.value.code == "UNKNOWN_COMMAND"
    finally:
        await host.shutdown()


def test_evidence_expiry_revoke_and_audit_tombstone(tmp_path: Path) -> None:
    _, storage, project, _, env, knowledge, source, memories, evidence = _setup(tmp_path)
    with pytest.raises(MemoryError, match="MEMORY_SOURCE_INVALID"):
        memories.propose(_proposal(project, env,
                                   MemoryEvidence(sourceRef=evidence.sourceRef,
                                                  sourceHash="0" * 64)))
    memory = memories.propose(_proposal(project, env, evidence))
    validated = memories.decide(_decide(project, memory))
    assert _search(memories, project, env).items
    revoked = memories.decide(_decide(project, validated, "revoke"))
    assert revoked.status == "revoked" and revoked.text == ""
    assert not _search(memories, project, env).items
    assert storage.session().execute("SELECT count(*) FROM memory_fts").fetchone()[0] == 0
    assert storage.session().execute("SELECT count(*) FROM memory_events").fetchone()[0] == 3
    # The source repository and project metadata are untouched by memory revocation.
    assert knowledge.chunk(KnowledgeChunkInput(
        projectId=project.projectId, sourceId=source.sourceId,
        version=source.version, ordinal=0)).text
    expires = datetime.now(UTC) + timedelta(seconds=5)
    short = memories.propose(_proposal(project, env, evidence, "date filtering expires",
                                       expires_at=expires))
    memories.decide(_decide(project, short))
    with storage.transaction() as db:
        db.execute("UPDATE project_memory SET expires_at=? WHERE memory_id=?",
                   ((datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
                    str(short.memoryId)))
    assert _search(memories, project, env).items == []
    assert memories.get(MemoryIdInput(projectId=project.projectId,
                                      memoryId=short.memoryId)).status == "stale"
    memory2 = memories.propose(_proposal(project, env, evidence, "date filtering source revoke"))
    memories.decide(_decide(project, memory2))
    knowledge.revoke(KnowledgeSourceInput(projectId=project.projectId,
                                         sourceId=source.sourceId))
    assert _search(memories, project, env).items == []
    assert memories.get(MemoryIdInput(projectId=project.projectId,
                                      memoryId=memory2.memoryId)).status == "stale"
    storage.close()


def test_candidate_edit_and_explicit_deprecate_are_revision_bound(tmp_path: Path) -> None:
    _, storage, project, _, env, _, _, memories, evidence = _setup(tmp_path)
    candidate = memories.propose(_proposal(project, env, evidence))
    edited = memories.edit(MemoryEdit(
        projectId=project.projectId, memoryId=candidate.memoryId,
        expectedRevision=1, text="date filtering uses the approved start_date field"))
    assert edited.revision == 2 and "approved" in edited.text
    with pytest.raises(MemoryError, match="MEMORY_STALE"):
        memories.edit(MemoryEdit(projectId=project.projectId, memoryId=candidate.memoryId,
                                 expectedRevision=1, text="stale update"))
    validated = memories.decide(_decide(project, edited))
    with pytest.raises(MemoryError, match="MEMORY_INVALID_TRANSITION"):
        memories.edit(MemoryEdit(projectId=project.projectId, memoryId=candidate.memoryId,
                                 expectedRevision=3, text="cannot edit validated"))
    stale = memories.decide(_decide(project, validated, "deprecate"))
    assert stale.status == "stale" and stale.text
    assert _search(memories, project, env).items == []
    assert storage.session().execute("SELECT count(*) FROM memory_fts").fetchone()[0] == 0
    storage.close()


def test_project_scope_conflict_and_context_does_not_promote_candidate(
    tmp_path: Path,
) -> None:
    root, storage, project, draft, env, knowledge, _, memories, evidence = _setup(tmp_path)
    first = memories.propose(_proposal(project, env, evidence))
    current = memories.decide(_decide(project, first))
    assert _search(memories, project, env).items
    (root / "docs" / "current.md").write_text(
        "# Current observation\ndate filtering now uses end_date.\n", encoding="utf-8")
    current_source = knowledge.import_source(KnowledgeImportInput(
        projectId=project.projectId, relativePath="docs/current.md"))
    current_chunk = knowledge.chunk(KnowledgeChunkInput(
        projectId=project.projectId, sourceId=current_source.sourceId,
        version=current_source.version, ordinal=0))
    current_evidence = MemoryEvidence(sourceRef=current_chunk.sourceRef,
                                      sourceHash=current_chunk.contentHash)
    candidate = memories.propose(_proposal(project, env, current_evidence,
                                           "date filtering now uses end_date"))
    search = _search(memories, project, env)
    assert not search.items and search.conflicts[0].candidateMemoryId == candidate.memoryId
    configs = RunConfigService(storage, EnvironmentService(storage))
    config = configs.create(selection(project, draft, env,
                                      VersionLock(id="standard", version="1",
                                                  contentHash="a" * 64)))
    preview = StageContextBuilder(storage, configs, knowledge, memories).preview(
        StageContextInput(projectId=project.projectId, runId=config.runId,
                          query="date filtering"))
    assert preview.status == "needs_human_decision"
    assert preview.conflicts[0].reason == "CURRENT_OBSERVATION_CONFLICT"
    assert all(item.kind != "validated_memory" for item in preview.items)
    replacement = memories.decide(_decide(project, candidate,
                                           replace=current.memoryId))
    assert replacement.status == "validated"
    assert memories.get(MemoryIdInput(projectId=project.projectId,
                                      memoryId=current.memoryId)).status == "stale"
    assert [item.memoryId for item in _search(memories, project, env).items] == [candidate.memoryId]
    other_root = tmp_path / "other project"
    other_root.mkdir()
    other_project, _, other_env = approved_task(storage, other_root, "standard")
    assert _search(memories, other_project, other_env).items == []
    with pytest.raises(MemoryError, match="MEMORY_SOURCE_INVALID"):
        memories.propose(_proposal(other_project, other_env, evidence))
    storage.close()
