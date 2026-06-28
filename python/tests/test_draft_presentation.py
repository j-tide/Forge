"""Draft provenance survives persistence; fixtures never claim live model acceptance."""

from pathlib import Path
from uuid import uuid4

import pytest

from forge.conversations import ConversationMessage, ConversationSend, ConversationService
from forge.drafts import DraftError, DraftRequest, DraftService
from forge.persistence import LATEST_SCHEMA, ForgePersistence
from forge.projects import TRUST_VERSION, ProjectService


def source_request(storage: ForgePersistence, source: Path) -> DraftRequest:
    source.mkdir()
    projects = ProjectService(storage)
    probe = projects.probe(str(source))
    project = projects.create(str(source), probe.fingerprint, TRUST_VERSION, True, 0)
    conversations = ConversationService(storage)
    conversation = conversations.create(str(project.projectId), "Project question", 0)
    sent = conversations.send(ConversationSend(
        projectId=project.projectId, conversationId=conversation.conversationId,
        idempotencyKey=str(uuid4()), text="你好", attachmentIds=[],
    ))
    message = sent["message"]
    assert isinstance(message, ConversationMessage)
    return DraftRequest(
        projectId=project.projectId, conversationId=conversation.conversationId,
        sourceMessageId=message.messageId, idempotencyKey=str(uuid4()),
    )


def test_reply_and_selected_model_survive_restart_without_creating_todo(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    request = source_request(storage, tmp_path / "repo").model_copy(
        update={"modelId": "fixture-selected"}
    )
    drafts = DraftService(storage)
    pending = drafts.begin(request, "generating", "model.fixture")
    assert pending.modelId == "fixture-selected" and pending.assistantReply is None
    finished = drafts.finish(
        str(request.projectId), str(pending.draftId), "query", None, None,
        model_id="fixture-selected", assistant_reply="你想在这个项目里做什么？",
    )
    assert finished.contract is None
    assert finished.modelProvider == "model.fixture"
    assert finished.modelId == "fixture-selected"
    assert finished.assistantReply == "你想在这个项目里做什么？"
    assert drafts.begin(request, "generating", "model.fixture") == finished
    # A repeated completion cannot replace already presented provenance or reply.
    assert drafts.finish(
        str(request.projectId), str(pending.draftId), "control", None, None,
        model_id="fixture-other", assistant_reply="Different response",
    ) == finished
    with pytest.raises(DraftError, match="IDEMPOTENCY_CONFLICT"):
        drafts.begin(request.model_copy(update={"modelId": "fixture-other"}),
                     "generating", "model.fixture")
    assert storage.session().execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
    storage.close()

    reopened = ForgePersistence(tmp_path / "data")
    reopened.open()
    reopened.migrate(LATEST_SCHEMA)
    assert DraftService(reopened).get(str(request.projectId), str(pending.draftId)) == finished
    assert DraftService(reopened).list_drafts(
        str(request.projectId), str(request.conversationId)
    ) == [finished]
    assert reopened.session().execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
    reopened.close()


def test_automatic_model_selection_is_stored_and_legacy_retry_remains_idempotent(
    tmp_path: Path,
) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    request = source_request(storage, tmp_path / "repo")
    drafts = DraftService(storage)
    pending = drafts.begin(request, "generating", "model.fixture")
    assert pending.modelId is None
    finished = drafts.finish(
        str(request.projectId), str(pending.draftId), "query", None, None,
        model_id="fixture-actual", assistant_reply="Actual provider response",
    )
    assert finished.modelId == "fixture-actual"
    assert drafts.begin(request, "generating", "model.fixture") == finished
    storage.close()


def test_manual_draft_rejects_model_without_inserting_row(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(LATEST_SCHEMA)
    request = source_request(storage, tmp_path / "repo")
    drafts = DraftService(storage)
    with pytest.raises(DraftError, match="DRAFT_INVALID_MODEL"):
        drafts.manual(request.model_copy(update={"modelId": "fixture-model"}))
    assert drafts.list_drafts(str(request.projectId), str(request.conversationId)) == []
    manual = drafts.manual(request)
    assert manual.modelId is None and manual.assistantReply is None
    assert manual.modelProvider is None
    storage.close()


def test_migration_keeps_legacy_draft_model_and_reply_unknown(tmp_path: Path) -> None:
    storage = ForgePersistence(tmp_path / "data")
    storage.open()
    storage.migrate(37)
    request = source_request(storage, tmp_path / "repo")
    draft_id = str(uuid4())
    created_at = "2026-09-26T00:00:00Z"
    with storage.transaction() as db:
        db.execute(
            "INSERT INTO task_drafts(draft_id,project_id,conversation_id,source_message_id,"
            "idempotency_key,revision,intent,status,contract_json,editable_text,error_code,"
            "model_provider,created_at,updated_at) "
            "VALUES(?,?,?,?,?,1,'query','needs_clarification',NULL,?,NULL,?,?,?)",
            (draft_id, str(request.projectId), str(request.conversationId),
             str(request.sourceMessageId), request.idempotencyKey, "你好", "model.codex",
             created_at, created_at),
        )
    storage.close()

    upgraded = ForgePersistence(tmp_path / "data")
    upgraded.open()
    upgraded.migrate(LATEST_SCHEMA)
    draft = DraftService(upgraded).get(str(request.projectId), draft_id)
    assert draft is not None
    assert draft.modelId is None and draft.assistantReply is None
    assert draft.editableText == "你好" and draft.modelProvider == "model.codex"
    assert draft.createdAt == created_at and draft.updatedAt == created_at
    assert upgraded.session().execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
    upgraded.close()
