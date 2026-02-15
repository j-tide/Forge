"""Narrow admission of published workflows to the existing explicit stage runtime.

The current Host has real Develop, Review, Verify and human acceptance services.
Only an exact linear chain that maps to those services is runnable. Other
published definitions remain editable/published but cannot claim execution.
"""

from __future__ import annotations

from forge.workflow_compiler import WorkflowCatalog, compile_workflow
from forge.workflow_drafts import PublishedWorkflow
from forge.workflow_templates import load_template


class WorkflowRuntimeError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def admit_linear_workflow(publication: PublishedWorkflow,
                          catalog: WorkflowCatalog) -> str:
    template = publication.definition
    compiled = compile_workflow(template, catalog=catalog)
    if not compiled.launchable or compiled.contentHash != publication.contentHash:
        raise WorkflowRuntimeError("WORKFLOW_RUNTIME_UNAVAILABLE")
    nodes = {node.id: node for node in template.nodes}
    supported = load_template("quick")
    reference_nodes = {node.id: node for node in supported.nodes}
    shape = (
        ("develop", "agent", "development", "ready", "review"),
        ("review", "agent", "review", "approved", "verify"),
        ("verify", "verifier", "verify", "passed", "accept"),
        ("accept", "approval", "verify", None, None),
    )
    if template.start != "develop" or set(nodes) != {item[0] for item in shape}:
        raise WorkflowRuntimeError("WORKFLOW_RUNTIME_UNSUPPORTED")
    for node_id, kind, column, _, _ in shape:
        node = nodes[node_id]
        if node.kind != kind or node.boardColumn != column:
            raise WorkflowRuntimeError("WORKFLOW_RUNTIME_UNSUPPORTED")
        actual = node.model_dump(exclude={"binding", "label"})
        expected = reference_nodes[node_id].model_dump(exclude={"binding", "label"})
        if actual != expected:
            raise WorkflowRuntimeError("WORKFLOW_RUNTIME_UNSUPPORTED")
    routes = {(edge.source, edge.event, edge.target) for edge in template.edges}
    required_routes = {(node_id, event, target) for node_id, _, _, event, target in shape
                       if event is not None and target is not None}
    if routes != required_routes or any(
        route.source not in ("review", "verify") or route.target != "develop"
        for route in template.rework
    ):
        raise WorkflowRuntimeError("WORKFLOW_RUNTIME_UNSUPPORTED")
    if (
        [item.model_dump(by_alias=True) for item in template.rework]
        != [item.model_dump(by_alias=True) for item in supported.rework]
        or template.maxTotalAttempts != supported.maxTotalAttempts
        or template.onUnmatched != supported.onUnmatched
        or template.finalAcceptance != supported.finalAcceptance
    ):
        raise WorkflowRuntimeError("WORKFLOW_RUNTIME_UNSUPPORTED")
    if nodes["verify"].binding != "verifier.project-checks" or (
        nodes["accept"].binding != "human.owner"
    ):
        raise WorkflowRuntimeError("WORKFLOW_RUNTIME_UNSUPPORTED")
    return nodes["develop"].binding
