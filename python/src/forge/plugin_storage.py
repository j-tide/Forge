"""A plugin-scoped key/value surface without SQL or a core connection."""

from __future__ import annotations

import json
import re
from typing import Any

from forge.conversations import timestamp
from forge.persistence import ForgePersistence

_PLUGIN_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
_KEY = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


class PluginStorageError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class PluginStorage:
    def __init__(self, storage: ForgePersistence, plugin_id: str) -> None:
        if _PLUGIN_ID.fullmatch(plugin_id) is None:
            raise PluginStorageError("PLUGIN_STORAGE_SCOPE_INVALID")
        self.__storage = storage
        self.__plugin_id = plugin_id

    @staticmethod
    def _key(value: str) -> None:
        if _KEY.fullmatch(value) is None:
            raise PluginStorageError("PLUGIN_STORAGE_KEY_INVALID")

    def get(self, key: str) -> Any:
        self._key(key)
        row = self.__storage.session().execute(
            "SELECT value_json FROM plugin_storage_entries WHERE plugin_id=? AND storage_key=?",
            (self.__plugin_id, key),
        ).fetchone()
        return json.loads(row["value_json"]) if row else None

    def put(self, key: str, value: Any) -> None:
        self._key(key)
        try:
            encoded = json.dumps(value, ensure_ascii=False, allow_nan=False,
                                 separators=(",", ":"))
        except (TypeError, ValueError) as error:
            raise PluginStorageError("PLUGIN_STORAGE_VALUE_INVALID") from error
        if len(encoded.encode()) > 16_384:
            raise PluginStorageError("PLUGIN_STORAGE_VALUE_INVALID")
        with self.__storage.transaction() as db:
            db.execute(
                "INSERT INTO plugin_storage_entries(plugin_id,storage_key,value_json,"
                "updated_at) VALUES(?,?,?,?) ON CONFLICT(plugin_id,storage_key) "
                "DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",
                (self.__plugin_id, key, encoded, timestamp()),
            )


class PluginStorageBroker:
    """Host-only factory; activation receives only its own scoped handle."""

    def __init__(self, storage: ForgePersistence) -> None:
        self.__storage = storage

    def for_plugin(self, plugin_id: str) -> PluginStorage:
        return PluginStorage(self.__storage, plugin_id)
