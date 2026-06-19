"""Small trusted built-in plugin runtime; discovery never executes entry code."""

from __future__ import annotations

import importlib
import json
import platform
import sys
from pathlib import Path
from typing import cast

from forge.executor_contracts import ExecutorAdapter, ExecutorCapabilities
from forge.plugin_api import (
    PLUGIN_API_VERSION,
    Disposable,
    ForgePlugin,
    PluginContext,
    PluginError,
    PluginManifest,
)
from forge.plugin_lock import PluginPackageLock, verify_builtin_lock
from forge.plugin_manifest import ManifestIssue, ManifestReport, inspect_manifest
from forge.plugin_scope import DisposableScope, Registration
from forge.plugin_storage import PluginStorageBroker

_BUILTINS = {
    "forge.executor.codex": ("codex.manifest.json", "forge.builtin_plugins.codex"),
}
_BUNDLE = Path(__file__).with_name("builtin_plugins")
_PERMISSIONS = frozenset(("workspace.read", "workspace.write", "process.spawn"))


def _platform_id() -> str:
    system = "win32" if sys.platform == "win32" else sys.platform
    arch = platform.machine().lower()
    arch = {"aarch64": "arm64", "amd64": "x64", "x86_64": "x64"}.get(arch, arch)
    return f"{system}-{arch}"


class _ActivationContext(PluginContext):
    def __init__(self, registry: PluginRegistry, manifest: PluginManifest) -> None:
        self.registry = registry
        self.manifest = manifest
        self.executors: dict[str, ExecutorAdapter] = {}
        self.scope = DisposableScope()

    def require_service(self, service_id: str) -> object:
        if service_id not in self.manifest.requires or service_id not in self.registry.services:
            raise PluginError("PLUGIN_SERVICE_UNAVAILABLE")
        service = self.registry.services[service_id]
        if service_id == "storage.v1":
            if not isinstance(service, PluginStorageBroker):
                raise PluginError("PLUGIN_SERVICE_UNAVAILABLE")
            return service.for_plugin(self.manifest.id)
        return service

    def register_executor(self, adapter: ExecutorAdapter) -> Disposable:
        if (
            adapter.id not in self.manifest.contributes.executors
            or adapter.id in self.executors or adapter.id in self.registry.executors
        ):
            raise PluginError("PLUGIN_CONTRIBUTION_INVALID")
        def release() -> None:
            if self.executors.get(adapter.id) is adapter:
                self.executors.pop(adapter.id)
            if self.registry.executors.get(adapter.id) is adapter:
                self.registry.executors.pop(adapter.id)

        registration = Registration(release)
        self.scope.track(registration)
        self.executors[adapter.id] = adapter
        return registration

    def track_disposable(self, disposable: Disposable) -> Disposable:
        return self.scope.track(disposable)


class PluginRegistry:
    def __init__(self, *, granted_permissions: frozenset[str]) -> None:
        if not granted_permissions.issubset(_PERMISSIONS):
            raise PluginError("PLUGIN_PERMISSION_UNKNOWN")
        self.granted_permissions = granted_permissions
        self.services: dict[str, object] = {}
        self.service_requires: dict[str, tuple[str, ...]] = {}
        self.manifests: dict[str, PluginManifest] = {}
        self.bundle_locks: dict[str, PluginPackageLock] = {}
        self.executors: dict[str, ExecutorAdapter] = {}
        self.executor_owner: dict[str, str] = {}
        self.activated: dict[str, ForgePlugin] = {}
        self.scopes: dict[str, DisposableScope] = {}
        self.run_leases: dict[str, set[str]] = {}
        self.draining: set[str] = set()
        self.activation_order: list[str] = []

    def register_service(
        self, service_id: str, service: object, *, requires: tuple[str, ...] = (),
    ) -> None:
        if not service_id or service_id in self.services:
            raise PluginError("PLUGIN_SERVICE_DUPLICATE")
        if len(set(requires)) != len(requires) or any(not name for name in requires):
            raise PluginError("PLUGIN_SERVICE_DEPENDENCY_INVALID")
        if service_id == "storage.v1" and not isinstance(service, PluginStorageBroker):
            raise PluginError("PLUGIN_SERVICE_UNAVAILABLE")
        self.services[service_id] = service
        self.service_requires[service_id] = requires

    def resolve_service_order(self, required: tuple[str, ...]) -> tuple[str, ...]:
        """Dependency-first order; cycles and missing services fail before entry import."""
        order: list[str] = []
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(service_id: str) -> None:
            if service_id in visiting:
                raise PluginError("PLUGIN_SERVICE_CYCLE")
            if service_id in visited:
                return
            if service_id not in self.services:
                raise PluginError("PLUGIN_SERVICE_UNAVAILABLE")
            visiting.add(service_id)
            for dependency in self.service_requires.get(service_id, ()):
                visit(dependency)
            visiting.remove(service_id)
            visited.add(service_id)
            order.append(service_id)

        for service_id in required:
            visit(service_id)
        return tuple(order)

    def discover_builtin(self, plugin_id: str) -> PluginManifest:
        """Read a fixed trusted manifest; import happens only during activation."""
        builtin = _BUILTINS.get(plugin_id)
        if builtin is None:
            raise PluginError("PLUGIN_NOT_BUNDLED")
        if plugin_id in self.manifests:
            raise PluginError("PLUGIN_DUPLICATE")
        report = inspect_manifest(
            _BUNDLE, builtin[0], expected_id=plugin_id, expected_entry="codex.py",
            host_api_version=PLUGIN_API_VERSION, platform_id=_platform_id(),
            granted_permissions=self.granted_permissions,
            available_services=frozenset(self.services), runtime_checks=False,
        )
        if not report.valid or report.manifest is None:
            raise PluginError(report.issues[0].code)
        manifest = report.manifest
        locked = verify_builtin_lock(_BUNDLE, builtin[0], manifest)
        self.manifests[plugin_id] = manifest
        self.bundle_locks[plugin_id] = locked
        return manifest

    def inspect_builtin(self, plugin_id: str) -> ManifestReport:
        """Return an error list without importing entry code or changing registry state."""
        builtin = _BUILTINS.get(plugin_id)
        if builtin is None:
            return ManifestReport(None, (
                ManifestIssue("PLUGIN_NOT_BUNDLED", "id", "Plugin is not in the bundled allowlist"),
            ))
        report = inspect_manifest(
            _BUNDLE, builtin[0], expected_id=plugin_id, expected_entry="codex.py",
            host_api_version=PLUGIN_API_VERSION, platform_id=_platform_id(),
            granted_permissions=self.granted_permissions,
            available_services=frozenset(self.services),
        )
        if report.valid and report.manifest is not None:
            try:
                verify_builtin_lock(_BUNDLE, builtin[0], report.manifest)
            except PluginError as error:
                return ManifestReport(report.manifest, report.issues + (
                    ManifestIssue(error.code, "lock", "Bundled plugin files do not match lock"),
                ))
        return report

    def inspect_builtin_config(self) -> dict[str, object]:
        """Read-only, fixed bundled-plugin diagnostics for the Desktop form."""
        plugin_id = "forge.executor.codex"
        report = self.inspect_builtin(plugin_id)
        manifest = report.manifest
        schema: dict[str, object] | None = None
        if report.valid and manifest is not None:
            # inspect_builtin already checked the package lock and the closed schema.
            raw = json.loads((_BUNDLE / "codex.config.schema.json").read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                schema = raw
        return {
            "pluginId": plugin_id,
            "version": manifest.version if manifest else None,
            "forgeApiRange": manifest.forgeApiRange if manifest else None,
            "compatible": report.valid,
            "active": plugin_id in self.activated,
            "issues": [issue.__dict__ for issue in report.issues],
            "configSchema": schema,
        }

    async def activate(self, plugin_id: str) -> None:
        manifest = self.manifests.get(plugin_id)
        builtin = _BUILTINS.get(plugin_id)
        if manifest is None or builtin is None:
            raise PluginError("PLUGIN_NOT_DISCOVERED")
        if plugin_id in self.activated:
            raise PluginError("PLUGIN_ALREADY_ACTIVE")
        report = inspect_manifest(
            _BUNDLE, builtin[0], expected_id=plugin_id, expected_entry="codex.py",
            host_api_version=PLUGIN_API_VERSION, platform_id=_platform_id(),
            granted_permissions=self.granted_permissions,
            available_services=frozenset(self.services), manifest_override=manifest,
        )
        if not report.valid:
            raise PluginError(report.issues[0].code)
        locked = verify_builtin_lock(_BUNDLE, builtin[0], manifest)
        if locked != self.bundle_locks.get(plugin_id):
            raise PluginError("PLUGIN_LOCK_MISMATCH")
        if plugin_id in self.draining:
            raise PluginError("PLUGIN_DRAINING")
        self.resolve_service_order(tuple(manifest.requires))
        if set(manifest.contributes.executors).intersection(self.executors):
            raise PluginError("PLUGIN_CONTRIBUTION_DUPLICATE")
        # Module names are fixed in _BUILTINS; manifest.entry is never imported as code.
        module = importlib.import_module(builtin[1])
        factory = getattr(module, "create_plugin", None)
        if not callable(factory):
            raise PluginError("PLUGIN_ENTRY_INVALID")
        plugin = cast(ForgePlugin, factory())
        context = _ActivationContext(self, manifest)
        try:
            returned = await plugin.activate(context)
            if returned is not None:
                context.track_disposable(returned)
            if set(context.executors) != set(manifest.contributes.executors):
                raise PluginError("PLUGIN_CONTRIBUTION_INVALID")
        except BaseException as error:
            failures = 0
            try:
                await plugin.dispose()
            except BaseException:
                failures += 1
            try:
                await context.scope.dispose()
            except BaseException:
                failures += 1
            if failures:
                raise PluginError("PLUGIN_ACTIVATION_ROLLBACK_FAILED") from error
            raise
        self.executors.update(context.executors)
        for executor_id in context.executors:
            self.executor_owner[executor_id] = plugin_id
        self.activated[plugin_id] = plugin
        self.scopes[plugin_id] = context.scope
        self.activation_order.append(plugin_id)

    def resolve_executor(self, executor_id: str) -> ExecutorAdapter | None:
        return self.executors.get(executor_id)

    def lock_for_executor(self, executor_id: str) -> PluginPackageLock:
        owner = self.executor_owner.get(executor_id)
        if owner is None or owner in self.draining:
            raise PluginError("PLUGIN_EXECUTOR_UNAVAILABLE")
        locked = verify_builtin_lock(_BUNDLE, _BUILTINS[owner][0], self.manifests[owner])
        if locked != self.bundle_locks[owner]:
            raise PluginError("PLUGIN_LOCK_MISMATCH")
        return locked

    def acquire_run(self, executor_id: str, run_id: str, expected: PluginPackageLock) -> None:
        owner = self.executor_owner.get(executor_id)
        if owner is None or owner in self.draining:
            raise PluginError("PLUGIN_VERSION_MISMATCH")
        if self.lock_for_executor(executor_id) != expected:
            raise PluginError("PLUGIN_VERSION_MISMATCH")
        self.run_leases.setdefault(owner, set()).add(run_id)

    async def release_run(self, executor_id: str, run_id: str) -> None:
        owner = self.executor_owner.get(executor_id)
        if owner is None:
            return
        self.run_leases.get(owner, set()).discard(run_id)
        if owner in self.draining and not self.run_leases.get(owner):
            await self.deactivate(owner)

    async def probe_executor(self, executor_id: str) -> ExecutorCapabilities:
        adapter = self.resolve_executor(executor_id)
        if adapter is None:
            raise PluginError("PLUGIN_EXECUTOR_UNAVAILABLE")
        return await adapter.probe()

    async def deactivate(self, plugin_id: str) -> str:
        if self.run_leases.get(plugin_id):
            self.draining.add(plugin_id)
            return "draining"
        plugin = self.activated.pop(plugin_id, None)
        if plugin is None:
            return "inactive"
        manifest = self.manifests[plugin_id]
        for executor_id in manifest.contributes.executors:
            self.executors.pop(executor_id, None)
            self.executor_owner.pop(executor_id, None)
        self.activation_order.remove(plugin_id)
        self.draining.discard(plugin_id)
        self.run_leases.pop(plugin_id, None)
        scope = self.scopes.pop(plugin_id)
        try:
            await plugin.dispose()
        finally:
            await scope.dispose()
        return "inactive"

    async def dispose(self) -> None:
        failures = 0
        for plugin_id in tuple(reversed(self.activation_order)):
            try:
                if await self.deactivate(plugin_id) == "draining":
                    failures += 1
            except Exception:
                failures += 1
        if failures:
            raise PluginError("PLUGIN_DISPOSE_FAILED")
