"""Real profile revision durability and strict provider capability selection."""

import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from forge.agent_profiles import (
    AgentProfile,
    AgentProfileError,
    AgentProfileService,
    ProfileSave,
    availability,
)
from forge.approvals import canonical_json
from forge.executor_contracts import ExecutorCapabilities
from forge.persistence import ForgePersistence
from forge.protocol import encode_frame


def profile(*, role: str = "developer", policy: str = "workspace-write",
            revision: int = 1, model: str = "known-model") -> AgentProfile:
    return AgentProfile.model_validate({
        "schemaVersion": "1.0", "id": "profile.test", "revision": revision,
        "name": "Test role", "role": role, "executorId": "executor.codex",
        "modelId": model, "promptTemplate": "Work only in the isolated workspace.",
        "contextProviders": ["task-contract"], "policyProfile": policy,
        "limits": {"maxTurns": 8, "maxSeconds": 120, "maxOutputTokens": 4000},
    })


def capabilities(**changes: object) -> ExecutorCapabilities:
    values: dict[str, object] = {
        "executorId": "executor.codex", "adapterVersion": "1", "upstreamVersion": "1",
        "platform": "darwin-arm64", "available": True, "streaming": True,
        "resume": True, "interrupt": True, "approval": True,
        "structuredEvents": True, "structuredOutput": True,
        "workspaceControl": True, "toolEvents": True,
        "sessionPersistence": True, "modelSelection": True,
        "usageReporting": True, "readOnlyEnforced": True,
        "networkPolicyEnforced": False, "enforcement": "native-sandbox",
        "modelIds": ["known-model"], "authModes": ["chatgpt-session"], "warnings": [],
    }
    return ExecutorCapabilities.model_validate({**values, **changes})


def test_profile_schema_revision_and_restart(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(24)
    db.set_metadata("pre-profile", "preserved")
    assert db.migrate(25) == 25
    service = AgentProfileService(db)
    first = profile()
    assert service.save(ProfileSave(profile=first, expectedRevision=0)) == first
    with pytest.raises(AgentProfileError, match="PROFILE_STALE"):
        service.save(ProfileSave(profile=first, expectedRevision=0))
    second = first.model_copy(update={"revision": 2, "name": "New responsibility"})
    assert service.save(ProfileSave(profile=second, expectedRevision=1)) == second
    assert service.get(first.id, 1) == first
    assert service.list() == [second]
    frozen_hash = hashlib.sha256(canonical_json(first.model_dump(mode="json")).encode()).hexdigest()
    assert service.get_locked(first.id, "1", frozen_hash, first.executorId) == first
    assert service.get_locked(first.id, "1", "0" * 64, first.executorId) is None
    assert service.get_locked(first.id, "1", frozen_hash, "executor.claude") is None
    assert service.get_locked(first.id, "invalid", frozen_hash, first.executorId) is None
    db.close()
    reopened = ForgePersistence(tmp_path)
    reopened.open()
    assert reopened.migrate(25) == 25
    assert reopened.get_metadata("pre-profile") == "preserved"
    assert AgentProfileService(reopened).get(first.id) == second
    assert AgentProfileService(reopened).get_locked(
        first.id, "1", frozen_hash, first.executorId,
    ) == first
    reopened.close()


def test_planner_role_survives_revision_and_restart_without_changing_frozen_version(
        tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(25)
    service = AgentProfileService(db)
    first = profile(role="planner", policy="read-only")
    service.save(ProfileSave(profile=first, expectedRevision=0))
    frozen_hash = hashlib.sha256(canonical_json(first.model_dump(mode="json")).encode()).hexdigest()
    second = first.model_copy(update={"revision": 2, "name": "Revised Planner"})
    service.save(ProfileSave(profile=second, expectedRevision=1))
    assert service.get_locked(first.id, "1", frozen_hash, first.executorId) == first
    db.close()

    reopened = ForgePersistence(tmp_path)
    reopened.open()
    reopened.migrate(25)
    current = AgentProfileService(reopened).get(first.id)
    assert current == second
    assert current is not None and current.role == "planner"
    assert AgentProfileService(reopened).get_locked(
        first.id, "1", frozen_hash, first.executorId,
    ) == first
    reopened.close()


def test_profile_revision_cannot_silently_change_role(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(25)
    service = AgentProfileService(db)
    planner = profile(role="planner", policy="read-only")
    service.save(ProfileSave(profile=planner, expectedRevision=0))
    rewritten = planner.model_copy(update={
        "revision": 2, "role": "developer", "policyProfile": "workspace-write",
    })
    with pytest.raises(AgentProfileError, match="PROFILE_ROLE_MISMATCH"):
        service.save(ProfileSave(profile=rewritten, expectedRevision=1))
    assert service.list() == [planner]
    with pytest.raises(ValidationError):
        AgentProfile.model_validate({**planner.model_dump(), "role": "unknown-role"})
    db.close()


def test_planner_cannot_be_saved_with_developer_write_policy(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(25)
    with pytest.raises(AgentProfileError, match="PROFILE_POLICY_UNSUPPORTED"):
        AgentProfileService(db).save(ProfileSave(
            profile=profile(role="planner", policy="workspace-write"),
            expectedRevision=0,
        ))
    assert AgentProfileService(db).list() == []
    db.close()


def test_planner_project_context_requires_explicit_profile_version(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(25)
    service = AgentProfileService(db)
    original = profile(role="planner", policy="read-only")
    service.save(ProfileSave(profile=original, expectedRevision=0))
    with_context = original.model_copy(update={
        "revision": 2, "contextProviders": ["task-contract", "project-context"],
    })
    service.save(ProfileSave(profile=with_context, expectedRevision=1))
    assert service.get(original.id, 1) == original
    assert service.get(original.id, 2) == with_context
    with pytest.raises(AgentProfileError, match="PROFILE_CONTEXT_UNSUPPORTED"):
        service.save(ProfileSave(profile=with_context.model_copy(update={
            "revision": 3, "contextProviders": ["task-contract", "arbitrary-source"],
        }), expectedRevision=2))
    db.close()


def test_profile_capability_gate_fails_closed() -> None:
    assert availability(profile(), capabilities()).runnable
    assert availability(profile(), None).reason == "EXECUTOR_UNAVAILABLE"
    assert availability(profile(), capabilities(available=False)).reason == "EXECUTOR_UNAVAILABLE"
    assert availability(profile(), capabilities(modelIds=[])).reason == "MODEL_UNAVAILABLE"
    assert (availability(profile(), capabilities(executorId="executor.claude")).reason
            == "EXECUTOR_MISMATCH")
    reviewer = profile(role="reviewer", policy="read-only")
    assert (availability(reviewer, capabilities(readOnlyEnforced=False)).reason
            == "READ_ONLY_UNENFORCED")
    assert (availability(reviewer, capabilities(structuredOutput=False)).reason
            == "STRUCTURED_OUTPUT_UNSUPPORTED")
    assert (availability(profile(policy="approval-required"), capabilities(approval=False)).reason
            == "APPROVAL_UNSUPPORTED")
    locked = reviewer.model_copy(update={"policyProfile": "read-only-no-network"})
    assert availability(locked, capabilities()).reason == "NETWORK_POLICY_UNENFORCED"
    with pytest.raises(ValidationError):
        profile().model_validate({**profile().model_dump(), "arbitraryTool": True})


def test_profile_save_rejects_unsafe_role_policy(tmp_path: Path) -> None:
    db = ForgePersistence(tmp_path)
    db.open()
    db.migrate(25)
    service = AgentProfileService(db)
    with pytest.raises(AgentProfileError, match="PROFILE_POLICY_UNSUPPORTED"):
        service.save(ProfileSave(profile=profile(role="reviewer"), expectedRevision=0))
    assert service.list() == []
    db.close()


@pytest.mark.asyncio
async def test_independent_host_profile_save_and_catalog(tmp_path: Path) -> None:
    process = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path),
             "FORGE_HOST_OWNERSHIP_TOKEN": "profile-fixture"},
    )
    assert process.stdin and process.stdout

    async def call(method: str, params: dict[str, object]) -> dict[str, object]:
        process.stdin.write(encode_frame({
            "jsonrpc": "2.0", "id": method, "method": method, "params": params,
            "transportVersion": "forge-local-jsonrpc/v1",
        }))
        await process.stdin.drain()
        return json.loads(await asyncio.wait_for(process.stdout.readline(), 30))

    try:
        hello = await call("system.handshake", {
            "productVersion": "0.0.1", "hostVersion": "0.0.1",
            "protocolVersion": "forge-host-protocol/v5",
            "ownershipToken": "profile-fixture",
        })
        assert "result" in hello
        saved = await call("agent.profileSave", {
            "profile": profile().model_dump(mode="json"), "expectedRevision": 0,
        })
        assert saved["result"]["data"]["revision"] == 1  # type: ignore[index]
        planner = profile(role="planner", policy="read-only").model_copy(
            update={"id": "profile.test.planner"}
        )
        planner_saved = await call("agent.profileSave", {
            "profile": planner.model_dump(mode="json"), "expectedRevision": 0,
        })
        assert planner_saved["result"]["data"]["role"] == "planner"  # type: ignore[index]
        rewritten = planner.model_copy(update={
            "revision": 2, "role": "developer", "policyProfile": "workspace-write",
        })
        rejected = await call("agent.profileSave", {
            "profile": rewritten.model_dump(mode="json"), "expectedRevision": 1,
        })
        assert rejected["error"]["code"] == "PROFILE_ROLE_MISMATCH"  # type: ignore[index]
        invalid = await call("agent.profileSave", {
            "profile": {**profile(revision=2).model_dump(mode="json"), "unknown": "x"},
            "expectedRevision": 1,
        })
        assert invalid["error"]["code"] == "INVALID_REQUEST"  # type: ignore[index]
        catalog = await call("agent.profileCatalog", {})
        result = catalog["result"]["data"]  # type: ignore[index]
        assert {item["id"]: item["role"] for item in result["profiles"]} == {
            "profile.test": "developer", "profile.test.planner": "planner",
        }
        assert any(executor["executorId"] == "executor.claude" and
                   not executor["available"] for executor in result["executors"])
        await call("system.shutdown", {})
        assert await asyncio.wait_for(process.wait(), 20) == 0
    finally:
        if process.returncode is None:
            process.kill()
            await process.wait()

    restored = ForgePersistence(tmp_path)
    restored.open()
    assert AgentProfileService(restored).get("profile.test") == profile()
    assert AgentProfileService(restored).get("profile.test.planner") == planner
    restored.close()

    restarted = await asyncio.create_subprocess_exec(
        sys.executable, "-m", "forge.host", stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
        env={**os.environ, "FORGE_HOST_DATA_DIR": str(tmp_path),
             "FORGE_HOST_OWNERSHIP_TOKEN": "profile-restart-fixture"},
    )
    assert restarted.stdin and restarted.stdout
    try:
        for method, params in [
            ("system.handshake", {"productVersion": "0.0.1", "hostVersion": "0.0.1",
                                  "protocolVersion": "forge-host-protocol/v5",
                                  "ownershipToken": "profile-restart-fixture"}),
            ("agent.profileCatalog", {}),
        ]:
            restarted.stdin.write(encode_frame({
                "jsonrpc": "2.0", "id": method, "method": method, "params": params,
                "transportVersion": "forge-local-jsonrpc/v1",
            }))
            await restarted.stdin.drain()
            response = json.loads(await asyncio.wait_for(restarted.stdout.readline(), 30))
            assert "result" in response
            if method == "agent.profileCatalog":
                assert {item["id"]: item["role"] for item in response["result"]["data"][
                    "profiles"]} == {"profile.test": "developer", "profile.test.planner": "planner"}
        restarted.stdin.write(encode_frame({
            "jsonrpc": "2.0", "id": "stop", "method": "system.shutdown", "params": {},
            "transportVersion": "forge-local-jsonrpc/v1",
        }))
        await restarted.stdin.drain()
        assert await asyncio.wait_for(restarted.wait(), 20) == 0
    finally:
        if restarted.returncode is None:
            restarted.kill()
            await restarted.wait()
