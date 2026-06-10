"""Bounded, redacted Run observations and a read-only Git diff preview."""

from __future__ import annotations

import asyncio
import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from forge.executor_contracts import ExecutorEvent, UsageUpdated
from forge.persistence import ForgePersistence
from forge.runs import RunService, RunView
from forge.workspaces import WorkspaceDescriptor


class InspectionError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class RunObservation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    cursor: int = Field(gt=0)
    runId: UUID
    attemptId: UUID
    sourceSequenceFrom: int = Field(gt=0)
    sourceSequenceTo: int = Field(gt=0)
    type: str = Field(min_length=1, max_length=48)
    text: str = Field(max_length=2048)
    timestamp: str


class RunFileChange(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    path: str = Field(min_length=1, max_length=512)
    status: Literal["added", "modified", "deleted", "renamed"]


class RunDiffPreview(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    files: list[RunFileChange] = Field(max_length=200)
    text: str = Field(max_length=65536)
    truncated: bool
    capturedAt: str


class RunInspection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    run: RunView
    observations: list[RunObservation] = Field(max_length=100)
    nextCursor: int = Field(ge=0)
    hasMore: bool
    diff: RunDiffPreview | None
    contextSources: list[dict[str, str]] = Field(max_length=128)
    usage: dict[str, Any] | None


_SECRETS = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b"
    r"|(?i:Authorization\s*:\s*(?:Bearer|Basic)\s+)\S+"
    r"|(?im:^\s*(?:Set-)?Cookie\s*:\s*[^\r\n]+)"
    r"|(?i:(?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,'\";]+"
)
_SENSITIVE_PATH = re.compile(r"(^|/)(\.env(?:\.|$)|[^/]+\.(?:pem|key|p12|pfx)$)", re.I)


def redact(text: str) -> str:
    return _SECRETS.sub("[REDACTED]", text)


def _summary(event: ExecutorEvent) -> str:
    if event.type == "assistant.message":
        return event.text
    if event.type == "command.started":
        return "Command started (arguments hidden)"
    if event.type == "command.completed":
        return f"Command exited {event.exitCode if event.exitCode is not None else 'unknown'}"
    if event.type in ("tool.started", "tool.completed"):
        return event.name
    if event.type == "file.changed":
        return f"{event.kind} {Path(event.path).name}"
    if event.type == "approval.requested":
        return f"{event.capability} approval requested"
    if event.type == "approval.resolved":
        return f"Approval {event.decision}"
    if event.type == "usage.updated":
        return f"{event.inputTokens} input / {event.outputTokens} output tokens"
    if event.type == "run.status":
        return event.status
    if event.type == "run.failed":
        return event.code
    return event.type


class RunInspectionService:
    def __init__(self, storage: ForgePersistence, runs: RunService) -> None:
        self.storage = storage
        self.runs = runs

    def append(self, project_id: UUID, run_id: UUID, attempt_id: UUID,
               event: ExecutorEvent) -> None:
        run = self.runs.get(project_id, run_id)
        if run is None or run.attempt.attemptId != attempt_id:
            raise InspectionError("RUN_CONFLICT")
        with self.storage.transaction() as db:
            latest = db.execute(
                "SELECT source_seq_to FROM run_observations WHERE run_id=? "
                "ORDER BY cursor DESC LIMIT 1", (str(run_id),),
            ).fetchone()
            if latest and event.sequence <= latest["source_seq_to"]:
                raise InspectionError("RUN_CONFLICT")
            if latest is None and event.sequence != 1:
                raise InspectionError("RUN_CONFLICT")
            count_row = db.execute(
                "SELECT COUNT(*) FROM run_observations WHERE run_id=?", (str(run_id),)
            ).fetchone()
            assert count_row is not None
            count = count_row[0]
            if count >= 2000 and event.type not in (
                "run.completed", "run.failed", "run.cancelled"
            ):
                if count == 2000:
                    db.execute(
                        "INSERT INTO run_observations(run_id,attempt_id,source_seq_from,"
                        "source_seq_to,type,text,created_at) VALUES(?,?,?,?,?,?,?)",
                        (str(run_id), str(attempt_id), event.sequence, event.sequence,
                         "stream.truncated", "Run activity limit reached", event.timestamp),
                    )
                return
            db.execute(
                "INSERT INTO run_observations(run_id,attempt_id,source_seq_from,"
                "source_seq_to,type,text,created_at) VALUES(?,?,?,?,?,?,?)",
                (str(run_id), str(attempt_id), event.sequence, event.sequence,
                 event.type, redact(_summary(event))[:2048], event.timestamp),
            )
            if isinstance(event, UsageUpdated):
                usage = event.model_dump(mode="json", exclude={
                    "type", "runId", "sequence", "timestamp"
                })
                db.execute(
                    "INSERT INTO run_usage_snapshots(run_id,usage_json,source_sequence) "
                    "VALUES(?,?,?) ON CONFLICT(run_id) DO UPDATE SET "
                    "usage_json=excluded.usage_json,source_sequence=excluded.source_sequence "
                    "WHERE excluded.source_sequence>source_sequence",
                    (str(run_id), json.dumps(usage), event.sequence),
                )

    def save_diff(self, project_id: UUID, run_id: UUID, preview: RunDiffPreview) -> None:
        if self.runs.get(project_id, run_id) is None:
            raise InspectionError("RUN_NOT_FOUND")
        with self.storage.transaction() as db:
            db.execute(
                "INSERT INTO run_diff_previews(run_id,preview_json,captured_at) VALUES(?,?,?) "
                "ON CONFLICT(run_id) DO UPDATE SET preview_json=excluded.preview_json,"
                "captured_at=excluded.captured_at",
                (str(run_id), preview.model_dump_json(), preview.capturedAt),
            )

    def list(self, project_id: UUID, task_id: UUID) -> list[RunView]:
        rows = self.storage.session().execute(
            "SELECT run_id FROM runs WHERE project_id=? AND task_id=? "
            "ORDER BY created_at DESC LIMIT 50", (str(project_id), str(task_id)),
        )
        return [value for row in rows if (
            value := self.runs.get(project_id, UUID(row["run_id"]))) is not None
        ]

    def inspect(self, project_id: UUID, run_id: UUID, after_cursor: int = 0,
                limit: int = 100) -> RunInspection:
        if after_cursor < 0 or not 1 <= limit <= 100:
            raise InspectionError("INVALID_REQUEST")
        run = self.runs.get(project_id, run_id)
        if run is None:
            raise InspectionError("RUN_NOT_FOUND")
        db = self.storage.session()
        rows = db.execute(
            "SELECT * FROM run_observations WHERE run_id=? AND cursor>? "
            "ORDER BY cursor LIMIT ?", (str(run_id), after_cursor, limit + 1),
        ).fetchall()
        observations = [RunObservation(
            cursor=row["cursor"], runId=run_id, attemptId=UUID(row["attempt_id"]),
            sourceSequenceFrom=row["source_seq_from"], sourceSequenceTo=row["source_seq_to"],
            type=row["type"], text=row["text"], timestamp=row["created_at"],
        ) for row in rows[:limit]]
        diff_row = db.execute(
            "SELECT preview_json FROM run_diff_previews WHERE run_id=?", (str(run_id),)
        ).fetchone()
        bundle_row = db.execute(
            "SELECT bundle_json FROM context_bundles WHERE run_id=? "
            "ORDER BY created_at LIMIT 1", (str(run_id),)
        ).fetchone()
        items = json.loads(bundle_row["bundle_json"]).get("items", []) if bundle_row else []
        usage_row = db.execute(
            "SELECT usage_json FROM run_usage_snapshots WHERE run_id=?", (str(run_id),)
        ).fetchone()
        return RunInspection(
            run=run, observations=observations,
            nextCursor=observations[-1].cursor if observations else after_cursor,
            hasMore=len(rows) > limit,
            diff=RunDiffPreview.model_validate_json(diff_row["preview_json"]) if diff_row else None,
            contextSources=[{
                "sourceRef": item["sourceRef"],
                "sourceKind": f"{item['authority']}/{item['kind']}",
            } for item in items[:128]],
            usage=json.loads(usage_row["usage_json"]) if usage_row else None,
        )


async def _git(root: Path, *args: str) -> bytes:
    try:
        child = await asyncio.create_subprocess_exec(
            "git", "-c", "core.fsmonitor=false", "-C", str(root), *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        )
        output, _ = await asyncio.wait_for(child.communicate(), timeout=10)
        if child.returncode != 0 or len(output) > 1024 * 1024:
            raise InspectionError("RUN_DIFF_UNAVAILABLE")
        return output
    except (OSError, TimeoutError) as error:
        if "child" in locals() and child.returncode is None:
            child.kill()
            await child.wait()
        raise InspectionError("RUN_DIFF_UNAVAILABLE") from error


async def capture_run_diff(workspace: WorkspaceDescriptor) -> RunDiffPreview:
    root = Path(workspace.rootPath)
    if root.is_symlink() or root.resolve(strict=True) != root:
        raise InspectionError("RUN_DIFF_UNAVAILABLE")
    raw = await _git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    entries = [item for item in raw.decode("utf-8", errors="replace").split("\0") if item]
    changes: list[RunFileChange] = []
    truncated = len(entries) > 200
    index = 0
    while index < len(entries) and len(changes) < 200:
        entry = entries[index]
        index += 1
        flag, name = entry[:2], entry[3:]
        if "R" in flag or "C" in flag:
            index += 1
        path = Path(name)
        if (
            not name or len(name) > 512 or _SENSITIVE_PATH.search(name)
            or path.is_absolute() or "\\" in name or any(
                segment in ("", ".", "..") for segment in name.split("/")
            ) or (root / path).resolve().is_relative_to(root) is False
        ):
            truncated = True
            continue
        status: Literal["added", "modified", "deleted", "renamed"] = (
            "added" if flag == "??" or "A" in flag
            else "deleted" if "D" in flag else "renamed" if "R" in flag else "modified"
        )
        changes.append(RunFileChange(path=name, status=status))
    tracked = [item.path for item in changes if item.status != "added"]
    raw_diff = await _git(root, "diff", "HEAD", "--no-ext-diff", "--no-textconv",
                          "--no-color", "--", *tracked) if tracked else b""
    text = raw_diff.decode("utf-8", errors="replace")
    for item in changes:
        if item.status != "added":
            continue
        target = root / item.path
        if target.is_symlink() or not target.is_file() or target.stat().st_size > 8192:
            truncated = True
            continue
        fd = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            content = os.read(fd, 8193)
        finally:
            os.close(fd)
        if len(content) > 8192 or b"\0" in content:
            truncated = True
            continue
        text += f"\n--- /dev/null\n+++ {item.path}\n" + "\n".join(
            f"+{line}" for line in content.decode("utf-8", errors="replace").split("\n")
        )
    if len(text) > 65536:
        truncated = True
    return RunDiffPreview(
        files=changes, text=redact(text)[:65536], truncated=truncated,
        capturedAt=datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
    )
