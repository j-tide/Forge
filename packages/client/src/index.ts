import {
  forgeError, hostConnectionSnapshotSchema, hostProtocolVersion, systemCommandEnvelopeSchema,
  systemCommandResultSchema, type ForgeDesktopBridge, type HostConnectionSnapshot,
  type SystemCommandEnvelope, type SystemCommandResult,
  projectCommandEnvelopeSchema, projectCommandResultSchema,
  type ProjectCommandEnvelope, type ProjectCommandResult,
  conversationCommandEnvelopeSchema, conversationCommandResultSchema,
  conversationStreamEventSchema, type ConversationCommandEnvelope, type ConversationCommandResult,
  type ConversationStreamEvent,
  draftCommandEnvelopeSchema, draftCommandResultSchema,
  type DraftCommandEnvelope, type DraftCommandResult,
  approvalCommandEnvelopeSchema, approvalCommandResultSchema,
  type ApprovalCommandEnvelope, type ApprovalCommandResult,
  boardCommandEnvelopeSchema, boardCommandResultSchema,
  type BoardCommandEnvelope, type BoardCommandResult,
  runCommandEnvelopeSchema, runCommandResultSchema,
  bundledPluginInspectionSchema, type BundledPluginInspection,
  agentProfileCatalogSchema, agentProfileSchema, agentProfileSaveSchema,
  type AgentProfileCatalog, type AgentProfile, type AgentProfileSave,
  workflowCommandSchema, workflowCompileSchema, workflowImpactSchema, workflowRecordSchema,
  publishedWorkflowSchema,
  workflowTemplateSchema, workflowWriteResultSchema, type WorkflowCommand,
  type WorkflowCompile, type WorkflowImpact, type WorkflowRecord, type WorkflowTemplate,
  knowledgeCommandSchema, knowledgeSourceSchema, knowledgeChunkSchema, knowledgeSearchResultSchema,
  type KnowledgeCommand, type KnowledgeSource, type KnowledgeChunk, type KnowledgeSearchResult,
  memoryCommandSchema, projectMemorySchema, memorySearchResultSchema,
  devicePairingCommandSchema, pairingIssuedSchema, pairingInspectionSchema,
  pairingDecisionResultSchema, type DevicePairingCommand,
  type MemoryCommand, type ProjectMemory, type MemorySearchResult,
  type RunCommandEnvelope, type RunCommandResult,
  appPreviewRequestSchema, appPreviewResultSchema, type AppPreviewResult,
  diagnosticsPreviewSchema, diagnosticsExportResultSchema, diagnosticsCleanupResultSchema,
  type DiagnosticsPreview, type DiagnosticsExportResult, type DiagnosticsCleanupResult,
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

  constructor(private readonly bridge?: ForgeDesktopBridge) {
    this.transport = bridge ? new LocalTransport(bridge) : new UnavailableTransport();
  }

  get status(): HostConnectionSnapshot { return this.transport.status; }
  connect(): Promise<HostConnectionSnapshot> { return this.transport.connect(); }
  disconnect(): void { this.transport.disconnect(); }
  health(): Promise<SystemCommandResult> { return this.transport.health(); }
  subscribe(listener: (snapshot: HostConnectionSnapshot) => void): () => void { return this.transport.subscribe(listener); }

  get canOpenAppPreview(): boolean { return typeof this.bridge?.openAppPreview === 'function'; }
  async openAppPreview(url: string): Promise<AppPreviewResult> {
    if (!this.bridge?.openAppPreview) throw new Error('DESKTOP_PREVIEW_UNAVAILABLE');
    const raw: unknown = await this.bridge.openAppPreview(appPreviewRequestSchema.parse({ url }));
    return appPreviewResultSchema.parse(raw);
  }
  get canManageDiagnostics(): boolean { return typeof this.bridge?.prepareDiagnostics === 'function'; }
  async prepareDiagnostics(): Promise<DiagnosticsPreview> {
    if (!this.bridge?.prepareDiagnostics) throw new Error('HOST_UNAVAILABLE');
    const raw: unknown = await this.bridge.prepareDiagnostics();
    return diagnosticsPreviewSchema.parse(raw);
  }
  async exportDiagnostics(previewId: string): Promise<DiagnosticsExportResult> {
    if (!this.bridge?.exportDiagnostics) throw new Error('HOST_UNAVAILABLE');
    const raw: unknown = await this.bridge.exportDiagnostics(previewId);
    return diagnosticsExportResultSchema.parse(raw);
  }
  async cleanupExpiredArtifacts(previewId: string): Promise<DiagnosticsCleanupResult> {
    if (!this.bridge?.cleanupExpiredArtifacts) throw new Error('HOST_UNAVAILABLE');
    const raw: unknown = await this.bridge.cleanupExpiredArtifacts(previewId);
    return diagnosticsCleanupResultSchema.parse(raw);
  }

  invoke(type: string): Promise<SystemCommandResult> {
    const command = systemCommandEnvelopeSchema.parse({
      schemaVersion: '1.0', commandId: crypto.randomUUID(), type,
      createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion, payload: {},
    });
    return this.transport.invoke(command);
  }

  async inspectBundledPlugin(): Promise<BundledPluginInspection | null> {
    if (!this.bridge) return null;
    const raw: unknown = await this.bridge.inspectBundledPlugin();
    return bundledPluginInspectionSchema.parse(raw);
  }

  async setBundledPluginEnabled(enabled: boolean): Promise<BundledPluginInspection> {
    if (!this.bridge) throw new Error('HOST_UNAVAILABLE');
    const raw: unknown = await this.bridge.setBundledPluginEnabled(enabled);
    return bundledPluginInspectionSchema.parse(raw);
  }

  async agentProfileCatalog(): Promise<AgentProfileCatalog | null> {
    if (!this.bridge) return null;
    const raw: unknown = await this.bridge.agentProfileCatalog();
    return agentProfileCatalogSchema.parse(raw);
  }

  async saveAgentProfile(value: AgentProfileSave): Promise<AgentProfile> {
    if (!this.bridge) throw new Error('HOST_UNAVAILABLE');
    const raw: unknown = await this.bridge.saveAgentProfile(agentProfileSaveSchema.parse(value));
    return agentProfileSchema.parse(raw);
  }

  private async workflow(command: WorkflowCommand): Promise<unknown> {
    if (!this.bridge) throw new Error('HOST_UNAVAILABLE');
    return this.bridge.invokeWorkflow(workflowCommandSchema.parse(command));
  }
  async workflowPresets(): Promise<WorkflowTemplate[]> {
    return workflowTemplateSchema.array().parse(await this.workflow({ type: 'presets', payload: {} }));
  }
  async listWorkflows(): Promise<WorkflowRecord[]> {
    return workflowRecordSchema.array().parse(await this.workflow({ type: 'list', payload: {} }));
  }
  async getWorkflow(workflowId: string): Promise<WorkflowRecord> {
    return workflowRecordSchema.parse(await this.workflow({ type: 'get', payload: { workflowId } }));
  }
  async getPublishedWorkflow(workflowId: string, revision: number): Promise<import('@forge/contracts').PublishedWorkflow> {
    return publishedWorkflowSchema.parse(await this.workflow({
      type: 'getPublished', payload: { workflowId, revision },
    }));
  }
  async workflowImpact(workflowId: string): Promise<WorkflowImpact> {
    return workflowImpactSchema.parse(await this.workflow({ type: 'impact', payload: { workflowId } }));
  }
  async compileWorkflow(template: WorkflowTemplate, expectedRevision: number): Promise<WorkflowCompile> {
    return workflowCompileSchema.parse(await this.workflow({
      type: 'compileDraft', payload: { template, expectedRevision },
    }));
  }
  async saveWorkflow(template: WorkflowTemplate, expectedRevision: number): Promise<{
    record: WorkflowRecord; compiled: WorkflowCompile;
  }> {
    return workflowWriteResultSchema.parse(await this.workflow({
      type: 'saveDraft', payload: { template, expectedRevision },
    }));
  }
  async publishWorkflow(workflowId: string, expectedDraftRevision: number): Promise<{
    record: WorkflowRecord; compiled: WorkflowCompile;
  }> {
    return workflowWriteResultSchema.parse(await this.workflow({
      type: 'publish', payload: { workflowId, expectedDraftRevision },
    }));
  }

  private async knowledge(command: KnowledgeCommand): Promise<unknown> {
    if (!this.bridge) throw new Error('HOST_UNAVAILABLE');
    return this.bridge.invokeKnowledge(knowledgeCommandSchema.parse(command));
  }
  async listKnowledge(projectId: string): Promise<KnowledgeSource[]> {
    return knowledgeSourceSchema.array().parse(await this.knowledge({ type: 'list', payload: { projectId } }));
  }
  async importKnowledge(projectId: string, relativePath: string): Promise<KnowledgeSource> {
    return knowledgeSourceSchema.parse(await this.knowledge({
      type: 'import', payload: { projectId, relativePath },
    }));
  }
  async knowledgeChunk(projectId: string, sourceId: string, version: number,
    ordinal: number): Promise<KnowledgeChunk> {
    return knowledgeChunkSchema.parse(await this.knowledge({
      type: 'chunk', payload: { projectId, sourceId, version, ordinal },
    }));
  }
  async revokeKnowledge(projectId: string, sourceId: string): Promise<KnowledgeSource> {
    return knowledgeSourceSchema.parse(await this.knowledge({
      type: 'revoke', payload: { projectId, sourceId },
    }));
  }
  async searchKnowledge(projectId: string, environmentId: string, query: string): Promise<KnowledgeSearchResult> {
    return knowledgeSearchResultSchema.parse(await this.knowledge({
      type: 'search', payload: { projectId, environmentId, query },
    }));
  }

  private async memory(command: MemoryCommand): Promise<unknown> {
    if (!this.bridge) throw new Error('HOST_UNAVAILABLE');
    return this.bridge.invokeMemory(memoryCommandSchema.parse(command));
  }
  async listMemories(projectId: string): Promise<ProjectMemory[]> {
    return projectMemorySchema.array().parse(await this.memory({ type: 'list', payload: { projectId } }));
  }
  async retrieveMemory(projectId: string, environmentId: string, query: string): Promise<MemorySearchResult> {
    return memorySearchResultSchema.parse(await this.memory({
      type: 'retrieve', payload: { projectId, environmentId, query },
    }));
  }
  async proposeMemory(payload: Extract<MemoryCommand, { type: 'propose' }>['payload']): Promise<ProjectMemory> {
    return projectMemorySchema.parse(await this.memory({ type: 'propose', payload }));
  }
  async editMemory(payload: Extract<MemoryCommand, { type: 'edit' }>['payload']): Promise<ProjectMemory> {
    return projectMemorySchema.parse(await this.memory({ type: 'edit', payload }));
  }
  async decideMemory(payload: Extract<MemoryCommand, { type: 'decide' }>['payload']): Promise<ProjectMemory> {
    return projectMemorySchema.parse(await this.memory({ type: 'decide', payload }));
  }

  get canPairLocalDevice(): boolean { return typeof this.bridge?.invokeDevicePairing === 'function'; }
  async devicePairing(command: DevicePairingCommand): Promise<unknown> {
    if (!this.bridge?.invokeDevicePairing) throw new Error('LOCAL_PAIRING_UNAVAILABLE');
    const checked = devicePairingCommandSchema.parse(command);
    const raw: unknown = await this.bridge.invokeDevicePairing(checked);
    switch (checked.type) {
      case 'issue': return pairingIssuedSchema.parse(raw);
      case 'inspect': return pairingInspectionSchema.parse(raw);
      case 'decide': return pairingDecisionResultSchema.parse(raw);
    }
  }

  async chooseProjectFolder(): Promise<string | null> {
    if (!this.bridge) return null;
    const selected: unknown = await this.bridge.chooseProjectFolder();
    if (selected === null) return null;
    if (typeof selected !== 'string' || !selected) throw new Error('Invalid folder picker result');
    return selected;
  }

  async project(command: Pick<ProjectCommandEnvelope, 'type' | 'payload'>): Promise<ProjectCommandResult> {
    const envelope = projectCommandEnvelopeSchema.parse({ ...command, schemaVersion: '1.0',
      commandId: crypto.randomUUID(), createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion });
    if (!this.bridge) return projectCommandResultSchema.parse({ commandId: envelope.commandId, ok: false,
      error: forgeError('HOST_UNAVAILABLE', 'Local Host unavailable', envelope.commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString() });
    const raw: unknown = await this.bridge.invokeProject(envelope);
    return projectCommandResultSchema.parse(raw);
  }

  async conversation(command: Pick<ConversationCommandEnvelope, 'type' | 'payload'>): Promise<ConversationCommandResult> {
    const envelope = conversationCommandEnvelopeSchema.parse({ ...command, schemaVersion: '1.0',
      commandId: crypto.randomUUID(), createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion });
    if (!this.bridge) return conversationCommandResultSchema.parse({ commandId: envelope.commandId, ok: false,
      error: forgeError('HOST_UNAVAILABLE', 'Local Host unavailable', envelope.commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString() });
    const raw: unknown = await this.bridge.invokeConversation(envelope);
    return conversationCommandResultSchema.parse(raw);
  }

  async draft(command: Pick<DraftCommandEnvelope, 'type' | 'payload'>): Promise<DraftCommandResult> {
    const envelope = draftCommandEnvelopeSchema.parse({ ...command, schemaVersion: '1.0',
      commandId: crypto.randomUUID(), createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion });
    if (!this.bridge) return draftCommandResultSchema.parse({ commandId: envelope.commandId, ok: false,
      error: forgeError('HOST_UNAVAILABLE', 'Local Host unavailable', envelope.commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString() });
    const raw: unknown = await this.bridge.invokeDraft(envelope);
    return draftCommandResultSchema.parse(raw);
  }

  async approval(command: Pick<ApprovalCommandEnvelope, 'type' | 'payload'>): Promise<ApprovalCommandResult> {
    const envelope = approvalCommandEnvelopeSchema.parse({ ...command, schemaVersion: '1.0',
      commandId: crypto.randomUUID(), createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion });
    if (!this.bridge) return approvalCommandResultSchema.parse({ commandId: envelope.commandId, ok: false,
      error: forgeError('HOST_UNAVAILABLE', 'Local Host unavailable', envelope.commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString() });
    const raw: unknown = await this.bridge.invokeApproval(envelope);
    return approvalCommandResultSchema.parse(raw);
  }

  async board(command: Pick<BoardCommandEnvelope, 'type' | 'payload'>): Promise<BoardCommandResult> {
    const envelope = boardCommandEnvelopeSchema.parse({ ...command, schemaVersion: '1.0',
      commandId: crypto.randomUUID(), createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion });
    if (!this.bridge) return boardCommandResultSchema.parse({ commandId: envelope.commandId, ok: false,
      error: forgeError('HOST_UNAVAILABLE', 'Local Host unavailable', envelope.commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString() });
    const raw: unknown = await this.bridge.invokeBoard(envelope);
    return boardCommandResultSchema.parse(raw);
  }

  async run(command: Pick<RunCommandEnvelope, 'type' | 'payload'>): Promise<RunCommandResult> {
    const envelope = runCommandEnvelopeSchema.parse({ ...command, schemaVersion: '1.0',
      commandId: crypto.randomUUID(), createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion });
    if (!this.bridge) return runCommandResultSchema.parse({ commandId: envelope.commandId, ok: false,
      error: forgeError('HOST_UNAVAILABLE', 'Local Host unavailable', envelope.commandId),
      durationMs: 0, hostTimestamp: new Date().toISOString() });
    const raw: unknown = await this.bridge.invokeRun(envelope);
    return runCommandResultSchema.parse(raw);
  }

  onConversationEvent(listener: (event: ConversationStreamEvent) => void): () => void {
    if (!this.bridge) return () => {};
    return this.bridge.onConversationEvent((raw) => {
      const checked = conversationStreamEventSchema.safeParse(raw);
      if (checked.success) listener(checked.data);
    });
  }
}
