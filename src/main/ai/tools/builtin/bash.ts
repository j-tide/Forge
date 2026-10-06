/**
 * Bash Command Tool
 * =================
 *
 * Executes bash commands with security validation.
 * Integrates with bashSecurityHook() for pre-execution command allowlisting.
 * Supports timeouts, background execution, and descriptive metadata.
 */

import { execFile, spawn } from 'node:child_process';
import { z } from 'zod/v3';

import { findExecutable, isWindows } from '../../../platform/index';
import { getTaskkillExePath } from '../../../utils/windows-paths';
import { bashSecurityHook } from '../../security/bash-validator';
import { Tool } from '../define';
import { ToolPermission } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_LENGTH = 30_000;
const COMMAND_KILL_GRACE_MS = 1000;
const MAX_CAPTURE_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Input Schema
// ---------------------------------------------------------------------------

const inputSchema = z.object({
  command: z.string().describe('The bash command to execute'),
  timeout: z
    .number()
    .optional()
    .describe('Optional timeout in milliseconds (max 600000)'),
  run_in_background: z
    .boolean()
    .optional()
    .describe('Set to true to run this command in the background'),
  description: z
    .string()
    .optional()
    .describe('Clear, concise description of what this command does'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return output;
  }
  return `${output.slice(0, MAX_OUTPUT_LENGTH)}\n\n[Output truncated — ${output.length} characters total]`;
}

function resolveShell(): string {
  if (isWindows()) {
    // Prefer Git Bash on Windows; fall back to cmd.exe
    return findExecutable('bash') ?? (process.env.ComSpec || 'cmd.exe');
  }
  return '/bin/bash';
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function startCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): { result: Promise<CommandResult>; closed: Promise<void>; stop: () => void } {
  abortSignal?.throwIfAborted();
  const shell = resolveShell();
  const args = isWindows() && shell.toLowerCase().endsWith('cmd.exe')
    ? ['/c', command]
    : ['-c', command];

  let closed = false;
  let processClosed = false;
  let stopping = false;
  let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let groupPollTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveResult!: (value: CommandResult) => void;
  let resolveClosed!: () => void;
  const result = new Promise<CommandResult>(resolve => { resolveResult = resolve; });
  const commandClosed = new Promise<void>(resolve => { resolveClosed = resolve; });
  let stdout = '';
  let stderr = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let failed = false;
  let exitCode: number | null = null;
  let pendingTreeKills = 0;
  const child = spawn(shell, args, {
    cwd,
    // A private POSIX process group lets shutdown target descendants without
    // touching another command. Keep the process referenced and owned.
    detached: !isWindows(),
    windowsHide: true,
    stdio: 'pipe',
  });

  const commandResult = (): CommandResult => ({ stdout, stderr, exitCode: failed ? 1 : exitCode ?? 1 });
  const groupAlive = (): boolean => {
    if (isWindows() || !child.pid) return false;
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
      throw error;
    }
  };
  const acknowledgeClose = (): void => {
    if (!processClosed || pendingTreeKills > 0) return;
    if (groupAlive()) {
      // A descendant with its own stdio can remain after the root's close event.
      // Its private process group remains ours until every member has exited.
      groupPollTimer = setTimeout(acknowledgeClose, 10);
      return;
    }
    closed = true;
    if (forceKillTimer) clearTimeout(forceKillTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (groupPollTimer) clearTimeout(groupPollTimer);
    abortSignal?.removeEventListener('abort', stop);
    resolveClosed();
    resolveResult(commandResult());
  };

  const killTree = (force: boolean): void => {
    if (!child.pid) return;
    if (isWindows()) {
      // Windows has no POSIX process groups: taskkill scopes the whole tree to
      // this command's PID. Its descendants must close before commandClosed.
      pendingTreeKills++;
      execFile(getTaskkillExePath(), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {
        pendingTreeKills--;
        acknowledgeClose();
      });
    } else {
      try {
        process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
  };
  const stop = (): void => {
    if (closed || stopping) return;
    stopping = true;
    failed = true;
    killTree(false);
    // Do not cancel escalation on root exit: descendants may still hold stdio.
    forceKillTimer = setTimeout(() => killTree(true), COMMAND_KILL_GRACE_MS);
  };
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (data: string) => {
    const remaining = Math.max(MAX_CAPTURE_BYTES - stdoutBytes, 0);
    stdout += Buffer.from(data).subarray(0, remaining).toString('utf8');
    stdoutBytes += Buffer.byteLength(data);
    if (stdoutBytes > MAX_CAPTURE_BYTES) {
      failed = true;
      stop();
    }
  });
  child.stderr?.on('data', (data: string) => {
    const remaining = Math.max(MAX_CAPTURE_BYTES - stderrBytes, 0);
    stderr += Buffer.from(data).subarray(0, remaining).toString('utf8');
    stderrBytes += Buffer.byteLength(data);
    if (stderrBytes > MAX_CAPTURE_BYTES) {
      failed = true;
      stop();
    }
  });
  child.once('error', (error) => {
    failed = true;
    stderr += error.message;
  });
  child.once('close', (code: number | null) => {
    processClosed = true;
    exitCode = code;
    // Normal shell completion may intentionally leave background descendants.
    // Return its output while the Worker owner retains those descendants.
    if (!stopping) resolveResult(commandResult());
    acknowledgeClose();
  });
  // Native execFile(signal) reports AbortError before the command closes. Own
  // cancellation instead, so result publication cannot outrun subprocess exit.
  abortSignal?.addEventListener('abort', stop, { once: true });
  if (abortSignal?.aborted) stop();
  if (timeoutMs > 0) timeoutTimer = setTimeout(stop, timeoutMs);
  return { result, closed: commandClosed, stop };
}

// ---------------------------------------------------------------------------
// Tool Definition
// ---------------------------------------------------------------------------

export const bashTool = Tool.define({
  metadata: {
    name: 'Bash',
    description:
      'Executes a given bash command with optional timeout. Use for git operations, command execution, and other terminal tasks.',
    permission: ToolPermission.RequiresApproval,
    executionOptions: {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      allowBackground: true,
    },
  },
  inputSchema,
  execute: async (input, context) => {
    const { command, timeout, run_in_background } = input;

    // Security: validate command against security profile via bashSecurityHook
    const hookResult = bashSecurityHook(
      {
        toolName: 'Bash',
        toolInput: { command },
        cwd: context.cwd,
      },
      context.securityProfile,
    );

    if ('hookSpecificOutput' in hookResult) {
      const reason = hookResult.hookSpecificOutput.permissionDecisionReason;
      return `Error: Command not allowed — ${reason}`;
    }

    const timeoutMs = Math.min(timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    const start = () => startCommand(command, context.cwd, timeoutMs, context.abortSignal);
    const running = context.backgroundCommands ? context.backgroundCommands.start(start) : start();
    if (run_in_background) {
      return `Command started in background: ${command}`;
    }

    const { stdout, stderr, exitCode } = await running.result;

    const parts: string[] = [];

    if (stdout) {
      parts.push(truncateOutput(stdout));
    }

    if (stderr) {
      parts.push(`STDERR:\n${truncateOutput(stderr)}`);
    }

    if (exitCode !== 0) {
      parts.push(`Exit code: ${exitCode}`);
    }

    return parts.length > 0 ? parts.join('\n') : '(no output)';
  },
});
