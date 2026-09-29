/**
 * Actual Add All to Queue UI with explicit, disposable task fixtures. Both Main
 * execution entry points are refused before their original handlers. Queue and
 * backlog writes still use the real Main handler. No executor outcome is faked.
 * The caller owns Electron and must close it if a guard cannot safely restore.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';

const guardKey = '__forgeConditionalQueueBoundary';
const statusChannel = 'task:updateStatus';
const startChannel = 'task:start';
const boundaryError = 'Explicit conditional UI boundary: task execution was refused before the original Main handler. No model was started.';

export async function walkConditionalQueueBoundary(ctx) {
  const {
    app, page, projectId, fixture, profile, report, t, button, main,
    click, segment, shot, blocked, createTaskFixture, refreshTasks,
  } = ctx;
  let requiresElectronClose = false;

  await segment('conditional-queue-add-all-guarded-refusal', async () => {
    const record = report.queueBoundary = {
      scope: 'Real queue UI and local persistence; synthetic execution refusal, no model/executor or Forge Host acceptance.',
      actualQueueAllClicked: false, guardsInstalled: false, guardsRestored: false,
      realExecution: false, runtimeRefusalIsSynthetic: true,
    };
    const directories = await app.evaluate(({ app: application }) => ({
      userData: application.getPath('userData'), home: application.getPath('home'), envHome: process.env.HOME,
    }));
    assert.equal(path.resolve(directories.userData), path.resolve(profile));
    assert.equal(path.resolve(directories.home), path.resolve(directories.envHome));
    assert.ok(path.resolve(directories.home).startsWith(path.dirname(path.resolve(profile)) + path.sep));
    assert.match(await readFile(path.join(fixture, 'README.md'), 'utf8'), /CONDITIONAL UI FIXTURE/);
    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.ok(projects.success && projects.data.length === 1, 'Require one isolated project for global queue boundary');
    const project = projects.data[0];
    assert.equal(project.id, projectId);
    assert.equal(path.resolve(project.path), path.resolve(fixture));
    assert.equal(project.autoBuildPath, '.forge-glass-preview');

    const readTasks = async () => {
      const result = await page.evaluate(id => window.electronAPI.getTasks(id, { forceRefresh: true }), projectId);
      assert.ok(result.success && Array.isArray(result.data));
      return result.data;
    };
    const executableOrQueued = tasks => tasks.filter(task => !task.metadata?.archivedAt &&
      ['backlog', 'queue', 'in_progress'].includes(task.status));
    const before = await readTasks();
    if (executableOrQueued(before).length > 0) {
      record.status = 'blocked-before-click';
      record.unrelatedEligibleTasks = executableOrQueued(before).map(task => ({ id: task.id, status: task.status }));
      await blocked('Add All to Queue runtime boundary',
        'Run this helper immediately after isolated project setup, before other task fixtures. Unrelated backlog/queued/running tasks make the two-task scope unsafe.');
      return;
    }

    const gate = await app.evaluate(({ ipcMain }, config) => ({
      invokeMapPresent: ipcMain._invokeHandlers instanceof Map,
      statusHandlerPresent: typeof ipcMain._invokeHandlers?.get?.(config.statusChannel) === 'function',
      startListenerCount: ipcMain.rawListeners(config.startChannel).length,
      startListenersAreFunctions: ipcMain.rawListeners(config.startChannel).every(listener => typeof listener === 'function'),
      existingGuard: !!globalThis[config.guardKey],
    }), { statusChannel, startChannel, guardKey });
    record.featureGate = gate;
    if (!gate.invokeMapPresent || !gate.statusHandlerPresent || gate.startListenerCount !== 1 ||
      !gate.startListenersAreFunctions || gate.existingGuard) {
      record.status = 'blocked-before-click';
      await blocked('Add All to Queue runtime boundary',
        'Cannot preserve the exact Main execution handlers. Undocumented invoke-map access is feature-detected; unsupported builds do not click this control.');
      return;
    }

    const fixtures = [];
    for (const suffix of ['A', 'B']) {
      const task = await createTaskFixture(`Conditional queue refusal fixture ${suffix}`, {
        status: 'backlog', xstateState: 'backlog', executionPhase: 'idle', subtaskStatus: 'pending',
      });
      assert.ok(path.resolve(task.specDir).startsWith(path.resolve(fixture) + path.sep));
      const plan = JSON.parse(await readFile(task.planPath, 'utf8'));
      assert.equal(plan.status, 'backlog');
      assert.ok(plan.phases.every(phase => phase.subtasks.every(subtask => subtask.status === 'pending')));
      fixtures.push(task);
    }
    const ownIds = fixtures.map(task => task.id);
    const eligible = executableOrQueued(await readTasks());
    assert.deepEqual(eligible.map(task => task.id).sort(), [...ownIds].sort());
    assert.ok(eligible.every(task => task.status === 'backlog'), 'Queue and In Progress must be empty before installation');
    await refreshTasks();
    const queue = main().locator('.forge-glass-board-column[data-status="queue"]');
    const running = main().locator('.forge-glass-board-column[data-status="in_progress"]');
    const backlog = main().locator('.forge-glass-board-column[data-status="backlog"]');
    await expect(queue.locator('[data-task-id]')).toHaveCount(0);
    await expect(running.locator('[data-task-id]')).toHaveCount(0);
    if (await backlog.getAttribute('data-collapsed') === 'true') {
      await click(button(await t('tasks', 'kanban.expandColumn'), backlog), 'Expand fresh queue-fixture backlog');
    }
    if (await queue.getAttribute('data-collapsed') === 'true') {
      await click(button(await t('tasks', 'kanban.expandColumn'), queue), 'Expand fresh queue-fixture pending queue');
    }
    const queueAll = button(await t('tasks', 'queue.queueAll'), backlog);
    const completedToast = page.getByText(await t('tasks', 'queue.queueAllSuccess', { count: 2 }), { exact: true });
    await expect(queueAll).toBeEnabled();
    await expect(completedToast).toHaveCount(0);

    await app.evaluate(({ ipcMain, app: application }, config) => {
      if (application.getPath('userData') !== config.profile || application.getPath('home') !== config.home ||
        process.env.HOME !== config.home) throw new Error('Queue boundary lost isolated directories');
      if (globalThis[config.guardKey]) throw new Error('Queue boundary already installed');
      const handlers = ipcMain._invokeHandlers;
      const originalStatus = handlers?.get?.(config.statusChannel);
      const originalStarts = ipcMain.rawListeners(config.startChannel);
      if (!(handlers instanceof Map) || typeof originalStatus !== 'function' || originalStarts.length !== 1) {
        throw new Error('Queue execution handlers changed before guard installation');
      }
      const state = {
        ...config, originalStatus, originalStarts, ownIds: new Set(config.ownIds),
        promotionsRefused: [], taskStartsRefused: [], unexpected: [], allowedWrites: [],
        inFlightWrites: 0, completedWrites: 0,
      };
      const refuse = (channel, taskId, status) => ({
        success: false, code: 'conditional-queue-execution-refused', error: config.boundaryError,
      });
      state.statusGuard = async (event, taskId, status, options) => {
        const request = { taskId, status, own: state.ownIds.has(taskId) };
        if (!request.own) state.unexpected.push({ channel: config.statusChannel, ...request });
        if (status === 'in_progress') {
          state.promotionsRefused.push(request);
          return refuse(config.statusChannel, taskId, status);
        }
        if (!request.own || !['queue', 'backlog'].includes(status)) {
          return refuse(config.statusChannel, taskId, status);
        }
        state.inFlightWrites += 1;
        const write = { ...request, acknowledged: false };
        state.allowedWrites.push(write);
        try {
          const result = await originalStatus(event, taskId, status, options);
          write.acknowledged = result?.success === true;
          return result;
        } finally {
          state.inFlightWrites -= 1;
          state.completedWrites += 1;
        }
      };
      state.startGuard = (_event, taskId) => {
        const request = { taskId, own: state.ownIds.has(taskId) };
        state.taskStartsRefused.push(request);
        if (!request.own) state.unexpected.push({ channel: config.startChannel, ...request });
        // task:start is send/on, so the return is deliberately unused. Do not
        // fabricate Task status/error events or call the original listener.
        return refuse(config.startChannel, taskId);
      };
      ipcMain.removeHandler(config.statusChannel);
      try {
        ipcMain.handle(config.statusChannel, state.statusGuard);
        for (const listener of originalStarts) ipcMain.removeListener(config.startChannel, listener);
        ipcMain.on(config.startChannel, state.startGuard);
        globalThis[config.guardKey] = state;
      } catch (error) {
        ipcMain.removeHandler(config.statusChannel);
        ipcMain.handle(config.statusChannel, originalStatus);
        ipcMain.removeListener(config.startChannel, state.startGuard);
        for (const listener of originalStarts) {
          if (!ipcMain.rawListeners(config.startChannel).includes(listener)) ipcMain.on(config.startChannel, listener);
        }
        throw error;
      }
    }, { statusChannel, startChannel, guardKey, profile: path.resolve(profile), home: path.resolve(directories.home), ownIds, boundaryError }).catch(error => {
      // The evaluation may have partially mutated IPC before rejecting. Do not
      // let a permissive segment runner proceed after an uncertain installation.
      requiresElectronClose = true;
      record.installationError = String(error);
      record.originalHandlerRestorationUnverifiedUntilAppTermination = true;
      record.requiresElectronClose = true;
      throw error;
    });
    record.guardsInstalled = true;
    report.fixtureSetup.push({
      kind: 'two-main-entry-execution-refusal-boundary', projectId, ownIds,
      sendChannel: startChannel, invokeChannel: statusChannel,
      invokeMapIsUndocumentedAndFeatureDetected: true,
      normalMainWritesAllowed: ['own task queue', 'own task backlog'],
      syntheticBoundary: true, noSyntheticTaskEvents: true,
      boundaryInvariant: 'Original task:start listeners are removed; original task:updateStatus only receives own queue/backlog writes. This is a boundary invariant, not independent executor telemetry.',
    });

    const guardSnapshot = () => app.evaluate((_electron, key) => {
      const state = globalThis[key];
      if (!state) throw new Error('Queue guard unexpectedly absent');
      return {
        promotionsRefused: state.promotionsRefused, taskStartsRefused: state.taskStartsRefused,
        unexpected: state.unexpected, allowedWrites: state.allowedWrites,
        inFlightWrites: state.inFlightWrites, completedWrites: state.completedWrites,
      };
    }, guardKey);
    const proveDrained = async () => {
      const stored = await readTasks();
      assert.ok(!stored.some(task => !task.metadata?.archivedAt && ['queue', 'in_progress'].includes(task.status)));
      for (const task of fixtures) {
        assert.equal(stored.find(candidate => candidate.id === task.id)?.status, 'backlog');
        assert.equal(JSON.parse(await readFile(task.planPath, 'utf8')).status, 'backlog');
        const runningState = await page.evaluate(id => window.electronAPI.checkTaskRunning(id), task.id);
        assert.ok(runningState.success && runningState.data === false);
      }
      await refreshTasks();
      await expect(queue.locator('[data-task-id]')).toHaveCount(0);
      await expect(running.locator('[data-task-id]')).toHaveCount(0);
      for (const task of fixtures) await expect(backlog.locator(`[data-task-id="${task.id}"]`)).toBeVisible();
      const first = await guardSnapshot();
      assert.equal(first.inFlightWrites, 0);
      assert.ok(first.allowedWrites.every(write => ['queue', 'backlog'].includes(write.status) && write.own));
      assert.equal(first.unexpected.length, 0);
      await readTasks();
      const second = await guardSnapshot();
      assert.deepEqual(second, first, 'No late queue promotions or status writes may remain before restoration');
      return { storedStatuses: fixtures.map(task => ({ taskId: task.id, status: 'backlog' })), guard: second };
    };
    let drainProof;
    let failure;
    let queueWorkflowSettled = false;
    try {
      record.queueAllClickAttempted = true;
      await click(queueAll, 'Click actual Add All to Queue with two guarded pending-task fixtures');
      record.actualQueueAllClicked = true;
      await expect(completedToast).toBeVisible();
      // This Toast occurs after await processQueue, not merely after enqueueing.
      queueWorkflowSettled = true;
      record.queueWorkflowCompletionAcknowledged = true;
      const queued = await readTasks();
      for (const task of fixtures) {
        assert.equal(queued.find(candidate => candidate.id === task.id)?.status, 'queue');
        assert.equal(JSON.parse(await readFile(task.planPath, 'utf8')).status, 'queue');
      }
      const refused = await guardSnapshot();
      assert.deepEqual(refused.promotionsRefused.map(request => request.taskId).sort(), [...ownIds].sort());
      assert.ok(refused.promotionsRefused.every(request => request.own));
      assert.equal(refused.taskStartsRefused.length, 0, 'Queue promotes via status IPC; the send entry is independently guarded');
      assert.equal(refused.unexpected.length, 0);
      assert.equal(refused.inFlightWrites, 0);
      assert.deepEqual(refused.allowedWrites.map(write => ({ taskId: write.taskId, status: write.status, acknowledged: write.acknowledged }))
        .sort((first, second) => first.taskId.localeCompare(second.taskId)),
      ownIds.map(taskId => ({ taskId, status: 'queue', acknowledged: true }))
        .sort((first, second) => first.taskId.localeCompare(second.taskId)));
      await expect(queue.locator('[data-task-id]')).toHaveCount(2);
      await expect(running.locator('[data-task-id]')).toHaveCount(0);
      record.queueWritesAcknowledged = true;
      record.refusedPromotionTaskIds = refused.promotionsRefused.map(request => request.taskId);
      await shot('queue-add-all-real-persistence-synthetic-execution-refusal');

      for (const task of fixtures) {
        const card = queue.locator(`[data-task-id="${task.id}"]`);
        await click(button(await t('tasks', 'actions.taskActions'), card), `Open normal queue menu for ${task.title}`);
        await click(page.getByRole('menuitem', { name: await t('tasks', 'columns.backlog'), exact: true }),
          `Move ${task.title} back to backlog through normal persisted task action`);
        await expect(card).toHaveCount(0);
      }
      drainProof = await proveDrained();
      record.drainedThroughNormalTaskMenus = true;
      await shot('queue-cleared-to-backlog-before-restoring-original-handlers');
      await blocked('Actual execution after Add All to Queue',
        'Both execution entry points were deliberately refused by a labelled Main boundary. This verifies the queue button and local persistence, not model execution or Forge Host acceptance.');
    } catch (error) {
      failure = error;
    } finally {
      if (!drainProof) {
        // Recovery uses the normal Main persistence API while both execution
        // guards stay installed. Never edit plans or invent a successful reply.
        try {
          const stored = await readTasks();
          for (const task of fixtures) {
            const status = stored.find(candidate => candidate.id === task.id)?.status;
            assert.ok(['backlog', 'queue'].includes(status));
            const result = await page.evaluate(id => window.electronAPI.updateTaskStatus(id, 'backlog'), task.id);
            assert.ok(result.success, 'Normal Main backlog reset must acknowledge persistence');
          }
          drainProof = await proveDrained();
          record.recoveryUsedNormalMainBacklogWrites = true;
        } catch (error) {
          record.drainError = String(error);
        }
      }
      if (drainProof && queueWorkflowSettled) {
        record.drainProof = drainProof;
        const restored = await app.evaluate(({ ipcMain }, key) => {
          const state = globalThis[key];
          if (!state || state.inFlightWrites !== 0 || state.unexpected.length !== 0 ||
            ipcMain._invokeHandlers?.get?.(state.statusChannel) !== state.statusGuard) {
            throw new Error('Queue boundary cannot restore altered or busy status handler');
          }
          const currentStarts = ipcMain.rawListeners(state.startChannel);
          if (currentStarts.length !== 1 || currentStarts[0] !== state.startGuard) {
            throw new Error('Queue boundary cannot restore altered start listeners');
          }
          ipcMain.removeHandler(state.statusChannel);
          ipcMain.handle(state.statusChannel, state.originalStatus);
          ipcMain.removeListener(state.startChannel, state.startGuard);
          // Preserve raw references, including any once wrapper, in their order.
          for (const listener of state.originalStarts) ipcMain.on(state.startChannel, listener);
          const exactStarts = ipcMain.rawListeners(state.startChannel);
          const exact = ipcMain._invokeHandlers.get(state.statusChannel) === state.originalStatus &&
            exactStarts.length === state.originalStarts.length && exactStarts.every((listener, index) => listener === state.originalStarts[index]);
          if (!exact) throw new Error('Queue original handler identity verification failed');
          delete globalThis[key];
          return { exactInvokeHandlerRestored: true, exactSendListenersRestored: true };
        }, guardKey).catch(error => { record.restoreError = String(error); return null; });
        if (restored) {
          record.guardsRestored = true;
          record.restoration = restored;
        }
      }
      if (!record.guardsRestored) {
        requiresElectronClose = true;
        record.guardRetainedUntilElectronClose = !record.restoreError;
        record.originalHandlerRestorationUnverifiedUntilAppTermination = true;
        record.queueWorkflowCompletionAcknowledged = queueWorkflowSettled;
        record.requiresElectronClose = true;
      }
    }
    if (requiresElectronClose) throw new Error('Queue boundary remains protected; caller must close Electron before any further task workflow.');
    if (failure) throw failure;
    record.status = 'passed-real-queue-ui-with-synthetic-runtime-refusal';
  });
  // Enforce app shutdown even when the caller is configured to continue after
  // a failed segment. A retained boundary must never leak into later scenarios.
  if (requiresElectronClose) throw new Error('Queue guard drain/restoration not proven; close the caller-owned Electron application.');
}
