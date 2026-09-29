import type { ChildProcess, ExecFileException, ExecFileOptions } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../types';

const { findExecutable, execution } = vi.hoisted(() => ({
  findExecutable: vi.fn(),
  execution: {
    child: undefined as ChildProcess | undefined,
    ready: undefined as Promise<void> | undefined,
    callback: undefined as Promise<void> | undefined,
    close: undefined as Promise<void> | undefined,
    closed: false,
    callbackBeforeClose: false,
    callbackError: undefined as ExecFileException | null | undefined,
    exitCode: undefined as number | null | undefined,
    signalCode: undefined as NodeJS.Signals | null | undefined,
  },
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFile: vi.fn((
      executable: string,
      args: string[],
      options: ExecFileOptions,
      callback: (error: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => void,
    ) => {
      let callbackSeen!: () => void;
      execution.callback = new Promise<void>(resolve => { callbackSeen = resolve; });
      const child = actual.execFile(executable, args, options, (error, stdout, stderr) => {
        execution.callbackBeforeClose = !execution.closed;
        execution.callbackError = error;
        callback(error, stdout, stderr);
        callbackSeen();
      });
      execution.child = child;
      execution.close = new Promise<void>(resolve => {
        child.once('close', (code, signal) => {
          execution.closed = true;
          execution.exitCode = code;
          execution.signalCode = signal;
          resolve();
        });
      });
      execution.ready = new Promise<void>((resolve, reject) => {
        let output = '';
        child.stdout?.on('data', chunk => {
          output += String(chunk);
          if (output.includes('READY\n')) resolve();
        });
        child.once('error', error => {
          if (!output.includes('READY\n')) reject(error);
        });
        child.once('close', () => {
          if (!output.includes('READY\n')) reject(new Error('Test child closed before readiness'));
        });
      });
      return child;
    }),
  };
});
vi.mock('../../../../platform/index', () => ({
  findExecutable,
  isWindows: () => process.platform === 'win32',
}));

import { grepTool } from '../grep';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

describe('Grep real subprocess lifecycle', () => {
  it.skipIf(process.platform === 'win32')('waits for child close when the abort callback arrives before delayed SIGTERM teardown', async () => {
    const projectDir = realpathSync(mkdtempSync(join(tmpdir(), 'forge-grep-process-')));
    const nodeInterpreter = join(projectDir, 'node-interpreter');
    const executable = join(projectDir, 'delayed-rg');
    const abort = new AbortController();
    const context: ToolContext = {
      cwd: projectDir,
      projectDir,
      specDir: join(projectDir, 'specs'),
      abortSignal: abort.signal,
      securityProfile: {
        baseCommands: new Set(), stackCommands: new Set(), scriptCommands: new Set(),
        customCommands: new Set(), customScripts: { shellScripts: [] },
        getAllAllowedCommands: () => new Set(),
      },
    };

    try {
      symlinkSync(process.execPath, nodeInterpreter);
      writeFileSync(executable, [
        `#!${nodeInterpreter}`,
        'const keepAlive = setInterval(() => {}, 1000);',
        "process.on('SIGTERM', () => {",
        '  setTimeout(() => { clearInterval(keepAlive); process.exit(0); }, 100);',
        '});',
        "process.stdout.write('READY\\n');",
        '',
      ].join('\n'), { mode: 0o755 });
      findExecutable.mockReturnValue(executable);
      const response = Promise.resolve(grepTool.config.execute({ pattern: 'example' }, context));
      const completed = vi.fn();
      void response.then(completed, () => undefined);
      expect(execution.ready).toBeDefined();
      // Explicit deadlines let failure reach our cleanup before Vitest's outer timeout.
      await withDeadline(execution.ready as Promise<void>, 5000, 'child readiness');
      const child = execution.child;
      expect(child?.pid).toBeTypeOf('number');
      const pid = child?.pid as number;
      expect(isProcessAlive(pid)).toBe(true);

      abort.abort();
      await withDeadline(execution.callback as Promise<void>, 1000, 'abort callback');
      await Promise.resolve();
      await Promise.resolve();
      // Node acknowledges AbortSignal before the signal handler finishes exiting.
      expect(execution.callbackError?.name).toBe('AbortError');
      expect(execution.callbackBeforeClose).toBe(true);
      expect(execution.closed).toBe(false);
      expect(completed).not.toHaveBeenCalled();

      await withDeadline(response, 1500, 'Grep close acknowledgement');
      expect(execution.closed).toBe(true);
      expect(execution.exitCode).toBe(0);
      expect(execution.signalCode).toBeNull();
      expect(isProcessAlive(pid)).toBe(false);
      expect(completed).toHaveBeenCalledOnce();
    } finally {
      // A failed assertion must never leave the real local child behind.
      const child = execution.child;
      if (child && !execution.closed) child.kill('SIGKILL');
      if (execution.close) await execution.close;
      rmSync(projectDir, { recursive: true, force: true });
      vi.restoreAllMocks();
    }
  }, 10_000);
});
