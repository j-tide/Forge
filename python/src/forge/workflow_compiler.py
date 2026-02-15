"""Pure workflow compiler; no eval, plugin import, filesystem write or Run start."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from forge.agent_profiles import AgentProfile, availability
from forge.executor_contracts import ExecutorCapabilities
from forge.workflow_templates import (
    WorkflowNode,
    WorkflowTemplate,
    WorkflowTemplateError,
    validate_template,
)

_SCHEMAS = frozenset(("plan-result", "step-result", "approval-decision"))
_INPUTS = frozenset(("task", "repo", "plan", "issues", "snapshot", "diff", "evidence"))
_BOOL_CAPS = frozenset((
    "streaming", "resume", "interrupt", "approval", "structuredEvents",
    "structuredOutput", "workspaceControl", "toolEvents", "sessionPersistence",
    "modelSelection", "usageReporting", "readOnlyEnforced", "networkPolicyEnforced",
))
_CONDITION = re.compile(r"^when:(task\.type|review\.status|verify\.status)==([a-z_]+)$")
_CONDITION_VALUES = {
    "task.type": frozenset(("feature", "bug", "refactor", "spike", "docs")),
    "review.status": frozenset(("approved", "changes_requested", "inconclusive")),
    "verify.status": frozenset(("passed", "failed", "timeout", "not_configured")),
}


class WorkflowCompileIssue(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    code: str
    path: str
    message: str


class WorkflowCompileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    templateId: Literal["standard", "quick", "strict"]


class CompiledWorkflow(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    workflowId: str
    revision: int = Field(ge=1)
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    orderedNodeIds: list[str]
    launchable: bool
    issues: list[WorkflowCompileIssue]


@dataclass(frozen=True)
class WorkflowCatalog:
    """Snapshot of installed runtime bindings, not reference-pack declarations."""

    profiles: Mapping[str, AgentProfile]
    executors: Mapping[str, ExecutorCapabilities]
    verifiers: frozenset[str]
    output_schemas: frozenset[str] = _SCHEMAS


def parse_condition(expression: str) -> tuple[str, str] | None:
    match = _CONDITION.fullmatch(expression)
    if match is None or match[2] not in _CONDITION_VALUES[match[1]]:
        return None
    return match[1], match[2]


def evaluate_condition(expression: str, facts: Mapping[str, str]) -> bool:
    parsed = parse_condition(expression)
    if parsed is None:
        raise WorkflowTemplateError("WORKFLOW_CONDITION_INVALID")
    return facts.get(parsed[0]) == parsed[1]


def compile_workflow(
    template: WorkflowTemplate, *, catalog: WorkflowCatalog | None = None,
) -> CompiledWorkflow:
    """Compile definitions, then optionally preflight actual installed capabilities.

    A structure-only result is not launchable. Call with an installed catalog
    immediately before any future workflow start; no caller may turn a plain
    static result into a Run.
    """
    issues: list[WorkflowCompileIssue] = []

    def issue(code: str, path: str, message: str) -> None:
        issues.append(WorkflowCompileIssue(code=code, path=path, message=message))

    try:
        validate_template(template, known_bindings=None)
    except WorkflowTemplateError as error:
        issue(error.code, "workflow", error.code)

    nodes = {node.id: node for node in template.nodes}
    children: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    parents: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    for edge in template.edges:
        if edge.source in nodes and edge.target in nodes:
            children[edge.source].append(edge.target)
            parents[edge.target].append(edge.source)
    ordered: list[str] = []
    remaining = {node_id: len(sources) for node_id, sources in parents.items()}
    ready = [template.start] if template.start in nodes else []
    while ready:
        node_id = ready.pop(0)
        ordered.append(node_id)
        for child in children[node_id]:
            remaining[child] -= 1
            if remaining[child] == 0:
                ready.append(child)
    if len(ordered) != len(nodes):
        issue("WORKFLOW_TOPOLOGY_INVALID", "edges", "Normal graph must be reachable and acyclic")

    dominators: dict[str, set[str]] = {}
    for node_id in ordered:
        if node_id == template.start:
            dominators[node_id] = {node_id}
        else:
            incoming = [dominators[parent] for parent in parents[node_id]
                        if parent in dominators]
            dominators[node_id] = ({node_id} | set.intersection(*incoming)) if incoming else {
                node_id,
            }

    def produces(input_name: str, candidate: WorkflowNode) -> bool:
        if input_name == "plan":
            return candidate.outputSchema == "plan-result"
        if input_name in ("snapshot", "diff"):
            profile = catalog.profiles.get(candidate.binding) if catalog else None
            return candidate.binding == "profile.developer" or (
                profile is not None and profile.role == "developer"
            )
        return input_name == "evidence" and candidate.kind == "verifier"

    if template.maxTotalAttempts > 100:
        issue("WORKFLOW_BUDGET_INVALID", "maxTotalAttempts", "Attempt budget exceeds 100")
    for index, node in enumerate(template.nodes):
        path = f"nodes[{index}]"
        if node.timeoutSeconds > 3600 or node.retryLimit > 5:
            issue("WORKFLOW_BUDGET_INVALID", path, "Node time or retry limit is too high")
        if node.outputSchema not in (catalog.output_schemas if catalog else _SCHEMAS):
            issue("WORKFLOW_OUTPUT_UNKNOWN", f"{path}.outputSchema",
                  f"Unknown output schema {node.outputSchema}")
        bound_profile = catalog.profiles.get(node.binding) if catalog else None
        is_planner = node.binding == "profile.planner" or (
            bound_profile is not None and bound_profile.role == "planner"
        )
        expected_schema = (
            "approval-decision" if node.kind == "approval" else
            "plan-result" if is_planner else
            "step-result"
        )
        if node.outputSchema != expected_schema:
            issue("WORKFLOW_OUTPUT_MISMATCH", f"{path}.outputSchema",
                  "Output schema is incompatible with the node binding")
        if len(set(node.requiredCapabilities)) != len(node.requiredCapabilities) or any(
            capability not in _BOOL_CAPS for capability in node.requiredCapabilities
        ):
            issue("WORKFLOW_CAPABILITY_UNKNOWN", f"{path}.requiredCapabilities",
                  "Unknown or duplicate Executor capability")
        for input_name in node.inputs:
            if input_name not in _INPUTS:
                issue("WORKFLOW_INPUT_UNKNOWN", f"{path}.inputs", f"Unknown input {input_name}")
                continue
            if input_name in ("plan", "snapshot", "diff", "evidence") and not any(
                produces(input_name, nodes[ancestor])
                for ancestor in dominators.get(node.id, set())
                if ancestor != node.id
            ):
                issue("WORKFLOW_INPUT_UNBOUND", f"{path}.inputs",
                      f"Input {input_name} is not produced on every normal path")
        if node.kind == "approval" and node.binding != "human.owner":
            issue("WORKFLOW_APPROVAL_INVALID", f"{path}.binding",
                  "Approval must be bound to human.owner")
        if catalog is None:
            continue
        if node.kind == "agent":
            profile = catalog.profiles.get(node.binding)
            if profile is None:
                issue("WORKFLOW_PROFILE_UNAVAILABLE", f"{path}.binding",
                      f"Agent Profile {node.binding} is not installed")
                continue
            expected_role = {
                "todo": "planner", "development": "developer", "review": "reviewer",
            }.get(node.boardColumn)
            if expected_role is None or profile.role != expected_role:
                issue("WORKFLOW_PROFILE_ROLE_MISMATCH", f"{path}.binding",
                      "Agent Profile role does not match the Workflow stage")
            caps = catalog.executors.get(profile.executorId)
            decision = availability(profile, caps)
            if not decision.runnable:
                issue(decision.reason or "WORKFLOW_EXECUTOR_UNAVAILABLE", f"{path}.binding",
                      f"Agent Profile {node.binding} cannot run")
            if caps is not None:
                if node.readOnly and not caps.readOnlyEnforced:
                    issue("READ_ONLY_UNENFORCED", f"{path}.readOnly",
                          "Executor cannot enforce a read-only node")
                for capability in node.requiredCapabilities:
                    if capability in _BOOL_CAPS and not getattr(caps, capability):
                        issue("WORKFLOW_CAPABILITY_UNAVAILABLE",
                              f"{path}.requiredCapabilities",
                              f"Executor lacks {capability}")
        elif node.kind == "verifier" and node.binding not in catalog.verifiers:
            issue("WORKFLOW_VERIFIER_UNAVAILABLE", f"{path}.binding",
                  f"Verifier {node.binding} is not installed")
        elif node.kind == "command":
            issue("WORKFLOW_COMMAND_UNAVAILABLE", f"{path}.binding",
                  "Command node runtime is not installed")
        elif node.kind == "condition" and node.binding != "condition.v1":
            issue("WORKFLOW_CONDITION_INVALID", f"{path}.binding",
                  "Unknown condition evaluator")
    for index, edge in enumerate(template.edges):
        source = nodes.get(edge.source)
        if source is None:
            continue
        if source.kind == "condition":
            if edge.event != "else" and parse_condition(edge.event) is None:
                issue("WORKFLOW_CONDITION_INVALID", f"edges[{index}].on",
                      "Condition must use a whitelisted field and literal")
        elif edge.event not in {
            "agent": {"ready", "approved"}, "verifier": {"passed"},
            "approval": {"approved"}, "command": {"passed"},
        }.get(source.kind, set()):
            issue("WORKFLOW_ROUTE_INVALID", f"edges[{index}].on",
                  "Route event does not match node kind")
    for index, node in enumerate(template.nodes):
        if node.kind != "condition":
            continue
        events = [edge.event for edge in template.edges if edge.source == node.id]
        if events.count("else") != 1 or len(events) < 2:
            issue("WORKFLOW_CONDITION_INVALID", f"nodes[{index}]",
                  "Condition requires a predicate route and exactly one else route")
    for index, route in enumerate(template.rework):
        source = nodes.get(route.source)
        if source is None or route.event not in {
            "agent": {"needs_changes", "failed"}, "verifier": {"failed"},
            "command": {"failed"},
        }.get(source.kind, set()):
            issue("WORKFLOW_REWORK_INVALID", f"rework[{index}]",
                  "Rework event does not match node kind")
    canonical = json.dumps(template.model_dump(mode="json", by_alias=True),
                           sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    content_hash = hashlib.sha256(canonical.encode()).hexdigest()
    return CompiledWorkflow(
        workflowId=template.id, revision=template.revision,
        contentHash=content_hash, orderedNodeIds=ordered,
        launchable=catalog is not None and not issues, issues=issues,
    )
