import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { forgeError, forgeErrorCodeSchema, hostConnectionSnapshotSchema, hostProtocolVersion,
  bundledPluginInspectionSchema, type BundledPluginInspection,
  agentProfileCatalogSchema, agentProfileSchema, agentProfileSaveSchema,
  type AgentProfileCatalog, type AgentProfile, type AgentProfileSave,
  workflowCommandSchema, workflowCompileSchema, workflowImpactSchema, workflowRecordSchema,
  publishedWorkflowSchema,
  workflowTemplateSchema, workflowWriteResultSchema, type WorkflowCommand,
  knowledgeCommandSchema, knowledgeSourceSchema, knowledgeChunkSchema, knowledgeSearchResultSchema,
  type KnowledgeCommand,
  memoryCommandSchema, projectMemorySchema, memorySearchResultSchema,
  devicePairingCommandSchema, pairingIssuedSchema, pairingInspectionSchema,
  pairingDecisionResultSchema, type DevicePairingCommand,
  diagnosticsPreviewSchema, diagnosticsCleanupResultSchema,
  hostActivitySchema, type HostActivity,
  type MemoryCommand,
  pythonHostHealthSchema, pythonHostInfoSchema, pythonHostSnapshotSchema, pythonTransportVersion,
  systemCommandEnvelopeSchema, systemCommandResultSchema,
  projectCommandEnvelopeSchema, projectCommandResultSchema,
  conversationCommandEnvelopeSchema, conversationCommandResultSchema,
  draftCommandEnvelopeSchema, draftCommandResultSchema,
  approvalCommandEnvelopeSchema, approvalCommandResultSchema,
  boardCommandEnvelopeSchema, boardCommandResultSchema,
  runCommandEnvelopeSchema, runCommandResultSchema,
  type HostConnectionSnapshot, type SystemCommandResult, type ProjectCommandResult,
  type ConversationCommandResult, type DraftCommandResult, type ApprovalCommandResult,
  type BoardCommandResult, type RunCommandResult, type PythonHostSnapshot } from '@forge/contracts';
import { hostEnvironment } from './host-environment.js';

const limits = Object.freeze({ frameBytes: 1_048_576, startupMs: 8_000, requestMs: 4_000,
  heartbeatMs: 3_000, shutdownMs: 20_000, terminateMs: 2_000 });

type RpcResponse = { jsonrpc: '2.0'; id: string | null; result?: unknown;
  error?: { code: string; message: string } };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> };

/** Sole Desktop business Host. Renderer commands are schema-gated before stdio dispatch. */
export class PythonHostController {
  private snapshot: PythonHostSnapshot = { revision: 0, state: 'unavailable', info: null,
    health: null, lastHealthCheck: null,
    error: forgeError('HOST_UNAVAILABLE', 'Python Host has not started', 'python-host') };
  private child: ChildProcessWithoutNullStreams | null = null;
  private ownedPid: number | null = null;
  private readonly token = randomUUID();
  private readonly pending = new Map<string, Pending>();
  private buffered = Buffer.alloc(0);
  private stderrBuffered = '';
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private probing = false;
  private longRequests = 0;

  constructor(private readonly interpreter: string, private readonly productVersion: string,
    private readonly dataDir: string,
    private readonly onStatus: (snapshot: PythonHostSnapshot) => void,
    private readonly packagedPython?: { pythonHome: string; pythonPath: string }) {}

  get status(): HostConnectionSnapshot { return hostConnectionSnapshotSchema.parse(this.snapshot); }
  get pythonStatus(): PythonHostSnapshot { return this.snapshot; }

  async start(): Promise<void> {
    if (this.child) return;
    this.stopping = false;
    this.publish({ state: 'starting', info: null, health: null, lastHealthCheck: null, error: null });
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(this.interpreter, ['-m', 'forge.host'], {
        shell: false, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...hostEnvironment(process.env),
          ...(this.packagedPython ? { PYTHONHOME: this.packagedPython.pythonHome,
            PYTHONPATH: this.packagedPython.pythonPath, PYTHONDONTWRITEBYTECODE: '1' } : {}),
          FORGE_HOST_OWNERSHIP_TOKEN: this.token, FORGE_HOST_DATA_DIR: this.dataDir },
      });
    } catch { this.fail('HOST_STARTUP_FAILED'); return; }
    this.child = child;
    this.ownedPid = child.pid ?? null;
    child.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    child.stderr.on('data', (chunk: Buffer) => this.onStderr(chunk));
    child.once('error', () => this.onExit(child));
    child.once('exit', () => this.onExit(child));
    try {
      const info = pythonHostInfoSchema.parse(await this.call('system.handshake', {
        productVersion: this.productVersion, hostVersion: this.productVersion,
        protocolVersion: hostProtocolVersion, ownershipToken: this.token,
      }, limits.startupMs));
      if (!this.ownedPid || info.pid !== this.ownedPid || info.productVersion !== this.productVersion
        || info.version !== this.productVersion || info.protocolVersion !== hostProtocolVersion) {
        throw new Error('VERSION_MISMATCH');
      }
      const health = pythonHostHealthSchema.parse(await this.call('system.health', {}));
      if (health.hostId !== info.hostId || health.pid !== this.ownedPid) throw new Error('INVALID_RESPONSE');
      this.publish({ state: health.status === 'ready' ? 'connected' : 'degraded', info, health,
        lastHealthCheck: new Date().toISOString(), error: health.storage.error });
      this.heartbeat = setInterval(() => { void this.probe(); }, limits.heartbeatMs);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'HOST_STARTUP_FAILED';
      this.fail(code === 'PROTOCOL_MISMATCH' || code === 'VERSION_MISMATCH' ? code : 'HOST_STARTUP_FAILED');
      await this.stop();
    }
  }

  private call(method: string, params: Record<string, unknown>, timeout: number = limits.requestMs): Promise<unknown> {
    const child = this.child;
    if (!child || child.killed || !this.ownedPid) return Promise.reject(new Error('HOST_EXITED'));
    const id = randomUUID();
    const frame = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, method, params,
      transportVersion: pythonTransportVersion }) + '\n');
    if (frame.length > limits.frameBytes) return Promise.reject(new Error('INVALID_RESPONSE'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('TRANSPORT_TIMEOUT')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(frame, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('HOST_EXITED'));
      });
    });
  }

  private failure(commandId: string, code: string): { commandId: string; ok: false;
    error: ReturnType<typeof forgeError>; durationMs: number; hostTimestamp: string } {
    const safeCode = forgeErrorCodeSchema.safeParse(code);
    const mapped = code === 'INVALID_REQUEST' ? 'VALIDATION_ERROR'
      : safeCode.success ? safeCode.data : 'INTERNAL_ERROR';
    const message = mapped === 'INVALID_RESPONSE' ? 'Host returned an invalid response'
      : mapped === 'TRANSPORT_TIMEOUT' ? 'Host request timed out'
      : mapped === 'HOST_EXITED' ? 'Python Host exited'
      : mapped === 'HOST_UNAVAILABLE' ? 'Python Host unavailable'
      : mapped === 'VALIDATION_ERROR' ? 'Invalid command payload'
      : mapped.replaceAll('_', ' ').toLowerCase();
    return { commandId, ok: false, error: forgeError(mapped, message, commandId,
      mapped === 'TRANSPORT_TIMEOUT'), durationMs: 0, hostTimestamp: new Date().toISOString() };
  }

  private async invokeDomain<T>(command: { commandId: string; type: string;
    protocolVersion: string; payload: Record<string, unknown> },
    parse: (value: unknown) => T, timeout: number = limits.requestMs): Promise<T> {
    if (command.protocolVersion !== hostProtocolVersion) return parse(this.failure(command.commandId, 'PROTOCOL_MISMATCH'));
    if (!['connected', 'degraded'].includes(this.snapshot.state)) {
      return parse(this.failure(command.commandId, this.snapshot.error?.code ?? 'HOST_UNAVAILABLE'));
    }
    const started = performance.now();
    if (timeout > limits.requestMs) this.longRequests += 1;
    try {
      const raw = await this.call(command.type, command.payload, timeout);
      if (!raw || typeof raw !== 'object' || (!command.type.startsWith('system.') && !('data' in raw))) {
        throw new Error('INVALID_RESPONSE');
      }
      const data = command.type.startsWith('system.') ? raw : (raw as { data: unknown }).data;
      return parse({ commandId: command.commandId, ok: true, data,
        durationMs: performance.now() - started, hostTimestamp: new Date().toISOString() });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'INVALID_RESPONSE';
      if (process.env.FORGE_BRIDGE_DIAGNOSTIC === '1') {
        process.stderr.write(`${JSON.stringify({ component: 'forge-python-bridge',
          event: 'domain_request_failed', method: command.type,
          errorKind: error instanceof Error ? error.constructor.name : 'unknown',
          errorCode: /^[A-Z_]{1,64}$/.test(code) ? code : 'UNSTRUCTURED' })}\n`);
      }
      return parse(this.failure(command.commandId, code));
    } finally {
      if (timeout > limits.requestMs) {
        this.longRequests -= 1;
        if (this.longRequests === 0) void this.probe();
      }
    }
  }

  async health(): Promise<SystemCommandResult> {
    return this.invokeSystem({ schemaVersion: '1.0', commandId: randomUUID(),
      type: 'system.health', createdAt: new Date().toISOString(),
      protocolVersion: hostProtocolVersion, payload: {} });
  }

  async invokeSystem(raw: unknown): Promise<SystemCommandResult> {
    const parsed = systemCommandEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return this.failure(randomUUID(), 'VALIDATION_ERROR');
    if (!['system.health', 'system.info', 'system.ping'].includes(parsed.data.type)) {
      return this.failure(parsed.data.commandId, 'UNKNOWN_COMMAND');
    }
    const result = await this.invokeDomain(parsed.data, (value) => systemCommandResultSchema.parse(value));
    if (result.ok && parsed.data.type === 'system.health') {
      const health = pythonHostHealthSchema.safeParse(result.data);
      if (health.success && health.data.hostId === this.snapshot.info?.hostId && health.data.pid === this.ownedPid) {
        this.publish({ state: health.data.status === 'ready' ? 'connected' : 'degraded',
          info: this.snapshot.info ? { ...this.snapshot.info, status: health.data.status } : null,
          health: health.data, lastHealthCheck: new Date().toISOString(), error: health.data.storage.error });
      }
    }
    return result;
  }

  async invokeProject(raw: unknown): Promise<ProjectCommandResult> {
    const parsed = projectCommandEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return this.failure(randomUUID(), 'VALIDATION_ERROR');
    return this.invokeDomain(parsed.data, (value) => projectCommandResultSchema.parse(value));
  }

  async inspectBundledPlugin(): Promise<BundledPluginInspection> {
    if (!['connected', 'degraded'].includes(this.snapshot.state)) throw new Error('HOST_UNAVAILABLE');
    const raw = await this.call('plugin.inspectBundled', {});
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    return bundledPluginInspectionSchema.parse(raw.data);
  }
  async setBundledPluginEnabled(enabled: boolean): Promise<BundledPluginInspection> {
    if (!['connected', 'degraded'].includes(this.snapshot.state)) throw new Error('HOST_UNAVAILABLE');
    const raw = await this.call('plugin.setBundledEnabled', { enabled });
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    return bundledPluginInspectionSchema.parse(raw.data);
  }
  async agentProfileCatalog(): Promise<AgentProfileCatalog> {
    if (!['connected', 'degraded'].includes(this.snapshot.state)) throw new Error('HOST_UNAVAILABLE');
    const raw = await this.call('agent.profileCatalog', {}, 25_000);
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    return agentProfileCatalogSchema.parse(raw.data);
  }
  async saveAgentProfile(value: AgentProfileSave): Promise<AgentProfile> {
    if (!['connected', 'degraded'].includes(this.snapshot.state)) throw new Error('HOST_UNAVAILABLE');
    const checked = agentProfileSaveSchema.parse(value);
    const raw = await this.call('agent.profileSave', checked);
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    return agentProfileSchema.parse(raw.data);
  }
  async invokeWorkflow(command: WorkflowCommand): Promise<unknown> {
    if (!['connected', 'degraded'].includes(this.snapshot.state)) throw new Error('HOST_UNAVAILABLE');
    const checked = workflowCommandSchema.parse(command);
    const raw = await this.call(`workflow.${checked.type}`, checked.payload, 25_000);
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    const data: unknown = raw.data;
    switch (checked.type) {
      case 'presets': return workflowTemplateSchema.array().parse(data);
      case 'list': return workflowRecordSchema.array().parse(data);
      case 'get': return workflowRecordSchema.parse(data);
      case 'getPublished': return publishedWorkflowSchema.parse(data);
      case 'impact': return workflowImpactSchema.parse(data);
      case 'saveDraft':
      case 'publish': return workflowWriteResultSchema.parse(data);
      case 'compileDraft': return workflowCompileSchema.parse(data);
    }
  }
  async invokeKnowledge(command: KnowledgeCommand): Promise<unknown> {
    if (!['connected', 'degraded'].includes(this.snapshot.state)) throw new Error('HOST_UNAVAILABLE');
    const checked = knowledgeCommandSchema.parse(command);
    const raw = await this.call(`knowledge.${checked.type}`, checked.payload, 25_000);
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    const data: unknown = raw.data;
    switch (checked.type) {
      case 'list': return knowledgeSourceSchema.array().parse(data);
      case 'import':
      case 'revoke': return knowledgeSourceSchema.parse(data);
      case 'chunk': return knowledgeChunkSchema.parse(data);
      case 'search': return knowledgeSearchResultSchema.parse(data);
    }
  }
  async invokeMemory(command: MemoryCommand): Promise<unknown> {
    if (!['connected', 'degraded'].includes(this.snapshot.state)) throw new Error('HOST_UNAVAILABLE');
    const checked = memoryCommandSchema.parse(command);
    const raw = await this.call(`memory.${checked.type}`, checked.payload, 25_000);
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    const data: unknown = raw.data;
    switch (checked.type) {
      case 'list': return projectMemorySchema.array().parse(data);
      case 'retrieve': return memorySearchResultSchema.parse(data);
      case 'get':
      case 'propose':
      case 'edit':
      case 'decide': return projectMemorySchema.parse(data);
    }
  }
  async invokeDevicePairing(command: DevicePairingCommand): Promise<unknown> {
    if (this.snapshot.state !== 'connected') throw new Error('HOST_UNAVAILABLE');
    const checked = devicePairingCommandSchema.parse(command);
    const raw = await this.call(`devices.pair.${checked.type}`, checked.payload);
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    switch (checked.type) {
      case 'issue': return pairingIssuedSchema.parse(raw.data);
      case 'inspect': return pairingInspectionSchema.parse(raw.data);
      case 'decide': return pairingDecisionResultSchema.parse(raw.data);
    }
  }
  async prepareDiagnostics(): Promise<import('@forge/contracts').DiagnosticsPreview> {
    if (this.snapshot.state !== 'connected') throw new Error('HOST_UNAVAILABLE');
    const raw = await this.call('diagnostics.prepare', {}, 10_000);
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    return diagnosticsPreviewSchema.parse(raw.data);
  }
  async activity(): Promise<HostActivity> {
    if (!['connected', 'degraded'].includes(this.snapshot.state)) throw new Error('HOST_UNAVAILABLE');
    return hostActivitySchema.parse(await this.call('system.activity', {}, 8_000));
  }
  async cleanupExpiredArtifacts(previewId: string): Promise<{ purgedImportedArtifacts: number }> {
    if (this.snapshot.state !== 'connected') throw new Error('HOST_UNAVAILABLE');
    const raw = await this.call('diagnostics.cleanup', { previewId, confirmed: true }, 15_000);
    if (!raw || typeof raw !== 'object' || !('data' in raw)) throw new Error('INVALID_RESPONSE');
    return diagnosticsCleanupResultSchema.omit({ cancelled: true }).parse(raw.data);
  }
  async invokeConversation(raw: unknown): Promise<ConversationCommandResult> {
    const parsed = conversationCommandEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return this.failure(randomUUID(), 'VALIDATION_ERROR');
    return this.invokeDomain(parsed.data, (value) => conversationCommandResultSchema.parse(value));
  }
  async invokeDraft(raw: unknown): Promise<DraftCommandResult> {
    const parsed = draftCommandEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return this.failure(randomUUID(), 'VALIDATION_ERROR');
    return this.invokeDomain(parsed.data, (value) => draftCommandResultSchema.parse(value));
  }
  async invokeApproval(raw: unknown): Promise<ApprovalCommandResult> {
    const parsed = approvalCommandEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return this.failure(randomUUID(), 'VALIDATION_ERROR');
    return this.invokeDomain(parsed.data, (value) => approvalCommandResultSchema.parse(value));
  }
  async invokeBoard(raw: unknown): Promise<BoardCommandResult> {
    const parsed = boardCommandEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return this.failure(randomUUID(), 'VALIDATION_ERROR');
    return this.invokeDomain(parsed.data, (value) => boardCommandResultSchema.parse(value));
  }
  async invokeRun(raw: unknown): Promise<RunCommandResult> {
    const parsed = runCommandEnvelopeSchema.safeParse(raw);
    if (!parsed.success) return this.failure(randomUUID(), 'VALIDATION_ERROR');
    return this.invokeDomain(parsed.data, (value) => runCommandResultSchema.parse(value),
      parsed.data.type === 'deliveries.merge' ? 180_000 :
      ['run.start', 'run.capabilities', 'run.cancel', 'run.reviewStart',
        'run.verifyStart'].includes(parsed.data.type) ?
        25_000 : limits.requestMs);
  }

  private onData(chunk: Buffer): void {
    this.buffered = Buffer.concat([this.buffered, chunk]);
    if (this.buffered.length > limits.frameBytes && !this.buffered.includes(10)) {
      this.fail('INVALID_RESPONSE'); void this.stop(); return;
    }
    let end: number;
    while ((end = this.buffered.indexOf(10)) !== -1) {
      const frame = this.buffered.subarray(0, end);
      this.buffered = this.buffered.subarray(end + 1);
      if (frame.length > limits.frameBytes) { this.fail('INVALID_RESPONSE'); void this.stop(); return; }
      let response: RpcResponse;
      try {
        const raw: unknown = JSON.parse(frame.toString());
        if (!raw || typeof raw !== 'object' || !('jsonrpc' in raw) || raw.jsonrpc !== '2.0'
          || !('id' in raw) || typeof raw.id !== 'string' || !('result' in raw || 'error' in raw)) {
          throw new Error('INVALID_RESPONSE');
        }
        response = raw as RpcResponse;
      } catch { this.fail('INVALID_RESPONSE'); void this.stop(); return; }
      const pending = this.pending.get(response.id ?? '');
      if (!pending) continue;
      this.pending.delete(response.id ?? ''); clearTimeout(pending.timer);
      if (response.error) pending.reject(new Error(response.error.code));
      else pending.resolve(response.result);
    }
  }

  private onStderr(chunk: Buffer): void {
    this.stderrBuffered = (this.stderrBuffered + chunk.toString()).slice(-16_384);
    let end: number;
    while ((end = this.stderrBuffered.indexOf('\n')) !== -1) {
      const line = this.stderrBuffered.slice(0, end);
      this.stderrBuffered = this.stderrBuffered.slice(end + 1);
      try {
        const raw: unknown = JSON.parse(line);
        if (!raw || typeof raw !== 'object' || !('event' in raw)
          || typeof raw.event !== 'string' || !/^[a-z_]{1,64}$/.test(raw.event)) continue;
        const record = raw as Record<string, unknown>;
        const code = typeof record.code === 'string' && /^[A-Z_]{1,64}$/.test(record.code)
          ? record.code : undefined;
        process.stderr.write(`${JSON.stringify({ component: 'forge-python-host', event: raw.event,
          ...(code ? { code } : {}) })}\n`);
      } catch { /* No raw Host stderr is forwarded to Desktop logs. */ }
    }
  }

  private async probe(): Promise<void> {
    if (this.probing || this.longRequests > 0 || !this.child || this.stopping) return;
    this.probing = true;
    try {
      const health = pythonHostHealthSchema.parse(await this.call('system.health', {}));
      if (health.hostId !== this.snapshot.info?.hostId || health.pid !== this.ownedPid) {
        throw new Error('INVALID_RESPONSE');
      }
      this.publish({ state: health.status === 'ready' ? 'connected' : 'degraded',
        info: this.snapshot.info ? { ...this.snapshot.info, status: health.status } : null,
        health, lastHealthCheck: new Date().toISOString(), error: health.storage.error });
    } catch { this.fail('TRANSPORT_TIMEOUT'); }
    finally { this.probing = false; }
  }

  private onExit(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.child = null; this.ownedPid = null;
    this.buffered = Buffer.alloc(0);
    this.stderrBuffered = '';
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer); pending.reject(new Error('HOST_EXITED'));
    }
    this.pending.clear();
    if (this.snapshot.state !== 'incompatible') {
      this.publish({ state: this.stopping ? 'unavailable' : 'crashed', info: null, health: null,
        lastHealthCheck: null, error: forgeError('HOST_EXITED', 'Python Host exited', 'python-host') });
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    try { await this.call('system.shutdown', {}); } catch {
      process.stderr.write(`${JSON.stringify({ component: 'forge-python-host', event: 'shutdown_request_failed',
        pid: this.ownedPid })}\n`);
    }
    if (this.child !== child) return;
    await Promise.race([new Promise<void>((resolve) => child.once('exit', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, limits.shutdownMs))]);
    if (this.child === child && this.ownedPid === child.pid) {
      process.stderr.write(`${JSON.stringify({ component: 'forge-python-host', event: 'shutdown_timeout',
        pid: this.ownedPid })}\n`);
      child.kill();
      await Promise.race([new Promise<void>((resolve) => child.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, limits.terminateMs))]);
      if (this.child === child && this.ownedPid === child.pid) {
        child.kill('SIGKILL');
      }
    }
  }

  private fail(code: 'HOST_STARTUP_FAILED' | 'PROTOCOL_MISMATCH' | 'VERSION_MISMATCH'
    | 'INVALID_RESPONSE' | 'TRANSPORT_TIMEOUT'): void {
    this.publish({ state: code === 'PROTOCOL_MISMATCH' || code === 'VERSION_MISMATCH'
      ? 'incompatible' : 'unavailable', info: null, health: null, lastHealthCheck: null,
    error: forgeError(code, `Python Host ${code.toLowerCase().replaceAll('_', ' ')}`, 'python-host') });
  }

  private publish(next: Omit<PythonHostSnapshot, 'revision'>): void {
    this.snapshot = pythonHostSnapshotSchema.parse({ revision: this.snapshot.revision + 1, ...next });
    this.onStatus(this.snapshot);
  }
}
