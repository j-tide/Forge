"""Version-locked, bounded settings for the trusted bundled Codex plugin."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forge.persistence import ForgePersistence
from forge.plugin_api import PluginError
from forge.plugins import PluginRegistry

PLUGIN_ID = "forge.executor.codex"
_METADATA_KEY = "plugin.forge.executor.codex.configuration.v1"
_MAX_BYTES = 4096


class _Record(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    revision: int = Field(ge=1)
    pluginVersion: str
    contentHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    values: dict[str, Any]


@dataclass(frozen=True)
class PluginConfiguration:
    revision: int
    values: dict[str, object]
    error: str | None = None


class BundledPluginConfiguration:
    def __init__(self, storage: ForgePersistence, registry: PluginRegistry) -> None:
        self.storage = storage
        self.registry = registry

    def read(self) -> PluginConfiguration:
        raw = self.storage.get_metadata(_METADATA_KEY)
        if raw is None:
            values: dict[str, object] = {}
            revision = 0
            version = None
            digest = None
        else:
            if len(raw.encode("utf-8")) > _MAX_BYTES:
                return PluginConfiguration(0, {}, "PLUGIN_CONFIG_CORRUPT")
            try:
                record = _Record.model_validate_json(raw)
            except ValidationError:
                return PluginConfiguration(0, {}, "PLUGIN_CONFIG_CORRUPT")
            values = record.values
            revision = record.revision
            version = record.pluginVersion
            digest = record.contentHash
        try:
            lock = self.registry.validate_builtin_configuration(PLUGIN_ID, values)
        except (PluginError, OSError, ValueError):
            return PluginConfiguration(revision, {}, "PLUGIN_CONFIG_INVALID")
        if version is not None and (version != lock.version or digest != lock.contentHash):
            return PluginConfiguration(revision, {}, "PLUGIN_CONFIG_STALE")
        return PluginConfiguration(revision, values.copy())

    def save(self, *, expected_revision: int,
             values: dict[str, object]) -> PluginConfiguration:
        current = self.read()
        if current.error == "PLUGIN_CONFIG_CORRUPT":
            raise PluginError(current.error)
        if current.revision != expected_revision:
            raise PluginError("PLUGIN_CONFIG_REVISION_CONFLICT")
        lock = self.registry.validate_builtin_configuration(PLUGIN_ID, values)
        record = _Record(
            schemaVersion="1.0", revision=expected_revision + 1,
            pluginVersion=lock.version, contentHash=lock.contentHash,
            values=values,
        )
        encoded = record.model_dump_json()
        if len(encoded.encode("utf-8")) > _MAX_BYTES:
            raise PluginError("PLUGIN_CONFIG_INVALID")
        self.storage.set_metadata(_METADATA_KEY, encoded)
        return PluginConfiguration(record.revision, values.copy())
