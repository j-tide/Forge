"""Host-owned, read-only project document ingestion with exact source ranges."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path, PurePosixPath
from sqlite3 import Row
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.persistence import ForgePersistence, cjk_short_terms
from forge.projects import ProjectService

MAX_SOURCE_BYTES = 1_048_576
MAX_CHUNK_CHARS = 4_000
MAX_CHUNKS = 512
_DIRECTORIES = frozenset(("docs", "spec", "specs", "knowledge"))
_OPENAPI_NAMES = frozenset((
    "openapi.yaml", "openapi.yml", "openapi.json",
    "swagger.yaml", "swagger.yml", "swagger.json",
))
_HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*$")
_YAML_KEY = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):(?:\s|$)")
_SENSITIVE = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|"
    r"ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b"
)
_OPENAPI_YAML = re.compile(r"(?m)^(?:openapi|swagger):\s*['\"]?[23]\.\d")
_SEARCH_PART = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|[\u3400-\u9fff]+")
_CJK = re.compile(r"[\u3400-\u9fff]+")
SEARCH_INDEX_VERSION = "forge-knowledge-search/v1-fts5-trigram-cjk-short"


class KnowledgeError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class KnowledgeImportInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID
    relativePath: str = Field(min_length=1, max_length=1024)


class KnowledgeProjectInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    projectId: UUID


class KnowledgeSourceInput(KnowledgeProjectInput):
    sourceId: UUID


class KnowledgeChunkInput(KnowledgeSourceInput):
    version: int = Field(ge=1)
    ordinal: int = Field(ge=0)


class KnowledgeSearchInput(KnowledgeProjectInput):
    environmentId: UUID
    query: str = Field(min_length=1, max_length=160)
    sourceId: UUID | None = None
    version: int | None = Field(default=None, ge=1)
    limit: int = Field(default=20, ge=1, le=50)


class KnowledgeSource(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    sourceId: UUID
    projectId: UUID
    relativePath: str
    version: int = Field(ge=1)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    status: Literal["active", "revoked"]
    byteSize: int = Field(ge=0)
    chunkCount: int = Field(ge=0)
    createdAt: str
    updatedAt: str


class KnowledgeChunk(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    sourceId: UUID
    projectId: UUID
    version: int = Field(ge=1)
    ordinal: int = Field(ge=0)
    startLine: int = Field(ge=1)
    endLine: int = Field(ge=1)
    heading: str | None
    text: str
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    sourceRef: str
    status: Literal["active", "superseded", "revoked"]


class KnowledgeSearchResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    indexVersion: str
    results: list[KnowledgeChunk]


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _allowed(relative: PurePosixPath) -> bool:
    parts = relative.parts
    name = relative.name.lower()
    if name.startswith(".") or any(part.startswith(".") for part in parts):
        return False
    if len(parts) == 1:
        return name == "readme.md" or name in _OPENAPI_NAMES
    if parts[0] not in _DIRECTORIES:
        return False
    if name.endswith((".md", ".txt")):
        return True
    return name in _OPENAPI_NAMES


def _document_chunks(text: str, suffix: str) -> list[tuple[int, int, str | None, str, str]]:
    lines = text.splitlines(keepends=True)
    if not lines or not text.strip():
        raise KnowledgeError("KNOWLEDGE_EMPTY")
    result: list[tuple[int, int, str | None, str, str]] = []
    buffer: list[str] = []
    start = 1
    heading: str | None = None
    in_fence = False

    def flush(end: int) -> None:
        nonlocal start
        if buffer:
            body = "".join(buffer)
            result.append((start, end, heading, body, _sha(body.encode("utf-8"))))
            buffer.clear()
        start = end + 1

    for number, line in enumerate(lines, 1):
        if len(line) > MAX_CHUNK_CHARS:
            raise KnowledgeError("KNOWLEDGE_LINE_TOO_LONG")
        stripped = line.strip()
        fence = stripped.startswith(("```", "~~~"))
        match = _HEADING.match(line) if suffix == ".md" and not in_fence else None
        if suffix in (".yaml", ".yml") and not in_fence:
            match = _YAML_KEY.match(line)
        if match and buffer:
            flush(number - 1)
        if match:
            heading = match.group(1).strip()[:160]
        if buffer and len("".join(buffer)) + len(line) > MAX_CHUNK_CHARS:
            flush(number - 1)
        if not buffer:
            start = number
        buffer.append(line)
        if fence:
            in_fence = not in_fence
        if len(result) > MAX_CHUNKS:
            raise KnowledgeError("KNOWLEDGE_TOO_MANY_CHUNKS")
    flush(len(lines))
    if len(result) > MAX_CHUNKS:
        raise KnowledgeError("KNOWLEDGE_TOO_MANY_CHUNKS")
    return result


class KnowledgeIngestionService:
    def __init__(self, storage: ForgePersistence, projects: ProjectService) -> None:
        self.storage = storage
        self.projects = projects

    def _project_root(self, project_id: UUID) -> Path:
        project = self.projects.get(str(project_id))
        if project is None or project.archivedAt is not None or not project.trusted:
            raise KnowledgeError("KNOWLEDGE_PROJECT_UNAVAILABLE")
        try:
            return Path(project.rootPath).resolve(strict=True)
        except (OSError, RuntimeError) as error:
            raise KnowledgeError("KNOWLEDGE_PROJECT_UNAVAILABLE") from error

    def _file(self, value: KnowledgeImportInput) -> tuple[Path, str]:
        root = self._project_root(value.projectId)
        name = PurePosixPath(value.relativePath)
        if (not name.parts or name.is_absolute() or ":" in value.relativePath
                or "\\" in value.relativePath
                or any(part in (".", "..", "") for part in name.parts)
                or not _allowed(name)):
            raise KnowledgeError("KNOWLEDGE_PATH_DENIED")
        try:
            path = root.joinpath(*name.parts).resolve(strict=True)
            canonical = path.relative_to(root)
        except (OSError, RuntimeError, ValueError) as error:
            raise KnowledgeError("KNOWLEDGE_PATH_DENIED") from error
        relative = PurePosixPath(*canonical.parts)
        if not _allowed(relative) or not path.is_file():
            raise KnowledgeError("KNOWLEDGE_PATH_DENIED")
        return path, relative.as_posix()

    def _source(self, row: Row) -> KnowledgeSource:
        count = self.storage.session().execute(
            "SELECT COUNT(*) AS n FROM knowledge_chunks WHERE source_id=? "
            "AND version=? AND length(text)>0",
            (row["source_id"], row["current_version"]),
        ).fetchone()
        return KnowledgeSource(
            sourceId=UUID(row["source_id"]), projectId=UUID(row["project_id"]),
            relativePath=row["relative_path"], version=row["current_version"],
            contentHash=row["content_hash"], status=row["status"],
            byteSize=row["byte_size"], chunkCount=count["n"] if count else 0,
            createdAt=row["created_at"], updatedAt=row["updated_at"],
        )

    def list(self, value: KnowledgeProjectInput) -> list[KnowledgeSource]:
        self._project_root(value.projectId)
        rows = self.storage.session().execute(
            "SELECT * FROM knowledge_sources WHERE project_id=? ORDER BY relative_path",
            (str(value.projectId),),
        ).fetchall()
        return [self._source(row) for row in rows]

    def import_source(self, value: KnowledgeImportInput) -> KnowledgeSource:
        path, relative = self._file(value)
        project = self.projects.get(str(value.projectId))
        assert project is not None
        try:
            with path.open("rb") as file:
                raw = file.read(MAX_SOURCE_BYTES + 1)
        except OSError as error:
            raise KnowledgeError("KNOWLEDGE_READ_FAILED") from error
        if len(raw) > MAX_SOURCE_BYTES:
            raise KnowledgeError("KNOWLEDGE_TOO_LARGE")
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeError as error:
            raise KnowledgeError("KNOWLEDGE_ENCODING_INVALID") from error
        if "\x00" in text:
            raise KnowledgeError("KNOWLEDGE_ENCODING_INVALID")
        if _SENSITIVE.search(text):
            raise KnowledgeError("KNOWLEDGE_SENSITIVE_CONTENT")
        if path.suffix.lower() == ".json":
            try:
                document = json.loads(text)
            except json.JSONDecodeError as error:
                raise KnowledgeError("KNOWLEDGE_FORMAT_INVALID") from error
            if not isinstance(document, dict) or not any(
                isinstance(document.get(key), str) and document[key].startswith(prefix)
                for key, prefix in (("openapi", "3."), ("swagger", "2."))
            ):
                raise KnowledgeError("KNOWLEDGE_FORMAT_INVALID")
        elif path.suffix.lower() in (".yaml", ".yml") and not _OPENAPI_YAML.search(text):
            raise KnowledgeError("KNOWLEDGE_FORMAT_INVALID")
        chunks = _document_chunks(text, path.suffix.lower())
        content_hash = _sha(raw)
        with self.storage.transaction() as db:
            prior = db.execute(
                "SELECT * FROM knowledge_sources WHERE project_id=? AND relative_path=?",
                (str(value.projectId), relative),
            ).fetchone()
            if (prior is not None and prior["status"] == "active" and
                    prior["content_hash"] == content_hash):
                return self._source(prior)
            source_id = prior["source_id"] if prior else str(uuid4())
            version = prior["current_version"] + 1 if prior else 1
            now = timestamp()
            if prior is None:
                db.execute(
                    "INSERT INTO knowledge_sources"
                    "(source_id,project_id,relative_path,current_version,content_hash,"
                    "status,byte_size,created_at,updated_at,environment_id) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (source_id, str(value.projectId), relative, version, content_hash,
                     "active", len(raw), now, now, str(project.environmentId)),
                )
            else:
                old_rows = db.execute(
                    "SELECT rowid FROM knowledge_chunks WHERE source_id=? AND version=?",
                    (source_id, prior["current_version"]),
                ).fetchall()
                for old in old_rows:
                    db.execute("DELETE FROM knowledge_fts WHERE rowid=?", (old["rowid"],))
                    db.execute("DELETE FROM knowledge_short_terms WHERE chunk_rowid=?",
                               (old["rowid"],))
                db.execute(
                    "UPDATE knowledge_sources SET current_version=?,content_hash=?,"
                    "status='active',byte_size=?,updated_at=?,environment_id=? WHERE source_id=?",
                    (version, content_hash, len(raw), now, str(project.environmentId), source_id),
                )
            for index, (first, last, heading, body, digest) in enumerate(chunks):
                inserted = db.execute(
                    "INSERT INTO knowledge_chunks"
                    "(source_id,version,ordinal,start_line,end_line,heading,text,content_hash)"
                    " VALUES(?,?,?,?,?,?,?,?)",
                    (source_id, version, index, first, last, heading, body, digest),
                )
                chunk_rowid = db.execute(
                    "SELECT rowid FROM knowledge_chunks "
                    "WHERE source_id=? AND version=? AND ordinal=?",
                    (source_id, version, index),
                ).fetchone()
                assert inserted.rowcount == 1 and chunk_rowid is not None
                db.execute("INSERT INTO knowledge_fts(rowid,text) VALUES(?,?)",
                           (chunk_rowid["rowid"], body))
                for term in cjk_short_terms(body):
                    db.execute("INSERT INTO knowledge_short_terms(chunk_rowid,term) VALUES(?,?)",
                               (chunk_rowid["rowid"], term))
        row = self.storage.session().execute(
            "SELECT * FROM knowledge_sources WHERE source_id=?", (source_id,),
        ).fetchone()
        assert row is not None
        return self._source(row)

    def chunk(self, value: KnowledgeChunkInput) -> KnowledgeChunk:
        self._project_root(value.projectId)
        row = self.storage.session().execute(
            "SELECT s.*,c.version,c.ordinal,c.start_line,c.end_line,c.heading,c.text,"
            "c.content_hash AS chunk_hash FROM knowledge_sources s JOIN knowledge_chunks c "
            "ON s.source_id=c.source_id WHERE s.project_id=? AND s.source_id=? "
            "AND c.version=? AND c.ordinal=?",
            (str(value.projectId), str(value.sourceId), value.version, value.ordinal),
        ).fetchone()
        if row is None:
            raise KnowledgeError("KNOWLEDGE_CHUNK_NOT_FOUND")
        status: Literal["active", "superseded", "revoked"] = (
            "revoked" if row["status"] == "revoked" else
            "superseded" if row["current_version"] != value.version else "active"
        )
        return KnowledgeChunk(
            sourceId=value.sourceId, projectId=value.projectId,
            version=value.version, ordinal=value.ordinal,
            startLine=row["start_line"], endLine=row["end_line"],
            heading=row["heading"], text=row["text"],
            contentHash=row["chunk_hash"],
            sourceRef=f"knowledge:{value.sourceId}@{value.version}#{value.ordinal}",
            status=status,
        )

    def search(self, value: KnowledgeSearchInput) -> KnowledgeSearchResult:
        project = self.projects.get(str(value.projectId))
        self._project_root(value.projectId)
        if project is None or project.environmentId != value.environmentId:
            raise KnowledgeError("KNOWLEDGE_SCOPE_DENIED")
        parts = _SEARCH_PART.findall(value.query)
        if not parts:
            return KnowledgeSearchResult(indexVersion=SEARCH_INDEX_VERSION, results=[])
        if len(parts) > 8:
            raise KnowledgeError("KNOWLEDGE_QUERY_TOO_COMPLEX")
        clauses = [
            "s.project_id=?", "s.environment_id=?", "s.status='active'",
            "c.version=s.current_version", "length(c.text)>0",
        ]
        args: list[str | int] = [str(value.projectId), str(value.environmentId)]
        if value.sourceId is not None:
            clauses.append("s.source_id=?")
            args.append(str(value.sourceId))
        if value.version is not None:
            clauses.append("c.version=?")
            args.append(value.version)
        for part in parts:
            if _CJK.fullmatch(part) and len(part) < 3:
                clauses.append(
                    "c.rowid IN (SELECT chunk_rowid FROM knowledge_short_terms WHERE term=?)"
                )
                args.append(part)
                clauses.append("instr(c.text,?)>0")
                args.append(part)
            elif len(part) >= 3:
                clauses.append(
                    "c.rowid IN (SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?)"
                )
                args.append(f'"{part}"')
                clauses.append("instr(lower(c.text),?)>0")
                args.append(part.lower())
            else:
                clauses.append("instr(lower(c.text),?)>0")
                args.append(part.lower())
        rows = self.storage.session().execute(
            "SELECT s.project_id,c.source_id,c.version,c.ordinal,c.start_line,c.end_line,"
            "c.heading,c.text,c.content_hash FROM knowledge_sources s "
            "JOIN knowledge_chunks c ON c.source_id=s.source_id WHERE "
            + " AND ".join(clauses) + " ORDER BY s.relative_path,c.ordinal LIMIT ?",
            (*args, value.limit),
        ).fetchall()
        return KnowledgeSearchResult(
            indexVersion=SEARCH_INDEX_VERSION,
            results=[KnowledgeChunk(
                sourceId=UUID(row["source_id"]), projectId=UUID(row["project_id"]),
                version=row["version"], ordinal=row["ordinal"],
                startLine=row["start_line"], endLine=row["end_line"],
                heading=row["heading"], text=row["text"],
                contentHash=row["content_hash"],
                sourceRef=f"knowledge:{row['source_id']}@{row['version']}#{row['ordinal']}",
                status="active",
            ) for row in rows],
        )

    def revoke(self, value: KnowledgeSourceInput) -> KnowledgeSource:
        self._project_root(value.projectId)
        with self.storage.transaction() as db:
            row = db.execute(
                "SELECT * FROM knowledge_sources WHERE project_id=? AND source_id=?",
                (str(value.projectId), str(value.sourceId)),
            ).fetchone()
            if row is None:
                raise KnowledgeError("KNOWLEDGE_SOURCE_NOT_FOUND")
            if row["status"] != "revoked":
                indexed = db.execute(
                    "SELECT rowid FROM knowledge_chunks WHERE source_id=? AND version=?",
                    (str(value.sourceId), row["current_version"]),
                ).fetchall()
                for chunk_row in indexed:
                    db.execute("DELETE FROM knowledge_fts WHERE rowid=?", (chunk_row["rowid"],))
                    db.execute("DELETE FROM knowledge_short_terms WHERE chunk_rowid=?",
                               (chunk_row["rowid"],))
                db.execute(
                    "UPDATE knowledge_sources SET status='revoked',updated_at=? "
                    "WHERE source_id=?", (timestamp(), str(value.sourceId)),
                )
                db.execute("UPDATE knowledge_chunks SET text='' WHERE source_id=?",
                           (str(value.sourceId),))
        refreshed = self.storage.session().execute(
            "SELECT * FROM knowledge_sources WHERE source_id=?", (str(value.sourceId),),
        ).fetchone()
        assert refreshed is not None
        return self._source(refreshed)
