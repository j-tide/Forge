import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const electronBinary = requireDesktop('electron');
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const smokeDataDir = mkdtempSync(join(tmpdir(), 'forge-desktop-smoke-'));
const knowledgeFixture = join(smokeDataDir, 'knowledge fixture');
mkdirSync(join(knowledgeFixture, 'docs'), { recursive: true });
const knowledgeText = '# Fixture guide\n日期筛选 uses start_date; only local sources are imported.\n';
writeFileSync(join(knowledgeFixture, 'docs', 'guide.md'), knowledgeText);
writeFileSync(join(knowledgeFixture, 'package.json'), JSON.stringify({ scripts: {
  test: 'node -e "require(\'fs\').writeFileSync(\'script-ran.txt\',\'bad\')"',
} }));
process.once('exit', () => rmSync(smokeDataDir, { recursive: true, force: true }));

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function waitGone(pid) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!alive(pid)) return;
    await delay(100);
  }
  throw new Error('Owned Host PID remains after Desktop exit: ' + pid);
}

function launchDesktop(dataDir = smokeDataDir) {
  return electron.launch({
    executablePath: electronBinary,
    args: [desktopDirectory],
    env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir },
  });
}

let electronApp = await launchDesktop();
let ownedPid;
try {
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  await page.getByRole('heading', { name: 'What do you want to build?' }).waitFor();
  assert.match(await page.title(), /Forge/);
  assert.equal(await page.getByLabel('描述你的想法').isDisabled(), true);

  const renderer = await page.evaluate(() => ({
    bridgeKeys: Object.keys(window.forge ?? {}),
    platform: window.forge?.platform,
    requireType: typeof window.require,
    processType: typeof window.process,
    ipcRendererType: typeof window.ipcRenderer,
  }));
  assert.deepEqual(renderer.bridgeKeys, ['platform', 'hostStatus', 'hostHealth', 'pythonHostStatus', 'invokeSystem', 'inspectBundledPlugin', 'setBundledPluginEnabled', 'agentProfileCatalog', 'saveAgentProfile', 'invokeWorkflow', 'invokeKnowledge', 'invokeMemory', 'invokeDevicePairing', 'chooseProjectFolder', 'openAppPreview', 'prepareDiagnostics', 'exportDiagnostics', 'cleanupExpiredArtifacts', 'invokeProject', 'invokeConversation', 'invokeDraft', 'invokeApproval', 'invokeBoard', 'invokeRun', 'onConversationEvent', 'onHostStatus', 'onPythonHostStatus']);
  assert.equal(renderer.platform, process.platform);
  assert.equal(renderer.requireType, 'undefined');
  assert.equal(renderer.processType, 'undefined');
  assert.equal(renderer.ipcRendererType, 'undefined');

  const webPreferences = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.getLastWebPreferences());
  assert.equal(webPreferences?.contextIsolation, true);
  assert.equal(webPreferences?.nodeIntegration, false);
  assert.equal(webPreferences?.sandbox, true);

  const health = await page.evaluate(() => window.forge.hostHealth());
  if (!health.ok) console.error(JSON.stringify({ stage: 'host-health-failed', health,
    status: await page.evaluate(() => window.forge.pythonHostStatus()) }));
  assert.equal(health.ok, true);
  assert.equal(health.data.status, 'ready');
  assert.equal(health.data.protocolVersion, 'forge-host-protocol/v5');
  assert.equal(health.data.storage.status, 'ready');
  assert.equal(health.data.storage.schemaVersion, 32);
  const pairing = await page.evaluate(() => window.forge.invokeDevicePairing({
    type: 'issue', payload: {},
  }));
  assert.match(pairing.nonce, /^[A-Za-z0-9_-]{40,}$/);
  const pairingInspection = await page.evaluate((pairingId) => window.forge.invokeDevicePairing({
    type: 'inspect', payload: { pairingId },
  }), pairing.pairingId);
  assert.equal(pairingInspection.status, 'pending');
  assert.equal('nonce' in pairingInspection, false);
  const arbitraryPairing = await page.evaluate(async (pairingId) => {
    try { await window.forge.invokeDevicePairing({
      type: 'claim', payload: { pairingId, nonce: 'untrusted' },
    }); return false; } catch { return true; }
  }, pairing.pairingId);
  assert.equal(arbitraryPairing, true);
  assert.equal(health.data.storage.journalMode, 'wal');
  assert.equal(health.data.runtime.platform, process.platform);
  assert.equal(health.data.runtime.arch, process.arch);
  assert.match(health.data.runtime.python, /^3\.12\./);
  assert.equal(health.data.transportVersion, 'forge-local-jsonrpc/v1');
  assert.equal(health.data.version, '0.0.1');
  const plugin = await page.evaluate(() => window.forge.inspectBundledPlugin());
  assert.equal(plugin.pluginId, 'forge.executor.codex');
  assert.equal(plugin.version, '0.0.2');
  assert.equal(plugin.compatible, true);
  assert.equal(plugin.active, true);
  assert.deepEqual(plugin.configSchema.properties, {});
  const agentCatalog = await page.evaluate(() => window.forge.agentProfileCatalog());
  assert.ok(agentCatalog.executors.some((item) => item.executorId === 'executor.codex'));
  assert.deepEqual(agentCatalog.executors.find((item) => item.executorId === 'executor.claude'), {
    executorId: 'executor.claude', available: false, modelIds: [],
    readOnlyEnforced: false, networkPolicyEnforced: false, approval: false,
    reason: 'CLAUDE_NOT_VERIFIED',
  });
  const codex = agentCatalog.executors.find((item) => item.executorId === 'executor.codex');
  if (codex.available && codex.modelIds.length) {
    const modelId = codex.modelIds[0];
    for (const [role, policyProfile, contextProviders] of [
      ['developer', 'workspace-write', ['task-contract', 'project-context']],
      ['reviewer', 'read-only', ['task-contract', 'snapshot-diff']],
    ]) {
      await page.evaluate(({ role, policyProfile, contextProviders, modelId }) =>
        window.forge.saveAgentProfile({
          profile: { schemaVersion: '1.0', id: `profile.smoke.${role}`,
            revision: 1, name: `Smoke ${role}`, role, executorId: 'executor.codex',
            modelId, promptTemplate: `Fixture ${role} responsibilities.`,
            contextProviders, policyProfile,
            limits: { maxTurns: 8, maxSeconds: 600, maxOutputTokens: 4000 } },
          expectedRevision: 0,
        }), { role, policyProfile, contextProviders, modelId });
    }
  }
  await page.getByRole('button', { name: 'Agents' }).click();
  await page.getByRole('heading', { name: 'Agent Profiles' }).waitFor();
  await page.getByText('CLAUDE_NOT_VERIFIED').waitFor({ timeout: 30_000 });
  assert.match(await page.locator('.agents-panel').textContent(), /未配置\/未验收/);
  if (process.env.FORGE_AGENTS_SCREENSHOT) {
    await page.screenshot({ path: process.env.FORGE_AGENTS_SCREENSHOT });
  }
  await page.getByRole('button', { name: '工作流' }).click();
  await page.getByRole('heading', { name: '线性配置' }).waitFor();
  await page.getByRole('button', { name: '从quick模板新建' }).click();
  await page.getByText('末尾人工验收门禁不可删除').waitFor();
  await page.getByRole('button', { name: '保存草稿' }).click();
  await page.getByText('草稿已保存。', { exact: false }).waitFor();
  const drafts = await page.evaluate(() => window.forge.invokeWorkflow({
    type: 'list', payload: {},
  }));
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].publishedRevision, null);
  await page.getByRole('button', { name: '发布当前草稿' }).click();
  await page.getByText('发布被 Host 阻止', { exact: false }).waitFor();
  const rejected = await page.evaluate(() => window.forge.invokeWorkflow({
    type: 'list', payload: {},
  }));
  assert.equal(rejected[0].publishedRevision, null);
  await page.getByRole('button', { name: '打开高级画布' }).click();
  await page.getByRole('region', { name: 'Workflow 画布' }).waitFor();
  assert.ok(await page.locator('.forge-flow-node--invalid').count() > 0);
  await page.getByRole('button', { name: '收起高级画布' }).click();
  if (codex.available && codex.modelIds.length) {
    await page.getByLabel('Agent Profile').nth(0).selectOption('profile.smoke.developer');
    await page.getByLabel('Agent Profile').nth(1).selectOption('profile.smoke.reviewer');
    await page.getByRole('button', { name: '保存草稿' }).click();
    await page.getByText('草稿已保存。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '发布当前草稿' }).click();
    await page.getByText('版本已发布', { exact: false }).waitFor();
    const published = await page.evaluate(() => window.forge.invokeWorkflow({
      type: 'list', payload: {},
    }));
    assert.equal(published[0].draftRevision, 2);
    assert.equal(published[0].publishedRevision, 2);
    const impact = await page.evaluate((workflowId) => window.forge.invokeWorkflow({
      type: 'impact', payload: { workflowId },
    }), drafts[0].workflowId);
    assert.deepEqual(impact.publishedRevisions, [2]);
    assert.deepEqual(impact.frozenRunCounts, {});
    await page.getByRole('region', { name: '版本影响预览' }).getByText(
      '新 Run 必须明确选择已发布版本', { exact: false },
    ).waitFor();
    await page.getByLabel('流程名称').fill('Smoke workflow v3');
    await page.getByRole('button', { name: '保存草稿' }).click();
    await page.getByText('草稿已保存。', { exact: false }).waitFor();
    await page.getByRole('button', { name: '发布当前草稿' }).click();
    await page.getByText('版本已发布', { exact: false }).waitFor();
    const newer = await page.evaluate((workflowId) => window.forge.invokeWorkflow({
      type: 'impact', payload: { workflowId },
    }), drafts[0].workflowId);
    assert.deepEqual(newer.publishedRevisions, [2, 3]);
    const comparison = page.getByRole('region', { name: '已发布版本差异' });
    await comparison.waitFor();
    console.log(JSON.stringify({ stage: 'workflow-version-comparison', text: await comparison.textContent() }));
    await comparison.getByText('v2：', { exact: false }).first().waitFor();
    assert.match(await comparison.textContent(), /Smoke workflow v3/);
  }
  if (process.env.FORGE_WORKFLOW_SCREENSHOT) {
    if (codex.available && codex.modelIds.length) {
      await page.getByRole('region', { name: '已发布版本差异' }).scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: process.env.FORGE_WORKFLOW_SCREENSHOT });
  }
  await page.getByRole('button', { name: '打开高级画布' }).click();
  await page.getByRole('region', { name: 'Workflow 画布' }).waitFor();
  await page.getByRole('button', { name: '导出画布 JSON' }).click();
  const canvasExport = await page.getByLabel('画布 JSON（最多 256 KB）').inputValue();
  const canvasDocument = JSON.parse(canvasExport);
  assert.equal(canvasDocument.format, 'forge-workflow-canvas/v1');
  assert.equal(canvasDocument.definition.id, drafts[0].workflowId);
  assert.equal(canvasDocument.layout.nodes.length, canvasDocument.definition.nodes.length);
  await page.getByRole('button', { name: '导入画布 JSON 到草稿' }).click();
  await page.getByText('已导入到未保存草稿', { exact: false }).waitFor();
  const afterCanvasImport = await page.evaluate(() => window.forge.invokeWorkflow({
    type: 'list', payload: {},
  }));
  assert.equal(afterCanvasImport[0].publishedRevision, codex.available && codex.modelIds.length ? 3 : null);
  if (process.env.FORGE_CANVAS_SCREENSHOT) {
    await page.getByRole('region', { name: 'Workflow 画布' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_CANVAS_SCREENSHOT });
  }
  const invalidWorkflow = await page.evaluate(async () => {
    try { await window.forge.invokeWorkflow({ type: 'shell.execute', payload: {} }); return false; }
    catch { return true; }
  });
  assert.equal(invalidWorkflow, true);
  await page.getByRole('button', { name: '插件' }).click();
  await page.getByRole('heading', { name: 'forge.executor.codex' }).waitFor();
  assert.match(await page.locator('.plugins-panel').textContent(), /当前插件没有可编辑配置项/);
  if (process.env.FORGE_PLUGIN_SCREENSHOT) await page.screenshot({ path: process.env.FORGE_PLUGIN_SCREENSHOT });
  await page.getByRole('button', { name: '工作台' }).click();
  assert.ok(health.data.pid > 0);
  assert.match(health.data.hostId, /^[0-9a-f-]{36}$/);
  ownedPid = health.data.pid;
  assert.equal(alive(ownedPid), true);

  const pythonStatus = await page.evaluate(() => window.forge.pythonHostStatus());
  assert.equal(pythonStatus.health.runtime.python, health.data.runtime.python);
  assert.equal(pythonStatus.health.storage.status, 'ready');
  assert.equal(pythonStatus.health.storage.schemaVersion, 32);
  assert.equal(pythonStatus.health.transportVersion, 'forge-local-jsonrpc/v1');
  assert.equal(pythonStatus.health.pid, pythonStatus.info.pid);
  assert.equal(pythonStatus.info.pid, ownedPid);

  await page.getByRole('button', { name: 'Host connected' }).click();
  const diagnostics = await page.locator('#host-diagnostics').evaluate((element) =>
    Object.fromEntries([...element.querySelectorAll('dt')].map((label) => [label.textContent, label.nextElementSibling?.textContent])));
  assert.equal(diagnostics['Host ID'], health.data.hostId);
  assert.equal(diagnostics['Host Version'], health.data.version);
  assert.equal(diagnostics.Protocol, health.data.protocolVersion);
  assert.equal(diagnostics.PID, String(ownedPid));
  assert.equal(diagnostics.Storage, 'Ready');
  assert.equal(diagnostics.Schema, '32');
  assert.equal(diagnostics['Python Version'], health.data.runtime.python);
  assert.notEqual(diagnostics['Last Health Check'], '—');
  const revisionBeforeRefresh = await page.evaluate(async () => (await window.forge.hostStatus()).revision);
  await page.getByRole('button', { name: '检查健康状态' }).click();
  await page.waitForFunction(async (previous) => (await window.forge.hostStatus()).revision > previous, revisionBeforeRefresh);
  await page.getByRole('button', { name: '关闭 Host 诊断' }).click();

  const unknown = await page.evaluate(() => window.forge.invokeSystem({
    schemaVersion: '1.0', commandId: 'smoke-unknown', type: 'shell.any',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload: {},
  }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'UNKNOWN_COMMAND');
  const forged = await page.evaluate(() => window.forge.invokeSystem({
    schemaVersion: '1.0', commandId: 'smoke-forged', type: 'system.ping',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload: {}, actor: 'owner',
  }));
  assert.equal(forged.ok, false);
  assert.equal(forged.error.code, 'VALIDATION_ERROR');
  const arbitraryRun = await page.evaluate(() => window.forge.invokeRun({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'shell.execute',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { command: 'whoami' },
  }));
  assert.equal(arbitraryRun.ok, false);
  assert.equal(arbitraryRun.error.code, 'VALIDATION_ERROR');

  await page.reload();
  await page.getByRole('button', { name: 'Host connected' }).waitFor();
  const afterReload = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(afterReload.data.hostId, health.data.hostId);
  assert.equal(afterReload.data.pid, ownedPid);

  if (process.env.FORGE_SMOKE_SCREENSHOT) {
    await page.locator('.board-pane').evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: process.env.FORGE_SMOKE_SCREENSHOT });
  }
  await page.getByRole('button', { name: /未选择项目/ }).click();
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, knowledgeFixture);
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await page.getByRole('button', { name: '继续查看信任范围' }).click();
  await page.getByRole('button', { name: 'Trust this project' }).click();
  await page.getByRole('button', { name: '进入 Forge Workspace' }).click();
  await page.getByRole('button', { name: '项目资料' }).click();
  await page.getByLabel('项目内相对路径').fill('docs/guide.md');
  await page.getByRole('button', { name: '只读导入' }).click();
  await page.getByText('已只读导入 docs/guide.md', { exact: false }).waitFor();
  await page.getByText('第 1–2 行', { exact: false }).waitFor();
  assert.equal(readFileSync(join(knowledgeFixture, 'docs', 'guide.md'), 'utf8'), knowledgeText);
  assert.equal(existsSync(join(knowledgeFixture, 'script-ran.txt')), false);
  const importedKnowledge = await page.evaluate(async () => {
    const active = await window.forge.invokeProject({
      schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'project.active',
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
      payload: {},
    });
    if (!active.ok) throw new Error('Project unavailable');
    return window.forge.invokeKnowledge({ type: 'list', payload: {
      projectId: active.data.projectId,
    } });
  });
  assert.equal(importedKnowledge.length, 1);
  assert.equal(importedKnowledge[0].chunkCount, 1);
  const activeForSearch = await page.evaluate(async () => {
    const result = await window.forge.invokeProject({
      schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'project.active',
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
      payload: {},
    });
    if (!result.ok) throw new Error('Active project unavailable');
    return result.data;
  });
  const missingContextRun = await page.evaluate((project) => window.forge.invokeRun({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'context.preview',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { projectId: project.projectId, runId: crypto.randomUUID(), query: '日期筛选' },
  }), activeForSearch);
  assert.equal(missingContextRun.ok, false);
  assert.equal(missingContextRun.error.code, 'CONTEXT_RUN_NOT_FOUND');
  await page.getByLabel('关键词').fill('日期筛选 start_date');
  await page.getByRole('button', { name: '检索', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '1 个片段' }).waitFor();
  const searched = await page.evaluate((project) => window.forge.invokeKnowledge({
    type: 'search', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: '日期筛选 start_date' },
  }), activeForSearch);
  assert.equal(searched.results.length, 1);
  assert.equal(searched.results[0].sourceId, importedKnowledge[0].sourceId);
  assert.match(searched.results[0].text, /start_date/);
  await page.getByRole('button', { name: '从此来源提议记忆' }).click();
  await page.getByLabel('主题键（小写字母开头）').fill('date.filtering');
  await page.getByRole('button', { name: '保存候选' }).click();
  await page.getByText('已保存候选记忆', { exact: false }).waitFor();
  const candidateList = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'list', payload: { projectId: project.projectId },
  }), activeForSearch);
  assert.equal(candidateList.length, 1);
  assert.equal(candidateList[0].status, 'candidate');
  const notAuthority = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'retrieve', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: 'start_date' },
  }), activeForSearch);
  assert.deepEqual(notAuthority.items, []);
  await page.getByRole('button', { name: '确认记忆' }).click();
  await page.getByLabel('人工决定理由（至少 12 字符）').fill('Current source confirmed by the local project owner');
  await page.getByRole('button', { name: '确认此决定' }).click();
  await page.getByText('已确认该记忆', { exact: false }).waitFor();
  const validatedMemory = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'retrieve', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: 'start_date' },
  }), activeForSearch);
  assert.equal(validatedMemory.items.length, 1);
  assert.equal(validatedMemory.items[0].memoryId, candidateList[0].memoryId);
  if (process.env.FORGE_MEMORY_SCREENSHOT) {
    await page.locator('[aria-label="项目记忆"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_MEMORY_SCREENSHOT });
  }
  await page.getByRole('button', { name: '撤销记忆' }).click();
  await page.getByLabel('人工决定理由（至少 12 字符）').fill('Local owner withdraws this project memory now');
  await page.getByRole('button', { name: '确认此决定' }).click();
  await page.getByText('已撤销并清空索引', { exact: false }).waitFor();
  const revokedMemory = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'retrieve', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: 'start_date' },
  }), activeForSearch);
  assert.deepEqual(revokedMemory.items, []);
  const tombstone = await page.evaluate((project) => window.forge.invokeMemory({
    type: 'list', payload: { projectId: project.projectId },
  }), activeForSearch);
  assert.equal(tombstone[0].status, 'revoked');
  assert.equal(tombstone[0].text, '');
  const noMatch = await page.evaluate((project) => window.forge.invokeKnowledge({
    type: 'search', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: 'never_present_here' },
  }), activeForSearch);
  assert.deepEqual(noMatch.results, []);
  if (process.env.FORGE_KNOWLEDGE_SEARCH_SCREENSHOT) {
    await page.getByRole('status').filter({ hasText: '1 个片段' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_KNOWLEDGE_SEARCH_SCREENSHOT });
  }
  if (process.env.FORGE_KNOWLEDGE_SCREENSHOT) {
    await page.locator('[aria-label="原文定位"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.FORGE_KNOWLEDGE_SCREENSHOT });
  }
  await page.getByRole('button', { name: '撤销来源' }).click();
  await page.getByRole('button', { name: '确认撤销' }).click();
  await page.getByText('来源已撤销并保留引用墓碑', { exact: false }).waitFor();
  const afterRevoke = await page.evaluate((project) => window.forge.invokeKnowledge({
    type: 'search', payload: { projectId: project.projectId,
      environmentId: project.environmentId, query: '日期筛选' },
  }), activeForSearch);
  assert.deepEqual(afterRevoke.results, []);
  assert.equal(readFileSync(join(knowledgeFixture, 'docs', 'guide.md'), 'utf8'), knowledgeText);
  assert.equal(existsSync(join(knowledgeFixture, 'script-ran.txt')), false);
  const arbitraryKnowledge = await page.evaluate(async () => {
    try { await window.forge.invokeKnowledge({ type: 'shell.execute', payload: {} }); return false; }
    catch { return true; }
  });
  assert.equal(arbitraryKnowledge, true);
  const arbitraryMemory = await page.evaluate(async () => {
    try { await window.forge.invokeMemory({ type: 'shell.execute', payload: {} }); return false; }
    catch { return true; }
  });
  assert.equal(arbitraryMemory, true);
  console.log(JSON.stringify({ stage: 'connected', hostId: health.data.hostId, pid: ownedPid,
    version: health.data.version, protocolVersion: health.data.protocolVersion,
    runtime: health.data.runtime, storage: health.data.storage, renderer, webPreferences: {
      contextIsolation: webPreferences.contextIsolation,
      nodeIntegration: webPreferences.nodeIntegration,
      sandbox: webPreferences.sandbox,
    } }, null, 2));
} finally {
  await electronApp.close();
}

const invalidDataDir = join(smokeDataDir, 'invalid-db');
mkdirSync(invalidDataDir);
writeFileSync(join(invalidDataDir, 'forge.sqlite'), 'not a SQLite database');
electronApp = await launchDesktop(invalidDataDir);
let degradedPid;
try {
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host degraded' }).waitFor({ timeout: 15000 });
  const degraded = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(degraded.ok, true);
  assert.equal(degraded.data.status, 'degraded');
  assert.equal(degraded.data.storage.status, 'unavailable');
  assert.equal(degraded.data.storage.error.code, 'DATABASE_CORRUPT');
  assert.doesNotMatch(JSON.stringify(degraded), new RegExp(invalidDataDir));
  const pythonDegraded = await page.evaluate(() => window.forge.pythonHostStatus());
  assert.equal(pythonDegraded.health.storage.status, 'unavailable');
  assert.equal(pythonDegraded.health.storage.error.code, 'DATABASE_CORRUPT');
  assert.doesNotMatch(JSON.stringify(pythonDegraded), new RegExp(invalidDataDir));
  degradedPid = degraded.data.pid;
  await page.getByRole('button', { name: 'Host degraded' }).click();
  assert.match(await page.locator('#host-diagnostics').textContent(), /Storage\s*Unavailable/);
  assert.match(await page.locator('#host-diagnostics').textContent(), /DATABASE_CORRUPT/);
  console.log(JSON.stringify({ stage: 'storage-degraded', pid: degradedPid,
    hostStatus: degraded.data.status, storage: degraded.data.storage.status,
    error: degraded.data.storage.error.code }, null, 2));
} finally {
  await electronApp.close();
}
if (degradedPid) await waitGone(degradedPid);
if (ownedPid) await waitGone(ownedPid);

electronApp = await launchDesktop();
try {
  const page = await electronApp.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  const beforeCrash = await page.evaluate(() => window.forge.hostHealth());
  assert.equal(beforeCrash.ok, true);
  const crashPid = beforeCrash.data.pid;
  assert.equal(alive(crashPid), true);
  process.kill(crashPid, 'SIGKILL');
  await page.getByRole('button', { name: 'Host crashed' }).waitFor({ timeout: 10000 });
  const afterCrash = await page.evaluate(() => Promise.all([window.forge.hostStatus(), window.forge.hostHealth()]));
  assert.equal(afterCrash[0].state, 'crashed');
  assert.equal(afterCrash[0].health, null);
  assert.equal(afterCrash[0].info, null);
  assert.equal(afterCrash[1].ok, false);
  assert.equal(afterCrash[1].error.code, 'HOST_EXITED');
  const runAfterCrash = await page.evaluate(() => window.forge.invokeRun({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), type: 'run.list',
    createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5',
    payload: { projectId: crypto.randomUUID(), taskId: crypto.randomUUID() },
  }));
  assert.equal(runAfterCrash.ok, false);
  assert.equal(runAfterCrash.error.code, 'HOST_EXITED');
  await page.getByRole('button', { name: 'Host crashed' }).click();
  assert.equal(await page.locator('#host-diagnostics dd').first().textContent(), '—');
  await waitGone(crashPid);
  console.log(JSON.stringify({ stage: 'crash-detected', pid: crashPid, state: afterCrash[0].state,
    error: afterCrash[1].error.code }, null, 2));
} finally {
  await electronApp.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
  await electronApp.close();
}
