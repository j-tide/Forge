"""Fixed MCP tool-call contract; no external MCP transport is enabled in v1."""

from __future__ import annotations

from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from forge.tool_registry import ToolError


class McpTextContent(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    type: Literal["text"]
    text: str = Field(max_length=16_384)


class McpToolResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    content: list[McpTextContent] = Field(max_length=16)
    isError: bool


class McpSession(Protocol):
    async def call_tool(self, name: str, arguments: dict[str, Any]) -> McpToolResponse: ...


class McpToolProxy:
    """An explicitly bound tool name; the registry still requires a scoped grant."""

    def __init__(self, server_id: str, tool_name: str, session: McpSession) -> None:
        if not server_id or not tool_name or len(server_id) > 128 or len(tool_name) > 128:
            raise ToolError("MCP_BINDING_INVALID")
        self.server_id = server_id
        self.tool_name = tool_name
        self.session = session

    async def __call__(self, value: Any) -> dict[str, str]:
        if not isinstance(value, dict):
            raise ToolError("TOOL_INPUT_INVALID")
        response = await self.session.call_tool(self.tool_name, value)
        if response.isError:
            raise ToolError("MCP_TOOL_FAILED")
        return {"text": "\n".join(item.text for item in response.content)}
