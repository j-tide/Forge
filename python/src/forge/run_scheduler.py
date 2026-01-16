"""One-node Host Run orchestration over frozen config, lease and Executor contract."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from forge.context import (
    CheckpointBudget,
    ContextEntry,
    ContextService,
    WorkingCheckpoint,
    executor_context,
)
from forge.executor_contracts import (
    ExecutorAdapter,
    ExecutorEvent,
    ExecutorEventGate,
    ExecutorRunHandle,
    ExecutorStartError,
    RunFailed,
    ScheduledExecutorRequest,
)
from forge.processes import ProcessController
from forge.run_config import RunConfigService
from forge.run_inspection import RunDiffPreview, RunInspectionService, capture_run_diff
from forge.runs import RunAttemptResult, RunService, RunStartIntent, RunView
from forge.workspaces import WorkspaceDescriptor, WorkspaceManager


class SchedulerError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def retry_429_delay(
    error: ExecutorStartError, retry_no: int, max_retries: int,
    remaining_seconds: float,
) -> float | None:
    if (
        error.code != "EXECUTOR_RATE_LIMITED" or error.http_status != 429
        or error.side_effect != "none" or retry_no < 0 or max_retries < 0
        or retry_no >= max_retries
    ):
        return None
    delay = min(30, 2 ** min(retry_no, 5))
    return float(delay) if delay < remaining_seconds else None


@dataclass
class _ActiveRun:
    intent: RunStartIntent
    gate: ExecutorEventGate
    done: asyncio.Future[RunView]
    cancel_requested: bool = False
    cancel_reason: Literal["user", "timeout", "shutdown"] | None = None
    cancel_signal: asyncio.Event = field(default_factory=asyncio.Event)
    handle: ExecutorRunHandle | None = None
    provider_failed: bool = False
    protocol_failed: bool = False
    begun: bool = False
    completed_actions: list[ContextEntry] = field(default_factory=list)
    open_issues: list[ContextEntry] = field(default_factory=list)
    observed_tokens: int | None = None
    observed_tool_starts: int = 0
    checkpoint_sequence: int = 0
    safe_start_no_effect: bool = False


class HostRunScheduler:
    def __init__(
        self, runs: RunService, configs: RunConfigService, contexts: ContextService,
        workspaces: WorkspaceManager, processes: ProcessController,
        adapter: ExecutorAdapter,
    ) -> None:
        self.runs = runs
        self.configs = configs
        self.contexts = contexts
        self.workspaces = workspaces
        self.processes = processes
        self.adapter = adapter
        self.inspections = RunInspectionService(configs.storage, runs)
        self.active: dict[UUID, _ActiveRun] = {}
        self.accepting = True
        self.lock = asyncio.Lock()

    def _validate(
        self, intent: RunStartIntent, workspace: WorkspaceDescriptor,
        request: ScheduledExecutorRequest,
    ) -> int:
        config = self.configs.get(intent.projectId, intent.runId)
        try:
            bundle_id = UUID(request.attempt.contextBundleId)
        except ValueError as error:
            raise SchedulerError("RUN_SNAPSHOT_MISMATCH") from error
        bundle = self.contexts.get_bundle(intent.projectId, bundle_id)
        current = self.workspaces.inspect(workspace.workspaceId)
        if (
            config is None or config.snapshotHash != intent.configHash
            or request.runId != str(intent.runId) or request.taskId != str(intent.taskId)
            or request.attempt.attemptId != str(intent.attemptId)
            or request.attempt.workspaceLeaseId != str(intent.workspaceLeaseId)
            or request.attempt.leaseEpoch != intent.leaseEpoch
            or request.attempt.contractRevision != config.taskRevision
            or request.maxDurationMs > config.budget.maxDurationMs
            or intent.executorId != self.adapter.id
            or workspace.workspaceId != intent.workspaceId
            or workspace.baseRevision != intent.baseRevision
            or current != workspace or current.status != "busy"
            or current.activeLeaseId != intent.workspaceLeaseId
            or workspace.ownerRunId != str(intent.runId)
            or request.workspace != current.rootPath
            or bundle is None or bundle.runId != intent.runId
            or bundle.taskId != intent.taskId
            or bundle.configHash != config.snapshotHash
            or bundle.taskRevision != config.taskRevision
            or request.goal != bundle.goal
            or request.context != executor_context(bundle)
        ):
            raise SchedulerError("RUN_SNAPSHOT_MISMATCH")
        try:
            deadline = datetime.fromisoformat(intent.createdAt.replace("Z", "+00:00"))
            return max(0, int((deadline - datetime.now(UTC)).total_seconds() * 1000)
                       + config.budget.maxDurationMs)
        except ValueError as error:
            raise SchedulerError("RUN_INVALID_TIME") from error

    def _on_event(self, active: _ActiveRun, event: ExecutorEvent) -> None:
        try:
            checked = active.gate.accept(event)
            self.inspections.append(
                active.intent.projectId, active.intent.runId, active.intent.attemptId, checked
            )
            if isinstance(checked, RunFailed):
                active.provider_failed = True
            source = f"executor-event:{checked.sequence}"
            if checked.type in ("command.started", "tool.started"):
                active.observed_tool_starts += 1
            if checked.type == "usage.updated":
                active.observed_tokens = checked.inputTokens + checked.outputTokens
            if checked.type == "command.completed":
                exit_label = checked.exitCode if checked.exitCode is not None else "unknown"
                active.completed_actions.append(ContextEntry(
                    text=f"Command exited {exit_label}",
                    sourceRef=source,
                ))
            if checked.type == "file.changed":
                active.completed_actions.append(ContextEntry(
                    text=f"File {checked.kind} observed", sourceRef=source
                ))
            if checked.type == "run.failed":
                active.open_issues.append(ContextEntry(
                    text="Executor failure observed", sourceRef=source
                ))
            active.completed_actions = active.completed_actions[-16:]
            active.open_issues = active.open_issues[-16:]
            if checked.sequence % 25 == 0:
                self._save_checkpoint(active)
        except Exception:
            active.protocol_failed = True
            active.cancel_signal.set()

    def _save_checkpoint(self, active: _ActiveRun) -> None:
        if not active.begun or not active.gate.sequence:
            return
        config = self.configs.get(active.intent.projectId, active.intent.runId)
        if config is None:
            raise SchedulerError("RUN_CONFIG_MISMATCH")
        state = WorkingCheckpoint(
            checkpointId=uuid4(), projectId=active.intent.projectId,
            runId=active.intent.runId, attemptId=active.intent.attemptId,
            sequence=active.checkpoint_sequence + 1,
            objective=ContextEntry(
                text=config.taskContract.goal,
                sourceRef=f"task:{active.intent.taskId}@{config.taskRevision}",
            ),
            completedActions=active.completed_actions[-16:],
            openIssues=active.open_issues[-16:],
            budget=CheckpointBudget(
                elapsedMs=max(0, int((datetime.now(UTC) - datetime.fromisoformat(
                    active.intent.createdAt.replace("Z", "+00:00")
                )).total_seconds() * 1000)),
                turnsUsed=None, tokensUsed=active.observed_tokens,
                toolCallsUsed=active.observed_tool_starts,
            ),
            createdAt=datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        )
        self.contexts.append_checkpoint(state)
        active.checkpoint_sequence += 1

    def _request_cancel(
        self, active: _ActiveRun,
        reason: Literal["user", "timeout", "shutdown"],
    ) -> None:
        if active.cancel_requested:
            return
        if not active.begun:
            raise SchedulerError("RUN_NOT_STARTED")
        self.runs.request_cancel(
            active.intent.projectId, active.intent.runId, active.intent.attemptId, reason
        )
        active.cancel_requested = True
        active.cancel_reason = reason
        active.cancel_signal.set()

    async def cancel(
        self, project_id: UUID, run_id: UUID,
        reason: Literal["user", "timeout", "shutdown"] = "user",
    ) -> RunView:
        active = self.active.get(run_id)
        if active is None or active.intent.projectId != project_id:
            raise SchedulerError("RUN_NOT_ACTIVE")
        self._request_cancel(active, reason)
        return await asyncio.shield(active.done)

    async def _cancel_owned(self, active: _ActiveRun) -> bool:
        handle = active.handle
        provider_stopped = handle is None
        if handle is not None:
            try:
                await asyncio.wait_for(handle.cancel(), timeout=4)
                await asyncio.wait_for(handle.wait(), timeout=4)
                provider_stopped = True
            except Exception:
                pass
        try:
            report = await self.processes.cancel(str(active.intent.runId))
        except Exception:
            return False
        return (
            report.confirmed and not self.processes.has_active(str(active.intent.runId))
            and (provider_stopped or bool(report.processIds))
        )

    async def _launch(
        self, active: _ActiveRun, request: ScheduledExecutorRequest,
        remaining_ms: int, max_retries: int,
    ) -> ExecutorRunHandle:
        retries = 0
        deadline = asyncio.get_running_loop().time() + remaining_ms / 1000
        while True:
            if active.cancel_requested:
                raise SchedulerError("RUN_CANCELLED_BEFORE_START")
            active.safe_start_no_effect = False
            try:
                start_task = asyncio.create_task(self.adapter.start(
                    request, lambda event: self._on_event(active, event)
                ))
                signal_task = asyncio.create_task(active.cancel_signal.wait())
                try:
                    done, _ = await asyncio.wait(
                        [start_task, signal_task],
                        timeout=max(0, deadline - asyncio.get_running_loop().time()),
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if start_task in done:
                        return await start_task
                    start_task.cancel()
                    await asyncio.gather(start_task, return_exceptions=True)
                    if signal_task in done:
                        raise SchedulerError("RUN_CANCELLED_BEFORE_START")
                    raise SchedulerError("EXECUTOR_TIMEOUT")
                finally:
                    if not start_task.done():
                        start_task.cancel()
                        await asyncio.gather(start_task, return_exceptions=True)
                    signal_task.cancel()
                    await asyncio.gather(signal_task, return_exceptions=True)
            except ExecutorStartError as error:
                if (
                    error.code != "EXECUTOR_RATE_LIMITED"
                    or error.http_status != 429 or error.side_effect != "none"
                ):
                    raise
                active.safe_start_no_effect = True
                delay = retry_429_delay(
                    error, retries, max_retries,
                    deadline - asyncio.get_running_loop().time(),
                )
                if delay is None:
                    raise
                retries += 1
                try:
                    await asyncio.wait_for(active.cancel_signal.wait(), timeout=delay)
                except TimeoutError:
                    continue
                raise SchedulerError("RUN_CANCELLED_BEFORE_START") from error

    async def execute(
        self, intent: RunStartIntent, workspace: WorkspaceDescriptor,
        request: ScheduledExecutorRequest,
        on_queued: Callable[[RunView], None] | None = None,
    ) -> RunView:
        if not self.accepting:
            raise SchedulerError("RUN_SCHEDULER_STOPPING")
        remaining_ms = self._validate(intent, workspace, request)
        if remaining_ms <= 0:
            raise SchedulerError("RUN_EXPIRED")
        capabilities = await self.adapter.probe()
        if (
            not capabilities.available or not capabilities.workspaceControl
            or not capabilities.streaming
            or request.model is not None and request.model not in capabilities.modelIds
            or request.approval == "on-request" and not capabilities.approval
        ):
            raise SchedulerError("EXECUTOR_UNSUPPORTED_CAPABILITY")
        async with self.lock:
            if not self.accepting or intent.runId in self.active:
                raise SchedulerError("RUN_ALREADY_ACTIVE")
            active = _ActiveRun(
                intent=intent, gate=ExecutorEventGate(str(intent.runId)),
                done=asyncio.get_running_loop().create_future(),
            )
            self.active[intent.runId] = active
        timer: asyncio.Task[None] | None = None
        wait_task: asyncio.Task[Literal["completed", "cancelled"]] | None = None
        cancel_task: asyncio.Task[bool] | None = None
        terminal: RunView | None = None
        workspace_released = False
        try:
            queued = self.runs.begin(intent)
            active.begun = True
            if on_queued is not None:
                on_queued(queued)

            async def deadline() -> None:
                await asyncio.sleep(remaining_ms / 1000)
                if intent.runId in self.active and not active.done.done():
                    try:
                        self._request_cancel(active, "timeout")
                    except Exception:
                        active.protocol_failed = True
                        active.cancel_signal.set()

            timer = asyncio.create_task(deadline())
            config = self.configs.get(intent.projectId, intent.runId)
            if config is None:
                raise SchedulerError("RUN_CONFIG_MISMATCH")
            handle = await self._launch(
                active, request, remaining_ms,
                min(3, max(0, config.budget.maxTurns - 1)),
            )
            active.handle = handle
            if not handle.provider_session_id:
                raise SchedulerError("EXECUTOR_PROTOCOL_ERROR")
            self.runs.mark_launched(
                intent.projectId, intent.runId, intent.attemptId, handle.provider_session_id
            )
            wait_task = asyncio.create_task(handle.wait())
            signal_task = asyncio.create_task(active.cancel_signal.wait())
            try:
                await asyncio.wait(
                    [wait_task, signal_task], return_when=asyncio.FIRST_COMPLETED
                )
            finally:
                signal_task.cancel()
                await asyncio.gather(signal_task, return_exceptions=True)
            if active.cancel_requested or active.protocol_failed:
                if not active.cancel_requested:
                    self._request_cancel(active, "shutdown")
                cancel_task = asyncio.create_task(self._cancel_owned(active))
                confirmed = await cancel_task
                if not confirmed:
                    raise SchedulerError("RUN_PROCESS_UNCONFIRMED")
                if active.protocol_failed:
                    raise SchedulerError("EXECUTOR_PROTOCOL_ERROR")
                outcome: Literal["completed", "failed", "cancelled"] = "cancelled"
            else:
                provider_outcome = await wait_task
                if self.processes.has_active(str(intent.runId)):
                    raise SchedulerError("RUN_PROCESS_UNCONFIRMED")
                if not active.gate.terminal:
                    raise SchedulerError("EXECUTOR_PROTOCOL_ERROR")
                outcome = (
                    "failed" if active.provider_failed
                    else "completed" if provider_outcome == "completed" else "cancelled"
                )
            result = RunAttemptResult(
                runId=intent.runId, attemptId=intent.attemptId,
                workspaceLeaseId=intent.workspaceLeaseId, leaseEpoch=intent.leaseEpoch,
                contractRevision=request.attempt.contractRevision,
                configHash=intent.configHash, outcome=outcome,
                providerSessionRef=handle.provider_session_id,
                lastEventSequence=active.gate.sequence, timestamp=datetime.now(UTC).isoformat(
                    timespec="milliseconds"
                ).replace("+00:00", "Z"),
            )
            self._save_checkpoint(active)
            try:
                preview = await capture_run_diff(workspace)
            except Exception:
                preview = RunDiffPreview(
                    files=[], text="Diff preview unavailable; workspace inspection failed",
                    truncated=True, capturedAt=datetime.now(UTC).isoformat(
                        timespec="milliseconds"
                    ).replace("+00:00", "Z"),
                )
            self.inspections.save_diff(intent.projectId, intent.runId, preview)
            disposition, terminal = self.runs.complete(
                intent.projectId, intent.runId, result, verified_stopped=True
            )
            if disposition != "APPLIED":
                raise SchedulerError("RUN_RESULT_NOT_APPLIED")
            await self.workspaces.release_lease(
                workspace.workspaceId, intent.workspaceLeaseId, str(intent.runId)
            )
            workspace_released = True
            return terminal
        except BaseException:
            if not active.begun:
                try:
                    await self.workspaces.release_lease(
                        workspace.workspaceId, intent.workspaceLeaseId, str(intent.runId)
                    )
                except Exception:
                    await self.workspaces.quarantine(workspace.workspaceId)
            else:
                if active.handle is None and active.safe_start_no_effect:
                    if active.cancel_requested:
                        safe_result = RunAttemptResult(
                            runId=intent.runId, attemptId=intent.attemptId,
                            workspaceLeaseId=intent.workspaceLeaseId,
                            leaseEpoch=intent.leaseEpoch,
                            contractRevision=request.attempt.contractRevision,
                            configHash=intent.configHash, outcome="cancelled",
                            providerSessionRef=None, lastEventSequence=0,
                            timestamp=datetime.now(UTC).isoformat(
                                timespec="milliseconds"
                            ).replace("+00:00", "Z"),
                        )
                        disposition, terminal = self.runs.complete(
                            intent.projectId, intent.runId, safe_result,
                            verified_stopped=not self.processes.has_active(str(intent.runId)),
                        )
                        if disposition == "APPLIED":
                            await self.workspaces.release_lease(
                                workspace.workspaceId, intent.workspaceLeaseId, str(intent.runId)
                            )
                            workspace_released = True
                            return terminal
                    else:
                        terminal = self.runs.block_no_side_effect(
                            intent.projectId, intent.runId, intent.attemptId,
                            "rate_limit_exhausted",
                        )
                        await self.workspaces.release_lease(
                            workspace.workspaceId, intent.workspaceLeaseId, str(intent.runId)
                        )
                        workspace_released = True
                        return terminal
                if (
                    active.provider_failed and not active.protocol_failed
                    and not active.cancel_requested and active.handle is not None
                    and not self.processes.has_active(str(intent.runId))
                ):
                    current = self.runs.get(intent.projectId, intent.runId)
                    if current is not None and current.state == "running":
                        try:
                            self._save_checkpoint(active)
                            failed_result = RunAttemptResult(
                                runId=intent.runId, attemptId=intent.attemptId,
                                workspaceLeaseId=intent.workspaceLeaseId,
                                leaseEpoch=intent.leaseEpoch,
                                contractRevision=request.attempt.contractRevision,
                                configHash=intent.configHash, outcome="failed",
                                providerSessionRef=active.handle.provider_session_id,
                                lastEventSequence=active.gate.sequence,
                                timestamp=datetime.now(UTC).isoformat(
                                    timespec="milliseconds"
                                ).replace("+00:00", "Z"),
                            )
                            disposition, terminal = self.runs.complete(
                                intent.projectId, intent.runId, failed_result,
                                verified_stopped=True,
                            )
                            if disposition == "APPLIED":
                                await self.workspaces.release_lease(
                                    workspace.workspaceId, intent.workspaceLeaseId,
                                    str(intent.runId),
                                )
                                workspace_released = True
                                return terminal
                        except Exception:
                            pass
                confirmed = await self._cancel_owned(active)
                try:
                    self._save_checkpoint(active)
                except Exception:
                    pass
                if terminal is None:
                    reason: Literal[
                        "launch_unknown", "process_unconfirmed", "cancel_unconfirmed"
                    ] = "launch_unknown" if active.handle is None else (
                        "cancel_unconfirmed" if active.cancel_requested else "process_unconfirmed"
                    )
                    terminal = self.runs.interrupt_uncertain(
                        intent.projectId, intent.runId, intent.attemptId, reason
                    )
                if not confirmed or terminal.state == "interrupted" or not workspace_released:
                    await self.workspaces.quarantine(workspace.workspaceId)
            raise
        finally:
            if timer:
                timer.cancel()
                await asyncio.gather(timer, return_exceptions=True)
            if wait_task and not wait_task.done():
                wait_task.cancel()
                await asyncio.gather(wait_task, return_exceptions=True)
            if cancel_task and not cancel_task.done():
                cancel_task.cancel()
                await asyncio.gather(cancel_task, return_exceptions=True)
            if active.handle:
                try:
                    await active.handle.dispose()
                except Exception:
                    pass
            if terminal is not None and not active.done.done():
                active.done.set_result(terminal)
            elif not active.done.done():
                active.done.cancel()
            self.active.pop(intent.runId, None)

    async def shutdown(self) -> list[RunView]:
        self.accepting = False
        pending = [
            self.cancel(item.intent.projectId, item.intent.runId, "shutdown")
            for item in self.active.values() if item.begun
        ]
        return await asyncio.gather(*pending)
