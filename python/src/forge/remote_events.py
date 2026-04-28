"""Project-scoped, bounded committed invalidations for authenticated SSE.

Events carry only identity and kind. Consumers reload authoritative projections;
the event stream itself is never a source of command success or approval state.
"""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

from forge.persistence import ForgePersistence
from forge.remote_commands import RemoteCommandError
from forge.remote_sessions import RemoteSessionService

MAX_REPLAY = 256
PAGE_SIZE = 64
CURSOR = re.compile(r"p:(0|[1-9][0-9]{0,17})\Z")


class RemoteEventFeed:
    def __init__(self, storage: ForgePersistence, sessions: RemoteSessionService,
                 host_id: str) -> None:
        self.storage = storage
        self.sessions = sessions
        self.host_id = host_id

    def snapshot_cursor(self, project_id: str) -> str:
        row = self.storage.session().execute(
            "SELECT COALESCE(MAX(seq),0) FROM remote_event_log WHERE project_id=?",
            (project_id,),
        ).fetchone()
        assert row is not None
        return f"p:{row[0]}"

    def read_notifications(self, request: dict[str, Any]) -> dict[str, Any]:
        """A bounded in-app list of committed event identities, never push content."""
        if set(request) != {"sessionToken", "projectId", "limit"}:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        token, project_id, limit = (
            request["sessionToken"], request["projectId"], request["limit"]
        )
        if not isinstance(token, str) or not isinstance(project_id, str) or (
            isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 20
        ):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        try:
            project = str(UUID(project_id))
        except ValueError as error:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        identity = self.sessions.authenticate(token)
        if project not in identity["projectIds"]:
            raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
        rows = self.storage.session().execute(
            "SELECT seq,entity_id,task_id,kind,occurred_at FROM remote_event_log "
            "WHERE project_id=? ORDER BY seq DESC LIMIT ?", (project, limit),
        ).fetchall()
        return {"projectId": project, "items": [
            {"id": f"p:{row['seq']}", "entityId": row["entity_id"],
             "hostId": self.host_id, "projectId": project,
             "taskId": row["task_id"], "type": row["kind"],
             "occurredAt": row["occurred_at"]} for row in rows
        ], "lastEventCursor": self.snapshot_cursor(project)}

    def read_page(self, request: dict[str, Any]) -> dict[str, Any]:
        if set(request) not in (
            {"sessionToken", "projectId", "cursor"},
            {"sessionToken", "projectId", "cursor", "policyRevision"},
        ):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        token, project_id, raw_cursor = (
            request["sessionToken"], request["projectId"], request["cursor"]
        )
        if not isinstance(token, str) or not isinstance(project_id, str) or (
            raw_cursor is not None and not isinstance(raw_cursor, str)
        ):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        revision = request.get("policyRevision")
        if revision is not None and (
            type(revision) is not int or not 1 <= revision <= 2_147_483_647
        ):
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400)
        try:
            project = str(UUID(project_id))
        except ValueError as error:
            raise RemoteCommandError("REMOTE_INVALID_REQUEST", 400) from error
        identity = self.sessions.authenticate(token)
        if revision is not None and identity["policyRevision"] != revision:
            raise RemoteCommandError("REMOTE_POLICY_CHANGED", 403)
        if project not in identity["projectIds"]:
            raise RemoteCommandError("REMOTE_PROJECT_FORBIDDEN", 403)
        if raw_cursor is not None and CURSOR.fullmatch(raw_cursor) is None:
            raise RemoteCommandError("REMOTE_INVALID_CURSOR", 400)
        after = int(raw_cursor[2:]) if raw_cursor is not None else None
        db = self.storage.session()
        latest_row = db.execute(
            "SELECT COALESCE(MAX(seq),0) FROM remote_event_log WHERE project_id=?",
            (project,),
        ).fetchone()
        assert latest_row is not None
        latest = int(latest_row[0])
        # No cursor means the client has not fetched its first authoritative
        # board snapshot. Never pretend that a partial replay is complete.
        if after is None or after > latest:
            return {"events": [], "cursor": f"p:{latest}", "resyncRequired": True}
        if after < latest:
            replay_window = db.execute(
                "SELECT seq FROM remote_event_log WHERE project_id=? AND seq>? "
                "ORDER BY seq ASC LIMIT ?",
                (project, after, MAX_REPLAY + 1),
            ).fetchall()
            if len(replay_window) > MAX_REPLAY:
                return {"events": [], "cursor": f"p:{latest}",
                        "resyncRequired": True}
        rows = db.execute(
            "SELECT seq,entity_id,task_id,kind,occurred_at FROM remote_event_log "
            "WHERE project_id=? AND seq>? ORDER BY seq ASC LIMIT ?",
            (project, after, PAGE_SIZE),
        ).fetchall()
        events = [{"id": f"p:{row['seq']}", "entityId": row["entity_id"],
                   "hostId": self.host_id, "projectId": project,
                   "taskId": row["task_id"], "type": row["kind"],
                   "occurredAt": row["occurred_at"]} for row in rows]
        return {"events": events,
                "cursor": events[-1]["id"] if events else f"p:{latest}",
                "resyncRequired": False}
