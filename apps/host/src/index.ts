import {
  forgeError, hostProtocolVersion, hostWireRequestSchema, hostWireResponseSchema,
  systemCommandResultSchema, type HostWireResponse, type SystemCommandResult,
  projectCommandResultSchema, type ProjectCommandEnvelope, type ProjectCommandResult,
  conversationCommandResultSchema, type ConversationCommandEnvelope, type ConversationCommandResult,
  draftCommandResultSchema, type DraftCommandEnvelope, type DraftCommandResult,
  type TaskDraft, type DraftRevision,
  approvalCommandResultSchema, type ApprovalCommandEnvelope, type ApprovalCommandResult,
  boardCommandResultSchema, type BoardCommandEnvelope, type BoardCommandResult,
  runCommandResultSchema, type RunCommandEnvelope, type RunCommandResult,
} from '@forge/contracts';
import { SystemCommandBus } from '@forge/core/commands';
import { DraftRevisionError } from '@forge/core/task-revisions';
import { ForgePersistence, mapDatabaseError, PersistenceError, ProjectStorageError,
  ConversationStorageError, DraftStorageError, BoardStorageError, RunStorageError } from '@forge/persistence';
import { TaskApprovalStorageError } from '@forge/persistence';
import { ProcessController } from '@forge/process';
import { WorkspaceManager } from '@forge/workspace';
import { join } from 'node:path';
import { getParentChannel } from './channel.js';
import { parseHostConfig } from './config.js';
import { logHost } from './log.js';
import { HostRuntime } from './runtime.js';
import { HostExecutorRegistry } from './executors.js';
import { ProjectError, ProjectService } from './projects.js';
import { ConversationService } from './conversations.js';
import { DraftService } from './drafts.js';
import { CodexRefinerModel } from './refiner-model.js';
import { HostRunResources } from './run-resources.js';
import { HostRunScheduler } from './run-scheduler.js';
import { HostSnapshotService } from './snapshots.js';
import { DevelopmentError, HostDevelopmentService } from './development.js';

async function start(): Promise<void> {
  const config = parseHostConfig(process.argv.slice(2), process.env);
  const channel = getParentChannel();
  if (channel && !config.ownershipToken) throw new Error('Missing Host ownership token');
  const runtime = new HostRuntime(config);
  const storage = new ForgePersistence(config.dataDir);
  const commands = new SystemCommandBus(runtime);
  const projects = new ProjectService(storage);
  const conversations = new ConversationService(storage, null,
    (event) => send({ kind: 'conversation-event', event }));
  const projectReceipts = new Map<string, { fingerprint: string; result: ProjectCommandResult }>();
  const conversationReceipts = new Map<string, { fingerprint: string; result: ConversationCommandResult }>();
  const processes = new ProcessController(runtime.hostId, join(config.dataDir, 'runtime', 'processes'));
  const refinerProcesses = new ProcessController(runtime.hostId, join(config.dataDir, 'runtime', 'refiner-processes'));
  const drafts = new DraftService(storage, new CodexRefinerModel(refinerProcesses));
  const workspaces = new WorkspaceManager(join(config.dataDir, 'workspaces'), runtime.hostId,
    (runId) => processes.hasActive(runId));
  const executors = new HostExecutorRegistry(processes);
  const runResources = new HostRunResources(executors, workspaces, processes);
  const runScheduler = new HostRunScheduler(storage, runResources, workspaces, processes, executors);
  const development = new HostDevelopmentService(storage, projects, workspaces, executors,
    runScheduler, new HostSnapshotService(storage, workspaces, processes));
  let authenticated = false;
  let stopping = false;
  let keepAlive: NodeJS.Timeout | undefined;

  function send(response: HostWireResponse): void {
    channel?.send(hostWireResponseSchema.parse(response));
  }

  function stop(exitCode: number): void {
    if (stopping) return;
    stopping = true;
    runtime.transition('stopping');
    logHost('stopping', { hostId: runtime.hostId, pid: runtime.pid, status: 'stopping' });
    if (keepAlive) clearInterval(keepAlive);
    setTimeout(() => { void (async () => {
      const cancellation = await Promise.allSettled([development.shutdown()]);
      const disposed = await Promise.allSettled([
        conversations.dispose(), drafts.dispose(), executors.dispose(),
      ]);
      if (cancellation.some((item) => item.status === 'rejected') ||
        disposed.some((item) => item.status === 'rejected')) {
        logHost('executor_shutdown_failed', { hostId: runtime.hostId, code: 'EXECUTOR_RUNTIME_ERROR' });
      }
      const quarantined = await workspaces.dispose();
      if (quarantined) logHost('workspaces_quarantined_on_shutdown', { hostId: runtime.hostId, count: quarantined });
      storage.close();
      runtime.transition('offline');
      logHost('stopped', { hostId: runtime.hostId, pid: runtime.pid, status: 'offline' });
      process.exit(exitCode);
    })(); }, 20);
  }

  function failCommand(commandId: string, code: 'UNAUTHENTICATED' | 'INTERNAL_ERROR'): SystemCommandResult {
    return {
      commandId, ok: false,
      error: forgeError(code, code === 'UNAUTHENTICATED' ? 'Host handshake is required' : 'Host command failed', commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString(),
    };
  }

  async function executeProject(command: ProjectCommandEnvelope): Promise<ProjectCommandResult> {
    const started = Date.now();
    const fingerprint = JSON.stringify([command.type, command.payload, command.protocolVersion]);
    const previous = projectReceipts.get(command.commandId);
    if (previous) return previous.fingerprint === fingerprint ? previous.result : {
      commandId: command.commandId, ok: false,
      error: forgeError('IDEMPOTENCY_CONFLICT', 'Command ID was reused', command.commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString(),
    };
    let result: ProjectCommandResult;
    try {
      if (!authenticated || command.protocolVersion !== hostProtocolVersion) {
        const code = authenticated ? 'PROTOCOL_MISMATCH' : 'UNAUTHENTICATED';
        return { commandId: command.commandId, ok: false,
          error: forgeError(code, authenticated ? 'Host protocol is incompatible' : 'Host handshake is required', command.commandId),
          durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() };
      }
      if (storage.health().status !== 'ready') throw new PersistenceError('DATABASE_OPEN_FAILED');
      let data: ProjectCommandResult & { ok: true } extends { data: infer T } ? T : never;
      switch (command.type) {
        case 'project.probe': data = await projects.probe(command.payload.rootPath); break;
        case 'project.create': data = await projects.create(command.payload.rootPath, command.payload.fingerprint,
          command.payload.trustVersion, command.payload.approved, command.payload.expectedRevision); break;
        case 'project.list': data = projects.list(); break;
        case 'project.get': data = projects.get(command.payload.projectId); break;
        case 'project.active': data = projects.active(); break;
        case 'project.setActive': data = projects.setActive(command.payload.projectId, command.payload.expectedRevision); break;
        case 'project.update': data = projects.update(command.payload.projectId, command.payload.expectedRevision, command.payload); break;
        case 'project.remove': data = projects.remove(command.payload.projectId, command.payload.expectedRevision); break;
        case 'environment.save': data = projects.saveEnvironment(command.payload); break;
        case 'environment.list': data = projects.listEnvironments(command.payload.projectId); break;
        case 'environment.get': data = projects.getEnvironment(command.payload.projectId, command.payload.environmentId); break;
        case 'environment.archive': data = projects.archiveEnvironment(command.payload.projectId,
          command.payload.environmentId, command.payload.expectedRevision); break;
        case 'commandPreset.save': data = await projects.saveCommandPreset(command.payload); break;
        case 'commandPreset.list': data = projects.listCommandPresets(command.payload.projectId,
          command.payload.environmentId); break;
        case 'commandPreset.get': data = projects.getCommandPreset(command.payload.projectId, command.payload.presetId); break;
        case 'commandPreset.approve': data = await projects.approveCommandPreset(command.payload.projectId,
          command.payload.presetId, command.payload.expectedRevision, command.payload.scriptsHash); break;
        case 'commandPreset.archive': data = projects.archiveCommandPreset(command.payload.projectId,
          command.payload.presetId, command.payload.expectedRevision); break;
      }
      result = projectCommandResultSchema.parse({ commandId: command.commandId, ok: true, data,
        durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof ProjectError || error instanceof ProjectStorageError ? error.code
        : error instanceof PersistenceError ? error.code : 'INTERNAL_ERROR';
      const message = error instanceof ProjectError ? error.message
        : error instanceof ProjectStorageError ? error.code
        : error instanceof PersistenceError ? error.message : 'Project request failed';
      result = projectCommandResultSchema.parse({ commandId: command.commandId, ok: false,
        error: forgeError(code, message, command.commandId),
        durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
    }
    projectReceipts.set(command.commandId, { fingerprint, result });
    if (projectReceipts.size > 256) projectReceipts.delete(projectReceipts.keys().next().value ?? '');
    return result;
  }

  function executeConversation(command: ConversationCommandEnvelope): ConversationCommandResult {
    const started = Date.now();
    const fingerprint = JSON.stringify([command.type, command.payload, command.protocolVersion]);
    const previous = conversationReceipts.get(command.commandId);
    if (previous) return previous.fingerprint === fingerprint ? previous.result : {
      commandId: command.commandId, ok: false,
      error: forgeError('IDEMPOTENCY_CONFLICT', 'Command ID was reused', command.commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString(),
    };
    let result: ConversationCommandResult;
    try {
      if (!authenticated || command.protocolVersion !== hostProtocolVersion) {
        const code = authenticated ? 'PROTOCOL_MISMATCH' : 'UNAUTHENTICATED';
        return { commandId: command.commandId, ok: false,
          error: forgeError(code, code === 'UNAUTHENTICATED' ? 'Host handshake is required' : 'Host protocol is incompatible', command.commandId),
          durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() };
      }
      if (storage.health().status !== 'ready') throw new PersistenceError('DATABASE_OPEN_FAILED');
      let data: ConversationCommandResult & { ok: true } extends { data: infer T } ? T : never;
      switch (command.type) {
        case 'conversation.create': data = conversations.create(command.payload.projectId,
          command.payload.title, command.payload.expectedRevision); break;
        case 'conversation.list': data = conversations.list(command.payload.projectId); break;
        case 'conversation.get': data = conversations.get(command.payload.projectId,
          command.payload.conversationId); break;
        case 'conversation.messages': data = conversations.messages(command.payload.projectId,
          command.payload.conversationId); break;
        case 'conversation.send': data = conversations.send(command.payload); break;
        case 'intent.propose': data = conversations.propose(command.payload.projectId,
          command.payload.conversationId, command.payload.messageId); break;
        case 'conversation.cancel': data = { cancelled: conversations.cancel(command.payload.projectId,
          command.payload.conversationId) }; break;
        case 'conversation.archive': data = conversations.archive(command.payload.projectId,
          command.payload.conversationId, command.payload.expectedRevision); break;
      }
      result = conversationCommandResultSchema.parse({ commandId: command.commandId, ok: true,
        data, durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof ConversationStorageError || error instanceof PersistenceError
        ? error.code : 'INTERNAL_ERROR';
      result = conversationCommandResultSchema.parse({ commandId: command.commandId, ok: false,
        error: forgeError(code, error instanceof ConversationStorageError ? error.code
          : error instanceof PersistenceError ? error.message : 'Conversation request failed', command.commandId),
        durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
    }
    conversationReceipts.set(command.commandId, { fingerprint, result });
    if (conversationReceipts.size > 256) conversationReceipts.delete(conversationReceipts.keys().next().value ?? '');
    return result;
  }

  function executeDraft(command: DraftCommandEnvelope): DraftCommandResult {
    const started = Date.now();
    try {
      if (!authenticated || command.protocolVersion !== hostProtocolVersion) {
        const code = authenticated ? 'PROTOCOL_MISMATCH' : 'UNAUTHENTICATED';
        return draftCommandResultSchema.parse({ commandId: command.commandId, ok: false,
          error: forgeError(code, code === 'UNAUTHENTICATED' ? 'Host handshake is required' :
            'Host protocol is incompatible', command.commandId),
          durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
      }
      if (storage.health().status !== 'ready') throw new PersistenceError('DATABASE_OPEN_FAILED');
      let data: TaskDraft | TaskDraft[] | DraftRevision[] | null;
      switch (command.type) {
        case 'draft.generate': data = drafts.generate(command.payload); break;
        case 'draft.manual': data = drafts.manual(command.payload); break;
        case 'draft.list': data = drafts.list(command.payload.projectId, command.payload.conversationId); break;
        case 'draft.get': data = drafts.get(command.payload.projectId, command.payload.draftId); break;
        case 'draft.updateText': data = drafts.updateText(command.payload.projectId,
          command.payload.draftId, command.payload.expectedRevision, command.payload.editableText); break;
        case 'draft.revise': data = drafts.revise(command.payload); break;
        case 'draft.history': data = drafts.history(command.payload.projectId, command.payload.draftId); break;
      }
      return draftCommandResultSchema.parse({ commandId: command.commandId, ok: true, data,
        durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof DraftStorageError || error instanceof DraftRevisionError ||
        error instanceof PersistenceError ? error.code : 'INTERNAL_ERROR';
      return draftCommandResultSchema.parse({ commandId: command.commandId, ok: false,
        error: forgeError(code, code, command.commandId), durationMs: Date.now() - started,
        hostTimestamp: new Date().toISOString() });
    }
  }

  function executeApproval(command: ApprovalCommandEnvelope): ApprovalCommandResult {
    const started = Date.now();
    try {
      if (!authenticated || command.protocolVersion !== hostProtocolVersion) {
        const code = authenticated ? 'PROTOCOL_MISMATCH' : 'UNAUTHENTICATED';
        return approvalCommandResultSchema.parse({ commandId: command.commandId, ok: false,
          error: forgeError(code, code, command.commandId), durationMs: Date.now() - started,
          hostTimestamp: new Date().toISOString() });
      }
      if (storage.health().status !== 'ready') throw new PersistenceError('DATABASE_OPEN_FAILED');
      const data = command.type === 'approval.request' ? storage.requestTaskApproval(command.payload) :
        command.type === 'approval.decide' ? storage.decideTaskApproval(command.payload) :
          storage.taskApprovalForDraft(command.payload.projectId, command.payload.draftId);
      return approvalCommandResultSchema.parse({ commandId: command.commandId, ok: true, data,
        durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof TaskApprovalStorageError || error instanceof PersistenceError ?
        error.code : 'INTERNAL_ERROR';
      return approvalCommandResultSchema.parse({ commandId: command.commandId, ok: false,
        error: forgeError(code, code, command.commandId), durationMs: Date.now() - started,
        hostTimestamp: new Date().toISOString() });
    }
  }

  function executeBoard(command: BoardCommandEnvelope): BoardCommandResult {
    const started = Date.now();
    try {
      if (!authenticated || command.protocolVersion !== hostProtocolVersion) {
        const code = authenticated ? 'PROTOCOL_MISMATCH' : 'UNAUTHENTICATED';
        return boardCommandResultSchema.parse({ commandId: command.commandId, ok: false,
          error: forgeError(code, code, command.commandId), durationMs: Date.now() - started,
          hostTimestamp: new Date().toISOString() });
      }
      if (storage.health().status !== 'ready') throw new PersistenceError('DATABASE_OPEN_FAILED');
      const data = command.type === 'board.snapshot' ? storage.boardSnapshot(command.payload.projectId) :
        command.type === 'task.detail' ? storage.taskDetail(command.payload.projectId,
          command.payload.taskId) : storage.reorderBoard(command.payload);
      return boardCommandResultSchema.parse({ commandId: command.commandId, ok: true, data,
        durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof BoardStorageError || error instanceof PersistenceError ?
        error.code : 'INTERNAL_ERROR';
      return boardCommandResultSchema.parse({ commandId: command.commandId, ok: false,
        error: forgeError(code, code, command.commandId), durationMs: Date.now() - started,
        hostTimestamp: new Date().toISOString() });
    }
  }

  async function executeRun(command: RunCommandEnvelope): Promise<RunCommandResult> {
    const started = Date.now();
    try {
      if (!authenticated || command.protocolVersion !== hostProtocolVersion) {
        const code = authenticated ? 'PROTOCOL_MISMATCH' : 'UNAUTHENTICATED';
        return runCommandResultSchema.parse({ commandId: command.commandId, ok: false,
          error: forgeError(code, code, command.commandId), durationMs: Date.now() - started,
          hostTimestamp: new Date().toISOString() });
      }
      if (storage.health().status !== 'ready') throw new PersistenceError('DATABASE_OPEN_FAILED');
      if (command.type === 'run.reviewReports' || command.type === 'run.issueHistory' ||
        command.type === 'run.reviewJobs' || command.type === 'run.reviewJob' ||
        command.type === 'run.reviewStart' || command.type === 'run.verifyStart' ||
        command.type === 'run.verifyJobs' || command.type === 'run.verifyJob' ||
        command.type === 'run.verifyReport' || command.type === 'run.verifyArtifact' ||
        command.type === 'run.acceptanceMatrix' || command.type === 'run.acceptanceDecide' ||
        command.type === 'run.reworkCycles' || command.type === 'run.finalAcceptance' ||
        command.type === 'run.finalDecide' || command.type === 'run.issueWaive' ||
        command.type === 'deliveries.get' || command.type === 'deliveries.preview' ||
        command.type === 'deliveries.merge' || command.type === 'task.change.get' ||
        command.type === 'task.change.propose' || command.type === 'task.change.decide' ||
        command.type === 'task.change.apply') {
        return runCommandResultSchema.parse({ commandId: command.commandId, ok: false,
          error: forgeError('UNKNOWN_COMMAND', 'Python Host owns Review and Verify', command.commandId),
          durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
      }
      const data = command.type === 'run.list' ? storage.listTaskRuns(command.payload.projectId,
        command.payload.taskId) : command.type === 'run.inspect' ?
        storage.inspectRun(command.payload.projectId, command.payload.runId,
          command.payload.afterCursor, command.payload.limit) :
        command.type === 'run.capabilities' ? await development.capabilities(
          command.payload.projectId, command.payload.taskId) :
          command.type === 'run.start' ? await development.start(command.payload) :
            command.type === 'run.cancel' ? development.cancel(command.payload.projectId,
              command.payload.runId) : development.handoff(command.payload.projectId,
                command.payload.runId);
      return runCommandResultSchema.parse({ commandId: command.commandId, ok: true, data,
        durationMs: Date.now() - started, hostTimestamp: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof DevelopmentError || error instanceof RunStorageError ||
        error instanceof PersistenceError ? error.code : 'INTERNAL_ERROR';
      return runCommandResultSchema.parse({ commandId: command.commandId, ok: false,
        error: forgeError(code === 'RUN_NOT_FOUND' || code === 'RUN_CONFLICT' ||
          code === 'RUN_START_FAILED' || code === 'RUN_CANCEL_FAILED' ||
          code === 'RUN_DELIVERY_FAILED' || code === 'MODEL_UNAVAILABLE' ||
          code === 'PROJECT_TRUST_REQUIRED' || code === 'TASK_NOT_FOUND' ||
          code === 'REVISION_CONFLICT' ? code : code === 'INTERNAL_ERROR' ? code :
            'DATABASE_IO_ERROR', code, command.commandId), durationMs: Date.now() - started,
        hostTimestamp: new Date().toISOString() });
    }
  }

  channel?.onMessage((raw) => {
    const parsed = hostWireRequestSchema.safeParse(raw);
    if (!parsed.success) {
      const requestId = typeof raw === 'object' && raw !== null && 'requestId' in raw && typeof raw.requestId === 'string'
        && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(raw.requestId) ? raw.requestId : null;
      logHost('invalid_request', { hostId: runtime.hostId, code: 'VALIDATION_ERROR' });
      if (requestId) send({ kind: 'protocol-error', requestId, error: forgeError('VALIDATION_ERROR', 'Invalid Host protocol request', requestId) });
      return;
    }
    const request = parsed.data;
    switch (request.kind) {
      case 'hello': {
        const code = request.ownershipToken !== config.ownershipToken ? 'UNAUTHENTICATED'
          : request.protocolVersion !== hostProtocolVersion ? 'PROTOCOL_MISMATCH'
            : request.productVersion !== config.productVersion || request.hostVersion !== config.hostVersion ? 'VERSION_MISMATCH' : null;
        if (code) {
          send({ kind: 'hello-result', requestId: request.requestId, ok: false,
            error: forgeError(code, code === 'PROTOCOL_MISMATCH' ? 'Host protocol is incompatible' : code === 'VERSION_MISMATCH' ? 'Host version is incompatible' : 'Host ownership is invalid', request.requestId) });
          logHost('handshake_rejected', { hostId: runtime.hostId, code });
          break;
        }
        authenticated = true;
        send({ kind: 'hello-result', requestId: request.requestId, ok: true, info: runtime.info() });
        logHost('handshake_accepted', { hostId: runtime.hostId, pid: runtime.pid, status: 'ready' });
        break;
      }
      case 'command': {
        let result: SystemCommandResult;
        try {
          result = authenticated
            ? commands.execute(request.command, { transport: config.transport, callerId: `host-channel:${runtime.hostId}` })
            : failCommand(request.command.commandId, 'UNAUTHENTICATED');
          result = systemCommandResultSchema.parse(result);
        } catch {
          result = failCommand(request.command.commandId, 'INTERNAL_ERROR');
          logHost('command_failed', { hostId: runtime.hostId, code: 'INTERNAL_ERROR' });
        }
        send({ kind: 'command-result', requestId: request.requestId, result });
        break;
      }
      case 'project-command': {
        void executeProject(request.command).then((result) => {
          send({ kind: 'project-command-result', requestId: request.requestId, result });
        });
        break;
      }
      case 'conversation-command': {
        send({ kind: 'conversation-command-result', requestId: request.requestId,
          result: executeConversation(request.command) });
        break;
      }
      case 'draft-command': {
        send({ kind: 'draft-command-result', requestId: request.requestId,
          result: executeDraft(request.command) });
        break;
      }
      case 'approval-command': {
        send({ kind: 'approval-command-result', requestId: request.requestId,
          result: executeApproval(request.command) });
        break;
      }
      case 'board-command': {
        send({ kind: 'board-command-result', requestId: request.requestId,
          result: executeBoard(request.command) });
        break;
      }
      case 'run-command': {
        void executeRun(request.command).then((result) => {
          send({ kind: 'run-command-result', requestId: request.requestId, result });
        });
        break;
      }
      case 'shutdown': {
        if (request.ownershipToken !== config.ownershipToken || request.hostId !== runtime.hostId) {
          send({ kind: 'shutdown-result', requestId: request.requestId, ok: false,
            error: forgeError('UNAUTHENTICATED', 'Host ownership is invalid', request.requestId) });
          break;
        }
        send({ kind: 'shutdown-result', requestId: request.requestId, ok: true, hostId: runtime.hostId });
        stop(0);
        break;
      }
    }
  });

  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
  process.on('disconnect', () => stop(0));
  process.on('uncaughtException', () => {
    logHost('fatal', { hostId: runtime.hostId, code: 'UNCAUGHT_EXCEPTION' });
    stop(1);
  });
  process.on('unhandledRejection', () => {
    logHost('fatal', { hostId: runtime.hostId, code: 'UNHANDLED_REJECTION' });
    stop(1);
  });

  await workspaces.open();
  const [orphanProcesses, orphanWorkspaces] = await Promise.all([
    processes.inspectOrphans(), workspaces.inspectOrphans(),
  ]);
  if (orphanProcesses.length) logHost('orphan_process_records_detected', { hostId: runtime.hostId, count: orphanProcesses.length });
  if (orphanWorkspaces.length) logHost('orphan_workspaces_detected', { hostId: runtime.hostId, count: orphanWorkspaces.length });
  try {
    await storage.open();
    storage.migrate();
    const interruptedConversations = storage.recoverInterruptedConversations();
    const interruptedDrafts = storage.recoverInterruptedTaskDrafts();
    if (interruptedDrafts) logHost('draft_generation_interrupted', { hostId: runtime.hostId, count: interruptedDrafts });
    if (interruptedConversations) logHost('conversation_streams_interrupted', {
      hostId: runtime.hostId, count: interruptedConversations });
    storage.recordHostStart(runtime.hostId);
    runtime.transition('ready');
    runtime.setStorageProbe(() => storage.health());
    runtime.setStorageHealth(storage.health());
  } catch (error) {
    const mapped = mapDatabaseError(error, 'DATABASE_OPEN_FAILED');
    storage.close();
    runtime.transition('ready');
    runtime.setStorageHealth({ status: 'unavailable', schemaVersion: null, sqliteVersion: null,
      journalMode: 'unknown', error: mapped.toForgeError('storage-startup') });
    logHost('storage_unavailable', { hostId: runtime.hostId, pid: runtime.pid, code: mapped.code });
  }
  logHost('ready', { hostId: runtime.hostId, pid: runtime.pid, status: runtime.info().status });
  send({ kind: 'ready', info: runtime.info() });
  if (!channel) keepAlive = setInterval(() => {}, 60_000);
}

void start().catch(() => {
  logHost('startup_failed', { code: 'HOST_STARTUP_FAILED' });
  process.exitCode = 2;
});
