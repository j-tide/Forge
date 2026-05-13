import { randomUUID } from 'node:crypto';
import { utilityProcess, type UtilityProcess } from 'electron';
import {
  forgeError, hostConnectionSnapshotSchema, hostHealthSchema, hostProtocolVersion,
  hostWireRequestSchema, hostWireResponseSchema, systemCommandEnvelopeSchema,
  systemCommandResultSchema, type ForgeError, type HostConnectionSnapshot,
  type HostInfo, type HostWireRequest, type HostWireResponse,
  type SystemCommandEnvelope, type SystemCommandResult,
} from '@forge/contracts';

export const hostLifecycleConfig = Object.freeze({
  startupTimeoutMs: 8000,
  requestTimeoutMs: 4000,
  healthIntervalMs: 3000,
  shutdownTimeoutMs: 8000,
  terminateTimeoutMs: 1000,
});

type ErrorCode = ForgeError['code'];

class HostConnectionError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); }
}

interface OwnedHost {
  child: UtilityProcess;
  token: string;
  pid: number | null;
  hostId: string | null;
  exited: boolean;
  exitPromise: Promise<number>;
  resolveExit: (code: number) => void;
}

interface PendingRequest {
  resolve: (response: HostWireResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class HostController {
  private snapshot: HostConnectionSnapshot = {
    revision: 0, state: 'unavailable', info: null, health: null, lastHealthCheck: null,
    error: forgeError('HOST_UNAVAILABLE', 'Local Host has not started', 'host-startup'),
  };
  private owned: OwnedHost | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private pendingReady: { resolve: (info: HostInfo) => void; reject: (error: Error) => void } | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private probing = false;
  private starting: Promise<void> | null = null;
  private tearingDown = false;

  constructor(
    private readonly hostEntryPath: string,
    private readonly productVersion: string,
    private readonly hostVersion: string,
    private readonly hostDataDir: string,
    private readonly onStatus: (snapshot: HostConnectionSnapshot) => void,
  ) {}

  get status(): HostConnectionSnapshot { return this.snapshot; }
  get ownedPid(): number | null { return this.owned?.pid ?? null; }

  start(): Promise<void> {
    if (this.starting) return this.starting;
    if (this.owned) return Promise.resolve();
    this.starting = this.startInternal().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async startInternal(): Promise<void> {
    this.tearingDown = false;
    this.publish({ state: 'starting', info: null, health: null, lastHealthCheck: null, error: null });
    const token = randomUUID();
    let child: UtilityProcess;
    try {
      child = utilityProcess.fork(this.hostEntryPath, [], {
        serviceName: 'Forge Host',
        stdio: 'pipe',
        env: { FORGE_HOST_TRANSPORT: 'desktop', FORGE_HOST_OWNERSHIP_TOKEN: token,
          FORGE_HOST_DATA_DIR: this.hostDataDir },
      });
    } catch {
      this.publish({ state: 'unavailable', info: null, health: null, lastHealthCheck: null,
        error: forgeError('HOST_STARTUP_FAILED', 'Host startup failed', randomUUID()) });
      this.log('startup_failed', { code: 'HOST_STARTUP_FAILED' });
      return;
    }
    let resolveExit: (code: number) => void = () => {};
    const exitPromise = new Promise<number>((resolve) => { resolveExit = resolve; });
    const owned: OwnedHost = { child, token, pid: null, hostId: null, exited: false, exitPromise, resolveExit };
    this.owned = owned;
    child.on('spawn', () => { owned.pid = child.pid ?? null; this.log('spawn', { pid: owned.pid }); });
    child.on('message', (raw: unknown) => this.onMessage(owned, raw));
    child.on('exit', (code) => this.onExit(owned, code));
    child.on('error', () => this.log('process_error', { code: 'HOST_EXITED' }));
    child.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().trim();
      if (lines) process.stderr.write(`${lines}\n`);
    });

    try {
      const readyInfo = await this.waitReady();
      if (this.tearingDown) throw new HostConnectionError('HOST_EXITED', 'Host startup was stopped');
      this.validateIdentity(owned, readyInfo);
      owned.hostId = readyInfo.hostId;
      const hello = await this.request(owned, {
        kind: 'hello', requestId: randomUUID(), protocolVersion: hostProtocolVersion,
        productVersion: this.productVersion, hostVersion: this.hostVersion, ownershipToken: token,
      });
      if (hello.kind !== 'hello-result') throw new HostConnectionError('INVALID_RESPONSE', 'Invalid Host handshake response');
      if (!hello.ok) throw new HostConnectionError(hello.error.code, hello.error.message);
      this.validateIdentity(owned, hello.info);
      if (hello.info.hostId !== owned.hostId || hello.info.protocolVersion !== hostProtocolVersion
        || hello.info.productVersion !== this.productVersion || hello.info.version !== this.hostVersion) {
        throw new HostConnectionError('PROTOCOL_MISMATCH', 'Host version handshake is incompatible');
      }
      const health = await this.probe(owned);
      if (this.tearingDown) throw new HostConnectionError('HOST_EXITED', 'Host startup was stopped');
      this.publish({ state: health.status === 'degraded' ? 'degraded' : 'connected', info: this.infoFromHealth(health), health,
        lastHealthCheck: new Date().toISOString(), error: health.storage.error });
      this.healthTimer = setInterval(() => { void this.periodicProbe(owned); }, hostLifecycleConfig.healthIntervalMs);
      this.log('connected', { pid: owned.pid, hostId: owned.hostId });
    } catch (error) {
      const code = error instanceof HostConnectionError ? error.code : 'HOST_STARTUP_FAILED';
      const incompatible = code === 'PROTOCOL_MISMATCH' || code === 'VERSION_MISMATCH';
      this.publish({ state: incompatible ? 'incompatible' : 'unavailable', info: null, health: null,
        lastHealthCheck: null, error: forgeError(code, this.safeMessage(code), randomUUID()) });
      this.log('startup_failed', { code });
      await this.terminateOwned(owned);
    }
  }

  private waitReady(): Promise<HostInfo> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingReady = null;
        reject(new HostConnectionError('HOST_STARTUP_FAILED', 'Host readiness timed out'));
      }, hostLifecycleConfig.startupTimeoutMs);
      this.pendingReady = {
        resolve: (info) => { clearTimeout(timer); this.pendingReady = null; resolve(info); },
        reject: (error) => { clearTimeout(timer); this.pendingReady = null; reject(error); },
      };
    });
  }

  private onMessage(owned: OwnedHost, raw: unknown): void {
    if (this.owned !== owned) return;
    const parsed = hostWireResponseSchema.safeParse(raw);
    if (!parsed.success) {
      this.pendingReady?.reject(new HostConnectionError('INVALID_RESPONSE', 'Invalid Host response'));
      this.rejectPending(new HostConnectionError('INVALID_RESPONSE', 'Invalid Host response'));
      return;
    }
    const response = parsed.data;
    if (response.kind === 'ready') {
      this.pendingReady?.resolve(response.info);
      return;
    }
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    clearTimeout(pending.timer);
    if (response.kind === 'protocol-error') pending.reject(new HostConnectionError(response.error.code, response.error.message));
    else pending.resolve(response);
  }

  private onExit(owned: OwnedHost, code: number): void {
    owned.exited = true;
    owned.resolveExit(code);
    this.pendingReady?.reject(new HostConnectionError('HOST_EXITED', 'Host exited during startup'));
    this.rejectPending(new HostConnectionError('HOST_EXITED', 'Host process exited'));
    this.clearHealthTimer();
    if (this.owned === owned) this.owned = null;
    this.log('exited', { pid: owned.pid, hostId: owned.hostId, code: String(code) });
    if (!this.tearingDown) {
      this.publish({ state: 'crashed', info: null, health: null, lastHealthCheck: null,
        error: forgeError('HOST_EXITED', 'Host process exited', randomUUID()) });
    } else if (this.snapshot.state !== 'incompatible') {
      this.publish({ state: 'unavailable', info: null, health: null, lastHealthCheck: null,
        error: forgeError('HOST_UNAVAILABLE', 'Local Host stopped', randomUUID()) });
    }
  }

  private request(owned: OwnedHost, request: HostWireRequest): Promise<HostWireResponse> {
    if (owned.exited || this.owned !== owned) return Promise.reject(new HostConnectionError('HOST_EXITED', 'Host process exited'));
    const validated = hostWireRequestSchema.parse(request);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(validated.requestId);
        reject(new HostConnectionError('TRANSPORT_TIMEOUT', 'Host request timed out'));
      }, hostLifecycleConfig.requestTimeoutMs);
      this.pending.set(validated.requestId, { resolve, reject, timer });
      try { owned.child.postMessage(validated); }
      catch {
        clearTimeout(timer);
        this.pending.delete(validated.requestId);
        reject(new HostConnectionError('HOST_EXITED', 'Host message channel closed'));
      }
    });
  }

  private async probe(owned: OwnedHost): Promise<ReturnType<typeof hostHealthSchema.parse>> {
    const command = this.systemCommand('system.health');
    const response = await this.request(owned, { kind: 'command', requestId: randomUUID(), command });
    if (response.kind !== 'command-result' || !response.result.ok) {
      throw new HostConnectionError('INVALID_RESPONSE', 'Host health response is invalid');
    }
    const health = hostHealthSchema.safeParse(response.result.data);
    if (!health.success || health.data.hostId !== owned.hostId || health.data.pid !== owned.pid
      || health.data.protocolVersion !== hostProtocolVersion || !['ready', 'degraded'].includes(health.data.status)) {
      throw new HostConnectionError('INVALID_RESPONSE', 'Host health identity is invalid');
    }
    return health.data;
  }

  private async periodicProbe(owned: OwnedHost): Promise<void> {
    if (this.probing || this.owned !== owned) return;
    this.probing = true;
    try {
      const health = await this.probe(owned);
      if (this.owned === owned) this.publish({ state: health.status === 'degraded' ? 'degraded' : 'connected',
        info: this.infoFromHealth(health), health, lastHealthCheck: new Date().toISOString(), error: health.storage.error });
    } catch (error) {
      if (this.owned === owned) {
        const code = error instanceof HostConnectionError ? error.code : 'INVALID_RESPONSE';
        this.publish({ state: 'unavailable', info: null, health: null, lastHealthCheck: null,
          error: forgeError(code, this.safeMessage(code), randomUUID()) });
      }
    } finally { this.probing = false; }
  }

  private systemCommand(type: string): SystemCommandEnvelope {
    return systemCommandEnvelopeSchema.parse({ schemaVersion: '1.0', commandId: randomUUID(), type,
      createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload: {} });
  }

  private infoFromHealth(health: ReturnType<typeof hostHealthSchema.parse>): HostInfo {
    return {
      status: health.status, hostId: health.hostId, pid: health.pid,
      version: health.version, productVersion: health.productVersion,
      startedAt: health.startedAt, protocolVersion: health.protocolVersion, runtime: health.runtime,
    };
  }

  async health(): Promise<SystemCommandResult> {
    return this.invokeSystem(this.systemCommand('system.health'));
  }

  async invokeSystem(raw: unknown): Promise<SystemCommandResult> {
    const parsed = systemCommandEnvelopeSchema.safeParse(raw);
    const commandId = parsed.success ? parsed.data.commandId : randomUUID();
    if (!parsed.success) return this.fail(commandId, 'VALIDATION_ERROR', 'Invalid system command');
    if (!['system.health', 'system.info', 'system.ping'].includes(parsed.data.type)) {
      return this.fail(commandId, 'UNKNOWN_COMMAND', 'System command is not registered');
    }
    const owned = this.owned;
    if (!owned || !['connected', 'degraded'].includes(this.snapshot.state)) {
      return this.fail(commandId, this.snapshot.error?.code ?? 'HOST_UNAVAILABLE', this.snapshot.error?.message ?? 'Local Host unavailable');
    }
    try {
      const response = await this.request(owned, { kind: 'command', requestId: randomUUID(), command: parsed.data });
      if (response.kind !== 'command-result') throw new HostConnectionError('INVALID_RESPONSE', 'Invalid Host command response');
      const result = systemCommandResultSchema.parse(response.result);
      if (result.commandId !== commandId) throw new HostConnectionError('INVALID_RESPONSE', 'Host command ID mismatch');
      if (parsed.data.type === 'system.health' && result.ok) {
        const health = hostHealthSchema.safeParse(result.data);
        if (!health.success || health.data.hostId !== owned.hostId || health.data.pid !== owned.pid) {
          throw new HostConnectionError('INVALID_RESPONSE', 'Host health identity is invalid');
        }
        this.publish({ state: health.data.status === 'degraded' ? 'degraded' : 'connected',
          info: this.infoFromHealth(health.data), health: health.data,
          lastHealthCheck: new Date().toISOString(), error: health.data.storage.error });
      }
      return result;
    } catch (error) {
      const code = error instanceof HostConnectionError ? error.code : 'INVALID_RESPONSE';
      if (this.owned === owned && (code === 'TRANSPORT_TIMEOUT' || code === 'INVALID_RESPONSE')) {
        this.publish({ state: 'unavailable', info: null, health: null, lastHealthCheck: null,
          error: forgeError(code, this.safeMessage(code), randomUUID()) });
      }
      return this.fail(commandId, code, this.safeMessage(code));
    }
  }

  private fail(commandId: string, code: ErrorCode, message: string): SystemCommandResult {
    return { commandId, ok: false, error: forgeError(code, message, commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString() };
  }

  async stop(): Promise<void> {
    const owned = this.owned;
    if (!owned) return;
    this.tearingDown = true;
    this.clearHealthTimer();
    if (owned.hostId && owned.pid && !owned.exited) {
      try {
        await this.request(owned, { kind: 'shutdown', requestId: randomUUID(), hostId: owned.hostId, ownershipToken: owned.token });
      } catch { this.log('shutdown_request_failed', { pid: owned.pid, hostId: owned.hostId }); }
    }
    await this.terminateOwned(owned);
  }

  private async terminateOwned(owned: OwnedHost): Promise<void> {
    this.tearingDown = true;
    this.clearHealthTimer();
    if (await this.waitExit(owned, hostLifecycleConfig.shutdownTimeoutMs)) return;
    if (this.owned !== owned || owned.exited) return;
    owned.child.kill();
    this.log('terminate_sent', { pid: owned.pid, hostId: owned.hostId });
    if (await this.waitExit(owned, hostLifecycleConfig.terminateTimeoutMs)) return;
    if (this.owned === owned && !owned.exited && owned.hostId && owned.pid
      && owned.child.pid === owned.pid && owned.token) {
      try {
        process.kill(owned.pid, process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL');
        this.log('force_terminate_sent', { pid: owned.pid, hostId: owned.hostId });
      } catch { /* The owned process may have exited between checks. */ }
      await this.waitExit(owned, hostLifecycleConfig.terminateTimeoutMs);
    }
  }

  private waitExit(owned: OwnedHost, timeoutMs: number): Promise<boolean> {
    if (owned.exited) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      void owned.exitPromise.then(() => { clearTimeout(timer); resolve(true); });
    });
  }

  private validateIdentity(owned: OwnedHost, info: HostInfo): void {
    if (!owned.child.pid || owned.child.pid !== info.pid || !['ready', 'degraded'].includes(info.status)) {
      throw new HostConnectionError('INVALID_RESPONSE', 'Host runtime identity is invalid');
    }
    owned.pid = info.pid;
  }

  private publish(next: Omit<HostConnectionSnapshot, 'revision'>): void {
    this.snapshot = hostConnectionSnapshotSchema.parse({ revision: this.snapshot.revision + 1, ...next });
    this.onStatus(this.snapshot);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  private clearHealthTimer(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  private safeMessage(code: ErrorCode): string {
    switch (code) {
      case 'PROTOCOL_MISMATCH': return 'Host protocol is incompatible';
      case 'VERSION_MISMATCH': return 'Host version is incompatible';
      case 'TRANSPORT_TIMEOUT': return 'Host request timed out';
      case 'INVALID_RESPONSE': return 'Host returned an invalid response';
      case 'HOST_EXITED': return 'Host process exited';
      default: return 'Host startup failed';
    }
  }

  private log(event: string, details: { pid?: number | null; hostId?: string | null; code?: string } = {}): void {
    process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), component: 'forge-desktop-host', event, ...details })}\n`);
  }
}
