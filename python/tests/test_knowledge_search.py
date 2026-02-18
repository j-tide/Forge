"""Real FTS5 search, scoped retrieval, migration backfill and revocation."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from forge.knowledge_ingestion import (
    KnowledgeError,
    KnowledgeImportInput,
    KnowledgeIngestionService,
    KnowledgeSearchInput,
    KnowledgeSourceInput,
)
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService


def _project(storage: ForgePersistence, root: Path):
    root.mkdir()
    project_service = ProjectService(storage)
    probe = project_service.probe(str(root))
    return project_service.create(str(root), probe.fingerprint, TRUST_VERSION, True, 0)


def _search(service: KnowledgeIngestionService, project, query: str, **extra):
    return service.search(KnowledgeSearchInput(
        projectId=project.projectId, environmentId=project.environmentId,
        query=query, **extra,
    ))


def test_chinese_code_scoped_search_reimport_revoke_and_restart(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(28)
    a = _project(storage, tmp_path / "中文 project")
    b = _project(storage, tmp_path / "other project")
    for project, text in ((a, "# 日期筛选\nUse start_date for local queries.\n"),
                          (b, "# 日期筛选\nUse start_date for private queries.\n")):
        docs = Path(project.rootPath) / "docs"
        docs.mkdir()
        (docs / "guide.md").write_text(text, encoding="utf-8")
    service = KnowledgeIngestionService(storage, ProjectService(storage))
    source_a = service.import_source(KnowledgeImportInput(
        projectId=a.projectId, relativePath="docs/guide.md"))
    source_b = service.import_source(KnowledgeImportInput(
        projectId=b.projectId, relativePath="docs/guide.md"))
    for query in ("日期筛选 start_date", "日期", "筛", "start_date"):
        found = _search(service, a, query)
        assert len(found.results) == 1 and found.results[0].sourceId == source_a.sourceId
        assert found.results[0].sourceRef == f"knowledge:{source_a.sourceId}@1#0"
        assert found.results[0].startLine == 1
    assert _search(service, a, "private").results == []
    assert _search(service, b, "private").results[0].sourceId == source_b.sourceId
    assert _search(service, a, "不存在的规则").results == []
    assert _search(service, a, "日期", version=2).results == []
    assert _search(service, a, "日期", sourceId=source_b.sourceId).results == []
    with pytest.raises(KnowledgeError, match="KNOWLEDGE_SCOPE_DENIED"):
        service.search(KnowledgeSearchInput(
            projectId=a.projectId, environmentId=uuid4(), query="日期",
        ))
    path = Path(a.rootPath) / "docs" / "guide.md"
    path.write_text("# 版本二\nUse end_date for the new filter.\n", encoding="utf-8")
    updated = service.import_source(KnowledgeImportInput(
        projectId=a.projectId, relativePath="docs/guide.md"))
    assert updated.version == 2
    assert _search(service, a, "start_date").results == []
    assert _search(service, a, "end_date").results[0].version == 2
    storage.close()
    restarted = ForgePersistence(tmp_path / "data")
    restarted.open()
    assert restarted.migrate(28) == 28
    service = KnowledgeIngestionService(restarted, ProjectService(restarted))
    assert _search(service, a, "end_date").results[0].sourceId == source_a.sourceId
    service.revoke(KnowledgeSourceInput(projectId=a.projectId, sourceId=source_a.sourceId))
    assert _search(service, a, "end_date").results == []
    assert _search(service, b, "start_date").results[0].sourceId == source_b.sourceId
    assert path.exists()
    assert restarted.session().execute("SELECT COUNT(*) FROM knowledge_fts").fetchone()[0] == 1
    restarted.close()


def test_migration_backfills_previous_source_and_short_char_index(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(27)
    project = _project(storage, tmp_path / "legacy project")
    now = "2026-09-25T00:00:00Z"
    source_id = str(uuid4())
    with storage.transaction() as db:
        db.execute("INSERT INTO knowledge_sources(source_id,project_id,relative_path,"
                   "current_version,content_hash,status,byte_size,created_at,updated_at) "
                   "VALUES(?,?,?,?,?,?,?,?,?)", (source_id, str(project.projectId), "docs/old.md",
                   1, "a" * 64, "active", 15, now, now))
        db.execute("INSERT INTO knowledge_chunks(source_id,version,ordinal,start_line,"
                   "end_line,heading,text,content_hash) VALUES(?,?,?,?,?,?,?,?)",
                   (source_id, 1, 0, 1, 1, None, "日期 start_date", "b" * 64))
    assert storage.migrate(28) == 28
    service = KnowledgeIngestionService(storage, ProjectService(storage))
    assert str(_search(service, project, "日期 start_date").results[0].sourceId) == source_id
    storage.close()
