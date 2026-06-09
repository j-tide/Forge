"""Verify the real, locked Python toolchain before porting business logic."""

import asyncio
import json
import sys
import tomllib
from pathlib import Path

import pytest
from pydantic import BaseModel, ConfigDict, ValidationError

import forge

ROOT = Path(__file__).resolve().parents[2]


class _StrictProbe(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    version: str


def test_python_and_pydantic_runtime() -> None:
    assert sys.version_info >= (3, 12)
    assert forge.__version__ == "0.0.1"
    assert _StrictProbe.model_validate_json(b'{"version":"v1"}').version == "v1"
    with pytest.raises(ValidationError):
        _StrictProbe.model_validate_json(b'{"version":"v1","unknown":true}')


@pytest.mark.asyncio
async def test_asyncio_plugin_uses_a_real_running_loop() -> None:
    loop = asyncio.get_running_loop()
    assert loop.is_running()
    task = asyncio.create_task(asyncio.sleep(0, result="completed"))
    assert await task == "completed"


def test_python_license_inventory_matches_locked_dependencies() -> None:
    lock = tomllib.loads((ROOT / "python/uv.lock").read_text())
    inventory = json.loads((ROOT / "docs/python-dependency-licenses.json").read_text())
    locked = {entry["name"]: entry["version"] for entry in lock["package"]}
    locked.pop("forge-core")
    declared = inventory["packages"]
    documented = {
        name: data["version"] for name, data in declared.items() if not data.get("buildOnly")
    }
    assert documented == locked
    assert all(data["license"] for data in declared.values())
