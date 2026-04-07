"""The launch capability response describes the published Developer binding."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from test_workflow_compiler import catalog

from forge.development import HostDevelopmentService
from forge.workflow_compiler import compile_workflow
from forge.workflow_drafts import PublishedWorkflow
from forge.workflow_templates import load_template


class _FixtureDevelopment(HostDevelopmentService):
    def __init__(self) -> None:
        available = catalog()
        definition = load_template("quick").model_copy(update={"id": "workflow.fixture.quick"})
        compiled = compile_workflow(definition, catalog=available)
        assert compiled.launchable
        publication = PublishedWorkflow(
            workflowId=definition.id, revision=1, definition=definition,
            contentHash=compiled.contentHash, createdAt="2026-09-27T00:00:00Z",
        )
        self.workflow_drafts = SimpleNamespace(published=lambda _: publication)
        self.workflow_catalog = self._catalog
        self.profiles = SimpleNamespace(get=lambda identity: available.profiles.get(identity))
        self.adapter = SimpleNamespace(id="fixture.codex", probe=self._probe)
        self.plugins = None
        self._available = available

    async def _catalog(self):
        return self._available

    async def _probe(self):
        return self._available.executors["fixture.codex"]

    def _project(self, project_id):
        return object()

    def _task(self, project_id, task_id, revision=None, *, require_todo=False):
        return "workflow.fixture.quick"

    def _has_unreconciled_run(self, project_id):
        return False


@pytest.mark.asyncio
async def test_capabilities_expose_exact_published_developer_binding() -> None:
    development = _FixtureDevelopment()
    result = await development.capabilities(uuid4(), uuid4())
    assert result.available
    assert result.workflowBinding is not None
    assert result.workflowBinding.workflowId == "workflow.fixture.quick"
    assert result.workflowBinding.workflowRevision == 1
    assert result.workflowBinding.profileId == "profile.developer"
    assert result.workflowBinding.profileRevision == 1
    assert result.workflowBinding.modelId == "fixture-model"
    assert result.workflowBinding.entryNode == "develop"

    development._available.executors["fixture.codex"] = (
        development._available.executors["fixture.codex"].model_copy(update={
            "modelIds": ["another-model"],
        })
    )
    unavailable = await development.capabilities(uuid4(), uuid4())
    assert not unavailable.available
    assert unavailable.workflowBinding is None
    assert "WORKFLOW_RUNTIME_UNAVAILABLE" in unavailable.warnings
