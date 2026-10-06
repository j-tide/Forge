import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bashTool } from '../bash';
import { BackgroundCommandOwner } from '../../background-command-owner';
import type { ToolContext } from '../../types';

const fixtures: Array<{ dir: string; owner: BackgroundCommandOwner }> = [];

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForPids(file: string): Promise<number[]> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    try { return JSON.parse(readFileSync(file, 'utf8')) as number[]; } catch { /* Synthetic child is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Synthetic Bash process did not become ready');
}

function fixture(ignoreChildTerm = false) {
  const dir = mkdtempSync(path.join(tmpdir(), 'forge-bash-owner-'));
  const owner = new BackgroundCommandOwner();
  fixtures.push({ dir, owner });
  const pidsPath = path.join(dir, 'pids.json');
  const script = path.join(dir, 'command.cjs');
  const childCode = `${ignoreChildTerm ? "process.on('SIGTERM', () => {});" : ''} process.send('ready'); setInterval(() => {}, 1000); setTimeout(() => process.exit(0), 10000);`;
  writeFileSync(script, `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: ${JSON.stringify(ignoreChildTerm ? ['ignore', 'ignore', 'ignore', 'ipc'] : ['inherit', 'inherit', 'inherit', 'ipc'])} });
process.on('SIGTERM', () => setTimeout(() => process.exit(0), 75));
child.once('message', () => fs.writeFileSync(${JSON.stringify(pidsPath)}, JSON.stringify([process.pid, child.pid])));
setInterval(() => {}, 1000);
setTimeout(() => process.exit(0), 10000);
`);
  const quote = (value: string) => process.platform === 'win32' ? `"${value}"` : `'${value.replace(/'/g, "'\\''")}'`;
  const command = `${quote(process.execPath)} ${quote(script)}`;
  const context: ToolContext = {
    cwd: dir, projectDir: dir, specDir: dir,
    securityProfile: {
      baseCommands: new Set(), stackCommands: new Set(), scriptCommands: new Set(), customCommands: new Set(),
      customScripts: { shellScripts: [] }, getAllAllowedCommands: () => new Set(),
    },
    backgroundCommands: owner,
  };
  return { owner, context, command, pidsPath };
}

function stopFixturePids(dir: string): void {
  try {
    const pids = JSON.parse(readFileSync(path.join(dir, 'pids.json'), 'utf8')) as number[];
    for (const pid of pids.reverse()) {
      try { if (isAlive(pid)) process.kill(pid, 'SIGKILL'); } catch { /* Synthetic process already exited. */ }
    }
  } catch { /* Setup may fail before the synthetic PIDs are recorded. */ }
}

afterEach(async () => {
  for (const { owner, dir } of fixtures.splice(0)) {
    const watchdog = setTimeout(() => stopFixturePids(dir), 2000);
    try { await owner.close(); } finally {
      clearTimeout(watchdog);
      stopFixturePids(dir);
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Bash command lifetime', () => {
  it('returns from background execution promptly and closes only its own owner', async () => {
    const first = fixture();
    const sibling = fixture();
    const [firstResult, siblingResult] = await Promise.all([
      bashTool.config.execute({ command: first.command, run_in_background: true }, first.context),
      bashTool.config.execute({ command: sibling.command, run_in_background: true }, sibling.context),
    ]);
    expect(firstResult).toContain('Command started in background');
    expect(siblingResult).toContain('Command started in background');
    const firstPids = await waitForPids(first.pidsPath);
    const siblingPids = await waitForPids(sibling.pidsPath);
    expect(firstPids.every(isAlive)).toBe(true);
    expect(siblingPids.every(isAlive)).toBe(true);

    await first.owner.close();

    expect(firstPids.some(isAlive)).toBe(false);
    expect(siblingPids.every(isAlive)).toBe(true);
  });

  it('waits for a foreground command and its descendants to close after abort', async () => {
    const command = fixture();
    const abortController = new AbortController();
    const running = bashTool.config.execute({ command: command.command }, { ...command.context, abortSignal: abortController.signal });
    const pids = await waitForPids(command.pidsPath);

    abortController.abort();
    await running;

    expect(pids.some(isAlive)).toBe(false);
  });

  it('reports a timeout as failure even when the command handles TERM and exits zero', async () => {
    const command = fixture();
    const running = bashTool.config.execute({ command: command.command, timeout: 250 }, command.context);
    const pids = await waitForPids(command.pidsPath);

    const result = await running;

    expect(result).toContain('Exit code: 1');
    expect(pids.some(isAlive)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('still kills a TERM-resistant descendant with independent stdio after the root exits', async () => {
    const command = fixture(true);
    await bashTool.config.execute({ command: command.command, run_in_background: true }, command.context);
    const pids = await waitForPids(command.pidsPath);
    await command.owner.close();

    expect(pids.some(isAlive)).toBe(false);
  });

  it('does not start another background command after the owner closes', async () => {
    const command = fixture();
    await command.owner.close();

    await expect(bashTool.config.execute({ command: command.command, run_in_background: true }, command.context)).rejects.toThrow('closed');
  });
});
