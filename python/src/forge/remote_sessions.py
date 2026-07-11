"""Host-owned, hashed device sessions for the optional remote adapter."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from forge.persistence import ForgePersistence

SESSION_LIFETIME = timedelta(minutes=15)
REFRESH_LIFETIME = timedelta(hours=24)
SECRET_PATTERN = re.compile(r"[A-Za-z0-9_-]{40,128}")


class RemoteSessionError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _now() -> datetime:
    return datetime.now(UTC)


def _stamp(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("ascii")).hexdigest()


def _valid_secret(value: str) -> bool:
    return SECRET_PATTERN.fullmatch(value) is not None


class RemoteSessionService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def pairing_status(self, claim_secret: str) -> dict[str, Any]:
        """Deliver one cookie credential after local approval, never a second session."""
        if not _valid_secret(claim_secret):
            raise RemoteSessionError("REMOTE_AUTH_REJECTED")
        now = _now()
        with self.storage.transaction() as session:
            row = session.execute(
                "SELECT pairing_id,status,expires_at,session_delivered_at "
                "FROM pairing_requests WHERE claim_secret_hash=?",
                (_hash(claim_secret),),
            ).fetchone()
            if row is None:
                raise RemoteSessionError("REMOTE_AUTH_REJECTED")
            if now >= _time(row["expires_at"]):
                return {"status": "expired", "deviceId": None, "csrfToken": None,
                        "expiresAt": None, "sessionToken": None}
            if row["status"] in ("pending", "claimed"):
                return {"status": "pending", "deviceId": None, "csrfToken": None,
                        "expiresAt": row["expires_at"], "sessionToken": None}
            if row["status"] != "approved" or row["session_delivered_at"] is not None:
                raise RemoteSessionError("REMOTE_AUTH_REJECTED")
            device = session.execute(
                "SELECT device_id,status FROM paired_devices WHERE pairing_id=?",
                (row["pairing_id"],),
            ).fetchone()
            if device is None or device["status"] != "approved":
                raise RemoteSessionError("REMOTE_AUTH_REJECTED")
            token = secrets.token_urlsafe(32)
            csrf = secrets.token_urlsafe(32)
            expiry = _stamp(now + SESSION_LIFETIME)
            session.execute(
                "INSERT INTO device_sessions(session_id,device_id,token_hash,csrf_hash,"
                "issued_at,expires_at,refresh_expires_at) VALUES(?,?,?,?,?,?,?)",
                (str(uuid4()), device["device_id"], _hash(token), _hash(csrf),
                 _stamp(now), expiry, _stamp(now + REFRESH_LIFETIME)),
            )
            session.execute(
                "UPDATE pairing_requests SET session_delivered_at=? "
                "WHERE pairing_id=? AND session_delivered_at IS NULL",
                (_stamp(now), row["pairing_id"]),
            )
            return {"status": "approved", "deviceId": device["device_id"],
                    "csrfToken": csrf, "expiresAt": expiry, "sessionToken": token}

    def authenticate(self, token: str) -> dict[str, Any]:
        if not _valid_secret(token):
            raise RemoteSessionError("REMOTE_AUTH_REJECTED")
        row = self.storage.session().execute(
            "SELECT s.session_id,s.device_id,s.expires_at,s.refresh_expires_at,"
            "s.revoked_at,d.status AS device_status,d.project_ids_json "
            "FROM device_sessions s JOIN paired_devices d ON d.device_id=s.device_id "
            "WHERE s.token_hash=?", (_hash(token),),
        ).fetchone()
        if row is None or row["revoked_at"] is not None or row["device_status"] != "approved":
            raise RemoteSessionError("REMOTE_AUTH_REJECTED")
        if _now() >= _time(row["expires_at"]):
            raise RemoteSessionError("REMOTE_AUTH_EXPIRED")
        return {"sessionId": row["session_id"], "deviceId": row["device_id"],
                "projectIds": json.loads(row["project_ids_json"]),
                "expiresAt": row["expires_at"]}

    def require_csrf(self, token: str, csrf: str) -> dict[str, Any]:
        identity = self.authenticate(token)
        if not _valid_secret(csrf):
            raise RemoteSessionError("REMOTE_CSRF_REJECTED")
        row = self.storage.session().execute(
            "SELECT csrf_hash FROM device_sessions WHERE session_id=?",
            (identity["sessionId"],),
        ).fetchone()
        if row is None or not hmac.compare_digest(row["csrf_hash"], _hash(csrf)):
            raise RemoteSessionError("REMOTE_CSRF_REJECTED")
        return identity

    def bootstrap_csrf(self, token: str) -> dict[str, Any]:
        identity = self.authenticate(token)
        csrf = secrets.token_urlsafe(32)
        with self.storage.transaction() as session:
            changed = session.execute(
                "UPDATE device_sessions SET csrf_hash=? "
                "WHERE session_id=? AND revoked_at IS NULL",
                (_hash(csrf), identity["sessionId"]),
            )
            if changed.rowcount != 1:
                raise RemoteSessionError("REMOTE_AUTH_REJECTED")
        return {**identity, "csrfToken": csrf}

    def refresh(self, token: str, csrf: str) -> dict[str, Any]:
        identity = self.require_csrf(token, csrf)
        now = _now()
        with self.storage.transaction() as session:
            row = session.execute(
                "SELECT refresh_expires_at FROM device_sessions "
                "WHERE session_id=? AND revoked_at IS NULL",
                (identity["sessionId"],),
            ).fetchone()
            if row is None or now >= _time(row["refresh_expires_at"]):
                raise RemoteSessionError("REMOTE_AUTH_EXPIRED")
            device = session.execute(
                "SELECT status FROM paired_devices WHERE device_id=?",
                (identity["deviceId"],),
            ).fetchone()
            if device is None or device["status"] != "approved":
                raise RemoteSessionError("REMOTE_AUTH_REJECTED")
            session.execute(
                "UPDATE device_sessions SET revoked_at=? WHERE session_id=?",
                (_stamp(now), identity["sessionId"]),
            )
            new_token = secrets.token_urlsafe(32)
            new_csrf = secrets.token_urlsafe(32)
            new_expiry = min(now + SESSION_LIFETIME, _time(row["refresh_expires_at"]))
            session.execute(
                "INSERT INTO device_sessions(session_id,device_id,token_hash,csrf_hash,"
                "issued_at,expires_at,refresh_expires_at,rotated_from) "
                "VALUES(?,?,?,?,?,?,?,?)",
                (str(uuid4()), identity["deviceId"], _hash(new_token), _hash(new_csrf),
                 _stamp(now), _stamp(new_expiry), row["refresh_expires_at"],
                 identity["sessionId"]),
            )
        return {"sessionToken": new_token, "csrfToken": new_csrf,
                "expiresAt": _stamp(new_expiry), "deviceId": identity["deviceId"]}

    def revoke(self, token: str, csrf: str) -> None:
        identity = self.require_csrf(token, csrf)
        with self.storage.transaction() as session:
            changed = session.execute(
                "UPDATE device_sessions SET revoked_at=? "
                "WHERE session_id=? AND revoked_at IS NULL",
                (_stamp(_now()), identity["sessionId"]),
            )
            if changed.rowcount != 1:
                raise RemoteSessionError("REMOTE_AUTH_REJECTED")
