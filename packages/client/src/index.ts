import {
  forgeError, hostConnectionSnapshotSchema, hostProtocolVersion, systemCommandEnvelopeSchema,
  systemCommandResultSchema, type ForgeDesktopBridge, type HostConnectionSnapshot,
  type SystemCommandEnvelope, type SystemCommandResult,
} from '@forge/contracts';

export interface ForgeTransport {
  readonly status: HostConnectionSnapshot;
  connect(): Promise<HostConnectionSnapshot>;
  disconnect(): void;
  health(): Promise<SystemCommandResult>;
  invoke(command: SystemCommandEnvelope): Promise<SystemCommandResult>;
  subscribe(listener: (snapshot: HostConnectionSnapshot) => void): () => void;
}

const unavailableStatus: HostConnectionSnapshot = {
  revision: 0,
  state: 'unavailable', info: null, health: null, lastHealthCheck: null,
  error: forgeError('HOST_UNAVAILABLE', 'Local Host unavailable', 'web-local-host'),
};

function failed(commandId: string, code: 'HOST_UNAVAILABLE' | 'TRANSPORT_TIMEOUT' | 'INVALID_RESPONSE', message: string): SystemCommandResult {
  return { commandId, ok: false, error: forgeError(code, message, commandId, code === 'TRANSPORT_TIMEOUT'), durationMs: 0, hostTimestamp: new Date().toISOString() };
}

export class UnavailableTransport implements ForgeTransport {
  readonly status = unavailableStatus;
  async connect(): Promise<HostConnectionSnapshot> { return this.status; }
  disconnect(): void { /* No local process is owned by the Web page. */ }
  async health(): Promise<SystemCommandResult> { return failed('web-health', 'HOST_UNAVAILABLE', 'Local Host unavailable'); }
  async invoke(command: SystemCommandEnvelope): Promise<SystemCommandResult> {
    return failed(command.commandId, 'HOST_UNAVAILABLE', 'Local Host unavailable');
  }
  subscribe(listener: (snapshot: HostConnectionSnapshot) => void): () => void {
    listener(this.status);
    return () => {};
  }
}

export class LocalTransport implements ForgeTransport {
  private current: HostConnectionSnapshot = {
    revision: 0,
    state: 'starting', info: null, health: null, lastHealthCheck: null, error: null,
  };
  private readonly listeners = new Set<(snapshot: HostConnectionSnapshot) => void>();
  private unsubscribeBridge: (() => void) | null = null;

  constructor(private readonly bridge: ForgeDesktopBridge, private readonly timeoutMs = 4000) {}

  get status(): HostConnectionSnapshot { return this.current; }

  async connect(): Promise<HostConnectionSnapshot> {
    if (!this.unsubscribeBridge) {
      this.unsubscribeBridge = this.bridge.onHostStatus((raw) => this.update(raw));
    }
    try {
      const snapshot = await this.withTimeout(this.bridge.hostStatus());
      this.update(snapshot);
    } catch (error) {
      this.failure(error);
    }
    return this.current;
  }

  disconnect(): void {
    this.unsubscribeBridge?.();
    this.unsubscribeBridge = null;
    this.listeners.clear();
    this.current = unavailableStatus;
  }

  async health(): Promise<SystemCommandResult> {
    return this.call('health', () => this.bridge.hostHealth());
  }

  async invoke(command: SystemCommandEnvelope): Promise<SystemCommandResult> {
    const parsed = systemCommandEnvelopeSchema.safeParse(command);
    if (!parsed.success) return failed('invalid-command', 'INVALID_RESPONSE', 'Invalid local command');
    return this.call(command.commandId, () => this.bridge.invokeSystem(parsed.data));
  }

  subscribe(listener: (snapshot: HostConnectionSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => { this.listeners.delete(listener); };
  }

  private async call(commandId: string, action: () => Promise<SystemCommandResult>): Promise<SystemCommandResult> {
    try {
      const raw = await this.withTimeout(action());
      const parsed = systemCommandResultSchema.safeParse(raw);
      if (!parsed.success) throw new Error('INVALID_RESPONSE');
      return parsed.data;
    } catch (error) {
      this.failure(error);
      const timeout = error instanceof Error && error.message === 'TRANSPORT_TIMEOUT';
      return failed(commandId, timeout ? 'TRANSPORT_TIMEOUT' : 'INVALID_RESPONSE', timeout ? 'Local Host request timed out' : 'Local Host response is invalid');
    }
  }

  private update(raw: unknown): void {
    const parsed = hostConnectionSnapshotSchema.safeParse(raw);
    if (!parsed.success) { this.failure(new Error('INVALID_RESPONSE')); return; }
    if (parsed.data.revision < this.current.revision) return;
    this.current = parsed.data;
    for (const listener of this.listeners) listener(this.current);
  }

  private failure(error: unknown): void {
    const timeout = error instanceof Error && error.message === 'TRANSPORT_TIMEOUT';
    this.current = {
      revision: this.current.revision + 1,
      state: 'unavailable', info: null, health: null, lastHealthCheck: null,
      error: forgeError(timeout ? 'TRANSPORT_TIMEOUT' : 'INVALID_RESPONSE', timeout ? 'Local Host request timed out' : 'Local Host response is invalid', 'local-transport', timeout),
    };
    for (const listener of this.listeners) listener(this.current);
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('TRANSPORT_TIMEOUT')), this.timeoutMs); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export class ForgeClient {
  readonly transport: ForgeTransport;

  constructor(bridge?: ForgeDesktopBridge) {
    this.transport = bridge ? new LocalTransport(bridge) : new UnavailableTransport();
  }

  get status(): HostConnectionSnapshot { return this.transport.status; }
  connect(): Promise<HostConnectionSnapshot> { return this.transport.connect(); }
  disconnect(): void { this.transport.disconnect(); }
  health(): Promise<SystemCommandResult> { return this.transport.health(); }
  subscribe(listener: (snapshot: HostConnectionSnapshot) => void): () => void { return this.transport.subscribe(listener); }

  invoke(type: string): Promise<SystemCommandResult> {
    const command = systemCommandEnvelopeSchema.parse({
      schemaVersion: '1.0', commandId: crypto.randomUUID(), type,
      createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload: {},
    });
    return this.transport.invoke(command);
  }
}
