"""Stage Context uses frozen Task authority and real, scoped source evidence."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from test_workflow_versioning import approved_task, selection

from forge.context import ContextError
from forge.context_builder import (
    StageContextBuilder,
    StageContextInput,
    StageContextItem,
    pack_context,
)
from forge.environments import EnvironmentService
from forge.host import HostRuntime
from forge.knowledge_ingestion import (
    KnowledgeImportInput,
    KnowledgeIngestionService,
    KnowledgeSourceInput,
)
from forge.persistence import ForgePersistence
from forge.project_memory import ProjectMemoryService
from forge.projects import ProjectService
from forge.protocol import ProtocolError, RpcRequest
from forge.run_config import RunConfigService, VersionLock


def _setup(tmp_path: Path):
    source = tmp_path / "fixture project"
    source.mkdir()
    (source / "docs").mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(29)
    project, draft, environment = approved_task(storage, source, "standard")
    configs = RunConfigService(storage, EnvironmentService(storage))
    config = configs.create(selection(project, draft, environment,
                                      VersionLock(id="standard", version="1",
                                                  contentHash="a" * 64)))
    knowledge = KnowledgeIngestionService(storage, ProjectService(storage))
    builder = StageContextBuilder(
        storage, configs, knowledge, ProjectMemoryService(storage, ProjectService(storage)),
    )
    return source, storage, project, config, knowledge, builder


def _input(project, config, query: str, max_chars: int = 16_000) -> StageContextInput:
    return StageContextInput(projectId=project.projectId, runId=config.runId,
                             query=query, maxChars=max_chars)


def test_approved_task_over_budget_never_emits_partial_context() -> None:
    mandatory = StageContextItem(priority=1, kind="approved_task", sourceRef="task:fixture@1",
                                 trust="approved", sourceHash="a" * 64, text="x" * 2000)
    optional = StageContextItem(priority=6, kind="retrieved_knowledge",
                                trust="untrusted", sourceRef="knowledge:fixture@1#0",
                                sourceHash="b" * 64,
                                text="lower priority")
    assert pack_context([mandatory], [optional], 1000) == ([], 0, 2, True)


def test_scope_authority_budget_and_missing_source(tmp_path: Path) -> None:
    root, storage, project, config, knowledge, builder = _setup(tmp_path)
    document = root / "docs" / "rules.md"
    document.write_text("# 日期筛选\nstart_date " + "规则" * 700 + "\n", encoding="utf-8")
    source = knowledge.import_source(KnowledgeImportInput(
        projectId=project.projectId, relativePath="docs/rules.md"))
    ready = builder.preview(_input(project, config, "日期筛选 start_date"))
    assert ready.status == "ready"
    assert ready.items[0].priority == 1 and ready.items[0].kind == "approved_task"
    assert ready.items[0].sourceRef == f"task:{config.taskId}@{config.taskRevision}"
    assert ready.items[-1].priority == 6
    assert ready.items[-1].trust == "untrusted"
    assert ready.items[-1].sourceRef.startswith("knowledge:")
    assert ready.items[-1].sourceHash != config.taskContractHash
    assert ready.sourceRefs == list(dict.fromkeys(item.sourceRef for item in ready.items))
    assert ready.usedChars <= ready.maxChars
    truncated = builder.preview(_input(project, config, "日期筛选 start_date", 1000))
    assert truncated.status == "ready" and truncated.truncated
    assert truncated.omittedItems == 1
    assert all(item.priority == 1 for item in truncated.items)
    no_source = builder.preview(_input(project, config, "unfindable"))
    assert no_source.status == "insufficient_sources"
    assert no_source.conflicts == []
    knowledge.revoke(KnowledgeSourceInput(projectId=project.projectId,
                                          sourceId=source.sourceId))
    revoked = builder.preview(_input(project, config, "日期筛选 start_date"))
    assert revoked.status == "insufficient_sources"
    assert all(item.kind != "retrieved_knowledge" for item in revoked.items)
    with pytest.raises(ContextError, match="CONTEXT_RUN_NOT_FOUND"):
        builder.preview(StageContextInput(projectId=project.projectId, runId=uuid4(),
                                          query="日期"))
    storage.close()


def test_conflicting_versions_request_human_decision_and_do_not_override_task(
    tmp_path: Path,
) -> None:
    root, storage, project, config, knowledge, builder = _setup(tmp_path)
    document = root / "docs" / "prd.md"
    document.write_text("# 日期筛选\n必须使用 start_date。\n", encoding="utf-8")
    first = knowledge.import_source(KnowledgeImportInput(
        projectId=project.projectId, relativePath="docs/prd.md"))
    document.write_text("# 日期筛选\n禁止使用 start_date。\n", encoding="utf-8")
    second = knowledge.import_source(KnowledgeImportInput(
        projectId=project.projectId, relativePath="docs/prd.md"))
    assert second.version == first.version + 1
    preview = builder.preview(_input(project, config, "日期筛选 start_date"))
    assert preview.status == "needs_human_decision"
    assert preview.conflicts[0].reason == "SOURCE_VERSION_CHANGED"
    assert preview.conflicts[0].currentSourceRef.endswith("@2#0")
    assert preview.conflicts[0].otherSourceRef.endswith("@1#0")
    assert "请选择" in preview.conflicts[0].question or "请确认" in preview.conflicts[0].question
    assert preview.items[0].text == config.taskContract.goal
    assert all(item.priority <= 6 for item in preview.items)
    storage.close()


@pytest.mark.asyncio
async def test_host_preview_rpc_rejects_invalid_or_cross_project_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "host-data"))
    host = HostRuntime()
    try:
        assert host.storage_health()["status"] == "ready"
        root = tmp_path / "rpc project"
        root.mkdir()
        (root / "docs").mkdir()
        project, draft, environment = approved_task(host.storage, root, "standard")
        config = host.configs.create(selection(project, draft, environment,
                            VersionLock(id="standard", version="1", contentHash="a" * 64)))
        (root / "docs" / "date.md").write_text("# 日期筛选\nstart_date\n")
        host.knowledge.import_source(KnowledgeImportInput(
            projectId=project.projectId, relativePath="docs/date.md"))

        def request(params: dict[str, object]) -> RpcRequest:
            return RpcRequest(jsonrpc="2.0", id="context-fixture", method="context.preview",
                              params=params, transportVersion="forge-local-jsonrpc/v1")

        params: dict[str, object] = {"projectId": str(project.projectId),
                                     "runId": str(config.runId), "query": "日期 start_date"}
        result = await host.dispatch_async(request(params))
        assert result["data"]["status"] == "ready"
        assert result["data"]["items"][-1]["sourceRef"].startswith("knowledge:")
        with pytest.raises(ProtocolError) as invalid:
            await host.dispatch_async(request({**params, "sql": "DELETE FROM projects"}))
        assert invalid.value.code == "INVALID_REQUEST"
        with pytest.raises(ProtocolError) as missing:
            await host.dispatch_async(request({**params, "projectId": str(uuid4())}))
        assert missing.value.code == "CONTEXT_RUN_NOT_FOUND"
    finally:
        await host.shutdown()
