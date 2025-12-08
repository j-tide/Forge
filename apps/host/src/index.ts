import {
  forgeError, hostProtocolVersion, hostWireRequestSchema, hostWireResponseSchema,
  systemCommandResultSchema, type HostWireResponse, type SystemCommandResult,
} from '@forge/contracts';
import { SystemCommandBus } from '@forge/core/commands';
import { ForgePersistence, mapDatabaseError } from '@forge/persistence';
import { ProcessController } from '@forge/process';
import { WorkspaceManager } from '@forge/workspace';
import { join } from 'node:path';
import { getParentChannel } from './channel.js';
import { parseHostConfig } from './config.js';
import { logHost } from './log.js';
import { HostRuntime } from './runtime.js';
import { HostExecutorRegistry } from './executors.js';

async function start(): Promise<void> {
  const config = parseHostConfig(process.argv.slice(2), process.env);
  const channel = getParentChannel();
  if (channel && !config.ownershipToken) throw new Error('Missing Host ownership token');
  const runtime = new HostRuntime(config);
  const storage = new ForgePersistence(config.dataDir);
  const commands = new SystemCommandBus(runtime);
  const processes = new ProcessController(runtime.hostId, join(config.dataDir, 'runtime', 'processes'));
  const workspaces = new WorkspaceManager(join(config.dataDir, 'workspaces'), runtime.hostId,
    (runId) => processes.hasActive(runId));
  const executors = new HostExecutorRegistry(processes);
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
      try { await executors.dispose(); }
      catch { logHost('executor_shutdown_failed', { hostId: runtime.hostId, code: 'EXECUTOR_RUNTIME_ERROR' }); }
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
