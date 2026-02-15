"""Bundled v1 workflow presets; static structure only, no automatic execution."""

from __future__ import annotations

import json
from importlib.resources import files
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class WorkflowTemplateError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class WorkflowNode(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    kind: Literal["agent", "command", "verifier", "approval", "condition"]
    label: str = Field(min_length=1, max_length=160)
    boardColumn: Literal["todo", "development", "review", "verify", "done"]
    binding: str = Field(min_length=1, max_length=128)
    requiredCapabilities: list[str] = Field(max_length=32)
    inputs: list[str] = Field(max_length=32)
    outputSchema: str = Field(min_length=1, max_length=128)
    timeoutSeconds: int = Field(ge=1)
    retryLimit: int = Field(ge=0)
    readOnly: bool


class WorkflowEdge(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    source: str = Field(alias="from", min_length=1, max_length=128)
    event: str = Field(alias="on", min_length=1, max_length=128)
    target: str = Field(alias="to", min_length=1, max_length=128)


class WorkflowRework(WorkflowEdge):
    maxCycles: int = Field(ge=1)
    invalidateDescendants: Literal[True]


class WorkflowTemplate(BaseModel):
    """Matches the reference workflow.schema.json fields without runtime spec reads."""

    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
    revision: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=160)
    start: str = Field(min_length=1, max_length=128)
    nodes: list[WorkflowNode] = Field(min_length=1, max_length=64)
    edges: list[WorkflowEdge] = Field(max_length=128)
    rework: list[WorkflowRework] = Field(max_length=64)
    maxTotalAttempts: int = Field(ge=1)
    onUnmatched: Literal["escalate"]
    finalAcceptance: Literal["human"]


_PRESETS = ("standard", "quick", "strict")
_BINDINGS = frozenset((
    "profile.planner", "profile.developer", "profile.reviewer",
    "verifier.project-checks", "human.owner",
))


def validate_template(
    value: WorkflowTemplate, *, known_bindings: frozenset[str] | None = _BINDINGS,
) -> WorkflowTemplate:
    """Minimal preset admission; P5-02 owns full compiler and capability resolution."""
    nodes = {node.id: node for node in value.nodes}
    if len(nodes) != len(value.nodes) or value.start not in nodes:
        raise WorkflowTemplateError("WORKFLOW_NODE_INVALID")
    if known_bindings is not None and any(
        node.binding not in known_bindings for node in value.nodes
    ):
        raise WorkflowTemplateError("WORKFLOW_BINDING_UNKNOWN")
    if value.maxTotalAttempts < len(nodes):
        raise WorkflowTemplateError("WORKFLOW_BUDGET_INVALID")
    graph: dict[str, list[str]] = {node_id: [] for node_id in nodes}
    routes: set[tuple[str, str]] = set()
    for edge in value.edges:
        if edge.source not in nodes or edge.target not in nodes:
            raise WorkflowTemplateError("WORKFLOW_EDGE_INVALID")
        route_key = (edge.source, edge.event)
        if route_key in routes:
            raise WorkflowTemplateError("WORKFLOW_ROUTE_AMBIGUOUS")
        routes.add(route_key)
        graph[edge.source].append(edge.target)
    visited: set[str] = set()
    active: set[str] = set()

    def visit(node_id: str) -> None:
        if node_id in active:
            raise WorkflowTemplateError("WORKFLOW_NORMAL_CYCLE")
        if node_id in visited:
            return
        active.add(node_id)
        for target in graph[node_id]:
            visit(target)
        active.remove(node_id)
        visited.add(node_id)

    visit(value.start)
    if visited != set(nodes):
        raise WorkflowTemplateError("WORKFLOW_NODE_UNREACHABLE")
    if not any(not targets for targets in graph.values()) or any(
        nodes[node_id].kind != "approval" or nodes[node_id].binding != "human.owner"
        for node_id, targets in graph.items() if not targets
    ):
        raise WorkflowTemplateError("WORKFLOW_FINAL_ACCEPTANCE_REQUIRED")
    for route in value.rework:
        if (route.source not in nodes or route.target not in nodes
                or (route.source, route.event) in routes
                or route.maxCycles >= value.maxTotalAttempts):
            raise WorkflowTemplateError("WORKFLOW_REWORK_INVALID")
        routes.add((route.source, route.event))
    return value


def load_template(template_id: str) -> WorkflowTemplate:
    if template_id not in _PRESETS:
        raise WorkflowTemplateError("WORKFLOW_PRESET_UNKNOWN")
    try:
        raw = json.loads(files("forge.workflow_presets").joinpath(
            f"{template_id}.json"
        ).read_text(encoding="utf-8"))
        value = WorkflowTemplate.model_validate(raw)
    except (OSError, ValueError, ValidationError) as error:
        raise WorkflowTemplateError("WORKFLOW_PRESET_INVALID") from error
    if value.id != template_id:
        raise WorkflowTemplateError("WORKFLOW_PRESET_INVALID")
    return validate_template(value)


def list_templates() -> tuple[WorkflowTemplate, ...]:
    return tuple(load_template(template_id) for template_id in _PRESETS)
