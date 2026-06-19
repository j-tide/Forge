"""P4-01: malformed bundled declarations are diagnosed before entry import."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from forge.plugin_api import PluginError
from forge.plugin_lock import content_hash
from forge.plugin_manifest import api_range_contains, inspect_manifest
from forge.plugins import PluginRegistry, _platform_id

_ID = "forge.executor.codex"
_GRANTS = frozenset(("workspace.read", "workspace.write", "process.spawn"))
_SOURCE = Path(__file__).parents[1] / "src/forge/builtin_plugins"


def fixture_bundle(tmp_path: Path) -> tuple[Path, dict]:
    root = tmp_path / "safe bundle"
    root.mkdir()
    manifest = json.loads((_SOURCE / "codex.manifest.json").read_text())
    (root / "codex.manifest.json").write_text(json.dumps(manifest))
    (root / "codex.config.schema.json").write_text(
        (_SOURCE / "codex.config.schema.json").read_text()
    )
    (root / "codex.py").write_text("raise AssertionError('entry must not execute')\n")
    write_lock(root, manifest)
    return root, manifest


def write_lock(root: Path, manifest: dict) -> None:
    files = {
        name: hashlib.sha256((root / name).read_bytes()).hexdigest()
        for name in ("codex.manifest.json", "codex.py", "codex.config.schema.json")
    }
    entry = {"id": manifest["id"], "version": manifest["version"], "files": files}
    entry["contentHash"] = content_hash(entry["id"], entry["version"], files)
    (root / "plugins.lock.json").write_text(json.dumps({
        "schemaVersion": "1.0", "plugins": [entry],
    }))


def inspect(root: Path, **changes: object):
    return inspect_manifest(
        root, "codex.manifest.json", expected_id=_ID, expected_entry="codex.py",
        host_api_version="1.0.0", platform_id="darwin-arm64",
        granted_permissions=_GRANTS, available_services=frozenset(("process.v1",)),
        **changes,
    )


def test_exact_and_caret_api_versions_fail_closed() -> None:
    assert api_range_contains("^1.0.0", "1.0.0")
    assert api_range_contains("^1.0.0", "1.9.2")
    assert not api_range_contains("^1.1.0", "1.0.0")
    assert not api_range_contains("^2.0.0", "1.9.2")
    assert api_range_contains("1.0.0", "1.0.0")
    assert not api_range_contains("1.0.0", "1.0.1")
    assert not api_range_contains(">=1.0.0", "1.0.0")
    assert not api_range_contains("^0.2.0", "0.3.0")


def test_builtin_manifest_preflight_is_read_only_and_compatible() -> None:
    registry = PluginRegistry(granted_permissions=_GRANTS)
    registry.register_service("process.v1", object())
    report = registry.inspect_builtin(_ID)
    assert report.valid == (_platform_id() == "darwin-arm64")
    assert report.manifest is not None
    assert report.manifest.version == "0.0.1"
    assert registry.manifests == {} and registry.activated == {}


def test_bundled_inspection_returns_only_locked_schema_and_actual_state() -> None:
    registry = PluginRegistry(granted_permissions=_GRANTS)
    registry.register_service("process.v1", object())
    result = registry.inspect_builtin_config()
    assert result["pluginId"] == _ID
    assert result["active"] is False
    assert result["compatible"] == (_platform_id() == "darwin-arm64")
    if result["compatible"]:
        assert result["configSchema"] == json.loads(
            (_SOURCE / "codex.config.schema.json").read_text()
        )
    else:
        assert result["configSchema"] is None
    assert registry.manifests == {}


def test_credential_config_accepts_reference_only(tmp_path: Path) -> None:
    root, _manifest = fixture_bundle(tmp_path)
    (root / "codex.config.schema.json").write_text(json.dumps({
        "type": "object", "additionalProperties": False,
        "properties": {"credentialRef": {"type": "string", "title": "凭据",
                                         "format": "forge-credential-ref"}},
        "required": ["credentialRef"],
    }))
    assert inspect(root, config={"credentialRef": "credential:local-test"}).valid
    for value in ("sk-secret-plain-text", "", 123):
        assert "PLUGIN_CONFIG_INVALID" in [issue.code for issue in inspect(
            root, config={"credentialRef": value},
        ).issues]
    assert "PLUGIN_CONFIG_INVALID" in [issue.code for issue in inspect(
        root, config={"credentialRef": "credential:local-test", "unlisted": "x"},
    ).issues]


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [
        ("id", "forge.other", "PLUGIN_ID_MISMATCH"),
        ("forgeApiRange", "^2.0.0", "PLUGIN_API_UNSUPPORTED"),
        ("forgeApiRange", ">=1.0.0", "PLUGIN_API_RANGE_INVALID"),
        ("supportedPlatforms", ["win32-x64"], "PLUGIN_PLATFORM_UNSUPPORTED"),
        ("requestedPermissions", ["shell.any"], "PLUGIN_PERMISSION_UNKNOWN"),
        ("execution", "external-process", "PLUGIN_SOURCE_UNSUPPORTED"),
        ("entry", "other.py", "PLUGIN_SOURCE_UNSUPPORTED"),
        ("extra", "run me", "PLUGIN_MANIFEST_INVALID"),
    ],
)
def test_invalid_manifest_reports_specific_error_without_entry_execution(
    tmp_path: Path, field: str, value: object, expected: str,
) -> None:
    root, manifest = fixture_bundle(tmp_path)
    manifest[field] = value
    (root / "codex.manifest.json").write_text(json.dumps(manifest))
    write_lock(root, manifest)
    report = inspect(root)
    assert not report.valid
    assert expected in [issue.code for issue in report.issues]
    assert "entry must not execute" not in str(report.issues)


def test_duplicate_id_and_multiple_errors_are_visible(tmp_path: Path) -> None:
    root, manifest = fixture_bundle(tmp_path)
    manifest["supportedPlatforms"] = ["win32-x64"]
    manifest["requestedPermissions"] = ["shell.any"]
    (root / "codex.manifest.json").write_text(json.dumps(manifest))
    report = inspect(root, known_ids=frozenset((_ID,)))
    assert [issue.code for issue in report.issues] == [
        "PLUGIN_DUPLICATE", "PLUGIN_PLATFORM_UNSUPPORTED", "PLUGIN_PERMISSION_UNKNOWN",
    ]


def test_config_and_source_are_checked_without_import(tmp_path: Path) -> None:
    root, manifest = fixture_bundle(tmp_path)
    (root / "codex.config.schema.json").write_text(json.dumps({
        "type": "object", "additionalProperties": False,
        "properties": {"region": {"type": "string"}}, "required": ["region"],
    }))
    assert inspect(root, config={"region": "local"}).valid
    assert "PLUGIN_CONFIG_INVALID" in [issue.code for issue in inspect(root).issues]
    assert "PLUGIN_CONFIG_INVALID" in [
        issue.code for issue in inspect(root, config={"region": True}).issues
    ]
    (root / "codex.config.schema.json").write_text(json.dumps({
        "type": "object", "additionalProperties": True,
    }))
    assert "PLUGIN_CONFIG_SCHEMA_INVALID" in [issue.code for issue in inspect(root).issues]
    (root / "codex.config.schema.json").unlink()
    (root / "codex.config.schema.json").symlink_to(_SOURCE / "codex.config.schema.json")
    assert "PLUGIN_CONFIG_SCHEMA_INVALID" in [issue.code for issue in inspect(root).issues]
    manifest["configSchema"] = "../outside.json"
    (root / "codex.manifest.json").write_text(json.dumps(manifest))
    assert "PLUGIN_MANIFEST_INVALID" in [issue.code for issue in inspect(root).issues]


def test_builtin_lock_detects_changed_entry_before_import(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    root, _manifest = fixture_bundle(tmp_path)
    monkeypatch.setattr("forge.plugins._BUNDLE", root)
    registry = PluginRegistry(granted_permissions=_GRANTS)
    registry.register_service("process.v1", object())
    registry.discover_builtin(_ID)
    (root / "codex.py").write_text("raise AssertionError('changed entry')\n")
    assert [issue.code for issue in registry.inspect_builtin(_ID).issues] == [
        "PLUGIN_LOCK_MISMATCH",
    ]
    with pytest.raises(PluginError, match="PLUGIN_LOCK_MISMATCH"):
        import asyncio
        asyncio.run(registry.activate(_ID))
    assert not registry.activated and not registry.executors


def test_builtin_lock_rejects_missing_or_duplicate_records(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    root, _manifest = fixture_bundle(tmp_path)
    monkeypatch.setattr("forge.plugins._BUNDLE", root)
    registry = PluginRegistry(granted_permissions=_GRANTS)
    (root / "plugins.lock.json").unlink()
    with pytest.raises(PluginError, match="PLUGIN_LOCK_INVALID"):
        registry.discover_builtin(_ID)
    write_lock(root, json.loads((root / "codex.manifest.json").read_text()))
    lock = json.loads((root / "plugins.lock.json").read_text())
    lock["plugins"].append(lock["plugins"][0])
    (root / "plugins.lock.json").write_text(json.dumps(lock))
    with pytest.raises(PluginError, match="PLUGIN_LOCK_INVALID"):
        registry.discover_builtin(_ID)


@pytest.mark.parametrize(
    ("field", "value", "error"),
    [
        ("requestedPermissions", ["shell.any"], "PLUGIN_PERMISSION_UNKNOWN"),
        ("supportedPlatforms", ["win32-x64"], "PLUGIN_PLATFORM_UNSUPPORTED"),
        ("forgeApiRange", "^2.0.0", "PLUGIN_API_UNSUPPORTED"),
    ],
)
@pytest.mark.asyncio
async def test_registry_refuses_bad_manifest_before_import(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
    field: str, value: object, error: str,
) -> None:
    root, manifest = fixture_bundle(tmp_path)
    manifest["supportedPlatforms"] = [_platform_id()]
    if field == "supportedPlatforms" and value == [_platform_id()]:
        value = ["darwin-x64" if _platform_id() != "darwin-x64" else "linux-x64"]
    manifest[field] = value
    (root / "codex.manifest.json").write_text(json.dumps(manifest))
    write_lock(root, manifest)
    monkeypatch.setattr("forge.plugins._BUNDLE", root)
    imported: list[str] = []

    def unexpected_import(name: str) -> None:
        imported.append(name)
        raise AssertionError("plugin entry imported")

    monkeypatch.setattr("forge.plugins.importlib.import_module", unexpected_import)
    registry = PluginRegistry(granted_permissions=_GRANTS)
    registry.register_service("process.v1", object())
    with pytest.raises(PluginError, match=error):
        registry.discover_builtin(_ID)
        await registry.activate(_ID)
    assert imported == []
    assert registry.executors == {} and registry.activated == {}
