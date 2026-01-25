/** MIG-PY-09: real Electron Renderer -> Main -> Python Host -> Codex, isolated fixture. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron as electron } from 'playwright-core';

const requireDesktop = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const desktopDirectory = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const p3Acceptance = process.env.FORGE_P3_ACCEPTANCE === '1';
const mergeOnly = process.env.FORGE_VERTICAL_MERGE_ONLY === '1';
const finalOnly = process.env.FORGE_VERTICAL_FINAL_ONLY === '1' || mergeOnly;
const root = await mkdtemp(join(tmpdir(), 'forge-python-desktop-live-'));
const source = join(root, 'Forge fixture 空格');
const dataDir = join(root, 'data');
const screenshot = fileURLToPath(new URL(p3Acceptance ?
  '../output/playwright/p3-12-python-desktop-handoff-1440x900.png' : mergeOnly ?
  '../output/playwright/p3-08-python-desktop-delivery-1440x900.png' : finalOnly ?
  '../output/playwright/p3-07-python-desktop-delivery-1440x900.png' :
  '../output/playwright/mig-py-09-python-desktop-run-1440x900.png', import.meta.url));
let desktop;
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();

async function invoke(page, group, type, payload) {
  const result = await page.evaluate(async ({ group, type, payload }) => {
    const command = { schemaVersion: '1.0', commandId: crypto.randomUUID(), type,
      createdAt: new Date().toISOString(), protocolVersion: 'forge-host-protocol/v5', payload };
    const bridge = globalThis.forge;
    switch (group) {
      case 'project': return bridge.invokeProject(command);
      case 'conversation': return bridge.invokeConversation(command);
      case 'draft': return bridge.invokeDraft(command);
      case 'approval': return bridge.invokeApproval(command);
      case 'run': return bridge.invokeRun(command);
      default: throw new Error('Invalid group');
    }
  }, { group, type, payload });
  assert.equal(result.ok, true, `${type}: ${JSON.stringify(result)}`);
  return result.data;
}

async function boardSnapshot(page, projectId) {
  const response = await page.evaluate(async ({projectId}) => globalThis.forge.invokeBoard({
    schemaVersion:'1.0',commandId:crypto.randomUUID(),type:'board.snapshot',
    createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',
    payload:{projectId},
  }),{projectId});
  assert.equal(response.ok,true,JSON.stringify(response));
  return response.data;
}

try {
  await mkdir(source);
  git('init', '-b', 'main');
  git('config', 'user.name', 'Forge fixture');
  git('config', 'user.email', 'forge-fixture@example.invalid');
  await writeFile(join(source, 'math.js'), 'export const add = (a, b) => a + b;\n');
  await writeFile(join(source, 'test.js'), "import { add } from './math.js';\nimport assert from 'node:assert/strict';\nassert.equal(add(1, 2), 3);\nconsole.log('Forge fixture test completed');\n");
  await writeFile(join(source, 'hold.js'), 'setTimeout(() => {}, 120_000);\n');
  await writeFile(join(source, 'package.json'), '{"type":"module","scripts":{"test":"node test.js"}}\n');
  git('add', '.'); git('commit', '-m', 'fixture');
  const sourceHead = git('rev-parse', 'HEAD');
  desktop = await electron.launch({ executablePath: requireDesktop('electron'),
    args: [desktopDirectory], env: { ...process.env, FORGE_DEV_SERVER_URL: '', FORGE_HOST_DATA_DIR: dataDir } });
  if (mergeOnly) await desktop.evaluate(({dialog}) => {
    let confirmations = 0;
    dialog.showMessageBox = async () => ({response:++confirmations === 1 ? 0 : 1,
      checkboxChecked:false});
  });
  const page = await desktop.firstWindow();
  await page.getByRole('button', { name: 'Host connected' }).waitFor({ timeout: 15000 });
  const hostHealth = await page.evaluate(() => globalThis.forge.hostHealth());
  assert.equal(hostHealth.ok, true);
  assert.equal(hostHealth.data.runtime.implementation, 'CPython');
  assert.equal(hostHealth.data.storage.schemaVersion, 24);

  await desktop.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () =>
    ({ canceled: false, filePaths: [path] }); }, source);
  assert.equal(await page.evaluate(() => globalThis.forge.chooseProjectFolder()), source);
  const probe = await invoke(page, 'project', 'project.probe', { rootPath: source });
  assert.equal(probe.repositoryType, 'git');
  const project = await invoke(page, 'project', 'project.create', {
    rootPath: source, fingerprint: probe.fingerprint, trustVersion: 'project-trust/v1',
    approved: true, expectedRevision: 0,
  });
  let verifierPreset;
  if (process.env.FORGE_VERTICAL_VERIFY_ONLY === '1' || finalOnly) {
    const environment = await invoke(page, 'project', 'environment.get', {
      projectId: project.projectId, environmentId: project.environmentId,
    });
    const preset = await invoke(page, 'project', 'commandPreset.save', {
      projectId: project.projectId, expectedRevision: 0,
      environmentId: environment.environmentId, name: 'test',
      executable: process.execPath, argv: ['test.js'], cwdRelative: '.',
      envRefs: [], timeoutSeconds: 30, scriptsHash: probe.scriptsHash,
    });
    verifierPreset = await invoke(page, 'project', 'commandPreset.approve', {
      projectId: project.projectId, presetId: preset.presetId,
      expectedRevision: preset.revision, scriptsHash: probe.scriptsHash,
    });
    await invoke(page, 'project', 'environment.save', {
      projectId: project.projectId, environmentId: environment.environmentId,
      expectedRevision: environment.revision, name: environment.name,
      config: { commandPresetIds: [preset.presetId], envRefs: [], networkMode: 'trusted-local' },
    });
  }
  const conversation = await invoke(page, 'conversation', 'conversation.create', {
    projectId: project.projectId, title: 'Desktop Python run', expectedRevision: 0,
  });
  const sent = await invoke(page, 'conversation', 'conversation.send', {
    projectId: project.projectId, conversationId: conversation.conversationId,
    idempotencyKey: 'python-desktop-live-msg-01',
    text: 'Validate add inputs and add tests.', attachmentIds: [],
  });
  const draft = await invoke(page, 'draft', 'draft.manual', {
    projectId: project.projectId, conversationId: conversation.conversationId,
    sourceMessageId: sent.message.messageId, idempotencyKey: 'python-desktop-live-draft-01',
  });
  const decisionId = crypto.randomUUID();
  const decisionRef = `decision:${decisionId}`;
  const contract = { schemaVersion: '1.0', taskId: draft.draftId, projectId: project.projectId,
    revision: 2, title: 'Validate add', type: 'feature',
    goal: 'In this tiny fixture, update math.js so add(a,b) rejects non-number inputs with TypeError. Add assertions in test.js for invalid inputs. Run npm test. Do not change package.json. Finish when tests pass.',
    acceptance: [{ id: 'AC-01', statement: 'Invalid inputs rejected', method: 'automated',
      required: true, sourceRefs: [decisionRef] }],
    constraints: [], scope: ['math.js', 'test.js'], outOfScope: [], dependencies: [],
    openQuestions: [], assumptions: [],
    sourceRefs: [`message:${sent.message.messageId}`, decisionRef],
    workflowRef: 'standard@1', priority: 'normal' };
  const revised = await invoke(page, 'draft', 'draft.revise', {
    projectId: project.projectId, draftId: draft.draftId, expectedRevision: 1,
    contract, decisionId, decisionSummary: 'Fixture scope approved',
    resolvedQuestions: [], removedAcceptanceIds: [], confirmScopeChange: true,
  });
  assert.equal(revised.status, 'proposed');
  const pending = await invoke(page, 'approval', 'approval.request', {
    projectId: project.projectId, draftId: draft.draftId, expectedRevision: 2,
  });
  const approved = await invoke(page, 'approval', 'approval.decide', {
    projectId: project.projectId, decision: {
      schemaVersion: '1.0', approvalId: pending.request.approvalId, decision: 'approve',
      expectedRevision: 2, scopeHash: pending.request.scopeHash, reason: 'Fixture reviewed',
    },
  });
  assert.equal(approved.taskState, 'todo');
  const capabilities = await invoke(page, 'run', 'run.capabilities', {
    projectId: project.projectId, taskId: draft.draftId,
  });
  const modelId = process.env.FORGE_VERTICAL_MODEL ?? 'gpt-6-luna';
  assert.equal(capabilities.available, true);
  assert.ok(capabilities.modelIds.includes(modelId));
  let successResult;
  if (process.env.FORGE_VERTICAL_SKIP_SUCCESS !== '1') {
  const runId = crypto.randomUUID();
  const run = await invoke(page, 'run', 'run.start', {
    projectId: project.projectId, taskId: draft.draftId,
    expectedTaskRevision: 2, modelId, idempotencyKey: runId,
  });
  assert.equal(run.runId, runId);
  let inspection;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await delay(1000);
    inspection = await invoke(page, 'run', 'run.inspect', {
      projectId: project.projectId, runId, afterCursor: 0, limit: 100,
    });
    if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(inspection.run.state)) break;
  }
  assert.equal(inspection?.run.state, 'succeeded', JSON.stringify(inspection));
  const pluginLock = JSON.parse(await readFile(fileURLToPath(new URL(
    '../python/src/forge/builtin_plugins/plugins.lock.json', import.meta.url)), 'utf8')).plugins[0];
  const snapshotText = execFileSync('uv', [
    '--directory', fileURLToPath(new URL('../python/', import.meta.url)),
    'run', '--frozen', 'python', '-c',
    "import sqlite3,sys,pathlib; p=pathlib.Path(sys.argv[1]); db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True); row=db.execute('SELECT snapshot_json FROM run_config_snapshots WHERE run_id=?',(sys.argv[2],)).fetchone(); print(row[0] if row else '')",
    join(dataDir, 'forge.sqlite'), runId,
  ], { encoding: 'utf8', timeout: 15_000 });
  const frozenPlugin = JSON.parse(snapshotText).plugins.find((entry) => entry.id === pluginLock.id);
  assert.deepEqual(frozenPlugin, { id: pluginLock.id, version: pluginLock.version,
    contentHash: pluginLock.contentHash });
  let handoff = null;
  for (let attempt = 0; attempt < 75 && !handoff; attempt += 1) {
    handoff = await invoke(page, 'run', 'run.handoff', { projectId: project.projectId, runId });
    if (!handoff) await delay(200);
  }
  assert.ok(handoff?.snapshot && !handoff.snapshot.noChange,
    `Codex completed without requested fixture edits: ${JSON.stringify({ inspection, handoff })}`);
  assert.ok(handoff.stepResult.acceptanceResults.every((item) => item.status === 'unverified'));
  const changed = handoff.snapshot.files.map((file) => file.path).sort();
  assert.deepEqual(changed, ['math.js', 'test.js']);
  await page.reload();
  await page.getByRole('button', { name: /Forge fixture 空格/ }).waitFor();
  await page.getByRole('button', { name: '研发看板' }).click();
  await page.locator('.board-task').filter({ hasText: 'Validate add' }).click();
  await page.getByText('已冻结 CodeSnapshot', { exact: false }).waitFor({ timeout: 15_000 });
  await mkdir(fileURLToPath(new URL('../output/playwright/', import.meta.url)), { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: screenshot });
  const workspace = join(dataDir, 'workspaces', 'trees', handoff.snapshot.workspaceId);
  execFileSync('node', ['test.js'], { cwd: workspace, timeout: 20_000 });
  const fixtureDiff = execFileSync('git', ['-C', workspace, 'diff', '--', 'math.js', 'test.js'],
    { encoding: 'utf8' });
  assert.match(fixtureDiff, /diff --git a\/math\.js b\/math\.js/);
  assert.match(fixtureDiff, /diff --git a\/test\.js b\/test\.js/);
  const diffArtifact = fileURLToPath(new URL('../output/playwright/p2-10-vertical.diff',
    import.meta.url));
  await writeFile(diffArtifact, fixtureDiff);
  assert.equal(git('rev-parse', 'HEAD'), sourceHead);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(await readFile(join(source, 'math.js'), 'utf8'), 'export const add = (a, b) => a + b;\n');
  successResult = { successRunId: runId, successSnapshotId: handoff.snapshot.snapshotId,
    runState: inspection.run.state, changed, sourceClean: true,
    formalAcceptance: handoff.stepResult.acceptanceResults[0].status, screenshot,
    diffArtifact };
  if (process.env.FORGE_VERTICAL_VERIFY_ONLY === '1' || finalOnly) {
    assert.ok(verifierPreset?.approvalHash);
    const verifyInput = {
      projectId: project.projectId, taskId: draft.draftId,
      developmentRunId: runId, expectedSnapshotId: handoff.snapshot.snapshotId,
      kind: 'test', presetId: verifierPreset.presetId, idempotencyKey: crypto.randomUUID(),
    };
    const startedCheck = await invoke(page, 'run', 'run.verifyStart', verifyInput);
    const replayed = await invoke(page, 'run', 'run.verifyStart', verifyInput);
    assert.equal(replayed.verificationId, startedCheck.verificationId);
    let check = startedCheck;
    for (let attempt = 0; attempt < 60 && check.state === 'running'; attempt += 1) {
      await delay(500);
      check = await invoke(page, 'run', 'run.verifyJob', {
        projectId: project.projectId, verificationId: startedCheck.verificationId,
      });
    }
    assert.equal(check.state, 'completed', JSON.stringify(check));
    const report = await invoke(page, 'run', 'run.verifyReport', {
      projectId: project.projectId, verificationId: startedCheck.verificationId,
    });
    assert.equal(report.status, 'passed', JSON.stringify(report));
    assert.equal(report.exitCode, 0);
    assert.equal(report.snapshotId, handoff.snapshot.snapshotId);
    assert.equal(report.approvalHash, verifierPreset.approvalHash);
    if (p3Acceptance) {
      assert.ok(report.stdoutArtifactId, 'Fixture test output artifact is missing');
      const evidence = page.locator('section[aria-label="验证报告"]');
      await evidence.getByRole('button', {name:'刷新报告'}).click();
      await evidence.getByText('test · passed · exit 0', {exact:false}).waitFor();
      await evidence.getByRole('button', {name:'查看 stdout 纯文本'}).click();
      await evidence.getByText('Forge fixture test completed', {exact:false}).waitFor();
      assert.equal(await evidence.locator('pre a, pre script').count(),0);
      await page.screenshot({path:fileURLToPath(new URL(
        '../output/playwright/p3-12-python-desktop-verify-report-1440x900.png',
        import.meta.url))});
    }
    const reworkCycles = await invoke(page, 'run', 'run.reworkCycles', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.deepEqual(reworkCycles, []);
    const beforeMatrix = await invoke(page, 'run', 'run.acceptanceMatrix', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(beforeMatrix.requiredCovered, false);
    assert.equal(beforeMatrix.evaluation, 'inconclusive');
    assert.equal(beforeMatrix.criteria[0].status, 'unverified');
    assert.equal(beforeMatrix.checkReports[0].reportId, report.reportId);
    const matrixPanel = page.locator('section[aria-label="逐条验收矩阵"]');
    await matrixPanel.getByRole('button', { name: '刷新真实证据' }).click();
    await matrixPanel.getByText(`未覆盖必需项：AC-01`).waitFor();
    await matrixPanel.getByLabel('当前快照报告（自动项验证必选）').selectOption(report.reportId);
    await matrixPanel.getByLabel('判断依据 / 未验证说明 / 风险接受原因').fill(
      'The fixed-snapshot node test exercises invalid inputs and exits zero.');
    await matrixPanel.getByRole('button', { name: '记录本快照的判断' }).click();
    await matrixPanel.getByText('必需项均有逐条决定；仍需最终人工验收').waitFor();
    const afterMatrix = await invoke(page, 'run', 'run.acceptanceMatrix', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(afterMatrix.criteria[0].status, 'verified');
    assert.equal(afterMatrix.criteria[0].reportId, report.reportId);
    assert.equal(afterMatrix.requiredCovered, true);
    assert.equal(afterMatrix.evaluation, 'covered');
    assert.equal(afterMatrix.finalAcceptanceRequired, true);
    const matrixScreenshot = fileURLToPath(new URL(p3Acceptance ?
      '../output/playwright/p3-12-python-desktop-matrix-1440x900.png' : mergeOnly ?
      '../output/playwright/p3-08-python-desktop-matrix-1440x900.png' : finalOnly ?
      '../output/playwright/p3-07-python-desktop-matrix-1440x900.png' :
      '../output/playwright/p3-05-python-desktop-acceptance-1440x900.png', import.meta.url));
    await matrixPanel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: matrixScreenshot });
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({ stage: 'python-desktop-verify-live',
      developmentRunId: runId, verificationId: check.verificationId,
      snapshotId: report.snapshotId, status: report.status, exitCode: report.exitCode,
      acceptanceStatus: afterMatrix.criteria[0].status, matrixScreenshot,
      sourceClean: true }));
  }
  if (process.env.FORGE_VERTICAL_REVIEW_ONLY === '1' || finalOnly) {
    const reviewKey = crypto.randomUUID();
    const reviewInput = {
      projectId: project.projectId, taskId: draft.draftId,
      developmentRunId: runId, expectedSnapshotId: handoff.snapshot.snapshotId,
      modelId, idempotencyKey: reviewKey,
    };
    const startedReview = await invoke(page, 'run', 'run.reviewStart', reviewInput);
    const retriedReview = await invoke(page, 'run', 'run.reviewStart', reviewInput);
    assert.equal(retriedReview.reviewRunId, startedReview.reviewRunId);
    let reviewJob = startedReview;
    for (let attempt = 0; attempt < 240 && reviewJob.state === 'running'; attempt += 1) {
      await delay(1000);
      reviewJob = await invoke(page, 'run', 'run.reviewJob', {
        projectId: project.projectId, reviewRunId: startedReview.reviewRunId,
      });
    }
    assert.equal(reviewJob.state, 'completed', JSON.stringify(reviewJob));
    const reports = await invoke(page, 'run', 'run.reviewReports', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(reports.length, 1);
    assert.equal(reports[0].snapshotId, handoff.snapshot.snapshotId);
    assert.ok(reports[0].result);
    assert.notEqual(reports[0].status, 'stale');
    await page.reload();
    await page.getByText('Review 与问题历史').waitFor({ timeout: 15_000 });
    await page.getByText(`最近报告：${reports[0].status}`, { exact: false })
      .waitFor({ timeout: 15_000 });
    await page.getByText('Review 与问题历史').scrollIntoViewIfNeeded();
    const reviewScreenshot = fileURLToPath(new URL(p3Acceptance ?
      '../output/playwright/p3-12-python-desktop-review-1440x900.png' : mergeOnly ?
      '../output/playwright/p3-08-python-desktop-review-1440x900.png' : finalOnly ?
      '../output/playwright/p3-07-python-desktop-review-1440x900.png' :
      '../output/playwright/p3-03-python-desktop-review-1440x900.png', import.meta.url));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: reviewScreenshot });
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({ stage: 'python-desktop-review-live',
      developmentRunId: runId, reviewRunId: reviewJob.reviewRunId,
      reviewStatus: reports[0].status, issueCount: reports[0].issues.length,
      snapshotId: reports[0].snapshotId, sourceClean: true,
      screenshot: reviewScreenshot }));
  }
  if (finalOnly) {
    const current = await invoke(page, 'run', 'run.finalAcceptance', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(current.status, 'ready', JSON.stringify(current));
    assert.equal(current.snapshotId, handoff.snapshot.snapshotId);
    const finalPanel = page.locator('section[aria-label="人类最终验收"]');
    await finalPanel.getByRole('button', { name: '重新读取交付' }).click();
    await finalPanel.getByText(`快照 ${handoff.snapshot.snapshotId.slice(0,8)}`, { exact: false })
      .waitFor({ timeout: 15_000 });
    await finalPanel.getByLabel('最终验收依据').fill(
      'I inspected the exact current diff, approved Review, passing test and AC report.');
    await finalPanel.getByLabel('我已检查当前快照与报告，并明确接受这一交付。').check();
    await finalPanel.getByRole('button', { name: '接受当前版本' }).click();
    await finalPanel.getByText('已由本地 Owner 验收', { exact: false })
      .waitFor({ timeout: 15_000 });
    const accepted = await invoke(page, 'run', 'run.finalAcceptance', {
      projectId: project.projectId, taskId: draft.draftId,
    });
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.decision?.actor, 'local-owner');
    const board = await page.evaluate(async ({ projectId }) => {
      const command = { schemaVersion: '1.0', commandId: crypto.randomUUID(),
        type: 'board.snapshot', createdAt: new Date().toISOString(),
        protocolVersion: 'forge-host-protocol/v5', payload: { projectId } };
      return globalThis.forge.invokeBoard(command);
    }, { projectId: project.projectId });
    assert.equal(board.ok, true);
    const task = board.data.tasks.find((item) => item.id === draft.draftId);
    assert.equal(task.state, 'done');
    assert.equal(task.boardColumn, 'done');
    await finalPanel.scrollIntoViewIfNeeded();
    const finalScreenshot = fileURLToPath(new URL(p3Acceptance ?
      '../output/playwright/p3-12-python-desktop-accepted-1440x900.png' : mergeOnly ?
      '../output/playwright/p3-08-python-desktop-accepted-1440x900.png' :
      '../output/playwright/p3-07-python-desktop-accepted-1440x900.png', import.meta.url));
    await page.screenshot({ path: finalScreenshot });
    assert.equal(git('status', '--porcelain'), '');
    console.log(JSON.stringify({ stage: 'python-desktop-final-acceptance',
      developmentRunId: runId, snapshotId: handoff.snapshot.snapshotId,
      decisionId: accepted.decision.decisionId, taskState: task.state,
      sourceClean: true, screenshot: finalScreenshot }));
    if (mergeOnly) {
      const record = await invoke(page, 'run', 'deliveries.get', {
        projectId:project.projectId, taskId:draft.draftId,
      });
      const target = await invoke(page, 'run', 'deliveries.preview', {
        projectId:project.projectId, taskId:draft.draftId,
      });
      assert.equal(record.snapshotId, handoff.snapshot.snapshotId);
      assert.equal(target.canMerge, true, JSON.stringify(target));
      assert.equal(target.targetHead, sourceHead);
      const cancelled = await page.evaluate(async ({projectId,taskId,deliveryId,snapshotId,
        expectedTargetHead,targetBranch}) => globalThis.forge.invokeRun({
        schemaVersion:'1.0',commandId:crypto.randomUUID(),
        createdAt:new Date().toISOString(),protocolVersion:'forge-host-protocol/v5',
        type:'deliveries.merge',payload:{projectId,taskId,deliveryId,
          expectedSnapshotId:snapshotId,expectedTargetHead,targetBranch,confirmed:true,
          idempotencyKey:crypto.randomUUID()},
      }),{projectId:project.projectId,taskId:draft.draftId,deliveryId:record.deliveryId,
        snapshotId:record.snapshotId,expectedTargetHead:target.targetHead,
        targetBranch:target.targetBranch});
      assert.equal(cancelled.ok,false);
      assert.equal(cancelled.error.code,'MERGE_CANCELLED');
      assert.equal(git('rev-parse','HEAD'),sourceHead);
      assert.equal((await invoke(page,'run','deliveries.preview',{
        projectId:project.projectId,taskId:draft.draftId,
      })).operationId,null);
      console.log(JSON.stringify({stage:'python-desktop-native-merge-cancelled',
        sourceHeadUnchanged:true}));
      const deliveryPanel = page.locator('section[aria-label="交付记录与显式合并"]');
      await deliveryPanel.getByText(`交付 ${record.deliveryId.slice(0,8)}`, {exact:false})
        .waitFor({timeout:15_000});
      await deliveryPanel.getByLabel('我确认将当前快照显式合并到上述本地分支；不推送或部署。')
        .check();
      await deliveryPanel.getByRole('button',{name:'合并当前交付'}).click();
      await deliveryPanel.getByText('已显式本地合并',{exact:false})
        .waitFor({timeout:25_000});
      const after = await invoke(page, 'run', 'deliveries.preview', {
        projectId:project.projectId, taskId:draft.draftId,
      });
      assert.equal(after.operationState, 'merged');
      assert.equal(git('rev-parse','HEAD'), after.resultCommit);
      assert.equal(git('status','--porcelain'), '');
      const parents = git('rev-list','--parents','-n','1',after.resultCommit).split(' ');
      assert.deepEqual(parents,[after.resultCommit,sourceHead,handoff.snapshot.commitSha]);
      await deliveryPanel.scrollIntoViewIfNeeded();
      const mergeScreenshot = fileURLToPath(new URL(p3Acceptance ?
        '../output/playwright/p3-12-python-desktop-merged-1440x900.png' :
        '../output/playwright/p3-08-python-desktop-merged-1440x900.png',import.meta.url));
      await page.screenshot({path:mergeScreenshot});
      console.log(JSON.stringify({stage:'python-desktop-explicit-merge',
        deliveryId:record.deliveryId,operationId:after.operationId,
        resultCommit:after.resultCommit,sourceHeadBefore:sourceHead,
        sourceClean:true,screenshot:mergeScreenshot}));
      if (p3Acceptance && process.env.FORGE_P3_VERTICAL_BOARD === '1') {
        const extraTaskIds = [];
        for (const index of [1, 2]) {
          const title = `P3 board fixture ${index}`;
          const message = await invoke(page,'conversation','conversation.send',{
            projectId:project.projectId,conversationId:conversation.conversationId,
            idempotencyKey:crypto.randomUUID(),text:`Manual TODO ${index} for board gate checks`,
            attachmentIds:[],
          });
          const extraDraft = await invoke(page,'draft','draft.manual',{
            projectId:project.projectId,conversationId:conversation.conversationId,
            sourceMessageId:message.message.messageId,idempotencyKey:crypto.randomUUID(),
          });
          const extraDecisionId=crypto.randomUUID();
          const extraRef=`decision:${extraDecisionId}`;
          const extraContract={...contract,taskId:extraDraft.draftId,title,
            goal:`Keep this approved fixture Task in TODO for board gate check ${index}.`,
            acceptance:[{id:'AC-01',statement:'No automatic execution',
              method:'inspection',required:true,sourceRefs:[extraRef]}],
            sourceRefs:[`message:${message.message.messageId}`,extraRef]};
          await invoke(page,'draft','draft.revise',{
            projectId:project.projectId,draftId:extraDraft.draftId,expectedRevision:1,
            contract:extraContract,decisionId:extraDecisionId,
            decisionSummary:'Board fixture scope reviewed',resolvedQuestions:[],
            removedAcceptanceIds:[],confirmScopeChange:true,
          });
          const requested=await invoke(page,'approval','approval.request',{
            projectId:project.projectId,draftId:extraDraft.draftId,expectedRevision:2,
          });
          const decided=await invoke(page,'approval','approval.decide',{
            projectId:project.projectId,decision:{schemaVersion:'1.0',
              approvalId:requested.request.approvalId,decision:'approve',
              expectedRevision:2,scopeHash:requested.request.scopeHash,
              reason:'Board fixture reviewed'},
          });
          assert.equal(decided.taskState,'todo');
          extraTaskIds.push(extraDraft.draftId);
        }
        await page.reload();
        await page.getByRole('button',{name:'关闭抽屉'}).click();
        await page.getByRole('button',{name:'研发看板'}).click();
        await page.locator('[aria-label="TODO 列"] .board-task').first().waitFor();
        const boardBefore=await boardSnapshot(page,project.projectId);
        assert.equal(boardBefore.tasks.filter((item)=>item.boardColumn==='todo').length,2);
        assert.equal(boardBefore.tasks.filter((item)=>item.boardColumn==='done').length,1);
        const todoCards=page.locator('[aria-label="TODO 列"] .board-task');
        const doneColumn=page.locator('[aria-label="Done 列"] .board-column-scroll');
        await todoCards.first().dragTo(doneColumn);
        await page.getByRole('alert').getByText('缺少 Review、Verify 与人工验收', {
          exact:false}).waitFor();
        assert.deepEqual((await boardSnapshot(page,project.projectId)).tasks
          .filter((item)=>extraTaskIds.includes(item.id)).map((item)=>item.boardColumn),
        ['todo','todo']);
        await page.reload();
        await page.locator('[aria-label="TODO 列"] .board-task').first().waitFor();
        const statusFilter=page.getByLabel('按状态筛选');
        await statusFilter.selectOption('done');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===1);
        assert.equal(await page.locator('.board-task').count(),1);
        await statusFilter.selectOption('todo');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===2);
        assert.equal(await page.locator('.board-task').count(),2);
        await statusFilter.selectOption('all');
        const priorityFilter=page.getByLabel('按优先级筛选');
        await priorityFilter.selectOption('high');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===0);
        assert.equal(await page.locator('.board-task').count(),0);
        await priorityFilter.selectOption('all');
        const executorFilter=page.getByLabel('按 Executor 筛选');
        await executorFilter.selectOption('');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===2);
        assert.equal(await page.locator('.board-task').count(),2);
        await executorFilter.selectOption('all');
        await page.waitForFunction(()=>globalThis.document.querySelectorAll('.board-task').length===3);
        const firstTitle=await todoCards.first().locator('h3').textContent();
        const move=page.getByRole('button',{name:`下移 ${firstTitle}`});
        await move.focus();await move.press('Enter');
        await page.getByText(`已调整 ${firstTitle} 的 TODO 顺序。`).waitFor({timeout:10_000});
        const feedback=await page.locator('.board-feedback').allTextContents();
        assert.ok(feedback.some((item)=>item.includes(`已调整 ${firstTitle} 的 TODO 顺序。`)),
          `Keyboard reorder failed: ${JSON.stringify(feedback)}`);
        assert.notEqual(await todoCards.first().locator('h3').textContent(),firstTitle);
        await page.waitForFunction((ids)=>ids.includes(
          globalThis.document.activeElement?.getAttribute('data-task-id') ?? ''),extraTaskIds);
        const focusId=await page.evaluate(()=>globalThis.document.activeElement?.getAttribute('data-task-id'));
        assert.ok(extraTaskIds.includes(focusId));
        const boardAfter=await boardSnapshot(page,project.projectId);
        assert.equal(boardAfter.tasks.filter((item)=>item.boardColumn==='todo').length,2);
        assert.equal(boardAfter.tasks.filter((item)=>item.boardColumn==='done').length,1);
        assert.equal(git('status','--porcelain'),'');
        const boardScreenshot=fileURLToPath(new URL(
          '../output/playwright/p3-12-python-desktop-board-1440x900.png',
          import.meta.url));
        await page.screenshot({path:boardScreenshot});
        console.log(JSON.stringify({stage:'p3-board-gates',todoCount:2,doneCount:1,
          crossColumnRejected:true,filtersNonMutating:true,keyboardReorder:true,
          sourceClean:true,screenshot:boardScreenshot}));
      }
    }
  }
  }

  if (process.env.FORGE_VERTICAL_REVIEW_ONLY !== '1' &&
      process.env.FORGE_VERTICAL_VERIFY_ONLY !== '1' &&
      !finalOnly) {
  // An owned, real Codex app-server is deliberately terminated mid-command.
  // This is a provider-failure path, not a simulated successful Agent result.
  const failureMessage = await invoke(page, 'conversation', 'conversation.send', {
    projectId: project.projectId, conversationId: conversation.conversationId,
    idempotencyKey: 'python-desktop-live-msg-02',
    text: 'Run the fixture hold command and report what happened.', attachmentIds: [],
  });
  const failureDraft = await invoke(page, 'draft', 'draft.manual', {
    projectId: project.projectId, conversationId: conversation.conversationId,
    sourceMessageId: failureMessage.message.messageId,
    idempotencyKey: 'python-desktop-live-draft-02',
  });
  const failureDecisionId = crypto.randomUUID();
  const failureRef = `decision:${failureDecisionId}`;
  const failureContract = { ...contract, taskId: failureDraft.draftId,
    title: 'Trace provider failure',
    goal: 'Run node hold.js in the isolated workspace. Wait for it to finish before doing anything else. Do not skip the command. After it finishes, add a comment to math.js.',
    acceptance: [{ id: 'AC-01', statement: 'Long command completes before edit',
      method: 'inspection', required: true, sourceRefs: [failureRef] }],
    scope: ['hold.js', 'math.js'],
    sourceRefs: [`message:${failureMessage.message.messageId}`, failureRef] };
  const failureRevised = await invoke(page, 'draft', 'draft.revise', {
    projectId: project.projectId, draftId: failureDraft.draftId, expectedRevision: 1,
    contract: failureContract, decisionId: failureDecisionId,
    decisionSummary: 'Provider failure fixture scope reviewed',
    resolvedQuestions: [], removedAcceptanceIds: [], confirmScopeChange: true,
  });
  assert.equal(failureRevised.status, 'proposed');
  const failureApproval = await invoke(page, 'approval', 'approval.request', {
    projectId: project.projectId, draftId: failureDraft.draftId, expectedRevision: 2,
  });
  const failureApproved = await invoke(page, 'approval', 'approval.decide', {
    projectId: project.projectId, decision: { schemaVersion: '1.0',
      approvalId: failureApproval.request.approvalId, decision: 'approve',
      expectedRevision: 2, scopeHash: failureApproval.request.scopeHash,
      reason: 'Failure fixture reviewed' },
  });
  assert.equal(failureApproved.taskState, 'todo');
  const failureRunId = crypto.randomUUID();
  await invoke(page, 'run', 'run.start', { projectId: project.projectId,
    taskId: failureDraft.draftId, expectedTaskRevision: 2,
    modelId, idempotencyKey: failureRunId });
  let failureInspection;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await delay(500);
    failureInspection = await invoke(page, 'run', 'run.inspect', {
      projectId: project.projectId, runId: failureRunId, afterCursor: 0, limit: 100,
    });
    if (failureInspection.observations.some((item) => item.type === 'command.started')) break;
    assert.ok(!['succeeded', 'failed', 'cancelled', 'interrupted'].includes(failureInspection.run.state),
      `Provider finished before the fault probe: ${JSON.stringify(failureInspection)}`);
  }
  assert.ok(failureInspection?.observations.some((item) => item.type === 'command.started'));
  const recordsDir = join(dataDir, 'process-records');
  const records = await Promise.all((await readdir(recordsDir)).filter((name) => name.endsWith('.json'))
    .map(async (name) => JSON.parse(await readFile(join(recordsDir, name), 'utf8'))));
  const owned = records.find((item) => item.runId === failureRunId && item.status === 'running');
  assert.ok(owned && Number.isInteger(owned.pid) && owned.pid > 0);
  const cancelScenario = process.env.FORGE_VERTICAL_TERMINATION === 'cancel';
  if (cancelScenario) {
    const cancellation = await invoke(page, 'run', 'run.cancel', {
      projectId: project.projectId, runId: failureRunId,
    });
    assert.equal(cancellation.state, 'cancelled');
  } else {
    process.kill(owned.pid, 'SIGKILL');
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(500);
    failureInspection = await invoke(page, 'run', 'run.inspect', {
      projectId: project.projectId, runId: failureRunId, afterCursor: 0, limit: 100,
    });
    if ((cancelScenario ? ['cancelled', 'interrupted'] : ['failed', 'interrupted'])
      .includes(failureInspection.run.state)) break;
  }
  assert.ok((cancelScenario ? ['cancelled'] : ['failed', 'interrupted'])
    .includes(failureInspection.run.state),
  `Run did not reach expected terminal state: ${JSON.stringify(failureInspection)}`);
  assert.ok(failureInspection.observations.some((item) => item.type ===
    (cancelScenario ? 'run.cancelled' : 'run.failed')));
  if (cancelScenario) {
    const workspaceRecords = join(dataDir, 'workspaces', 'records');
    const workspaces = await Promise.all((await readdir(workspaceRecords))
      .filter((name) => name.endsWith('.json')).map(async (name) =>
        JSON.parse(await readFile(join(workspaceRecords, name), 'utf8'))));
    const ownedWorkspace = workspaces.find((item) => item.ownerRunId === failureRunId);
    assert.ok(ownedWorkspace, 'Run workspace ownership record is missing');
    const workspacePath = ownedWorkspace.rootPath;
    const before = await readFile(join(workspacePath, 'math.js'), 'utf8');
    await delay(2_000);
    assert.equal(await readFile(join(workspacePath, 'math.js'), 'utf8'), before,
      'Cancelled Run continued writing the workspace');
    const stopped = JSON.parse(await readFile(join(recordsDir,
      `${owned.processId}.json`), 'utf8'));
    assert.notEqual(stopped.status, 'running', 'Owned app-server remained active');
  }
  assert.equal(await invoke(page, 'run', 'run.handoff', {
    projectId: project.projectId, runId: failureRunId }), null);
  assert.equal(git('status', '--porcelain'), '');
  console.log(JSON.stringify({ stage: 'python-desktop-live', hostPid: hostHealth.data.pid,
    ...successResult,
    failureRunId,
    termination: cancelScenario ? 'user-cancel' : 'provider-kill',
    providerFailure: failureInspection.run.state, failureObservationTypes:
      failureInspection.observations.map((item) => item.type), screenshot }));
  }
} finally {
  await desktop?.close();
  await rm(root, { recursive: true, force: true });
}
