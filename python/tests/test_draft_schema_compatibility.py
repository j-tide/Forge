"""Drafts remain usable in historical schema fixtures before presentation columns."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from forge.conversations import ConversationMessage, ConversationSend, ConversationService
from forge.drafts import DraftError, DraftRequest, DraftService
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService


@pytest.mark.parametrize("version", [23, 25, 29, 32, 37])
def test_draft_begin_read_finish_on_pre_presentation_schema(
    tmp_path: Path, version: int,
) -> None:
    root = tmp_path / "project"
    root.mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(version)
    try:
        projects = ProjectService(storage)
        probe = projects.probe(str(root))
        project = projects.create(str(root), probe.fingerprint, TRUST_VERSION, True, 0)
        conversations = ConversationService(storage)
        conversation = conversations.create(str(project.projectId), "Draft source", 0)
        sent = conversations.send(ConversationSend(
            projectId=project.projectId, conversationId=conversation.conversationId,
            idempotencyKey=str(uuid4()), text="Clarify this project task",
            attachmentIds=[],
        ))
        message = sent["message"]
        assert isinstance(message, ConversationMessage)
        request = DraftRequest(
            projectId=project.projectId, conversationId=conversation.conversationId,
            sourceMessageId=message.messageId, idempotencyKey=str(uuid4()),
        )
        drafts = DraftService(storage)
        pending = drafts.begin(request, "generating", "model.fixture")
        assert pending.modelId is None and pending.assistantReply is None
        assert drafts.begin(request, "generating", "model.fixture") == pending
        assert drafts.get(str(project.projectId), str(pending.draftId)) == pending
        assert drafts.list_drafts(str(project.projectId), str(conversation.conversationId)) == [
            pending,
        ]
        with pytest.raises(DraftError, match="DRAFT_INVALID_MODEL"):
            drafts.finish(str(project.projectId), str(pending.draftId),
                          "query", None, None, assistant_reply="Not stored by this schema")
        assert drafts.get(str(project.projectId), str(pending.draftId)) == pending
        finished = drafts.finish(str(project.projectId), str(pending.draftId),
                                 "new_task", None, "REFINER_UNAVAILABLE")
        assert finished.status == "invalid_output"
        assert finished.modelId is None and finished.assistantReply is None
        assert [entry.revision for entry in drafts.history(
            str(project.projectId), str(pending.draftId))] == [1]
        with pytest.raises(DraftError, match="DRAFT_INVALID_MODEL"):
            drafts.begin(request.model_copy(update={"modelId": "fixture-selected"}),
                         "generating", "model.fixture")
    finally:
        storage.close()
