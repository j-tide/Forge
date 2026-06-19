"""Side-effect-free validation for allowlisted, bundled plugin manifests."""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from forge.plugin_api import PluginManifest

_MAX_MANIFEST_BYTES = 128 * 1024
_MAX_SCHEMA_BYTES = 256 * 1024
_VERSION = re.compile(r"^(\^)?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$")
_SCALAR_TYPES = frozenset(("string", "integer", "number", "boolean"))
_PERMISSIONS = frozenset(("workspace.read", "workspace.write", "process.spawn"))
_FIELD_KEYS = frozenset(("type", "title", "description", "format"))
_CREDENTIAL_REF = re.compile(r"^credential:[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


@dataclass(frozen=True)
class ManifestIssue:
    code: str
    path: str
    message: str


@dataclass(frozen=True)
class ManifestReport:
    manifest: PluginManifest | None
    issues: tuple[ManifestIssue, ...]

    @property
    def valid(self) -> bool:
        return self.manifest is not None and not self.issues


def api_range_contains(api_range: str, host_version: str) -> bool:
    """Support exact and caret SemVer ranges; reject unknown syntax closed."""
    required = _VERSION.fullmatch(api_range)
    actual = _VERSION.fullmatch(host_version)
    if required is None or actual is None or actual[1]:
        return False
    need = tuple(int(required[index]) for index in (2, 3, 4))
    have = tuple(int(actual[index]) for index in (2, 3, 4))
    if required[1] is None:
        return have == need
    if need[0] > 0:
        upper = (need[0] + 1, 0, 0)
    elif need[1] > 0:
        upper = (0, need[1] + 1, 0)
    else:
        upper = (0, 0, need[2] + 1)
    return need <= have < upper


def _owned_file(root: Path, name: str, max_bytes: int) -> Path | None:
    """Never follow a symlink or leave the bundled root, including parent components."""
    target = root / name
    try:
        resolved_root = root.resolve(strict=True)
        resolved = target.resolve(strict=True)
        if not resolved.is_relative_to(resolved_root) or not resolved.is_file():
            return None
        current = root
        if current.is_symlink():
            return None
        for part in target.relative_to(root).parts:
            current = current / part
            if current.is_symlink():
                return None
        if resolved.stat().st_size > max_bytes:
            return None
        return resolved
    except (OSError, ValueError):
        return None


def _config_schema(raw: object) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    if set(raw) - {"$schema", "type", "additionalProperties", "properties", "required"}:
        return None
    if raw.get("type") != "object" or raw.get("additionalProperties") is not False:
        return None
    if "$schema" in raw and raw["$schema"] != "https://json-schema.org/draft/2020-12/schema":
        return None
    properties = raw.get("properties", {})
    required = raw.get("required", [])
    if not isinstance(properties, dict) or not isinstance(required, list):
        return None
    if any(not isinstance(key, str) or key not in properties for key in required):
        return None
    if len(set(required)) != len(required):
        return None
    for key, schema in properties.items():
        if (not isinstance(key, str) or re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", key) is None
                or not isinstance(schema, dict) or set(schema) - _FIELD_KEYS
                or not isinstance(schema.get("type"), str)
                or schema["type"] not in _SCALAR_TYPES
                or ("title" in schema and (not isinstance(schema["title"], str)
                    or not 1 <= len(schema["title"]) <= 160))
                or ("description" in schema and (not isinstance(schema["description"], str)
                    or len(schema["description"]) > 500))
                or ("format" in schema and (schema["format"] != "forge-credential-ref"
                    or schema["type"] != "string"))):
            return None
    return raw


def inspect_manifest(
    root: Path,
    filename: str,
    *,
    expected_id: str,
    expected_entry: str,
    host_api_version: str,
    platform_id: str,
    granted_permissions: frozenset[str],
    available_services: frozenset[str],
    known_ids: frozenset[str] = frozenset(),
    config: dict[str, object] | None = None,
    runtime_checks: bool = True,
    manifest_override: PluginManifest | None = None,
) -> ManifestReport:
    """Return all safe diagnostics before any plugin entry import or activation."""
    issues: list[ManifestIssue] = []

    def add(code: str, path: str, message: str) -> None:
        issues.append(ManifestIssue(code, path, message))

    path = _owned_file(root, filename, _MAX_MANIFEST_BYTES)
    if path is None:
        add("PLUGIN_MANIFEST_SOURCE_INVALID", "manifest", "Manifest missing, linked or oversized")
        return ManifestReport(None, tuple(issues))
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        manifest = PluginManifest.model_validate(raw)
    except (OSError, UnicodeError, ValueError, ValidationError):
        add("PLUGIN_MANIFEST_INVALID", "manifest", "Manifest does not match the public schema")
        return ManifestReport(None, tuple(issues))
    if manifest_override is not None:
        manifest = manifest_override
    if manifest.id != expected_id:
        add("PLUGIN_ID_MISMATCH", "id", "Manifest ID differs from the bundled allowlist")
    if manifest.id in known_ids:
        add("PLUGIN_DUPLICATE", "id", "Plugin ID is already registered")
    if manifest.entry != expected_entry or manifest.execution != "bundled-trusted":
        add("PLUGIN_SOURCE_UNSUPPORTED", "entry", "Entry is not the allowlisted bundled source")
    if _owned_file(root, manifest.entry, _MAX_SCHEMA_BYTES) is None:
        add("PLUGIN_ENTRY_INVALID", "entry", "Entry missing, linked or outside package")
    schema_file = _owned_file(root, manifest.configSchema, _MAX_SCHEMA_BYTES)
    schema: dict[str, Any] | None = None
    if schema_file is None:
        add("PLUGIN_CONFIG_SCHEMA_INVALID", "configSchema", "Config schema source is not safe")
    else:
        try:
            schema = _config_schema(json.loads(schema_file.read_text(encoding="utf-8")))
        except (OSError, UnicodeError, ValueError):
            pass
        if schema is None:
            add("PLUGIN_CONFIG_SCHEMA_INVALID", "configSchema", "Unsupported config schema")
    if schema is not None:
        if config is not None and not isinstance(config, dict):
            add("PLUGIN_CONFIG_INVALID", "config", "Config must be an object")
            values: dict[str, object] = {}
        else:
            values = config or {}
        properties = schema.get("properties", {})
        missing = set(schema.get("required", [])) - set(values)
        unknown = set(values) - set(properties)
        if missing or unknown:
            add("PLUGIN_CONFIG_INVALID", "config", "Missing or undeclared config fields")
        for key in set(values).intersection(properties):
            kind = properties[key]["type"]
            value = values[key]
            valid = (
                (kind == "string" and isinstance(value, str))
                or (kind == "boolean" and isinstance(value, bool))
                or (kind == "integer" and isinstance(value, int) and not isinstance(value, bool))
                or (kind == "number" and not isinstance(value, bool) and (
                    isinstance(value, int)
                    or (isinstance(value, float) and math.isfinite(value))
                ))
            )
            if not valid:
                add("PLUGIN_CONFIG_INVALID", f"config.{key}", "Config value has the wrong type")
            elif (properties[key].get("format") == "forge-credential-ref"
                  and (not isinstance(value, str) or _CREDENTIAL_REF.fullmatch(value) is None)):
                add("PLUGIN_CONFIG_INVALID", f"config.{key}", "Expected a credential reference")
    if _VERSION.fullmatch(manifest.forgeApiRange) is None:
        add("PLUGIN_API_RANGE_INVALID", "forgeApiRange", "Unsupported API range syntax")
    elif not api_range_contains(manifest.forgeApiRange, host_api_version):
        add("PLUGIN_API_UNSUPPORTED", "forgeApiRange", "Host API version is outside plugin range")
    if runtime_checks:
        if platform_id not in manifest.supportedPlatforms:
            add("PLUGIN_PLATFORM_UNSUPPORTED", "supportedPlatforms", "Platform not declared")
        unknown_permissions = set(manifest.requestedPermissions) - _PERMISSIONS
        if unknown_permissions:
            add("PLUGIN_PERMISSION_UNKNOWN", "requestedPermissions", "Unknown permission requested")
        elif not set(manifest.requestedPermissions).issubset(granted_permissions):
            add("PLUGIN_PERMISSION_DENIED", "requestedPermissions", "Permission not granted")
        if set(manifest.requires) - available_services:
            add("PLUGIN_SERVICE_UNAVAILABLE", "requires", "Required Host service is unavailable")
        if any((manifest.contributes.modelProviders, manifest.contributes.contextProviders,
                manifest.contributes.tools, manifest.contributes.verifiers,
                manifest.contributes.viewTypes)):
            add("PLUGIN_CONTRIBUTION_UNSUPPORTED", "contributes", "Contribution unavailable")
    return ManifestReport(manifest, tuple(issues))
