"""Real project files enter Host storage only through bounded read-only ingestion."""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.host import HostRuntime
from forge.knowledge_ingestion import (
    KnowledgeChunkInput,
    KnowledgeError,
    KnowledgeImportInput,
    KnowledgeIngestionService,
    KnowledgeProjectInput,
    KnowledgeSourceInput,
)
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.protocol import ProtocolError, RpcRequest


def trusted(storage: ForgePersistence, root: Path):
    projects = ProjectService(storage)
    probe = projects.probe(str(root))
    return projects.create(str(root), probe.fingerprint, TRUST_VERSION, True, 0)


def test_read_only_import_ranges_versions_retry_and_revocation(tmp_path: Path) -> None:
    root = tmp_path / "sample project"
    docs = root / "docs"
    docs.mkdir(parents=True)
    source = docs / "规则 01.md"
    original = "# 目标\n只允许本地构建。\n\n## 验收\n必须人工确认。\n"
    source.write_text(original, encoding="utf-8")
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    assert storage.migrate(LATEST_SCHEMA) == LATEST_SCHEMA
    project = trusted(storage, root)
    service = KnowledgeIngestionService(storage, ProjectService(storage))
    value = KnowledgeImportInput(projectId=project.projectId, relativePath="docs/规则 01.md")
    first = service.import_source(value)
    assert first.version == 1 and first.chunkCount == 2 and first.status == "active"
    assert source.read_text(encoding="utf-8") == original
    assert service.import_source(value) == first
    first_chunk = service.chunk(KnowledgeChunkInput(
        projectId=project.projectId, sourceId=first.sourceId, version=1, ordinal=0,
    ))
    assert first_chunk.text == "# 目标\n只允许本地构建。\n\n"
    assert (first_chunk.startLine, first_chunk.endLine) == (1, 3)
    assert first_chunk.sourceRef == f"knowledge:{first.sourceId}@1#0"
    assert service.chunk(KnowledgeChunkInput(
        projectId=project.projectId, sourceId=first.sourceId, version=1, ordinal=1,
    )).text == "## 验收\n必须人工确认。\n"
    source.write_text(original.replace("本地", "隔离工作区"), encoding="utf-8")
    second = service.import_source(value)
    assert second.sourceId == first.sourceId and second.version == 2
    assert second.contentHash != first.contentHash
    old = service.chunk(KnowledgeChunkInput(
        projectId=project.projectId, sourceId=first.sourceId, version=1, ordinal=0,
    ))
    assert old.status == "superseded" and old.text == first_chunk.text
    revoked = service.revoke(KnowledgeSourceInput(
        projectId=project.projectId, sourceId=first.sourceId,
    ))
    assert revoked.status == "revoked" and revoked.chunkCount == 0
    assert service.revoke(KnowledgeSourceInput(
        projectId=project.projectId, sourceId=first.sourceId,
    )) == revoked
    tombstone = service.chunk(KnowledgeChunkInput(
        projectId=project.projectId, sourceId=first.sourceId, version=1, ordinal=0,
    ))
    assert tombstone.status == "revoked" and tombstone.text == ""
    assert tombstone.sourceRef == first_chunk.sourceRef
    assert source.read_text(encoding="utf-8").startswith("# 目标")
    storage.close()
    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    reopened.migrate(LATEST_SCHEMA)
    assert KnowledgeIngestionService(reopened, ProjectService(reopened)).list(
        KnowledgeProjectInput(projectId=project.projectId)
    )[0].status == "revoked"
    reopened.close()


def test_whitelist_size_symlink_secret_and_cross_project_boundaries(tmp_path: Path) -> None:
    root_a, root_b = tmp_path / "A", tmp_path / "B"
    for root in (root_a, root_b):
        (root / "docs").mkdir(parents=True)
    (root_a / "docs" / "valid.md").write_text("# Title\nAllowed\n")
    (root_a / "docs" / "huge.md").write_bytes(b"x" * 1_048_577)
    (root_a / "docs" / "secret.md").write_text("sk-" + "A" * 30)
    (root_a / "docs" / "bad.md").write_bytes(b"\xff\xfe")
    (root_a / "docs" / "openapi.json").write_text('{"name":"not OpenAPI"}')
    (root_a / "docs" / "escape.md").symlink_to(root_b / "docs" / "other.md")
    (root_b / "docs" / "other.md").write_text("# Other project\nNo access\n")
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    a, b = trusted(storage, root_a), trusted(storage, root_b)
    service = KnowledgeIngestionService(storage, ProjectService(storage))
    for path, code in (
        ("../B/docs/other.md", "KNOWLEDGE_PATH_DENIED"),
        ("docs/escape.md", "KNOWLEDGE_PATH_DENIED"),
        ("src/hidden.md", "KNOWLEDGE_PATH_DENIED"),
        ("docs/huge.md", "KNOWLEDGE_TOO_LARGE"),
        ("docs/secret.md", "KNOWLEDGE_SENSITIVE_CONTENT"),
        ("docs/bad.md", "KNOWLEDGE_ENCODING_INVALID"),
        ("docs/openapi.json", "KNOWLEDGE_FORMAT_INVALID"),
    ):
        with pytest.raises(KnowledgeError, match=code):
            service.import_source(KnowledgeImportInput(projectId=a.projectId, relativePath=path))
    assert service.list(KnowledgeProjectInput(projectId=a.projectId)) == []
    (root_a / "docs" / "openapi.json").write_text(
        '{"openapi":"3.1.0","info":{"title":"Fixture","version":"1"},"paths":{}}'
    )
    assert service.import_source(KnowledgeImportInput(
        projectId=a.projectId, relativePath="docs/openapi.json",
    )).version == 1
    imported = service.import_source(KnowledgeImportInput(
        projectId=a.projectId, relativePath="docs/valid.md",
    ))
    with pytest.raises(KnowledgeError, match="KNOWLEDGE_CHUNK_NOT_FOUND"):
        service.chunk(KnowledgeChunkInput(projectId=b.projectId, sourceId=imported.sourceId,
                                          version=1, ordinal=0))
    assert service.list(KnowledgeProjectInput(projectId=b.projectId)) == []
    storage.close()


@pytest.mark.asyncio
async def test_host_imports_openapi_text_and_rejects_unknown_commands(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    root = tmp_path / "api project"
    docs = root / "docs"
    docs.mkdir(parents=True)
    (docs / "openapi.yaml").write_text("openapi: 3.1.0\ninfo:\n  title: Fixture\npaths: {}\n")
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path / "data"))
    host = HostRuntime()
    try:
        assert host.storage_health()["status"] == "ready"
        project = trusted(host.storage, root)

        def request(method: str, params: dict[str, object]) -> RpcRequest:
            return RpcRequest(jsonrpc="2.0", id="knowledge-fixture", method=method,
                              params=params, transportVersion="forge-local-jsonrpc/v1")

        imported = await host.dispatch_async(request("knowledge.import", {
            "projectId": str(project.projectId), "relativePath": "docs/openapi.yaml",
        }))
        source_id = imported["data"]["sourceId"]
        assert imported["data"]["chunkCount"] >= 1
        listed = await host.dispatch_async(request("knowledge.list", {
            "projectId": str(project.projectId),
        }))
        assert listed["data"][0]["sourceId"] == source_id
        cited = await host.dispatch_async(request("knowledge.chunk", {
            "projectId": str(project.projectId), "sourceId": source_id,
            "version": 1, "ordinal": 0,
        }))
        assert cited["data"]["text"].startswith("openapi:")
        found = await host.dispatch_async(request("knowledge.search", {
            "projectId": str(project.projectId),
            "environmentId": str(project.environmentId), "query": "openapi",
        }))
        assert found["data"]["results"][0]["sourceId"] == source_id
        assert found["data"]["indexVersion"].startswith("forge-knowledge-search/")
        with pytest.raises(ProtocolError) as forged_search:
            await host.dispatch_async(request("knowledge.search", {
                "projectId": str(project.projectId),
                "environmentId": str(project.environmentId), "query": "openapi",
                "sql": "SELECT * FROM projects",
            }))
        assert forged_search.value.code == "INVALID_REQUEST"
        with pytest.raises(ProtocolError) as extra:
            await host.dispatch_async(request("knowledge.import", {
                "projectId": str(project.projectId), "relativePath": "docs/openapi.yaml",
                "command": "shell.execute",
            }))
        assert extra.value.code == "INVALID_REQUEST"
        with pytest.raises(ProtocolError) as unknown:
            await host.dispatch_async(request("knowledge.runScript", {}))
        assert unknown.value.code == "UNKNOWN_COMMAND"
    finally:
        await host.shutdown()
