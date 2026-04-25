"""Host-owned, local-approval device pairing. Remote session delivery is a later gate."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from forge.persistence import ForgePersistence
from forge.remote_policy import RemoteScope

PAIRING_LIFETIME = timedelta(minutes=10)
MAX_CLAIM_ATTEMPTS = 5


class PairingError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PairingIssueInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PairingIdInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    pairingId: UUID


class DeviceIdInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    deviceId: UUID


class PairingDecisionInput(PairingIdInput):
    approve: bool
    projectIds: list[UUID] = Field(max_length=32)
    scopes: list[RemoteScope] = Field(default_factory=list, max_length=6)


def _now() -> datetime:
    return datetime.now(UTC)


def _stamp(value: datetime) -> str:
    return value.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode("ascii")).hexdigest()


def _safe_label(value: str) -> bool:
    return all(char.isprintable() and char not in "\r\n\u2028\u2029" for char in value)


class DevicePairingService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def list_local(self) -> list[dict[str, Any]]:
        """Local management view; valid sessions are not an online presence claim."""
        rows = self.storage.session().execute(
            "SELECT d.device_id,d.name,d.address_summary,d.fingerprint_summary,"
            "d.project_ids_json,d.operation_scopes_json,d.policy_revision,d.status,"
            "d.approved_at,d.revoked_at,"
            "(SELECT COUNT(*) FROM device_sessions s WHERE s.device_id=d.device_id "
            "AND s.revoked_at IS NULL AND s.expires_at>?) AS valid_sessions "
            "FROM paired_devices d ORDER BY d.approved_at DESC,d.device_id LIMIT 100",
            (_stamp(_now()),),
        ).fetchall()
        return [{"deviceId": row["device_id"], "name": row["name"],
                 "addressSummary": row["address_summary"],
                 "fingerprintSummary": row["fingerprint_summary"],
                 "projectIds": json.loads(row["project_ids_json"]),
                 "scopes": json.loads(row["operation_scopes_json"]),
                 "revision": row["policy_revision"], "status": row["status"],
                 "approvedAt": row["approved_at"], "revokedAt": row["revoked_at"],
                 "validSessionCount": row["valid_sessions"]} for row in rows]

    def issue(self) -> dict[str, Any]:
        now = _now()
        pairing_id = str(uuid4())
        nonce = secrets.token_urlsafe(32)  # 256 random bits; never persisted in cleartext.
        expires_at = _stamp(now + PAIRING_LIFETIME)
        with self.storage.transaction() as session:
            session.execute(
                "INSERT INTO pairing_requests(pairing_id,nonce_hash,status,created_at,expires_at) "
                "VALUES(?,?,'pending',?,?)",
                (pairing_id, _hash(nonce), _stamp(now), expires_at),
            )
        return {"pairingId": pairing_id, "nonce": nonce, "expiresAt": expires_at}

    def inspect_local(self, pairing_id: UUID) -> dict[str, Any]:
        row = self.storage.session().execute(
            "SELECT pairing_id,status,device_name,address_summary,fingerprint_summary,"
            "created_at,expires_at,claimed_at,decided_at,granted_project_ids_json "
            "FROM pairing_requests WHERE pairing_id=?", (str(pairing_id),)
        ).fetchone()
        if row is None:
            raise PairingError("PAIRING_NOT_FOUND")
        status = row["status"]
        if status in ("pending", "claimed") and _now() >= datetime.fromisoformat(
            row["expires_at"].replace("Z", "+00:00")
        ):
            with self.storage.transaction() as session:
                session.execute(
                    "UPDATE pairing_requests SET status='expired' "
                    "WHERE pairing_id=? AND status IN ('pending','claimed')",
                    (str(pairing_id),),
                )
            status = "expired"
        scopes: list[str] = []
        if self.storage.schema_version() >= 34 and status == "approved":
            grant = self.storage.session().execute(
                "SELECT operation_scopes_json FROM paired_devices WHERE pairing_id=?",
                (str(pairing_id),),
            ).fetchone()
            if grant is not None:
                scopes = json.loads(grant["operation_scopes_json"])
        return {
            "pairingId": row["pairing_id"],
            "status": status,
            "deviceName": row["device_name"],
            "addressSummary": row["address_summary"],
            "fingerprintSummary": row["fingerprint_summary"],
            "createdAt": row["created_at"],
            "expiresAt": row["expires_at"],
            "claimedAt": row["claimed_at"],
            "decidedAt": row["decided_at"],
            "projectIds": json.loads(row["granted_project_ids_json"])
            if row["granted_project_ids_json"] else [],
            "scopes": scopes,
        }

    def claim(
        self, pairing_id: UUID, nonce: str, *, device_name: str,
        address_summary: str, fingerprint_summary: str,
    ) -> dict[str, str]:
        """Called by a future same-origin gateway after its Origin/rate checks."""
        if not (1 <= len(device_name) <= 80
                and 1 <= len(address_summary) <= 120
                and 8 <= len(fingerprint_summary) <= 120
                and 40 <= len(nonce) <= 128
                and re.fullmatch(r"[A-Za-z0-9_-]+", nonce) is not None
                and all(_safe_label(value) for value in (
                    device_name, address_summary, fingerprint_summary,
                ))):
            raise PairingError("PAIRING_INVALID_CLAIM")
        now = _now()
        with self.storage.transaction() as session:
            row = session.execute(
                "SELECT nonce_hash,status,attempt_count,expires_at FROM pairing_requests "
                "WHERE pairing_id=?", (str(pairing_id),),
            ).fetchone()
            if row is None or row["status"] != "pending":
                raise PairingError("PAIRING_REJECTED")
            if now >= datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")):
                raise PairingError("PAIRING_EXPIRED")
            valid = hmac.compare_digest(row["nonce_hash"], _hash(nonce))
            if not valid:
                attempts = int(row["attempt_count"]) + 1
                session.execute(
                    "UPDATE pairing_requests SET attempt_count=?,status=? WHERE pairing_id=?",
                    (attempts, "rejected" if attempts >= MAX_CLAIM_ATTEMPTS else "pending",
                     str(pairing_id)),
                )
            else:
                claim_secret = secrets.token_urlsafe(32)
                session.execute(
                    "UPDATE pairing_requests SET status='claimed',claim_secret_hash=?,"
                    "device_name=?,address_summary=?,fingerprint_summary=?,"
                    "claimed_at=?,consumed_at=? WHERE pairing_id=? AND status='pending'",
                    (_hash(claim_secret), device_name, address_summary,
                     fingerprint_summary, _stamp(now), _stamp(now), str(pairing_id)),
                )
        if not valid:
            raise PairingError("PAIRING_REJECTED")
        return {"pairingId": str(pairing_id), "claimSecret": claim_secret}

    def claim_from_nonce(
        self, nonce: str, *, device_name: str, address_summary: str,
        fingerprint_summary: str,
    ) -> dict[str, str]:
        """OpenAPI claim shape has no pairing ID; the gateway must rate-limit sources."""
        if not (40 <= len(nonce) <= 128 and re.fullmatch(r"[A-Za-z0-9_-]+", nonce)):
            raise PairingError("PAIRING_REJECTED")
        row = self.storage.session().execute(
            "SELECT pairing_id FROM pairing_requests WHERE nonce_hash=?", (_hash(nonce),)
        ).fetchone()
        if row is None:
            raise PairingError("PAIRING_REJECTED")
        return self.claim(
            UUID(row["pairing_id"]), nonce, device_name=device_name,
            address_summary=address_summary, fingerprint_summary=fingerprint_summary,
        )

    def decide(self, decision: PairingDecisionInput) -> dict[str, Any]:
        now = _now()
        project_ids = [str(project_id) for project_id in decision.projectIds]
        scopes = list(decision.scopes)
        if (len(project_ids) != len(set(project_ids))
                or len(scopes) != len(set(scopes))):
            raise PairingError("PAIRING_INVALID_SCOPE")
        if decision.approve and not project_ids:
            raise PairingError("PAIRING_INVALID_SCOPE")
        if not decision.approve and (project_ids or scopes):
            raise PairingError("PAIRING_INVALID_SCOPE")
        if scopes and self.storage.schema_version() < 34:
            raise PairingError("PAIRING_SCOPE_UNSUPPORTED")
        with self.storage.transaction() as session:
            row = session.execute(
                "SELECT status,expires_at,device_name,address_summary,fingerprint_summary "
                "FROM pairing_requests WHERE pairing_id=?", (str(decision.pairingId),),
            ).fetchone()
            if row is None or row["status"] != "claimed":
                raise PairingError("PAIRING_NOT_CLAIMED")
            if now >= datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")):
                raise PairingError("PAIRING_EXPIRED")
            if decision.approve:
                for project_id in project_ids:
                    project = session.execute(
                        "SELECT project_id FROM projects "
                        "WHERE project_id=? AND archived_at IS NULL",
                        (project_id,),
                    ).fetchone()
                    if project is None:
                        raise PairingError("PAIRING_INVALID_SCOPE")
                device_id = str(uuid4())
                if self.storage.schema_version() >= 34:
                    session.execute(
                        "INSERT INTO paired_devices(device_id,pairing_id,name,address_summary,"
                        "fingerprint_summary,project_ids_json,operation_scopes_json,"
                        "status,approved_at) VALUES(?,?,?,?,?,?,?,'approved',?)",
                        (device_id, str(decision.pairingId), row["device_name"],
                         row["address_summary"], row["fingerprint_summary"],
                         json.dumps(project_ids), json.dumps(scopes), _stamp(now)),
                    )
                else:
                    session.execute(
                        "INSERT INTO paired_devices(device_id,pairing_id,name,address_summary,"
                        "fingerprint_summary,project_ids_json,status,approved_at) "
                        "VALUES(?,?,?,?,?,?,'approved',?)",
                        (device_id, str(decision.pairingId), row["device_name"],
                         row["address_summary"], row["fingerprint_summary"],
                         json.dumps(project_ids), _stamp(now)),
                    )
                status = "approved"
            else:
                device_id = None
                status = "rejected"
            session.execute(
                "UPDATE pairing_requests SET status=?,decided_at=?,granted_project_ids_json=? "
                "WHERE pairing_id=? AND status='claimed'",
                (status, _stamp(now), json.dumps(project_ids), str(decision.pairingId)),
            )
        return {"pairingId": str(decision.pairingId), "status": status,
                "deviceId": device_id, "projectIds": project_ids, "scopes": scopes}
