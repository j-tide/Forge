"""Versioned Agent Profile records and fail-closed Executor capability decisions."""

from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from forge.conversations import timestamp
from forge.executor_contracts import ExecutorCapabilities
from forge.persistence import ForgePersistence


class AgentProfileError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class AgentLimits(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    maxTurns: int = Field(ge=1, le=1000)
    maxSeconds: int = Field(ge=1, le=3600)
    maxOutputTokens: int = Field(ge=1, le=100_000)


class AgentProfile(BaseModel):
    """Mirrors the read-only reference agent-profile.schema.json fields."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    revision: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=160)
    role: Literal["refiner", "planner", "developer", "reviewer"]
    executorId: str = Field(min_length=1, max_length=128)
    modelId: str | None = Field(default=None, min_length=1, max_length=128)
    promptTemplate: str = Field(min_length=1, max_length=4096)
    contextProviders: list[str] = Field(max_length=32)
    policyProfile: str = Field(min_length=1, max_length=80)
    limits: AgentLimits


class ProfileSave(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    profile: AgentProfile
    expectedRevision: int = Field(ge=0)


class ProfileAvailability(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    profileId: str
    revision: int
    executorId: str
    modelId: str | None
    runnable: bool
    reason: str | None


_POLICIES: dict[str, tuple[bool, bool, bool]] = {
    # read-only, network restriction, interactive approval
    "workspace-write": (False, False, False),
    "read-only": (True, False, False),
    "read-only-no-network": (True, True, False),
    "approval-required": (False, False, True),
}


def availability(profile: AgentProfile, caps: ExecutorCapabilities | None) -> ProfileAvailability:
    reason: str | None = None
    policy = _POLICIES.get(profile.policyProfile)
    if policy is None:
        reason = "PROFILE_POLICY_UNSUPPORTED"
    elif caps is None or not caps.available or caps.enforcement == "unavailable":
        reason = "EXECUTOR_UNAVAILABLE"
    elif profile.executorId != caps.executorId:
        reason = "EXECUTOR_MISMATCH"
    elif profile.modelId is None or profile.modelId not in caps.modelIds:
        reason = "MODEL_UNAVAILABLE"
    elif policy[0] and not caps.readOnlyEnforced:
        reason = "READ_ONLY_UNENFORCED"
    elif policy[1] and not caps.networkPolicyEnforced:
        reason = "NETWORK_POLICY_UNENFORCED"
    elif policy[2] and not caps.approval:
        reason = "APPROVAL_UNSUPPORTED"
    elif profile.role == "reviewer" and not caps.structuredOutput:
        reason = "STRUCTURED_OUTPUT_UNSUPPORTED"
    elif profile.role == "developer" and not caps.workspaceControl:
        reason = "WORKSPACE_UNSUPPORTED"
    elif profile.role not in ("developer", "reviewer"):
        reason = "ROLE_UNSUPPORTED"
    return ProfileAvailability(
        profileId=profile.id, revision=profile.revision,
        executorId=profile.executorId, modelId=profile.modelId,
        runnable=reason is None, reason=reason,
    )


class AgentProfileService:
    def __init__(self, storage: ForgePersistence) -> None:
        self.storage = storage

    def get(self, profile_id: str, revision: int | None = None) -> AgentProfile | None:
        if revision is None:
            row = self.storage.session().execute(
                "SELECT profile_json,content_hash FROM agent_profiles WHERE profile_id=? "
                "ORDER BY revision DESC LIMIT 1", (profile_id,),
            ).fetchone()
        else:
            row = self.storage.session().execute(
                "SELECT profile_json,content_hash FROM agent_profiles WHERE profile_id=? "
                "AND revision=?", (profile_id, revision),
            ).fetchone()
        if row is None:
            return None
        raw = row["profile_json"]
        if hashlib.sha256(raw.encode()).hexdigest() != row["content_hash"]:
            raise AgentProfileError("PROFILE_CORRUPT")
        return AgentProfile.model_validate_json(raw)

    def list(self) -> list[AgentProfile]:
        rows = self.storage.session().execute(
            "SELECT profile_id,MAX(revision) AS revision FROM agent_profiles "
            "GROUP BY profile_id ORDER BY profile_id"
        ).fetchall()
        result: list[AgentProfile] = []
        for row in rows:
            profile = self.get(row["profile_id"], row["revision"])
            if profile is not None:
                result.append(profile)
        return result

    def save(self, value: ProfileSave) -> AgentProfile:
        profile = value.profile
        if (not profile.id.startswith("profile.") or
                profile.id in ("profile.developer", "profile.reviewer") or
                profile.policyProfile not in _POLICIES or
                profile.revision != value.expectedRevision + 1):
            raise AgentProfileError("PROFILE_INVALID")
        if profile.role == "reviewer" and not profile.policyProfile.startswith("read-only"):
            raise AgentProfileError("PROFILE_POLICY_UNSUPPORTED")
        if profile.role == "developer" and profile.policyProfile.startswith("read-only"):
            raise AgentProfileError("PROFILE_POLICY_UNSUPPORTED")
        if profile.role == "reviewer" and set(profile.contextProviders) != {
            "task-contract", "snapshot-diff"
        }:
            raise AgentProfileError("PROFILE_CONTEXT_UNSUPPORTED")
        if profile.role == "developer" and not set(profile.contextProviders).issubset({
            "task-contract", "project-context"
        }):
            raise AgentProfileError("PROFILE_CONTEXT_UNSUPPORTED")
        if not all(item and len(item) <= 128 for item in profile.contextProviders):
            raise AgentProfileError("PROFILE_INVALID")
        raw = profile.model_dump_json()
        digest = hashlib.sha256(raw.encode()).hexdigest()
        with self.storage.transaction() as db:
            row = db.execute(
                "SELECT MAX(revision) AS revision FROM agent_profiles WHERE profile_id=?",
                (profile.id,),
            ).fetchone()
            current = row["revision"] if row is not None else None
            if (current or 0) != value.expectedRevision:
                raise AgentProfileError("PROFILE_STALE")
            db.execute(
                "INSERT INTO agent_profiles"
                "(profile_id,revision,profile_json,content_hash,created_at) "
                "VALUES(?,?,?,?,?)",
                (profile.id, profile.revision, raw, digest, timestamp()),
            )
        return profile

    def export(self) -> str:
        return json.dumps([profile.model_dump(mode="json") for profile in self.list()])
