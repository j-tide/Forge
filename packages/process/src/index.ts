import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Writable, Readable } from 'node:stream';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export const processDescriptorSchema = z.strictObject({
  processId: z.uuid(), runId: id, runtimeId: z.uuid(), pid: z.number().int().positive(),
  parentProcessId: z.string().nullable(), executable: z.string().min(1), argv: z.array(z.string()),
  cwd: z.string().min(1), startedAt: z.string().datetime(),
  status: z.enum(['running', 'cancelling', 'exited', 'cancelled', 'quarantined']),
});
export type ProcessDescriptor = z.infer<typeof processDescriptorSchema>;
export type SpawnRequest = { runId: string; executable: string; argv: string[]; cwd: string;
  env?: NodeJS.ProcessEnv; parentProcessId?: string | null };
export type ProcessSession = { descriptor: ProcessDescriptor; stdin: Writable; stdout: Readable;
  stderr: Readable; exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  closed: Promise<void> };
export type CancellationReport = { runId: string; confirmed: boolean; processIds: string[]; forced: boolean };
type Owned = { descriptor: ProcessDescriptor; child: ChildProcessWithoutNullStreams;
  exit: ProcessSession['exit']; observedGone: boolean };
type Journal = Pick<ProcessDescriptor, 'processId' | 'runId' | 'runtimeId' | 'pid' | 'parentProcessId' | 'startedAt' | 'status'>;

export function minimalProcessEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = ['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_ALL', 'APPDATA', 'LOCALAPPDATA',
    'USERPROFILE', 'TEMP', 'TMP', 'SystemRoot', 'ComSpec'];
  return Object.fromEntries(allowed.flatMap((key) => typeof source[key] === 'string' ? [[key, source[key]]] : []));
}

/** Owns only children it spawned. POSIX process groups are isolated per top-level child. */
export class ProcessController {
  private readonly records = new Map<string, Owned>();
  private readonly cancelling = new Map<string, Promise<CancellationReport>>();
  private readonly completedCancellation = new Map<string, CancellationReport>();
  private accepting = true;
  constructor(readonly runtimeId: string = randomUUID(), private readonly journalDir?: string,
    private readonly graceMs = 800, private readonly forceMs = 2_000) {
    z.uuid().parse(runtimeId);
  }

  private async journal(record: ProcessDescriptor): Promise<void> {
    if (!this.journalDir) return;
    await mkdir(this.journalDir, { recursive: true, mode: 0o700 });
    const safe: Journal = { processId: record.processId, runId: record.runId, runtimeId: record.runtimeId,
      parentProcessId: record.parentProcessId,
      pid: record.pid, startedAt: record.startedAt, status: record.status };
    const target = join(this.journalDir, `${record.processId}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(safe), { mode: 0o600 });
    await rename(temporary, target);
  }

  async spawn(input: SpawnRequest): Promise<ProcessSession> {
    if (!this.accepting) throw new Error('ProcessController is stopping');
    id.parse(input.runId);
    if (this.cancelling.has(input.runId)) throw new Error('Process Run is being cancelled');
    if (this.hasActive(input.runId)) throw new Error('Process Run already has an active process group');
    this.completedCancellation.delete(input.runId);
    if (process.platform === 'win32') throw new Error('Windows process-tree backend is unverified and unavailable');
    if (process.platform !== 'darwin' && process.platform !== 'linux') throw new Error('Unsupported process-tree platform');
    if (!input.executable || !Array.isArray(input.argv) || input.argv.some((part) => typeof part !== 'string')) {
      throw new Error('Executable and argv[] are required');
    }
    const cwd = await realpath(input.cwd);
    if (!(await stat(cwd)).isDirectory()) throw new Error('Process cwd must be a directory');
    const child = spawn(input.executable, input.argv, {
      cwd, env: input.env ?? minimalProcessEnvironment(process.env), shell: false, detached: true,
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    } catch (error) { throw new Error('Owned process failed to start', { cause: error }); }
    if (!child.pid) throw new Error('Owned process has no PID');
    const descriptor = processDescriptorSchema.parse({ processId: randomUUID(), runId: input.runId,
      runtimeId: this.runtimeId, pid: child.pid, parentProcessId: input.parentProcessId ?? null,
      executable: input.executable, argv: input.argv, cwd, startedAt: new Date().toISOString(), status: 'running' });
    const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    const owned: Owned = { descriptor, child, exit, observedGone: false };
    this.records.set(descriptor.processId, owned);
    try { await this.journal(descriptor); }
    catch (error) {
      this.signalGroup(owned, 'SIGKILL');
      await this.waitGone(owned, this.forceMs);
      this.records.delete(descriptor.processId);
      throw new Error('Process ownership record could not be written', { cause: error });
    }
    void exit.then(() => { if (this.groupAlive(owned)) return;
      if (owned.descriptor.status === 'running') { owned.descriptor.status = 'exited'; void this.journal(owned.descriptor); }
    });
    return { descriptor, stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, exit, closed };
  }

  private groupAlive(owned: Owned): boolean {
    if (owned.observedGone) return false;
    try { process.kill(-owned.descriptor.pid, 0); return true; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') { owned.observedGone = true; return false; }
      return true; // EPERM/unknown is not proof of exit.
    }
  }

  private signalGroup(owned: Owned, signal: NodeJS.Signals): void {
    if (owned.descriptor.runtimeId !== this.runtimeId || !this.groupAlive(owned)) return;
    try { process.kill(-owned.descriptor.pid, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; owned.observedGone = true; }
  }

  private async waitGone(owned: Owned, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) { if (!this.groupAlive(owned)) return true; await delay(40); }
    return !this.groupAlive(owned);
  }

  inspect(processId: string): ProcessDescriptor | null {
    const owned = this.records.get(processId);
    if (!owned) return null;
    if (owned.descriptor.status === 'running' && !this.groupAlive(owned)) owned.descriptor.status = 'exited';
    return processDescriptorSchema.parse({ ...owned.descriptor, argv: [...owned.descriptor.argv] });
  }

  inspectRun(runId: string): ProcessDescriptor[] {
    id.parse(runId);
    return [...this.records.values()].filter((owned) => owned.descriptor.runId === runId)
      .map((owned) => this.inspect(owned.descriptor.processId)).filter((value): value is ProcessDescriptor => value !== null);
  }

  hasActive(runId: string): boolean {
    return [...this.records.values()].some((owned) => owned.descriptor.runId === runId && this.groupAlive(owned));
  }

  cancel(runId: string): Promise<CancellationReport> {
    id.parse(runId);
    const prior = this.cancelling.get(runId);
    if (prior) return prior;
    const completed = this.completedCancellation.get(runId);
    if (completed) return Promise.resolve(completed);
    const operation = this.cancelOwned(runId).then((report) => {
      this.completedCancellation.set(runId, report);
      this.cancelling.delete(runId);
      return report;
    }, (error: unknown) => { this.cancelling.delete(runId); throw error; });
    this.cancelling.set(runId, operation);
    return operation;
  }

  async terminate(processId: string): Promise<CancellationReport> {
    const owned = this.records.get(processId);
    if (!owned) throw new Error('Unknown process identity');
    return this.cancel(owned.descriptor.runId);
  }

  private async cancelOwned(runId: string): Promise<CancellationReport> {
    const targets = [...this.records.values()].filter((owned) => owned.descriptor.runId === runId);
    let forced = false;
    for (const owned of targets) {
      if (!this.groupAlive(owned)) continue;
      owned.descriptor.status = 'cancelling';
      await this.journal(owned.descriptor);
      this.signalGroup(owned, 'SIGTERM');
    }
    for (const owned of targets) {
      if (await this.waitGone(owned, this.graceMs)) continue;
      forced = true;
      this.signalGroup(owned, 'SIGKILL');
    }
    const confirmed = (await Promise.all(targets.map((owned) => this.waitGone(owned, this.forceMs)))).every(Boolean);
    for (const owned of targets) {
      owned.descriptor.status = confirmed ? 'cancelled' : 'quarantined';
      await this.journal(owned.descriptor);
    }
    return { runId, confirmed, processIds: targets.map(({ descriptor }) => descriptor.processId), forced };
  }

  async inspectOrphans(): Promise<Journal[]> {
    if (!this.journalDir) return [];
    let names: string[];
    try { names = await readdir(this.journalDir); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const result: Journal[] = [];
    for (const name of names.filter((value) => /^[0-9a-f-]{36}\.json$/.test(value))) {
      try {
        const record = JSON.parse(await readFile(join(this.journalDir, name), 'utf8')) as Journal;
        if (record.runtimeId !== this.runtimeId && ['running', 'cancelling', 'quarantined'].includes(record.status)) result.push(record);
      } catch { /* invalid records are not trusted as ownership evidence */ }
    }
    return result;
  }

  async dispose(): Promise<CancellationReport[]> {
    this.accepting = false;
    const runs = [...new Set([...this.records.values()].map((owned) => owned.descriptor.runId))];
    return Promise.all(runs.map((runId) => this.cancel(runId)));
  }
}
