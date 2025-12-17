import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { z } from 'zod';
import { ProcessController } from '@forge/process';
import {
  ExecutorError, executorCapabilitiesSchema, executorEventSchema, executorRunRequestSchema,
  type ExecutorAdapter, type ExecutorCapabilities, type ExecutorErrorCode, type ExecutorEvent,
  type ExecutorRunHandle, type ExecutorRunRequest,
} from '@forge/plugin-api';
import { AppServerConnection, codexCliScript, codexEnvironment } from './app-server.js';

const threadResponse = z.object({ thread: z.object({ id: z.string().min(1) }) });
const turnResponse = z.object({ turn: z.object({ id: z.string().min(1) }) });
const modelListResponse = z.object({ data: z.array(z.object({ id: z.string().min(1), hidden: z.boolean().optional() })) });
const jsonValueSchema = z.json();
const evidenceSchema = z.object({ verifiedOn: z.string(), upstreamVersion: z.string(), platform: z.string(),
  checks: z.object({ streaming: z.boolean(), resume: z.boolean(), interrupt: z.boolean(), approval: z.boolean(),
    structuredEvents: z.boolean(), structuredOutput: z.boolean(), workspaceControl: z.boolean(), toolEvents: z.boolean(),
    sessionPersistence: z.boolean(), modelSelection: z.boolean(), usageReporting: z.boolean(),
    readOnlyEnforced: z.boolean(), networkPolicyEnforced: z.boolean() }) });
const completionNotice = z.object({ threadId: z.string().optional(), turn: z.object({
  id: z.string(), status: z.enum(['completed', 'interrupted', 'failed']),
  error: z.object({ message: z.string().optional(), codexErrorInfo: z.unknown().optional() }).nullable().optional(),
}) });
const itemNotice = z.object({ threadId: z.string().optional(), turnId: z.string().optional(), item: z.object({
  id: z.string(), type: z.string(), status: z.string().optional(), text: z.string().optional(),
  command: z.string().optional(), exitCode: z.number().nullable().optional(),
  server: z.string().optional(), tool: z.string().optional(),
  changes: z.array(z.object({ path: z.string(), kind: z.object({ type: z.enum(['add', 'delete', 'update']) }) })).optional(),
}) });

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function mapCodexError(error: unknown): ExecutorError {
  if (error instanceof ExecutorError) return error;
  const raw = object(error);
  const message = error instanceof Error ? error.message : typeof raw?.message === 'string' ? raw.message : '';
  const info = object(raw?.codexErrorInfo);
  const infoType = typeof info?.type === 'string' ? info.type : '';
  let code: ExecutorErrorCode = 'EXECUTOR_RUNTIME_ERROR';
  if (/unauthorized|authentication|login|401|403/i.test(`${infoType} ${message}`)) code = 'EXECUTOR_AUTH_FAILED';
  else if (/timed? out|deadline/i.test(message)) code = 'EXECUTOR_TIMEOUT';
  else if (/workspace|directory|cwd/i.test(message)) code = 'EXECUTOR_WORKSPACE_ERROR';
  else if (/protocol|invalid (response|request)/i.test(message)) code = 'EXECUTOR_PROTOCOL_ERROR';
  // Provider details are intentionally not returned to Core/UI.
  return new ExecutorError(code, code === 'EXECUTOR_AUTH_FAILED' ? 'Codex authentication is unavailable' :
    code === 'EXECUTOR_WORKSPACE_ERROR' ? 'Executor workspace is invalid' :
      code === 'EXECUTOR_TIMEOUT' ? 'Codex request timed out' : 'Codex runtime failed');
}

async function workspacePath(path: string): Promise<string> {
  try {
    const root = await realpath(path);
    if (!(await stat(root)).isDirectory()) throw new Error('not a directory');
    return root;
  } catch { throw new ExecutorError('EXECUTOR_WORKSPACE_ERROR', 'Executor workspace is invalid'); }
}

type EventPayload<T = ExecutorEvent> = T extends ExecutorEvent ? Omit<T, 'runId' | 'sequence' | 'timestamp'> : never;

class CodexRun implements ExecutorRunHandle {
  readonly runId: string;
  readonly providerSessionId: string;
  readonly completion: Promise<'completed' | 'cancelled'>;
  private turnId = '';
  private sequence = 0;
  private readonly events: ExecutorEvent[] = [];
  private readonly listeners = new Set<(event: ExecutorEvent) => void>();
  private readonly approvals = new Map<string, { requestId: number; timer: NodeJS.Timeout }>();
  private readonly unsubscribe: () => void;
  private readonly timer: NodeJS.Timeout;
  private settle!: (value: 'completed' | 'cancelled') => void;
  private reject!: (error: Error) => void;
  private finished = false;
  private cancelPending = false;
  private structuredOutput: z.infer<typeof jsonValueSchema> = null;
  private hasStructuredOutput = false;

  constructor(private readonly adapter: CodexExecutorAdapter, private readonly connection: AppServerConnection,
    private readonly request: ExecutorRunRequest, threadId: string) {
    this.runId = request.runId;
    this.providerSessionId = threadId;
    this.completion = new Promise((resolve, reject) => { this.settle = resolve; this.reject = reject; });
    this.unsubscribe = connection.onMessage((message) => this.handle(message));
    this.timer = setTimeout(() => this.fail(new ExecutorError('EXECUTOR_TIMEOUT', 'Codex run timed out')), request.maxDurationMs);
    this.emit({ type: 'run.started', providerSessionId: threadId });
    this.emit({ type: 'run.status', status: 'starting' });
  }

  setTurnId(turnId: string): void {
    this.turnId = turnId;
    if (this.finished) return;
    if (this.cancelPending) void this.cancel().catch((error: unknown) => this.fail(mapCodexError(error)));
    else this.emit({ type: 'run.status', status: 'running' });
  }

  private emit(payload: EventPayload): void {
    const event = executorEventSchema.parse({ ...payload, runId: this.runId,
      sequence: ++this.sequence, timestamp: new Date().toISOString() });
    this.events.push(event);
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: (event: ExecutorEvent) => void): () => void {
    for (const event of this.events) listener(event);
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handle(message: { method: string; params?: unknown; id?: number }): void {
    if (this.finished) return;
    if (message.method === 'forge/processExited') {
      this.fail(new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Codex app-server exited'));
      return;
    }
    if (message.method === 'forge/invalidResponse') {
      this.fail(new ExecutorError('EXECUTOR_PROTOCOL_ERROR', 'Codex returned an invalid response'));
      return;
    }
    const params = object(message.params);
    if (params?.threadId && params.threadId !== this.providerSessionId) return;
    if (this.turnId && params?.turnId && params.turnId !== this.turnId) return;
    if (message.method === 'turn/completed') {
      const parsed = completionNotice.safeParse(message.params);
      if (!parsed.success) { this.fail(new ExecutorError('EXECUTOR_PROTOCOL_ERROR', 'Invalid Codex turn result')); return; }
      if (this.turnId && parsed.data.turn.id !== this.turnId) return;
      if (parsed.data.turn.status === 'completed') this.finish('completed');
      else if (parsed.data.turn.status === 'interrupted') this.finish('cancelled');
      else this.fail(mapCodexError(parsed.data.turn.error));
      return;
    }
    if (message.method === 'item/agentMessage/delta') {
      if (typeof params?.delta === 'string') this.emit({ type: 'assistant.message', text: params.delta });
      return;
    }
    if (message.method === 'thread/tokenUsage/updated') {
      const token = object(params?.tokenUsage);
      const total = object(token?.total);
      if (typeof total?.inputTokens === 'number' && typeof total.outputTokens === 'number') {
        this.emit({ type: 'usage.updated', inputTokens: total.inputTokens, outputTokens: total.outputTokens,
          cachedInputTokens: typeof total.cachedInputTokens === 'number' ? total.cachedInputTokens : null,
          cost: null, currency: null });
      }
      return;
    }
    if (message.method === 'item/started' || message.method === 'item/completed') {
      const parsed = itemNotice.safeParse(message.params);
      if (!parsed.success) { this.fail(new ExecutorError('EXECUTOR_PROTOCOL_ERROR', 'Invalid Codex item')); return; }
      const item = parsed.data.item;
      if (item.type === 'agentMessage' && message.method === 'item/completed' && this.request.outputSchema) {
        try { this.structuredOutput = jsonValueSchema.parse(JSON.parse(item.text ?? '')); this.hasStructuredOutput = true; }
        catch { /* commentary messages may precede the final structured answer */ }
      }
      if (item.type === 'commandExecution') {
        if (message.method === 'item/started') this.emit({ type: 'command.started', commandId: item.id, command: item.command ?? '' });
        else this.emit({ type: 'command.completed', commandId: item.id, exitCode: item.exitCode ?? null });
      } else if (item.type === 'fileChange' && message.method === 'item/completed' && item.status === 'completed') {
        for (const change of item.changes ?? []) {
          this.emit({ type: 'file.changed', path: change.path, kind: change.kind.type });
        }
      } else if (item.type === 'mcpToolCall') {
        const data = { toolId: item.id, name: `${item.server ?? 'mcp'}.${item.tool ?? 'tool'}` };
        if (message.method === 'item/started') this.emit({ type: 'tool.started', ...data });
        else this.emit({ type: 'tool.completed', ...data, ok: item.status === 'completed' });
      }
      return;
    }
    if (message.method === 'item/commandExecution/requestApproval' || message.method === 'item/fileChange/requestApproval') {
      if (typeof message.id !== 'number' || typeof params?.itemId !== 'string') {
        this.fail(new ExecutorError('EXECUTOR_PROTOCOL_ERROR', 'Invalid Codex approval request')); return;
      }
      const approvalId = `${this.runId}:${message.id}`;
      const timer = setTimeout(() => { void this.respondToApproval(approvalId, 'reject').catch(() => {}); }, 120_000);
      this.approvals.set(approvalId, { requestId: message.id, timer });
      this.emit({ type: 'run.status', status: 'waiting_approval' });
      this.emit({ type: 'approval.requested', approvalId,
        summary: typeof params.reason === 'string' ? params.reason :
          typeof params.command === 'string' ? params.command : 'Codex file change requires approval',
        capability: message.method.includes('commandExecution') ? 'command' : 'file_change',
        expiresAt: new Date(Date.now() + 120_000).toISOString() });
      return;
    }
    // Unsupported interactive requests stop this spike run; never grant implicitly.
    if (typeof message.id === 'number') this.fail(new ExecutorError('EXECUTOR_UNSUPPORTED_CAPABILITY', 'Codex requested an unsupported interaction'));
  }

  async respondToApproval(approvalId: string, decision: 'approve' | 'reject'): Promise<void> {
    const pending = this.approvals.get(approvalId);
    if (!pending) throw new ExecutorError('EXECUTOR_PROTOCOL_ERROR', 'Approval is not pending');
    clearTimeout(pending.timer);
    this.approvals.delete(approvalId);
    this.connection.respond(pending.requestId, { decision: decision === 'approve' ? 'accept' : 'decline' });
    this.emit({ type: 'approval.resolved', approvalId, decision });
    this.emit({ type: 'run.status', status: 'running' });
  }

  async cancel(): Promise<void> {
    if (this.finished) return;
    if (!this.turnId) { this.cancelPending = true; return; }
    await this.connection.request('turn/interrupt', { threadId: this.providerSessionId, turnId: this.turnId }, 10_000);
  }

  async interrupt(): Promise<void> { await this.cancel(); }

  async resume(goal: string): Promise<ExecutorRunHandle> {
    if (!this.finished) throw new ExecutorError('EXECUTOR_UNSUPPORTED_CAPABILITY', 'Active turn must finish before continuation');
    await this.completion;
    return this.adapter.start({ ...this.request, goal, providerSessionId: this.providerSessionId });
  }

  private finish(outcome: 'completed' | 'cancelled'): void {
    if (this.finished) return;
    if (outcome === 'completed' && this.request.outputSchema && !this.hasStructuredOutput) {
      this.fail(new ExecutorError('EXECUTOR_PROTOCOL_ERROR', 'Codex structured output is missing'));
      return;
    }
    this.finished = true;
    void this.cleanup().then(() => {
      this.emit(outcome === 'completed' ? { type: 'run.completed', providerSessionId: this.providerSessionId,
        structuredOutput: this.structuredOutput } : { type: 'run.cancelled' });
      this.settle(outcome);
    }).catch(() => {
      const error = new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Codex process tree could not be confirmed stopped');
      this.emit({ type: 'run.failed', code: error.code, message: error.message });
      this.reject(error);
    });
  }

  private fail(error: ExecutorError): void {
    if (this.finished) return;
    this.finished = true;
    void this.cleanup().then(() => {
      this.emit({ type: 'run.failed', code: error.code, message: error.message });
      this.reject(error);
    }).catch(() => {
      const failure = new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Codex process tree could not be confirmed stopped');
      this.emit({ type: 'run.failed', code: failure.code, message: failure.message });
      this.reject(failure);
    });
  }

  private async cleanup(): Promise<void> {
    clearTimeout(this.timer);
    for (const pending of this.approvals.values()) clearTimeout(pending.timer);
    this.approvals.clear();
    this.unsubscribe();
    await this.connection.dispose();
  }

  async dispose(): Promise<void> {
    if (!this.finished) await this.cancel().catch(() => {});
    if (!this.finished) await Promise.race([this.completion.catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 500))]);
    if (!this.finished) this.finish('cancelled');
    await this.completion.catch(() => {});
    this.listeners.clear();
  }
}

export class CodexExecutorAdapter implements ExecutorAdapter {
  readonly id = 'executor.codex';
  private readonly active = new Set<ExecutorRunHandle>();
  constructor(private readonly controller: ProcessController = new ProcessController()) {}

  private async runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const runId = `codex-cli-${randomUUID()}`;
    const session = await this.controller.spawn({ runId, executable: process.execPath,
      argv: [codexCliScript, ...args], cwd: process.cwd(), env: codexEnvironment(process.env) });
    let stdout = '';
    let stderr = '';
    session.stdout.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-64_000); });
    session.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-64_000); });
    let timer: NodeJS.Timeout | undefined;
    let failure: unknown;
    try {
      const exit = await Promise.race([session.exit,
        new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), 10_000); })]);
      if (exit === 'timeout') throw new ExecutorError('EXECUTOR_TIMEOUT', 'Codex CLI probe timed out');
      await session.closed;
      if (exit.code !== 0) throw new ExecutorError('EXECUTOR_AUTH_FAILED', 'Codex CLI session unavailable');
    } catch (error) { failure = error; }
    if (timer) clearTimeout(timer);
    const report = await this.controller.terminate(session.descriptor.processId);
    if (!report.confirmed) throw new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Codex CLI process cleanup was not confirmed');
    if (failure) throw failure;
    return { stdout, stderr };
  }

  async probe(): Promise<ExecutorCapabilities> {
    let version = 'unavailable';
    let available = false;
    let authenticated = false;
    let modelIds: string[] = [];
    try {
      const result = await this.runCli(['--version']);
      version = result.stdout.trim();
      const login = await this.runCli(['login', 'status']);
      authenticated = /Logged in/.test(`${login.stdout}\n${login.stderr}`);
      const connection = new AppServerConnection(this.controller, `codex-probe-${randomUUID()}`);
      try {
        await connection.connect();
        modelIds = modelListResponse.parse(await connection.request('model/list', { limit: 100 })).data
          .filter((model) => !model.hidden).map((model) => model.id);
        available = true;
      } finally { await connection.dispose(); }
    } catch { /* no credential or runtime detail leaves this boundary */ }
    let checks: Record<string, boolean> = {};
    try {
      const evidence = evidenceSchema.parse(JSON.parse(await readFile(new URL('../verified-capabilities.json', import.meta.url), 'utf8')));
      if (evidence.upstreamVersion === version && evidence.platform === `${process.platform}/${process.arch}` && available && authenticated) checks = evidence.checks;
    } catch { /* absence of matching live evidence is unsupported */ }
    return executorCapabilitiesSchema.parse({
      executorId: this.id, adapterVersion: '0.0.1', upstreamVersion: version,
      platform: `${process.platform}/${process.arch}`, available: available && authenticated,
      streaming: checks.streaming ?? false, resume: checks.resume ?? false, interrupt: checks.interrupt ?? false,
      approval: checks.approval ?? false, structuredEvents: checks.structuredEvents ?? false,
      structuredOutput: checks.structuredOutput ?? false,
      workspaceControl: checks.workspaceControl ?? false, toolEvents: checks.toolEvents ?? false,
      sessionPersistence: checks.sessionPersistence ?? false, modelSelection: checks.modelSelection ?? false,
      usageReporting: checks.usageReporting ?? false, readOnlyEnforced: checks.readOnlyEnforced ?? false,
      networkPolicyEnforced: checks.networkPolicyEnforced ?? false,
      enforcement: checks.readOnlyEnforced ? 'native-sandbox' : 'unavailable',
      modelIds: available && authenticated ? modelIds : [], authModes: authenticated ? ['chatgpt-session'] : [],
      warnings: Object.keys(checks).length
        ? [...(!checks.modelSelection || !checks.structuredOutput
          ? ['Model selection and structured output await successful Adapter end-to-end rerun'] : []),
          'Local availability does not guarantee an upstream model stream']
        : ['Detailed capabilities require version-matched live probe evidence'],
    });
  }

  async start(input: ExecutorRunRequest): Promise<ExecutorRunHandle> {
    const request = executorRunRequestSchema.parse(input);
    const cwd = await workspacePath(request.workspace);
    try {
      const login = await this.runCli(['login', 'status']);
      if (!/Logged in/.test(`${login.stdout}\n${login.stderr}`)) throw new Error('not logged in');
    } catch { throw new ExecutorError('EXECUTOR_AUTH_FAILED', 'Codex authentication is unavailable'); }
    const connection = new AppServerConnection(this.controller, request.runId, cwd);
    try {
      await connection.connect();
      if (request.model) {
        const models = modelListResponse.parse(await connection.request('model/list', { limit: 100 })).data;
        if (!models.some((model) => model.id === request.model && !model.hidden)) {
          throw new ExecutorError('EXECUTOR_UNSUPPORTED_CAPABILITY', 'Requested Codex model is unavailable');
        }
      }
      const thread = request.providerSessionId
        ? threadResponse.parse(await connection.request('thread/resume', { threadId: request.providerSessionId }, 20_000))
        : threadResponse.parse(await connection.request('thread/start', {
          cwd, approvalPolicy: request.approval, sandbox: request.permission,
          serviceName: 'forge_executor', ...(request.model ? { model: request.model } : {}),
        }, 20_000));
      const handle = new CodexRun(this, connection, request, thread.thread.id);
      void handle.completion.catch(() => {});
      const prompt = [request.goal, ...request.context].join('\n\n');
      const turn = turnResponse.parse(await connection.request('turn/start', {
        threadId: thread.thread.id, cwd,
        input: [{ type: 'text', text: prompt }],
        approvalPolicy: request.approval,
        sandboxPolicy: { type: request.permission === 'read-only' ? 'readOnly' : 'workspaceWrite' },
        ...(request.model ? { model: request.model } : {}),
        ...(request.outputSchema ? { outputSchema: request.outputSchema } : {}),
      }, 20_000));
      handle.setTurnId(turn.turn.id);
      this.active.add(handle);
      void handle.completion.finally(() => this.active.delete(handle)).catch(() => {});
      return handle;
    } catch (error) {
      await connection.dispose();
      throw mapCodexError(error);
    }
  }

  async dispose(): Promise<void> {
    const results = await Promise.allSettled([...this.active].map((handle) => handle.dispose()));
    const cleanup = await this.controller.dispose();
    this.active.clear();
    if (results.some((result) => result.status === 'rejected') || cleanup.some((item) => !item.confirmed)) {
      throw new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Executor process cleanup was not confirmed');
    }
  }
}

export { AppServerConnection, codexEnvironment } from './app-server.js';
