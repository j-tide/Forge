"""Exact bundled plugin content lock; no dynamic plugin installation."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forge.plugin_api import PluginError, PluginManifest

_SHA = re.compile(r"^[a-f0-9]{64}$")
_MAX_LOCK_BYTES = 128 * 1024
_MAX_FILE_BYTES = 512 * 1024


class PluginPackageLock(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    id: str
    version: str
    files: dict[str, str]
    contentHash: str = Field(pattern=_SHA.pattern)


class BuiltinLockFile(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schemaVersion: Literal["1.0"]
    plugins: list[PluginPackageLock]


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def content_hash(plugin_id: str, version: str, files: dict[str, str]) -> str:
    body = {"id": plugin_id, "version": version, "files": files}
    return _sha(json.dumps(body, sort_keys=True, separators=(",", ":")).encode())


def verify_builtin_lock(
    root: Path, manifest_file: str, manifest: PluginManifest,
) -> PluginPackageLock:
    """Refuse missing, linked, changed or extra lock entries before entry import."""
    lock_path = root / "plugins.lock.json"
    try:
        if lock_path.is_symlink() or not lock_path.is_file():
            raise PluginError("PLUGIN_LOCK_INVALID")
        if lock_path.stat().st_size > _MAX_LOCK_BYTES:
            raise PluginError("PLUGIN_LOCK_INVALID")
        lock = BuiltinLockFile.model_validate_json(lock_path.read_bytes())
        if len({item.id for item in lock.plugins}) != len(lock.plugins):
            raise PluginError("PLUGIN_LOCK_INVALID")
        item = next((entry for entry in lock.plugins if entry.id == manifest.id), None)
        if item is None or item.version != manifest.version:
            raise PluginError("PLUGIN_LOCK_MISMATCH")
        expected = {manifest_file, manifest.entry, manifest.configSchema}
        if set(item.files) != expected or content_hash(
            item.id, item.version, item.files
        ) != item.contentHash:
            raise PluginError("PLUGIN_LOCK_INVALID")
        for filename, digest in item.files.items():
            path = root / filename
            resolved = path.resolve(strict=True)
            if (
                path.is_symlink() or not resolved.is_relative_to(root.resolve(strict=True))
                or not resolved.is_file() or resolved.stat().st_size > _MAX_FILE_BYTES
                or _SHA.fullmatch(digest) is None
                or _sha(resolved.read_bytes()) != digest
            ):
                raise PluginError("PLUGIN_LOCK_MISMATCH")
        return item
    except (OSError, ValueError, RuntimeError, ValidationError) as error:
        raise PluginError("PLUGIN_LOCK_INVALID") from error
