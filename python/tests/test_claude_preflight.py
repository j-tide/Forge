"""An offline probe is evidence of packaging, not an Agent run or authentication."""

import os
from uuid import uuid4

import pytest

from forge.claude_preflight import SDK_VERSION, probe_claude_sdk
from forge.processes import ProcessController, minimal_environment


@pytest.mark.asyncio
async def test_offline_sdk_bundled_binary_is_owned_and_never_claims_live(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-secret-do-not-print")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "subscription-token-not-authorized")
    assert "ANTHROPIC_API_KEY" not in minimal_environment(dict(os.environ))
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in minimal_environment(dict(os.environ))
    controller = ProcessController(uuid4())
    try:
        report = await probe_claude_sdk(controller)
        assert report.sdkVersion == SDK_VERSION
        assert report.bundledCliVersion
        assert report.apiKeyConfigured
        assert not report.liveVerified
        assert "test-secret" not in report.model_dump_json()
        assert all(not controller.has_active(owned.session.descriptor.runId)
                   for owned in controller.records.values())
    finally:
        await controller.dispose()
