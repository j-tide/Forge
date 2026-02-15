"""Only published linear workflows can enter the existing explicit stage runtime."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from test_workflow_compiler import catalog

from forge.conversations import timestamp
from forge.persistence import ForgePersistence
from forge.rework import MAX_TOTAL_ATTEMPTS, ReworkError, frozen_attempt_limit
from forge.run_config import VersionLock
from forge.workflow_compiler import compile_workflow
from forge.workflow_drafts import (
    PublishedWorkflow,
    WorkflowDraftService,
    WorkflowPublishInput,
    WorkflowSaveInput,
)
from forge.workflow_runtime import WorkflowRuntimeError, admit_linear_workflow
from forge.workflow_templates import load_template


def test_published_quick_chain_admitted_but_planner_graph_is_not(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(29)
    workflows = WorkflowDraftService(storage)
    quick = load_template("quick").model_copy(update={"id": "workflow.quickfixture"})
    workflows.save(WorkflowSaveInput(template=quick, expectedRevision=0))
    workflows.publish(WorkflowPublishInput(
        workflowId=quick.id, expectedDraftRevision=1), catalog())
    publication = workflows.published(quick.id)
    assert admit_linear_workflow(publication, catalog()) == "profile.developer"
    locked = SimpleNamespace(workflow=VersionLock(
        id=publication.workflowId, version=str(publication.revision),
        contentHash=publication.contentHash,
    ))
    assert frozen_attempt_limit(storage, locked) == quick.maxTotalAttempts
    assert frozen_attempt_limit(storage, SimpleNamespace(workflow=VersionLock(
        id="standard", version="1", contentHash="a" * 64,
    ))) == MAX_TOTAL_ATTEMPTS
    with pytest.raises(ReworkError, match="WORKFLOW_RUNTIME_UNAVAILABLE"):
        frozen_attempt_limit(storage, SimpleNamespace(workflow=VersionLock(
            id=publication.workflowId, version=str(publication.revision),
            contentHash="b" * 64,
        )))
    with pytest.raises(WorkflowRuntimeError, match="WORKFLOW_RUNTIME_UNAVAILABLE"):
        admit_linear_workflow(publication, catalog(verifier=False))
    standard = load_template("standard").model_copy(update={"id": "workflow.plannerfixture"})
    # A planner chain cannot be mistaken for the supported four-node runtime.
    with pytest.raises(WorkflowRuntimeError, match="WORKFLOW_RUNTIME_UNAVAILABLE"):
        admit_linear_workflow(PublishedWorkflow(
            workflowId=standard.id, revision=1, definition=standard,
            contentHash=compile_workflow(standard).contentHash, createdAt=timestamp(),
        ), catalog())
    storage.close()
