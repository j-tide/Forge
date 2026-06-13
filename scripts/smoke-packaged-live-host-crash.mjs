/** A real installed Codex Run interrupted by its owned Host crash is never success. */
/* global window */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync,
  rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const dmg = process.env.FORGE_LIVE_HOST_CRASH_DMG;
if (process.platform !== 'darwin' || process.arch !== 'arm64' ||
    !dmg || !existsSync(dmg)) throw new Error('Require an explicit internal macOS arm64 DMG');
const qaRoot = mkdtempSync(join(root, 'output', 'qa', 'desktop-live-host-crash-'));
const appData = join(qaRoot, 'isolated-app-data');
const source = join(qaRoot, 'Forge 等待测试 repo');
const installRoot = mkdtempSync(join(root, 'build', 'macos', 'qa-install-'));
const mount = join(installRoot, 'mounted');
const installed = join(installRoot, 'Forge INTERNAL.app');
mkdirSync(source); mkdirSync(mount);

function command(executable, argv, cwd = root) {
  return execFileSync(executable, argv, { cwd, encoding: 'utf8', timeout: 30_000 }).trim();
}
command('git', ['init', '-b', 'main'], source);
command('git', ['config', 'user.name', 'Forge fixture'], source);
command('git', ['config', 'user.email', 'forge@example.invalid'], source);
writeFileSync(join(source, 'package.json'), '{"name":"active-restore-fixture","type":"module"}\n');
writeFileSync(join(source, 'math.js'), 'export const add = (a, b) => a + b;\n');
writeFileSync(join(source, 'hold.js'), `import { writeFileSync } from 'node:fs';
writeFileSync('hold.started', 'started\\n');
await new Promise((resolve) => setTimeout(resolve, 15000));
writeFileSync('hold.finished', 'finished\\n');
`);
command('git', ['add', '.'], source);
command('git', ['commit', '-m', 'Disposable active Run fixture'], source);
const sourceHead = command('git', ['rev-parse', 'HEAD'], source);

let attached = false;
let app;
let page;
let projectId;
let runId;
let interrupted = false;

async function invoke(group, type, payload) {
  const response = await page.evaluate(async ({ group, type, payload }) => {
    const envelope = { schemaVersion: '1.0', commandId: crypto.randomUUID(), type,
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload };
    switch (group) {
      case 'project': return window.forge.invokeProject(envelope);
      case 'conversation': return window.forge.invokeConversation(envelope);
      case 'draft': return window.forge.invokeDraft(envelope);
      case 'approval': return window.forge.invokeApproval(envelope);
      case 'run': return window.forge.invokeRun(envelope);
      default: throw new Error('Unknown fixed Host command group');
    }
  }, { group, type, payload });
  assert.equal(response.ok, true, `${type}: ${JSON.stringify(response)}`);
  return response.data;
}

function startedWorkspace() {
  const trees = join(appData, 'Forge', 'production', 'workspaces', 'trees');
  if (!existsSync(trees)) return null;
  for (const name of readdirSync(trees)) {
    const path = join(trees, name);
    if (existsSync(join(path, 'hold.started'))) return path;
  }
  return null;
}

try {
  command('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]);
  attached = true;
  command('ditto', [join(mount, 'Forge INTERNAL.app'), installed]);
  command('codesign', ['--verify', '--deep', '--strict', installed]);
  command('hdiutil', ['detach', mount]); attached = false;
  app = await electron.launch({
    executablePath: join(installed, 'Contents', 'MacOS', 'Forge'), args: [],
    env: { ...process.env, FORGE_INTERNAL_TEST_HOME: appData,
      FORGE_DEV_SERVER_URL: '', FORGE_MODEL_PROVIDER: 'disabled' },
  });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, source);
  await page.getByRole('button', { name: '项目', exact: true }).click();
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByRole('button', { name: '继续查看信任范围' }).click();
  await page.getByRole('button', { name: 'Trust this project' }).click();
  await page.getByText('PROJECT CONNECTED').waitFor({ timeout: 15_000 });
  const projects = await invoke('project', 'project.list', {});
  assert.equal(projects.length, 1);
  projectId = projects[0].projectId;

  const created = await invoke('conversation', 'conversation.create', {
    projectId, title: 'Live Host crash QA', expectedRevision: 0,
  });
  const sent = await invoke('conversation', 'conversation.send', {
    projectId, conversationId: created.conversationId,
    idempotencyKey: crypto.randomUUID(),
    text: 'In this disposable workspace, run node hold.js and wait until it exits before editing math.js.',
    attachmentIds: [],
  });
  const draft = await invoke('draft', 'draft.manual', {
    projectId, conversationId: created.conversationId,
    sourceMessageId: sent.message.messageId, idempotencyKey: crypto.randomUUID(),
  });
  const decisionId = crypto.randomUUID();
  const contract = { schemaVersion: '1.0', taskId: draft.draftId, projectId, revision: 2,
    title: 'Wait before isolated arithmetic edit', type: 'feature',
    goal: 'Run node hold.js in the isolated workspace. Wait for it to finish before changing math.js. Then add subtract(a,b). Do not edit until hold.js exits.',
    acceptance: [{ id: 'AC-01', statement: 'The hold command completed before any edit',
      method: 'manual', required: true, sourceRefs: [`decision:${decisionId}`] }],
    constraints: [], scope: ['hold.js', 'math.js'], outOfScope: [], dependencies: [],
    openQuestions: [], assumptions: [],
    sourceRefs: [`message:${sent.message.messageId}`, `decision:${decisionId}`],
    workflowRef: 'standard@1', priority: 'normal' };
  await invoke('draft', 'draft.revise', {
    projectId, draftId: draft.draftId, expectedRevision: 1, contract, decisionId,
    decisionSummary: 'Only the disposable fixture may be modified',
    resolvedQuestions: [], removedAcceptanceIds: [], confirmScopeChange: true,
  });
  const requested = await invoke('approval', 'approval.request', {
    projectId, draftId: draft.draftId, expectedRevision: 2,
  });
  const approved = await invoke('approval', 'approval.decide', {
    projectId, decision: { schemaVersion: '1.0', approvalId: requested.request.approvalId,
      decision: 'approve', expectedRevision: 2, scopeHash: requested.request.scopeHash,
      reason: 'Disposable isolated QA only; start remains explicit' },
  });
  assert.equal(approved.taskState, 'todo');
  const database = join(appData, 'Forge', 'production', 'forge.sqlite');
  const hostBefore = await page.evaluate(() => window.forge.hostHealth());
  const catalog = await page.evaluate(() => window.forge.agentProfileCatalog());
  const codex = catalog.executors.find((item) => item.executorId === 'executor.codex');
  assert.equal(codex?.available, true, 'The installed Codex CLI must really be available');
  const modelId = 'gpt-6-luna';
  assert.ok(codex.modelIds.includes(modelId), 'Approved low-cost Codex model unavailable');
  runId = crypto.randomUUID();
  const started = await invoke('run', 'run.start', {
    projectId, taskId: draft.draftId, expectedTaskRevision: 2,
    modelId, idempotencyKey: runId, maxTokens: 50000,
  });
  assert.equal(started.runId, runId);
  let workspace = null;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    workspace = startedWorkspace();
    if (workspace) break;
    const inspection = await invoke('run', 'run.inspect', {
      projectId, runId, afterCursor: 0, limit: 100,
    });
    if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(inspection.run.state)) {
      throw new Error(`Run ended before hold.js started: ${inspection.run.state}`);
    }
    await delay(1000);
  }
  assert.ok(workspace, 'Real Codex did not start the hold command in its isolated worktree');
  assert.equal(existsSync(join(source, 'hold.started')), false);
  assert.equal(existsSync(join(workspace, 'hold.finished')), false);
  process.kill(hostBefore.data.pid, 'SIGKILL');
  await page.getByRole('button', { name: 'Host crashed' }).waitFor({ timeout: 15_000 });
  const crashed = await page.evaluate(() => window.forge.hostStatus());
  assert.equal(crashed.state, 'crashed');
  const screenshot = join(root, 'output', 'playwright',
    'desktop-live-host-crashed-20260926-1440x900.png');
  await page.screenshot({ path: screenshot });
  // The real Desktop asks before quitting when Host activity is unknowable.
  // The isolated QA controller explicitly chooses its own instance's Quit.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await app.close(); app = null;
  await delay(17_000);
  const lateWrite = existsSync(join(workspace, 'hold.finished'));
  app = await electron.launch({
    executablePath: join(installed, 'Contents', 'MacOS', 'Forge'), args: [],
    env: { ...process.env, FORGE_INTERNAL_TEST_HOME: appData,
      FORGE_DEV_SERVER_URL: '', FORGE_MODEL_PROVIDER: 'disabled' },
  });
  page = await app.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 20_000 });
  const recovered = await invoke('run', 'run.inspect', {
    projectId, runId, afterCursor: 0, limit: 100,
  });
  assert.equal(recovered.run.state, 'interrupted');
  interrupted = true;
  const report = JSON.parse(command(join(root, 'python', '.venv', 'bin', 'python'),
    ['python/scripts/evaluate_qa_runs.py', database]));
  assert.equal(report.interruptedRuns, 1);
  assert.equal(report.acceptedDeliveryRuns, 0);
  assert.equal(command('git', ['rev-parse', 'HEAD'], source), sourceHead);
  assert.equal(command('git', ['status', '--porcelain'], source), '');
  assert.equal(lateWrite, false, 'An orphan command wrote after the Host crashed');
  console.log(JSON.stringify({ stage: 'packaged-live-host-crash', projectId,
    runId, hostPid: hostBefore.data.pid, outcome: 'interrupted',
    acceptedDeliveryRuns: report.acceptedDeliveryRuns, lateWrite, sourceClean: true,
    workspace, screenshot, qaRoot }));
} finally {
  if (runId && projectId && !interrupted && page) {
    await invoke('run', 'run.cancel', { projectId, runId }).catch(() => undefined);
  }
  if (app) {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }).catch(() => undefined);
    await app.close().catch(() => undefined);
  }
  if (attached) command('hdiutil', ['detach', mount]);
  rmSync(installRoot, { recursive: true, force: true });
}
