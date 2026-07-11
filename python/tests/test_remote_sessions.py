"""Real Host-owned SQLite session, rotation and revocation invariants."""

from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import UUID

import pytest

from forge.device_pairing import DevicePairingService, PairingDecisionInput
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.remote_sessions import RemoteSessionError, RemoteSessionService


def prepared(tmp_path: Path) -> tuple[ForgePersistence, str, str, str]:
    db = ForgePersistence(tmp_path / "data")
    db.open()
    assert db.migrate(LATEST_SCHEMA) == 32
    source = tmp_path / "project"
    source.mkdir()
    project_service = ProjectService(db)
    probe = project_service.probe(str(source))
    project = project_service.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    pairing = DevicePairingService(db)
    issued = pairing.issue()
    claimed = pairing.claim_from_nonce(
        issued["nonce"], device_name="Phone", address_summary="private-network",
        fingerprint_summary="sha256:phone-browser-fixture",
    )
    return db, issued["pairingId"], claimed["claimSecret"], str(project.projectId)


def test_schema31_pairing_survives_additive_session_upgrade(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path / "existing")
    db.open()
    assert db.migrate(31) == 31
    issued = DevicePairingService(db).issue()
    claimed = DevicePairingService(db).claim_from_nonce(
        issued["nonce"], device_name="Phone", address_summary="loopback",
        fingerprint_summary="browser-hint:fixture",
    )
    db.close()
    upgraded = ForgePersistence(tmp_path / "existing")
    upgraded.open()
    assert upgraded.migrate(32) == 32
    assert upgraded.last_backup is not None and upgraded.last_backup.is_file()
    assert DevicePairingService(upgraded).inspect_local(
        UUID(issued["pairingId"]))["status"] == "claimed"
    assert RemoteSessionService(upgraded).pairing_status(
        claimed["claimSecret"])["status"] == "pending"
    assert upgraded.migrate(32) == 32
    upgraded.close()


def test_session_issued_once_after_approval_rotates_and_revoke_is_durable(
    tmp_path: Path,
) -> None:
    db, pairing_id, claim_secret, project_id = prepared(tmp_path)
    sessions = RemoteSessionService(db)
    pending = sessions.pairing_status(claim_secret)
    assert pending["status"] == "pending" and pending["sessionToken"] is None
    pairing = DevicePairingService(db)
    pairing.decide(PairingDecisionInput(
        pairingId=UUID(pairing_id), approve=True, projectIds=[UUID(project_id)]))
    delivered = sessions.pairing_status(claim_secret)
    assert delivered["status"] == "approved"
    token, csrf = delivered["sessionToken"], delivered["csrfToken"]
    assert len(token) >= 40 and len(csrf) >= 40
    assert sessions.authenticate(token)["projectIds"] == [project_id]
    row = db.session().execute(
        "SELECT token_hash,csrf_hash,refresh_expires_at FROM device_sessions",
    ).fetchone()
    assert row is not None
    assert row["token_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert row["csrf_hash"] == hashlib.sha256(csrf.encode()).hexdigest()
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_REJECTED"):
        sessions.pairing_status(claim_secret)
    with pytest.raises(RemoteSessionError, match="REMOTE_CSRF_REJECTED"):
        sessions.require_csrf(token, "A" * 43)
    bootstrapped = sessions.bootstrap_csrf(token)
    assert bootstrapped["csrfToken"] != csrf
    with pytest.raises(RemoteSessionError, match="REMOTE_CSRF_REJECTED"):
        sessions.require_csrf(token, csrf)
    rotated = sessions.refresh(token, bootstrapped["csrfToken"])
    assert rotated["sessionToken"] != token
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_REJECTED"):
        sessions.authenticate(token)
    assert sessions.authenticate(rotated["sessionToken"])["projectIds"] == [project_id]
    sessions.revoke(rotated["sessionToken"], rotated["csrfToken"])
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_REJECTED"):
        sessions.authenticate(rotated["sessionToken"])
    db.close()
    restored = ForgePersistence(tmp_path / "data")
    restored.open()
    assert restored.migrate(LATEST_SCHEMA) == 32
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_REJECTED"):
        RemoteSessionService(restored).authenticate(rotated["sessionToken"])
    restored.close()


def test_expired_session_and_pairing_never_refresh_or_issue(tmp_path: Path) -> None:
    db, pairing_id, secret, project_id = prepared(tmp_path)
    pairing = DevicePairingService(db)
    pairing.decide(PairingDecisionInput(
        pairingId=UUID(pairing_id), approve=True, projectIds=[UUID(project_id)]))
    sessions = RemoteSessionService(db)
    delivered = sessions.pairing_status(secret)
    with db.transaction() as session:
        session.execute(
            "UPDATE device_sessions SET expires_at='2000-01-01T00:00:00.000Z'")
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_EXPIRED"):
        sessions.authenticate(delivered["sessionToken"])
    with pytest.raises(RemoteSessionError, match="REMOTE_AUTH_REJECTED"):
        sessions.pairing_status(secret)
    db.close()
