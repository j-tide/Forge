"""Built-in Codex contribution; Core sees only the ExecutorAdapter protocol."""

from __future__ import annotations

from forge.codex_executor import CodexExecutorAdapter
from forge.codex_model_provider import CodexModelProvider
from forge.plugin_api import PluginContext, PluginError
from forge.processes import ProcessController


class CodexPlugin:
    def __init__(self) -> None:
        self.adapter: CodexExecutorAdapter | None = None

    async def activate(self, context: PluginContext) -> None:
        service = context.require_service("process.v1")
        if not isinstance(service, ProcessController):
            raise PluginError("PLUGIN_SERVICE_UNAVAILABLE")
        adapter = CodexExecutorAdapter(service)
        context.register_executor(adapter)
        context.register_model_provider(CodexModelProvider())
        self.adapter = adapter

    async def dispose(self) -> None:
        if self.adapter is not None:
            await self.adapter.dispose()
            self.adapter = None


def create_plugin() -> CodexPlugin:
    return CodexPlugin()
