"""Versioned, bounded JSON-RPC 2.0 messages for the local stdio link."""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

TRANSPORT_VERSION = "forge-local-jsonrpc/v1"
HOST_PROTOCOL_VERSION = "forge-host-protocol/v5"
MAX_FRAME_BYTES = 1_048_576


class RpcRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    jsonrpc: Literal["2.0"]
    id: str = Field(min_length=1, max_length=128)
    method: str = Field(min_length=1, max_length=128)
    params: dict[str, Any]
    transportVersion: Literal["forge-local-jsonrpc/v1"]


class ProtocolError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def parse_frame(raw: bytes) -> RpcRequest:
    if len(raw) > MAX_FRAME_BYTES or not raw.endswith(b"\n"):
        raise ProtocolError("INVALID_FRAME", "Invalid or oversized JSON-RPC frame")
    try:
        data = json.loads(raw)
        return RpcRequest.model_validate(data)
    except (ValueError, ValidationError) as exc:
        raise ProtocolError("INVALID_REQUEST", "Invalid JSON-RPC request") from exc


def encode_frame(message: dict[str, Any]) -> bytes:
    frame = json.dumps(message, separators=(",", ":"), ensure_ascii=False).encode() + b"\n"
    if len(frame) > MAX_FRAME_BYTES:
        raise ProtocolError("INVALID_FRAME", "JSON-RPC response exceeds frame limit")
    return frame
