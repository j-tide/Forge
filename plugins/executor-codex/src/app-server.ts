import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface, type Interface } from 'node:readline';
import { ExecutorError } from '@forge/plugin-api';
import { ProcessController, type ProcessSession } from '@forge/process';

const require = createRequire(import.meta.url);
const codexPackagePath = require.resolve('@openai/codex/package.json');
export const codexCliScript = join(dirname(codexPackagePath), 'bin', 'codex.js');

export function codexEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = ['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'CODEX_HOME',
    'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'SystemRoot', 'ComSpec',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'];
  const environment = Object.fromEntries(allowed.flatMap((key) => typeof source[key] === 'string' ? [[key, source[key]]] : []));
  for (const key of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) {
    const value = source[key];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) environment[key] = value;
    } catch { /* malformed or credential-bearing proxy settings are not forwarded */ }
  }
  for (const key of ['NO_PROXY', 'no_proxy']) if (source[key]) environment[key] = source[key];
  return environment;
}

type RpcResponse = { id: number; result?: unknown; error?: { code: number; message: string } };
type RpcMessage = { method: string; params?: unknown; id?: number };
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout };

export class AppServerConnection {
  private session: ProcessSession | null = null;
  private lines: Interface | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Set<(message: RpcMessage) => void>();
  private closed = false;
  private exitPromise: Promise<void> | null = null;
  private closing: Promise<void> | null = null;

  constructor(private readonly controller: ProcessController = new ProcessController(),
    private readonly runId: string = `codex-${randomUUID()}`, private readonly cwd: string = process.cwd()) {}

  async connect(): Promise<void> {
    if (this.session) throw new ExecutorError('EXECUTOR_PROTOCOL_ERROR', 'Codex connection already started');
    const session = await this.controller.spawn({ runId: this.runId, executable: process.execPath,
      argv: [codexCliScript, 'app-server', '--stdio'], cwd: this.cwd, env: codexEnvironment(process.env) });
    this.session = session;
    // stderr may contain private provider diagnostics. Never forward it to Core or UI.
    session.stderr.resume();
    this.lines = createInterface({ input: session.stdout });
    this.lines.on('line', (line) => this.receive(line));
    this.exitPromise = session.exit.then(() => {
        this.closed = true;
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Codex app-server exited'));
        }
        this.pending.clear();
        for (const listener of this.listeners) listener({ method: 'forge/processExited' });
    });
    await this.request('initialize', { clientInfo: { name: 'forge_spike', title: 'Forge Executor Spike', version: '0.0.1' } }, 15_000);
    this.notify('initialized', {});
  }

  onMessage(listener: (message: RpcMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async request(method: string, params: unknown, timeoutMs = 30_000): Promise<unknown> {
    if (this.closed || !this.session) throw new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Codex app-server unavailable');
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ExecutorError('EXECUTOR_TIMEOUT', `Codex ${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ method, params, id });
    });
  }

  notify(method: string, params: unknown): void { this.send({ method, params }); }

  respond(id: number, result: unknown): void { this.send({ id, result }); }

  private send(message: object): void {
    if (this.closed || !this.session?.stdin.writable) throw new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Codex app-server unavailable');
    this.session.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { this.failProtocol(); return; }
    if (typeof raw !== 'object' || raw === null) { this.failProtocol(); return; }
    const message = raw as Partial<RpcMessage & RpcResponse>;
    if (typeof message.id === 'number' && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new ExecutorError('EXECUTOR_PROTOCOL_ERROR', `Codex rejected ${message.error.code}`));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method !== 'string') { this.failProtocol(); return; }
    for (const listener of this.listeners) listener(message as RpcMessage);
  }

  private failProtocol(): void {
    for (const listener of this.listeners) listener({ method: 'forge/invalidResponse' });
  }

  async dispose(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      if (!this.session) return;
      this.session.stdin.end();
      const report = await this.controller.terminate(this.session.descriptor.processId);
      if (!report.confirmed) throw new ExecutorError('EXECUTOR_RUNTIME_ERROR', 'Codex process tree could not be confirmed stopped');
      await this.exitPromise;
      this.lines?.close();
      this.listeners.clear();
    })();
    return this.closing;
  }
}
