"""Seed one real Host-service device in an isolated smoke-test data directory."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import UUID

from forge.device_pairing import DevicePairingService, PairingDecisionInput
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService
from forge.remote_sessions import RemoteSessionService


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Expected isolated data directory and fixture project path")
    data_dir, project_root = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    if data_dir.exists() or not project_root.is_dir() or data_dir == project_root:
        raise SystemExit("Fixture data directory must not already exist")
    storage = ForgePersistence(data_dir)
    storage.open()
    try:
        storage.migrate(LATEST_SCHEMA)
        projects = ProjectService(storage)
        probe = projects.probe(str(project_root))
        project = projects.create(str(project_root), probe.fingerprint, TRUST_VERSION, True, 0)
        pairing = DevicePairingService(storage)
        issued = pairing.issue()
        claim = pairing.claim_from_nonce(
            issued["nonce"], device_name="Fixture phone",
            address_summary="private-fixture", fingerprint_summary="fixture-reported-key",
        )
        approved = pairing.decide(PairingDecisionInput(
            pairingId=UUID(issued["pairingId"]), approve=True,
            projectIds=[project.projectId], scopes=["task:draft"],
        ))
        # A real valid credential exists. It is not printed or persisted in clear.
        RemoteSessionService(storage).pairing_status(claim["claimSecret"])
        print(json.dumps({"deviceId": approved["deviceId"],
                          "projectId": str(project.projectId)}))
    finally:
        storage.close()


if __name__ == "__main__":
    main()
