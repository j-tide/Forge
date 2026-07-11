"""Real SQLite pairing lifecycle; no fake remote session or enabled HTTP command."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from forge.device_pairing import (
    MAX_CLAIM_ATTEMPTS,
    DevicePairingService,
    PairingDecisionInput,
    PairingError,
)
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.protocol import HOST_PROTOCOL_VERSION, TRANSPORT_VERSION


def service(tmp_path: Path) -> tuple[ForgePersistence, DevicePairingService]:
    db = ForgePersistence(tmp_path / "data")
    db.open()
    assert db.migrate(31) == 31
    return db, DevicePairingService(db)


def test_schema30_additive_pairing_upgrade_keeps_existing_metadata(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path / "existing-data")
    db.open()
    assert db.migrate(30) == 30
    db.set_metadata("before.pairing", "preserved")
    db.close()
    reopened = ForgePersistence(tmp_path / "existing-data")
    reopened.open()
    assert reopened.migrate(31) == 31
    assert reopened.get_metadata("before.pairing") == "preserved"
    assert reopened.last_backup is not None and reopened.last_backup.is_file()
    assert reopened.migrate(31) == 31
    assert reopened.session().execute("PRAGMA foreign_key_check").fetchone() is None
    reopened.close()


def project_id(db: ForgePersistence, tmp_path: Path) -> UUID:
    root = tmp_path / "project"
    root.mkdir()
    projects = ProjectService(db)
    probe = projects.probe(str(root))
    return projects.create(str(root), probe.fingerprint, TRUST_VERSION, True, 0).projectId


def claim(pairing: DevicePairingService, issued: dict[str, str]) -> dict[str, str]:
    return pairing.claim(
        UUID(issued["pairingId"]), issued["nonce"], device_name="Test phone",
        address_summary="local-network", fingerprint_summary="sha256:fixture-device",
    )


def test_once_only_hashed_nonce_local_approval_and_durable_device(tmp_path: Path) -> None:
    db, pairing = service(tmp_path)
    allowed = project_id(db, tmp_path)
    issued = pairing.issue()
    assert len(issued["nonce"]) >= 40
    row = db.session().execute(
        "SELECT nonce_hash,claim_secret_hash,status FROM pairing_requests WHERE pairing_id=?",
        (issued["pairingId"],),
    ).fetchone()
    assert row is not None
    assert row["nonce_hash"] == hashlib.sha256(issued["nonce"].encode()).hexdigest()
    assert row["claim_secret_hash"] is None
    receipt = pairing.claim_from_nonce(
        issued["nonce"], device_name="Test phone",
        address_summary="local-network", fingerprint_summary="sha256:fixture-device")
    assert receipt["claimSecret"] != issued["nonce"]
    with pytest.raises(PairingError, match="PAIRING_REJECTED"):
        claim(pairing, issued)
    with pytest.raises(PairingError, match="PAIRING_REJECTED"):
        pairing.claim_from_nonce(
            issued["nonce"], device_name="Second phone",
            address_summary="local-network", fingerprint_summary="sha256:second-device")
    row = db.session().execute(
        "SELECT nonce_hash,claim_secret_hash,consumed_at FROM pairing_requests WHERE pairing_id=?",
        (issued["pairingId"],),
    ).fetchone()
    assert row is not None and row["consumed_at"] is not None
    assert row["claim_secret_hash"] == hashlib.sha256(receipt["claimSecret"].encode()).hexdigest()
    assert receipt["claimSecret"] not in db.db_path.read_bytes().decode(
        "utf-8", errors="ignore")
    local = pairing.inspect_local(UUID(issued["pairingId"]))
    assert local["status"] == "claimed" and "nonce" not in local
    with pytest.raises(PairingError, match="PAIRING_INVALID_SCOPE"):
        pairing.decide(PairingDecisionInput(
            pairingId=UUID(issued["pairingId"]), approve=True, projectIds=[uuid4()]))
    approved = pairing.decide(PairingDecisionInput(
        pairingId=UUID(issued["pairingId"]), approve=True, projectIds=[allowed]))
    assert approved["status"] == "approved" and approved["projectIds"] == [str(allowed)]
    with pytest.raises(PairingError, match="PAIRING_NOT_CLAIMED"):
        pairing.decide(PairingDecisionInput(
            pairingId=UUID(issued["pairingId"]), approve=True, projectIds=[allowed]))
    db.close()
    restored = ForgePersistence(tmp_path / "data")
    restored.open()
    assert restored.migrate(31) == 31
    assert DevicePairingService(restored).inspect_local(
        UUID(issued["pairingId"]))["status"] == "approved"
    assert restored.session().execute(
        "SELECT status FROM paired_devices WHERE pairing_id=?", (issued["pairingId"],)
    ).fetchone()["status"] == "approved"
    restored.close()


def test_expiry_brute_force_rejection_and_negative_decision(tmp_path: Path) -> None:
    db, pairing = service(tmp_path)
    issued = pairing.issue()
    for _ in range(MAX_CLAIM_ATTEMPTS):
        with pytest.raises(PairingError, match="PAIRING_REJECTED"):
            pairing.claim(UUID(issued["pairingId"]), "A" * 43, device_name="Phone",
                          address_summary="private-network",
                          fingerprint_summary="sha256:fixture")
    with pytest.raises(PairingError, match="PAIRING_REJECTED"):
        claim(pairing, issued)
    assert pairing.inspect_local(UUID(issued["pairingId"]))["status"] == "rejected"
    expired = pairing.issue()
    with db.transaction() as session:
        session.execute(
            "UPDATE pairing_requests SET expires_at='2000-01-01T00:00:00.000Z' "
            "WHERE pairing_id=?", (expired["pairingId"],))
    with pytest.raises(PairingError, match="PAIRING_EXPIRED"):
        claim(pairing, expired)
    assert pairing.inspect_local(UUID(expired["pairingId"]))["status"] == "expired"
    rejected = pairing.issue()
    with pytest.raises(PairingError, match="PAIRING_INVALID_CLAIM"):
        pairing.claim(UUID(rejected["pairingId"]), rejected["nonce"],
                      device_name="Phone\nApprove all", address_summary="private-network",
                      fingerprint_summary="sha256:fixture")
    claim(pairing, rejected)
    decision = pairing.decide(PairingDecisionInput(
        pairingId=UUID(rejected["pairingId"]), approve=False, projectIds=[]))
    assert decision["status"] == "rejected"
    assert db.session().execute(
        "SELECT 1 FROM paired_devices WHERE pairing_id=?", (rejected["pairingId"],)
    ).fetchone() is None
    db.close()


@pytest.mark.asyncio
async def test_real_host_allows_only_local_pairing_methods(tmp_path: Path) -> None:
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path / "host"),
             "FORGE_HOST_OWNERSHIP_TOKEN": "pair-fixture"},
    )
    assert process.stdin and process.stdout

    async def call(method: str, params: dict[str, object]) -> dict[str, object]:
        ident = str(uuid4())
        process.stdin.write(json.dumps({
            "jsonrpc": "2.0", "id": ident, "method": method, "params": params,
            "transportVersion": TRANSPORT_VERSION,
        }).encode() + b"\n")
        await process.stdin.drain()
        result: dict[str, object] = json.loads(
            await asyncio.wait_for(process.stdout.readline(), 5))
        assert result["id"] == ident
        return result

    try:
        hello = await call("system.handshake", {
            "productVersion": "0.0.1", "hostVersion": "0.0.1",
            "protocolVersion": HOST_PROTOCOL_VERSION, "ownershipToken": "pair-fixture",
        })
        assert hello["result"]["status"] == "ready"  # type: ignore[index]
        issued = await call("devices.pair.issue", {})
        data = issued["result"]["data"]  # type: ignore[index]
        assert isinstance(data, dict)
        assert len(data["nonce"]) >= 40
        before_claim = await call("devices.pair.inspect", {"pairingId": data["pairingId"]})
        assert before_claim["result"]["data"]["status"] == "pending"  # type: ignore[index]
        assert "nonce" not in before_claim["result"]["data"]  # type: ignore[index]
        forbidden = await call("devices.pair.claim", {"nonce": data["nonce"]})
        assert forbidden["error"]["code"] == "UNKNOWN_COMMAND"  # type: ignore[index]
        invalid = await call("devices.pair.issue", {"approve": True})
        assert invalid["error"]["code"] == "INVALID_REQUEST"  # type: ignore[index]
        decided = await call("devices.pair.decide", {
            "pairingId": data["pairingId"], "approve": True, "projectIds": [],
        })
        assert decided["error"]["code"] == "PAIRING_INVALID_SCOPE"  # type: ignore[index]
        await call("system.shutdown", {})
        assert await asyncio.wait_for(process.wait(), 5) == 0
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()
