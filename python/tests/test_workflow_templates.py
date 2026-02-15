"""P5-01 bundled standard, quick and strict static template admission."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from forge.workflow_templates import (
    WorkflowTemplate,
    WorkflowTemplateError,
    list_templates,
    load_template,
    validate_template,
)


def test_three_presets_have_one_schema_and_human_final_gate() -> None:
    templates = list_templates()
    schema_path = Path(__file__).parents[2] / "forge_spec_v1.0/contracts/workflow.schema.json"
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    for template in templates:
        validator.validate(template.model_dump(mode="json", by_alias=True))
    assert [value.id for value in templates] == ["standard", "quick", "strict"]
    assert all(value.schemaVersion == "1.0" and value.revision == 1 for value in templates)
    assert all(value.finalAcceptance == "human" and value.onUnmatched == "escalate"
               for value in templates)
    assert all(value.nodes[-1].id == "accept" and value.nodes[-1].binding == "human.owner"
               for value in templates)
    assert [node.id for node in templates[0].nodes] == [
        "plan", "develop", "review", "verify", "accept",
    ]
    assert [node.id for node in templates[1].nodes] == [
        "develop", "review", "verify", "accept",
    ]
    assert [node.id for node in templates[2].nodes] == [
        "plan", "approve_plan", "develop", "review", "verify", "accept",
    ]
    assert "plan" not in next(node for node in templates[1].nodes
                              if node.id == "develop").inputs
    assert next(node for node in templates[2].nodes
                if node.id == "approve_plan").kind == "approval"
    assert all(value.maxTotalAttempts > max(route.maxCycles for route in value.rework)
               for value in templates)


def test_unknown_preset_and_unknown_json_keys_fail_closed() -> None:
    with pytest.raises(WorkflowTemplateError, match="WORKFLOW_PRESET_UNKNOWN"):
        load_template("../../etc/passwd")
    base = load_template("standard").model_dump(mode="json", by_alias=True)
    with pytest.raises(ValidationError):
        WorkflowTemplate.model_validate({**base, "allowAutoApproval": True})
    with pytest.raises(ValidationError):
        WorkflowTemplate.model_validate({**base, "finalAcceptance": "agent"})


def test_static_admission_rejects_normal_cycle_missing_binding_and_unsafe_terminal() -> None:
    base = load_template("standard")
    cycle = base.model_copy(update={
        "edges": [*base.edges, base.edges[0].model_copy(update={
            "source": "accept", "event": "again", "target": "plan",
        })],
    })
    with pytest.raises(WorkflowTemplateError, match="WORKFLOW_NORMAL_CYCLE"):
        validate_template(cycle)
    missing = base.model_copy(update={"nodes": [node.model_copy(update={
        "binding": "profile.missing",
    }) if node.id == "review" else node for node in base.nodes]})
    with pytest.raises(WorkflowTemplateError, match="WORKFLOW_BINDING_UNKNOWN"):
        validate_template(missing)
    unsafe = base.model_copy(update={"nodes": [node.model_copy(update={
        "kind": "agent",
    }) if node.id == "accept" else node for node in base.nodes]})
    with pytest.raises(WorkflowTemplateError, match="WORKFLOW_FINAL_ACCEPTANCE_REQUIRED"):
        validate_template(unsafe)


def test_static_admission_requires_bounded_rework_and_reachable_nodes() -> None:
    base = load_template("quick")
    infinite = base.model_copy(update={"rework": [base.rework[0].model_copy(update={
        "maxCycles": base.maxTotalAttempts,
    }), *base.rework[1:]]})
    with pytest.raises(WorkflowTemplateError, match="WORKFLOW_REWORK_INVALID"):
        validate_template(infinite)
    isolated = base.model_copy(update={"edges": base.edges[1:]})
    with pytest.raises(WorkflowTemplateError, match="WORKFLOW_NODE_UNREACHABLE"):
        validate_template(isolated)
