"""Fixed remote authentication operations, executed on the Python Host loop."""

from __future__ import annotations

import hashlib
from typing import Any
from uuid import UUID

from forge.device_pairing import DevicePairingService
from forge.remote_sessions import RemoteSessionService


class RemoteAuthDispatcher:
    def __init__(self, pairing: DevicePairingService, sessions: RemoteSessionService) -> None:
        self.pairing = pairing
        self.sessions = sessions

    def handle(self, method: str, payload: dict[str, str]) -> dict[str, Any]:
        if method == "claim":
            fingerprint = "browser-hint:" + hashlib.sha256(
                payload["userAgent"].encode("utf-8")).hexdigest()[:16]
            claimed = self.pairing.claim_from_nonce(
                payload["nonce"], device_name=payload["deviceLabel"],
                address_summary=payload["addressSummary"],
                fingerprint_summary=fingerprint,
            )
            issued = self.pairing.inspect_local(UUID(claimed["pairingId"]))
            return {**claimed, "status": "pending", "expiresAt": issued["expiresAt"]}
        if method == "status":
            return self.sessions.pairing_status(payload["claimSecret"])
        if method == "current":
            return self.sessions.bootstrap_csrf(payload["sessionToken"])
        if method == "refresh":
            return self.sessions.refresh(payload["sessionToken"], payload["csrfToken"])
        if method == "revoke":
            self.sessions.revoke(payload["sessionToken"], payload["csrfToken"])
            return {"revoked": True}
        raise ValueError("REMOTE_METHOD_NOT_ALLOWED")
