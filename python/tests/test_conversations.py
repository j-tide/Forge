"""Offline P1 messages are real SQLite rows, including after Host restart."""

from pathlib import Path
from uuid import uuid4

import pytest

from forge.conversations import ConversationError, ConversationSend, ConversationService
from forge.persistence import ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService


def test_offline_conversation_idempotency_archive_and_restart(tmp_path: Path) -> None:
    repo = tmp_path / "source"
    repo.mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate()
    projects = ProjectService(storage)
    probe = projects.probe(str(repo))
    project = projects.create(str(repo), probe.fingerprint, TRUST_VERSION, True, 0)
    service = ConversationService(storage)
    created = service.create(str(project.projectId), "真实需求", 0)
    assert service.list_conversations(str(project.projectId)) == [created]
    request = ConversationSend(
        projectId=project.projectId,
        conversationId=created.conversationId,
        idempotencyKey="manual-message-key-01",
        text="Add validation to add(a,b)",
        attachmentIds=[],
    )
    first = service.send(request)
    assert first["replyStatus"] == "unavailable"
    assert first["replay"] is False
    replay = service.send(request)
    assert replay["replay"] is True
    assert first["message"] == replay["message"]
    with pytest.raises(ConversationError, match="IDEMPOTENCY_CONFLICT"):
        service.send(request.model_copy(update={"text": "Different text"}))
    assert len(service.messages(str(project.projectId), str(created.conversationId))) == 1
    storage.close()

    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    again = ConversationService(reopened)
    assert again.messages(str(project.projectId), str(created.conversationId)) == [first["message"]]
    latest = again.get(str(project.projectId), str(created.conversationId))
    assert latest and latest.revision == 2
    with pytest.raises(ConversationError, match="REVISION_CONFLICT"):
        again.archive(str(project.projectId), str(created.conversationId), 1)
    archived = again.archive(str(project.projectId), str(created.conversationId), 2)
    assert archived.archivedAt is not None
    assert again.list_conversations(str(project.projectId)) == []
    assert repo.is_dir()
    reopened.close()


def test_conversation_project_scope_and_no_fabricated_reply(tmp_path: Path) -> None:
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir()
    b.mkdir()
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate()
    projects = ProjectService(storage)
    first_probe = projects.probe(str(a))
    second_probe = projects.probe(str(b))
    first = projects.create(str(a), first_probe.fingerprint, TRUST_VERSION, True, 0)
    second = projects.create(str(b), second_probe.fingerprint, TRUST_VERSION, True, 0)
    service = ConversationService(storage)
    conversation = service.create(str(first.projectId), "A", 0)
    assert service.get(str(second.projectId), str(conversation.conversationId)) is None
    with pytest.raises(ConversationError, match="CONVERSATION_NOT_FOUND"):
        service.send(
            ConversationSend(
                projectId=second.projectId,
                conversationId=conversation.conversationId,
                idempotencyKey="separate-project-01",
                text="Must fail",
                attachmentIds=[uuid4()],
            )
        )
    assert service.messages(str(first.projectId), str(conversation.conversationId)) == []
    storage.close()
