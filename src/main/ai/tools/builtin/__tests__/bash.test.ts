import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

import { bashTool } from '../bash';
import type { ToolContext } from '../../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSpawn = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execFile: vi.fn(),
}));

const mockIsWindows = vi.fn(() => false);
const mockFindExecutable = vi.fn(() => null);

vi.mock('../../../../platform/index', () => ({
  isWindows: () => mockIsWindows(),
  findExecutable: (_name: string, _additionalPaths?: string[]) => mockFindExecutable(),
}));

const mockBashSecurityHook = vi.fn(() => ({}));
vi.mock('../../../security/bash-validator', () => ({
  bashSecurityHook: (_input: unknown, _profile?: unknown) => mockBashSecurityHook(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseContext: ToolContext = {
  cwd: '/test/project',
  projectDir: '/test/project',
  specDir: '/test/specs/001',
  securityProfile: {
    baseCommands: new Set(),
    stackCommands: new Set(),
    scriptCommands: new Set(),
    customCommands: new Set(),
    customScripts: { shellScripts: [] },
    getAllAllowedCommands: () => new Set(),
  },
} as unknown as ToolContext;

/**
 * Emit the output and close events observed from a real spawned command.
 */
function setupCommand(stdout: string, stderr: string, exitCode: number) {
  mockSpawn.mockImplementation(
    () => {
      const output = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
      const errorOutput = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
      const child = Object.assign(new EventEmitter(), { pid: undefined, stdout: output, stderr: errorOutput });
      queueMicrotask(() => {
        output.emit('data', stdout);
        errorOutput.emit('data', stderr);
        child.emit('close', exitCode);
      });
      return child;
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bash Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsWindows.mockReturnValue(false);
    mockBashSecurityHook.mockReturnValue({});
  });

  it('should have correct metadata', () => {
    expect(bashTool.metadata.name).toBe('Bash');
    expect(bashTool.metadata.permission).toBe('requires_approval');
  });

  it('should return stdout from successful command', async () => {
    setupCommand('hello from bash\n', '', 0);

    const result = await bashTool.config.execute(
      { command: 'echo hello from bash' },
      baseContext,
    );

    expect(result).toContain('hello from bash');
  });

  it('should include stderr in output when present', async () => {
    setupCommand('', 'some warning\n', 0);

    const result = await bashTool.config.execute(
      { command: 'cmd-with-stderr' },
      baseContext,
    );

    expect(result).toContain('STDERR:');
    expect(result).toContain('some warning');
  });

  it('should include exit code in output when non-zero', async () => {
    setupCommand('', '', 1);

    const result = await bashTool.config.execute(
      { command: 'failing-command' },
      baseContext,
    );

    expect(result).toContain('Exit code: 1');
  });

  it('should return (no output) when stdout and stderr are empty and exit code is 0', async () => {
    setupCommand('', '', 0);

    const result = await bashTool.config.execute(
      { command: 'silent-command' },
      baseContext,
    );

    expect(result).toBe('(no output)');
  });

  it('should truncate output exceeding MAX_OUTPUT_LENGTH', async () => {
    const longOutput = 'x'.repeat(31_000);
    setupCommand(longOutput, '', 0);

    const result = await bashTool.config.execute(
      { command: 'long-output-cmd' },
      baseContext,
    );

    expect(result).toContain('[Output truncated');
    expect(result.length).toBeLessThan(longOutput.length);
  });

  it('should return error message when security hook rejects command', async () => {
    mockBashSecurityHook.mockReturnValue({
      hookSpecificOutput: {
        permissionDecisionReason: 'command is blocked for safety',
      },
    });

    const result = await bashTool.config.execute(
      { command: 'rm -rf /' },
      baseContext,
    );

    expect(result).toContain('Error: Command not allowed');
    expect(result).toContain('command is blocked for safety');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should start command in background and return immediately', async () => {
    // In background mode the execute call is fire-and-forget, so mockSpawn
    // may or may not be called synchronously. The return value is what matters.
    mockSpawn.mockImplementation(
      () => {
        const child = Object.assign(new EventEmitter(), { pid: undefined });
        queueMicrotask(() => child.emit('close', 0));
        return child;
      },
    );

    const result = await bashTool.config.execute(
      { command: 'sleep 100', run_in_background: true },
      baseContext,
    );

    expect(result).toContain('Command started in background');
    expect(result).toContain('sleep 100');
  });

  it('should pass cwd from context to execFile', async () => {
    setupCommand('output', '', 0);

    await bashTool.config.execute(
      { command: 'pwd' },
      baseContext,
    );

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: '/test/project' }),
    );
  });

  it('should cap timeout to MAX_TIMEOUT_MS (600000)', async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), { pid: undefined });
    mockSpawn.mockReturnValueOnce(child);
    try {
      const running = bashTool.config.execute({ command: 'cmd', timeout: 9_000_000 }, baseContext);
      await vi.advanceTimersByTimeAsync(600_000);
      child.emit('close', 0);
      expect(await running).toContain('Exit code: 1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should use /bin/bash as shell on non-Windows', async () => {
    mockIsWindows.mockReturnValue(false);
    setupCommand('output', '', 0);

    await bashTool.config.execute(
      { command: 'echo hi' },
      baseContext,
    );

    expect(mockSpawn).toHaveBeenCalledWith(
      '/bin/bash',
      ['-c', 'echo hi'],
      expect.any(Object),
    );
  });

  it('should use cmd.exe args (/c) on Windows when bash not found', async () => {
    // The Windows branch uses /c rather than -c for cmd.exe.
    // We verify the logic by checking that bash uses -c on non-Windows (already tested
    // above) and that the findExecutable mock would select the right executable.
    // This test validates the cmd.exe ComSpec fallback resolution path.
    mockIsWindows.mockReturnValue(true);
    mockFindExecutable.mockReturnValue(null);

    const origComSpec = process.env.ComSpec;
    process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe';

    setupCommand('output', '', 0);

    await bashTool.config.execute(
      { command: 'dir' },
      baseContext,
    );

    // Verify that on Windows with no bash found, cmd.exe with /c flag is used
    const callArgs = mockSpawn.mock.calls[0];
    const shell = callArgs[0] as string;
    const args = callArgs[1] as string[];

    // The shell should be cmd.exe (via ComSpec) and arg should be /c
    expect(shell).toBe('C:\\Windows\\System32\\cmd.exe');
    expect(args[0]).toBe('/c');
    expect(args[1]).toBe('dir');

    process.env.ComSpec = origComSpec;
  });
});
