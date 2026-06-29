"""P5-02 pure compiler, conditional grammar and installed-capability preflight."""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.agent_profiles import AgentProfile
from forge.executor_contracts import ExecutorCapabilities
from forge.host import HostRuntime
from forge.protocol import ProtocolError, RpcRequest
from forge.workflow_compiler import (
    WorkflowCatalog,
    compile_workflow,
    evaluate_condition,
    parse_condition,
)
from forge.workflow_templates import WorkflowTemplateError, load_template


def profile(role: str, policy: str) -> AgentProfile:
    return AgentProfile.model_validate({
        "schemaVersion": "1.0", "id": f"profile.{role}", "revision": 1,
        "name": role, "role": role, "executorId": "fixture.codex",
        "modelId": "fixture-model", "promptTemplate": "Fixture only",
        "contextProviders": [], "policyProfile": policy,
        "limits": {"maxTurns": 10, "maxSeconds": 100, "maxOutputTokens": 1000},
    })


def capabilities(**changes: object) -> ExecutorCapabilities:
    values: dict[str, object] = {
        "executorId": "fixture.codex", "adapterVersion": "1.0.0",
        "upstreamVersion": "fixture", "platform": "test", "available": True,
        "streaming": True, "resume": False, "interrupt": True, "approval": True,
        "structuredEvents": True, "structuredOutput": True,
        "workspaceControl": True, "toolEvents": False,
        "sessionPersistence": False, "modelSelection": True,
        "usageReporting": False, "readOnlyEnforced": True,
        "networkPolicyEnforced": False, "enforcement": "native-sandbox",
        "modelIds": ["fixture-model"], "authModes": [], "warnings": ["fixture only"],
    }
    return ExecutorCapabilities.model_validate({**values, **changes})


def catalog(*, verifier: bool = True, read_only: bool = True) -> WorkflowCatalog:
    return WorkflowCatalog(
        profiles={"profile.developer": profile("developer", "workspace-write"),
                  "profile.reviewer": profile("reviewer", "read-only")},
        executors={"fixture.codex": capabilities(readOnlyEnforced=read_only)},
        verifiers=frozenset(("verifier.project-checks",)) if verifier else frozenset(),
    )


def codes(report: object) -> set[str]:
    return {issue.code for issue in report.issues}


def test_all_presets_compile_structurally_but_only_installed_bindings_can_launch() -> None:
    for name in ("standard", "quick", "strict"):
        result = compile_workflow(load_template(name))
        assert result.issues == [] and not result.launchable
        assert len(result.orderedNodeIds) == len(load_template(name).nodes)
        assert len(result.contentHash) == 64
    ready = compile_workflow(load_template("quick"), catalog=catalog())
    assert ready.launchable and ready.issues == []
    missing_planner = compile_workflow(load_template("standard"), catalog=catalog())
    assert not missing_planner.launchable
    assert "WORKFLOW_PROFILE_UNAVAILABLE" in codes(missing_planner)


def test_missing_verifier_and_read_only_capability_fail_before_any_execution() -> None:
    template = load_template("quick")
    no_verifier = compile_workflow(template, catalog=catalog(verifier=False))
    no_read_only = compile_workflow(template, catalog=catalog(read_only=False))
    assert "WORKFLOW_VERIFIER_UNAVAILABLE" in codes(no_verifier)
    assert "READ_ONLY_UNENFORCED" in codes(no_read_only)
    assert not no_verifier.launchable and not no_read_only.launchable
    # The compiler takes data snapshots only. Neither fixture has a start/run method.
    assert not hasattr(catalog(), "start")


def test_rejects_cycle_unbound_input_unknown_output_and_excess_budget() -> None:
    base = load_template("quick")
    cycle = base.model_copy(update={"edges": [*base.edges, base.edges[0].model_copy(
        update={"source": "accept", "event": "approved", "target": "develop"})]})
    assert "WORKFLOW_NORMAL_CYCLE" in codes(compile_workflow(cycle))
    no_plan = base.model_copy(update={"nodes": [node.model_copy(update={
        "inputs": [*node.inputs, "plan"],
    }) if node.id == "develop" else node for node in base.nodes]})
    assert "WORKFLOW_INPUT_UNBOUND" in codes(compile_workflow(no_plan))
    bad_output = base.model_copy(update={"nodes": [node.model_copy(update={
        "outputSchema": "untrusted-result",
    }) if node.id == "verify" else node for node in base.nodes]})
    assert "WORKFLOW_OUTPUT_UNKNOWN" in codes(compile_workflow(bad_output))
    unbounded = base.model_copy(update={"maxTotalAttempts": 1000})
    assert "WORKFLOW_BUDGET_INVALID" in codes(compile_workflow(unbounded))


def test_conditions_use_a_closed_grammar_without_eval() -> None:
    assert parse_condition("when:task.type==feature") == ("task.type", "feature")
    assert evaluate_condition("when:task.type==feature", {"task.type": "feature"})
    assert not evaluate_condition("when:task.type==feature", {"task.type": "bug"})
    for malicious in ("when:__import__('os')==feature", "when:task.type==feature;rm",
                      "when:task.type==unknown", "task.type == feature"):
        assert parse_condition(malicious) is None
        with pytest.raises(WorkflowTemplateError, match="WORKFLOW_CONDITION_INVALID"):
            evaluate_condition(malicious, {"task.type": "feature"})

    base = load_template("quick")
    condition = base.nodes[0].model_copy(update={
        "id": "choose", "kind": "condition", "binding": "condition.v1",
        "readOnly": True, "inputs": ["task"], "requiredCapabilities": [],
    })
    first = base.edges[0].model_copy(update={"target": "choose"})
    predicate = base.edges[0].model_copy(update={
        "source": "choose", "event": "when:task.type==feature", "target": "review",
    })
    otherwise = predicate.model_copy(update={"event": "else"})
    branching = base.model_copy(update={
        "nodes": [base.nodes[0], condition, *base.nodes[1:]],
        "edges": [first, predicate, otherwise, *base.edges[1:]],
    })
    assert compile_workflow(branching).issues == []
    injected = branching.model_copy(update={
        "edges": [first, predicate.model_copy(update={
            "event": "when:__import__('os')==feature",
        }), otherwise, *base.edges[1:]],
    })
    assert "WORKFLOW_CONDITION_INVALID" in codes(compile_workflow(injected))


def test_hash_tracks_semantic_version_without_mutating_old_template() -> None:
    original = load_template("quick")
    upgraded = original.model_copy(update={"revision": 2, "name": "Quick v2"})
    first = compile_workflow(original)
    second = compile_workflow(upgraded)
    assert first.contentHash != second.contentHash
    assert first.revision == 1 and second.revision == 2
    assert load_template("quick").revision == 1


@pytest.mark.asyncio
async def test_real_host_preflight_rejects_missing_runtime_bindings_and_extra_payload(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FORGE_HOST_DATA_DIR", str(tmp_path))
    host = HostRuntime()
    try:
        assert host.storage_health()["status"] == "ready"
        host.verifier_ready = True
        request = RpcRequest(jsonrpc="2.0", id="compile", method="workflow.compilePreset",
                             params={"templateId": "standard"},
                             transportVersion="forge-local-jsonrpc/v1")
        result = await host.dispatch_async(request)
        assert result["data"]["workflowId"] == "standard"
        assert result["data"]["launchable"] is False
        assert any(issue["code"] == "WORKFLOW_PROFILE_UNAVAILABLE"
                   for issue in result["data"]["issues"])
        forged = request.model_copy(update={"params": {
            "templateId": "standard", "autoApprove": True,
        }})
        with pytest.raises(ProtocolError, match="Invalid Workflow preset"):
            await host.dispatch_async(forged)
        assert host.development is None
    finally:
        await host.shutdown()
