import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import type { WorkerConfig, WorkerMessage } from '../types';
import type { TaskLogs } from '../../../../shared/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
let fixtureRoot: string;
let workerPath: string;

type Scenario = 'success' | 'provider-error' | 'abort-pending' | 'setup-error' | 'invalid-config' | 'path-containment'
  | 'background-success' | 'background-error' | 'background-cancel';

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function shellQuote(value: string): string {
  return process.platform === 'win32' ? `"${value}"` : `'${value.replace(/'/g, "'\\''")}'`;
}

// Build the real entry into a private directory: these regressions do not use
// a stale out/ worker, a mock Worker, or a mock session/tool/log writer.
beforeAll(async () => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), 'forge-worker-regression-'));
  symlinkSync(path.join(root, 'node_modules'), path.join(fixtureRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  await build({
    configFile: false,
    envDir: false,
    root,
    logLevel: 'silent',
    publicDir: false,
    define: { __SERPER_API_KEY__: JSON.stringify('') },
    build: {
      ssr: path.join(root, 'src/main/ai/agent/worker.ts'),
      target: 'node24',
      outDir: path.join(fixtureRoot, 'bundle'),
      minify: false,
      rollupOptions: {
        external: [...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)],
        output: { format: 'es', entryFileNames: 'worker.mjs' },
      },
    },
  });
  workerPath = path.join(fixtureRoot, 'bundle/worker.mjs');
}, 30_000);

afterAll(() => {
  if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
});

async function runWorker(scenario: Scenario) {
  const dir = path.join(fixtureRoot, scenario);
  const home = path.join(dir, 'home');
  const projectDir = path.join(dir, 'project');
  const specDir = path.join(projectDir, '.forge-glass-preview/specs', scenario);
  const tracePath = path.join(dir, 'transport.jsonl');
  const canary = path.join(dir, 'outside-project.txt');
  const backgroundPidsPath = path.join(projectDir, 'background-pids.json');
  const backgroundScript = path.join(projectDir, 'background.cjs');
  const backgroundCommand = `${shellQuote(process.execPath)} ${shellQuote(backgroundScript)}`;
  const hasBackground = scenario.startsWith('background-');
  mkdirSync(home, { recursive: true });
  mkdirSync(specDir, { recursive: true });
  writeFileSync(path.join(projectDir, 'seed.txt'), 'FORGE_OFFLINE_SEED_20261006\n');
  writeFileSync(canary, 'UNCHANGED_ACCEPTANCE_CANARY\n');
  if (hasBackground) {
    // Both processes inherit the tool's stdio and process group. The root delays
    // its TERM exit so a kill request alone cannot satisfy close-before-result.
    writeFileSync(backgroundScript, `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000); setTimeout(() => process.exit(0), 10000)'], { stdio: 'inherit' });
process.on('SIGTERM', () => setTimeout(() => process.exit(0), 75));
fs.writeFileSync(${JSON.stringify(backgroundPidsPath)}, JSON.stringify([process.pid, child.pid]));
setInterval(() => {}, 1000);
setTimeout(() => process.exit(0), 10000);
`);
  }
  const config: WorkerConfig = {
    taskId: `regression-${scenario}`,
    projectId: 'worker-regression-only',
    processType: 'task-execution',
    session: {
      agentType: hasBackground ? 'insights' : 'spec_gatherer',
      systemPrompt: 'Offline transport regression: Read seed.txt, Write artifact.txt, then Read it.',
      initialMessages: [{ role: 'user', content: 'Use the supplied isolated project.' }],
      provider: scenario === 'setup-error' ? 'fixture-unsupported-provider' : 'ollama',
      modelId: 'forge-local-transport-fixture',
      baseURL: 'http://127.0.0.1:11439',
      maxSteps: 5,
      phase: 'coding',
      specDir,
      projectDir,
      mcpOptions: {
        context7Enabled: false, memoryEnabled: false, linearEnabled: false,
        electronMcpEnabled: false, puppeteerMcpEnabled: false,
      },
      toolContext: { cwd: projectDir, projectDir, specDir },
    },
  };
  const worker = new Worker(workerPath, {
    workerData: scenario === 'invalid-config' ? { taskId: config.taskId } : config,
    execArgv: ['--import', pathToFileURL(path.join(root, 'tests/fixtures/worker-transport.mjs')).href],
    env: {
      PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: home, CFFIXED_USER_HOME: home, TMPDIR: dir, TZ: 'UTC',
      FORGE_FIXTURE_SCENARIO: scenario, FORGE_FIXTURE_TRACE: tracePath, FORGE_FIXTURE_CANARY: canary,
      FORGE_FIXTURE_BACKGROUND_COMMAND: backgroundCommand,
      FORGE_FIXTURE_BACKGROUND_PIDS: backgroundPidsPath,
    },
    stdout: true,
    stderr: true,
  });
  const messages: WorkerMessage[] = [];
  let threadError: Error | undefined;
  let abortSent = false;
  let backgroundAliveAtResult: number[] = [];
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const exited = new Promise<number>(resolve => {
    worker.on('message', (message: WorkerMessage) => {
      messages.push(message);
      if (hasBackground && message.type === 'result') {
        const pids = JSON.parse(readFileSync(backgroundPidsPath, 'utf8')) as number[];
        backgroundAliveAtResult = pids.filter(isProcessAlive);
      }
    });
    worker.on('error', error => { threadError = error instanceof Error ? error : new Error(String(error)); });
    worker.once('exit', resolve);
  });
  // The transport signals when the actual SDK request is waiting, rather than
  // cancelling after a guessed delay or injecting a fake Worker result.
  const abortPoll = scenario === 'abort-pending' || scenario === 'background-cancel' ? setInterval(() => {
    try {
      if (!abortSent && readFileSync(tracePath, 'utf8').includes('fixture-pending-until-abort')) {
        abortSent = true;
        worker.postMessage({ type: 'abort' });
      }
    } catch { /* The request has not started yet. */ }
  }, 5) : undefined;
  try {
    const exitCode = await Promise.race([
      exited,
      new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error(`Worker ${scenario} did not exit naturally`)), 2500);
      }),
    ]);
    const trace = readFileSync(tracePath, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(trace.filter(item => item.type.startsWith('blocked-'))).toEqual([]);
    const resultMessages = messages.filter((message): message is Extract<WorkerMessage, { type: 'result' }> => message.type === 'result');
    let logs: TaskLogs | undefined;
    try { logs = JSON.parse(readFileSync(path.join(specDir, 'task_logs.json'), 'utf8')); } catch { /* Setup/invalid config may precede logs. */ }
    return { messages, resultMessages, exitCode, threadError, trace, logs, projectDir, canary, abortSent, backgroundAliveAtResult, threadId: worker.threadId };
  } finally {
    if (watchdog !== undefined) clearTimeout(watchdog);
    if (abortPoll) clearInterval(abortPoll);
    // Failure cleanup is scoped to the thread made by this test. A passing test
    // must have observed its real exit before this fallback is reached.
    if (worker.threadId !== -1) await worker.terminate();
    if (hasBackground) {
      // RED/failure cleanup only ever targets PIDs created by this fixture.
      try {
        const pids = JSON.parse(readFileSync(backgroundPidsPath, 'utf8')) as number[];
        for (const pid of pids.reverse()) {
          try {
            if (!isProcessAlive(pid)) continue;
            if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
            else process.kill(pid, 'SIGKILL');
          } catch { /* This synthetic process may already have exited. */ }
        }
      } catch { /* Setup can fail before any subprocess starts. */ }
    }
  }
}

describe('real Worker outcomes and natural shutdown with offline transport', () => {
  it.each([
    ['background-success', 'completed'],
    ['background-error', 'error'],
    ['background-cancel', 'cancelled'],
  ] as const)('closes owned background commands and descendants before the %s terminal result', async (scenario, outcome) => {
    const run = await runWorker(scenario);
    expect(run.resultMessages).toHaveLength(1);
    expect(run.resultMessages[0].data.outcome).toBe(outcome);
    expect(run.backgroundAliveAtResult).toEqual([]);
    expect(run.trace.some(item => item.type === 'fixture-background-ready-before-next-step')).toBe(true);
    expect(run.trace.some(item => item.type === 'fixture-background-close')).toBe(true);
    expect(run.threadId).toBe(-1);
  });

  it('completes actual Read/Write/Read and persists logs before natural exit', async () => {
    const run = await runWorker('success');
    expect(run.threadError).toBeUndefined();
    expect(run.threadId).toBe(-1);
    expect(run.resultMessages).toHaveLength(1);
    expect(run.resultMessages[0].data.outcome).toBe('completed');
    expect(run.resultMessages[0].data.toolCallCount).toBe(3);
    expect(readFileSync(path.join(run.projectDir, 'artifact.txt'), 'utf8')).toBe('FORGE_OFFLINE_ARTIFACT_20261006\nWritten by the actual Forge Write tool.\n');
    expect(run.logs?.phases.coding.status).toBe('completed');
    expect(run.logs?.phases.coding.entries.filter(entry => entry.type === 'tool_end')).toHaveLength(3);
    expect(run.exitCode).toBe(0);
  });

  it('returns error for the actual SDK 400 response and closes its thread', async () => {
    const run = await runWorker('provider-error');
    expect(run.resultMessages).toHaveLength(1);
    expect(run.resultMessages[0].data.outcome).toBe('error');
    expect(run.resultMessages[0].data.error).toBeDefined();
    expect(run.logs?.phases.coding.status).toBe('failed');
    expect(run.logs?.phases.coding.entries.some(entry => entry.type === 'error')).toBe(true);
    expect(run.threadId).toBe(-1);
  });

  it('returns cancelled when abort reaches a pending SDK request and closes its thread', async () => {
    const run = await runWorker('abort-pending');
    expect(run.abortSent).toBe(true);
    expect(run.trace.some(item => item.type === 'fixture-aborted')).toBe(true);
    expect(run.resultMessages).toHaveLength(1);
    expect(run.resultMessages[0].data.outcome).toBe('cancelled');
    expect(run.logs?.phases.coding.status).toBe('failed');
    expect(run.threadId).toBe(-1);
  });

  it('returns a single failed result for setup errors and exits without model requests', async () => {
    const run = await runWorker('setup-error');
    expect(run.resultMessages).toHaveLength(1);
    expect(run.resultMessages[0].data.outcome).toBe('error');
    expect(run.resultMessages[0].data.error?.message).toContain('Unsupported provider');
    expect(run.trace.filter(item => item.type === 'fixture-request')).toHaveLength(0);
    expect(run.threadId).toBe(-1);
  });

  it('fails invalid workerData through a native error and naturally exits', async () => {
    const run = await runWorker('invalid-config');
    expect(run.threadError?.message).toContain('requires valid WorkerConfig');
    expect(run.resultMessages).toHaveLength(0);
    expect(run.exitCode).toBe(1);
    expect(run.threadId).toBe(-1);
  });

  it('allows a recoverable tool error without misclassifying the session', async () => {
    const run = await runWorker('path-containment');
    expect(readFileSync(run.canary, 'utf8')).toBe('UNCHANGED_ACCEPTANCE_CANARY\n');
    expect(run.resultMessages).toHaveLength(1);
    expect(run.resultMessages[0].data.outcome).toBe('completed');
    expect(run.messages.some(message => message.type === 'stream-event' && message.data.type === 'tool-result' && message.data.isError)).toBe(true);
    expect(run.logs?.phases.coding.status).toBe('completed');
    expect(run.threadId).toBe(-1);
  });
});
