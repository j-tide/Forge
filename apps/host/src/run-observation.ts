import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { RunDiffPreview } from '@forge/contracts';
import type { ExecutorEvent } from '@forge/plugin-api';
import type { ForgePersistence } from '@forge/persistence';
import type { WorkspaceDescriptor } from '@forge/workspace';

const git = promisify(execFile);
const secretFile = /(^|\/)(\.env(?:\.|$)|[^/]+\.(?:pem|key|p12|pfx)$)/i;
export function redactRunText(text: string): string {
  return text.replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g, '[REDACTED]')
    .replace(/((?:^|[^A-Za-z0-9_])(?:[A-Za-z][A-Za-z0-9_]*_)?(?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,'";]+/gim, '$1[REDACTED]')
    .replace(/(Authorization\s*:\s*(?:Bearer|Basic)\s+)\S+/gi, '$1[REDACTED]')
    .replace(/((?:^|\n)(?:Set-)?Cookie\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]');
}
function summary(event: ExecutorEvent): string {
  switch (event.type) {
    case 'assistant.message': return event.text;
    case 'run.status': return event.status;
    case 'command.started': return 'Command started (arguments hidden)';
    case 'command.completed': return `Command exited ${event.exitCode ?? 'unknown'}`;
    case 'tool.started': case 'tool.completed': return event.name;
    case 'file.changed': return `${event.kind} ${event.path.split(/[\\/]/).at(-1) ?? 'file'}`;
    case 'approval.requested': return `${event.capability} approval requested`;
    case 'approval.resolved': return `Approval ${event.decision}`;
    case 'usage.updated': return `${event.inputTokens} input / ${event.outputTokens} output tokens`;
    case 'run.failed': return event.code;
    case 'run.started': case 'run.completed': case 'run.cancelled': return event.type;
  }
}

/** Saves bounded, redacted Forge events. Token deltas are coalesced within 100 ms. */
export class RunObservationRecorder {
  private pending: { from: number; event: ExecutorEvent & { type: 'assistant.message' }; text: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly storage: ForgePersistence, private readonly projectId: string,
    private readonly runId: string, private readonly attemptId: string,
    private readonly onError: (error: Error) => void) {}

  accept(event: ExecutorEvent): void {
    try {
      if (event.type === 'assistant.message') {
        if (this.pending && this.pending.text.length + event.text.length > 2048) this.flush();
        if (!this.pending) this.pending = { from: event.sequence, event, text: '' };
        this.pending.text += event.text.slice(0, 2048);
        this.pending.event = event;
        if (!this.timer) this.timer = setTimeout(() => { try { this.flush(); }
          catch (error) { this.onError(error as Error); } }, 100);
        return;
      }
      this.flush();
      this.write(event, event.sequence, summary(event));
      if (event.type === 'usage.updated') this.storage.saveRunUsage(this.projectId, this.runId,
        event.sequence, { inputTokens:event.inputTokens, outputTokens:event.outputTokens,
          cachedInputTokens:event.cachedInputTokens,cost:event.cost,currency:event.currency });
    } catch (error) { this.onError(error as Error); }
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const pending = this.pending;
    this.pending = null;
    if (pending) this.write(pending.event, pending.from, pending.text);
  }
  dispose(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; this.pending = null; }
  private write(event: ExecutorEvent, from: number, text: string): void {
    this.storage.appendRunObservation(this.projectId, { runId:this.runId,attemptId:this.attemptId,
      sourceSequenceFrom:from,sourceSequenceTo:event.sequence,type:event.type,
      text:redactRunText(text).slice(0,2048),timestamp:event.timestamp });
  }
}

/** A bounded, read-only preview. This is not the frozen CodeSnapshot from P2-09. */
export async function captureRunDiff(workspace: WorkspaceDescriptor): Promise<RunDiffPreview> {
  const root = workspace.rootPath;
  const options = { encoding: 'utf8' as const, timeout: 10_000, maxBuffer: 1024 * 1024 };
  const { stdout: status } = await git('git', ['-c', 'core.fsmonitor=false', '-C', root, 'status', '--porcelain=v1', '-z',
    '--untracked-files=all'], options);
  const entries = status.split('\0').filter(Boolean);
  const files: RunDiffPreview['files'] = [];
  let truncated = entries.length > 200;
  for (let index = 0; index < entries.length && files.length < 200; index++) {
    const entry = entries[index]!;
    const flag = entry.slice(0, 2);
    const path = entry.slice(3);
    if (flag.includes('R') || flag.includes('C')) index++; // porcelain -z adds the old name
    if (!path || secretFile.test(path) || path.includes('\0')) continue;
    const absolute = resolve(root, path);
    const rel = relative(root, absolute);
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel === '' || rel !== path) continue;
    files.push({ path, status: flag === '??' || flag.includes('A') ? 'added' :
      flag.includes('D') ? 'deleted' : flag.includes('R') ? 'renamed' : 'modified' });
  }
  const tracked = files.filter((file) => file.status !== 'added').map((file) => file.path);
  const textResult = tracked.length ? await git('git', ['-c', 'core.fsmonitor=false', '-C', root, 'diff', 'HEAD', '--no-ext-diff',
    '--no-textconv', '--no-color', '--', ...tracked], options) : { stdout: '' };
  let text = textResult.stdout;
  for (const file of files.filter((item) => item.status === 'added')) {
    if (text.length >= 60_000) { truncated = true; break; }
    const target = resolve(root, file.path);
    try {
      const stat = await lstat(target);
      if (!stat.isFile() || stat.size > 8192) { truncated = true; continue; }
      const content = await readFile(target, 'utf8');
      if (content.includes('\0')) { truncated = true; continue; }
      text += `\n--- /dev/null\n+++ ${file.path}\n` + content.split('\n').map((line) => `+${line}`).join('\n');
    } catch { truncated = true; }
  }
  if (text.length > 65536) truncated = true;
  return { files, text: redactRunText(text).slice(0,65536), truncated,
    capturedAt:new Date().toISOString() };
}
