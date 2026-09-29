/**
 * Fresh staged-message Copy controls, with an explicitly synthetic IPC result.
 * The caller owns Electron/native focus. Importing this module launches nothing.
 * The real merge handler is never called: no staging, task SDK, model or Keychain
 * execution is certified by these component-only UI checks.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, mkdir, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { captureNativeClipboard, restoreNativeClipboard } from './clipboard-fixture-safety.mjs';

const CHANNEL = 'task:worktreeMerge';
const MESSAGE = 'SYNTHETIC COMPONENT FIXTURE ONLY: no Git staging, model call or task execution occurred.';
const COMMIT = 'test: synthetic staged-message Copy UI fixture';
const INVOKE_STATE = '__forgeConditionalStagedCopyInvoke';
const NATIVE_STATE = '__forgeConditionalStagedNativeCopy';
const REFUSAL_STATE = '__forgeConditionalStagedCopyRefusal';

export async function walkConditionalStagedCopy(ctx) {
  const { app, page, projectId, fixture, profile, report, t, button, dialog,
    click, fill, segment, shot, blocked, closeLayers, createTaskFixture, refreshTasks } = ctx;
  report.fixtureSetup ??= [];
  const exists = file => access(file).then(() => true, () => false);
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  const inside = file => assert.ok(path.resolve(file).startsWith(path.resolve(fixture) + path.sep), 'Refuse paths outside the disposable project');
  const taskGitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (args, cwd = fixture) => execFileSync('git', [
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false',
    '-c', 'user.name=Forge Conditional UI QA', '-c', 'user.email=ui-qa@example.invalid', ...args,
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...taskGitEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
  } }).trim();

  // Hash payloads rather than recording fixture contents; include missing files,
  // modes and symlink targets so a task-state mutation cannot hide in the snapshot.
  async function treeSnapshot(directory) {
    const records = [];
    async function visit(file, relative) {
      const stat = await lstat(file);
      if (stat.isDirectory()) {
        records.push({ path: relative, type: 'directory', mode: stat.mode & 0o777 });
        for (const entry of (await readdir(file)).sort()) await visit(path.join(file, entry), path.join(relative, entry));
      } else if (stat.isSymbolicLink()) {
        records.push({ path: relative, type: 'symlink', targetHash: hash(await readlink(file)), mode: stat.mode & 0o777 });
      } else {
        assert.ok(stat.isFile(), 'Fixture snapshots must not contain devices or sockets');
        records.push({ path: relative, type: 'file', sha256: hash(await readFile(file)), mode: stat.mode & 0o777 });
      }
    }
    if (await exists(directory)) await visit(directory, '.');
    return records;
  }
  async function gitSnapshot(directory) {
    const indexPath = path.resolve(directory, git(['rev-parse', '--git-path', 'index'], directory));
    const indexExists = await exists(indexPath);
    let readableIndexPath = indexPath;
    if (indexExists) {
      // macOS Git reports worktree indexes under /private/var even when the
      // caller's disposable fixture uses its /var alias. Resolve only this
      // existing index and fixture for the read containment check.
      const [canonicalIndex, canonicalFixture] = await Promise.all([realpath(indexPath), realpath(fixture)]);
      assert.ok(canonicalIndex.startsWith(canonicalFixture + path.sep), 'Refuse an index outside the canonical disposable project');
      readableIndexPath = canonicalIndex;
    } else {
      inside(indexPath);
    }
    return {
      head: git(['rev-parse', 'HEAD'], directory), branch: git(['branch', '--show-current'], directory),
      status: git(['status', '--porcelain=v1', '--untracked-files=all'], directory),
      indexSha256: indexExists ? hash(await readFile(readableIndexPath)) : null,
      cachedDiffSha256: hash(git(['diff', '--cached', '--binary'], directory)),
      workingDiffSha256: hash(git(['diff', '--binary'], directory)),
    };
  }

  async function preservingNativeCopy(expectedText, label, operation) {
    const saved = await captureNativeClipboard(app);
    if (saved.unsupported.length) {
      await blocked(label, 'The current native clipboard format cannot be restored completely; this actual native write was not attempted. Original contents were preserved.');
      report.fixtureSetup.push({ kind: 'staged-copy-native-write-blocked', label, originalContentsLogged: false, unsupportedNativeFormats: true, actualNativeWrites: 0 });
      return false;
    }
    let installed = false;
    let settlement;
    const owner = randomUUID();
    try {
      // Also clean up an installation whose renderer acknowledgement is lost.
      installed = true;
      const installation = await page.evaluate(({ key, text, owner }) => {
        if (window[key]) throw new Error('A staged native clipboard fixture is already active');
        if (typeof navigator.clipboard?.writeText !== 'function') return { supported: false };
        const clipboard = navigator.clipboard;
        const original = clipboard.writeText;
        const ownDescriptor = Object.getOwnPropertyDescriptor(clipboard, 'writeText');
        const state = { clipboard, original, ownDescriptor, owner, writes: [], rejectedUnexpectedWrites: 0 };
        state.wrapper = function (...args) {
          if (args.length !== 1 || args[0] !== text) {
            state.rejectedUnexpectedWrites++;
            return Promise.reject(new Error('Synthetic Copy fixture refused an unexpected payload before native clipboard mutation'));
          }
          const result = Reflect.apply(original, clipboard, args);
          state.writes.push(Promise.resolve(result).then(() => true, () => false));
          return result;
        };
        window[key] = state;
        try { Object.defineProperty(clipboard, 'writeText', { configurable: true, writable: true, value: state.wrapper }); }
        catch (error) { delete window[key]; throw error; }
        if (clipboard.writeText !== state.wrapper) throw new Error('Unable to install bounded native clipboard observer');
        return { supported: true };
      }, { key: NATIVE_STATE, text: expectedText, owner });
      if (!installation.supported) {
        installed = false;
        await blocked(label, 'This renderer does not expose clipboard.writeText; no native clipboard write was attempted.');
        return false;
      }
      installed = true;
      await operation();
      assert.ok(await app.evaluate(({ clipboard }, expected) => clipboard.readText() === expected, expectedText), 'Native Copy must contain the exact edited synthetic message');
      return true;
    } finally {
      try {
        if (installed) {
          settlement = await page.evaluate(async ({ key, owner }) => {
            const state = window[key];
            if (!state) return null;
            if (state.owner !== owner) throw new Error('Refuse to restore another clipboard observer');
            const writes = await Promise.all(state.writes);
            const identityBeforeRestore = state.clipboard.writeText === state.wrapper;
            if (state.ownDescriptor) Object.defineProperty(state.clipboard, 'writeText', state.ownDescriptor);
            else Reflect.deleteProperty(state.clipboard, 'writeText');
            const restoredSameFunction = state.clipboard.writeText === state.original;
            delete window[key];
            return { writes, identityBeforeRestore, restoredSameFunction, rejectedUnexpectedWrites: state.rejectedUnexpectedWrites };
          }, { key: NATIVE_STATE, owner });
          assert.ok(settlement, 'Bounded native clipboard observer installation was not acknowledged');
          assert.equal(settlement.identityBeforeRestore, true);
          assert.equal(settlement.restoredSameFunction, true);
          assert.equal(settlement.rejectedUnexpectedWrites, 0);
          assert.deepEqual(settlement.writes, [true], 'One real native write must settle successfully before restoration');
        }
      } finally {
        await restoreNativeClipboard(app, saved);
        report.fixtureSetup.push({ kind: 'staged-copy-native-clipboard-preservation', label,
          writerSettlementConfirmed: !!settlement, browserWritesSettled: settlement?.writes.length,
          restoredFormatsAndContentsAtVerification: true, originalContentsLogged: false });
      }
    }
  }

  await segment('conditional-task-synthetic-staged-copy-controls', async () => {
    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.equal(projects.success, true);
    const project = projects.data.find(candidate => candidate.id === projectId);
    assert.ok(project);
    assert.equal(path.resolve(project.path), path.resolve(fixture), 'Refuse production projects');
    assert.equal(project.autoBuildPath, '.forge-glass-preview');
    assert.match(await readFile(path.join(fixture, 'README.md'), 'utf8'), /CONDITIONAL UI FIXTURE/);
    assert.equal(await realpath(git(['rev-parse', '--show-toplevel'])), await realpath(fixture));
    assert.equal(git(['remote']), '', 'The component fixture must have no remote');
    const directories = await app.evaluate(({ app: application }) => ({ home: application.getPath('home'), userData: application.getPath('userData') }));
    assert.equal(path.resolve(directories.userData), path.resolve(profile));
    assert.ok(path.resolve(directories.home).startsWith(path.dirname(path.resolve(profile)) + path.sep), 'Require isolated HOME');
    const accounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
    assert.ok(accounts.success && Array.isArray(accounts.data?.accounts));
    assert.equal(accounts.data.accounts.length, 0, 'The component fixture must not configure a provider account');
    report.fixtureSetup.push({ kind: 'synthetic-staged-copy-empty-provider-preflight', providerAccountCount: 0,
      credentialsRead: false, componentOnly: true, productSuccess: false });

    const support = await app.evaluate(({ ipcMain }, channel) => ({
      mapPresent: ipcMain._invokeHandlers instanceof Map,
      originalHandlerPresent: typeof ipcMain._invokeHandlers?.get?.(channel) === 'function',
    }), CHANNEL);
    report.fixtureSetup.push({ kind: 'synthetic-stage-handler-access', channel: CHANNEL, ...support,
      fixtureLimitation: 'Electron has no public getHandler API. This fixture feature-detects the undocumented ipcMain._invokeHandlers Map; replacement/restoration use public removeHandler/handle.' });
    if (!support.mapPresent || !support.originalHandlerPresent) {
      await blocked('Synthetic staged-message component fixture', 'The Electron private invoke-handler Map is unavailable. Stage was not clicked because the real handler cannot be safely captured and restored.');
      return;
    }

    const task = await createTaskFixture('Conditional synthetic staged Copy component fixture', { status: 'human_review', xstateState: 'human_review', reviewReason: 'completed' });
    inside(task.specDir);
    assert.equal(task.id, task.specId, 'Require the canonical isolated task/spec branch identity');
    const worktreePath = path.join(fixture, '.forge-glass-preview', 'worktrees', 'tasks', task.id);
    const branch = `forge-glass-preview/${task.specId}`;
    const mainHead = git(['rev-parse', 'HEAD']);
    const mainBranch = git(['branch', '--show-current']);
    const mainReadme = await readFile(path.join(fixture, 'README.md'), 'utf8');
    inside(worktreePath);
    assert.equal(await exists(worktreePath), false);
    assert.equal(git(['branch', '--list', branch]), '');
    await mkdir(path.dirname(worktreePath), { recursive: true });
    let worktreeCreated = false;
    let handlerInstalled = false;
    const handlerOwner = randomUUID();
    let baseline;
    let invariantEvidence;
    try {
      worktreeCreated = true;
      git(['worktree', 'add', '-b', branch, worktreePath, mainBranch]);
      await writeFile(path.join(worktreePath, 'README.md'), `${mainReadme}\n${MESSAGE}\n`);
      git(['add', '--', 'README.md'], worktreePath);
      git(['commit', '-m', 'Create synthetic staged Copy component worktree fixture'], worktreePath);
      report.fixtureSetup.push({ kind: 'synthetic-staged-copy-local-worktree', taskId: task.id, worktreePath, branch,
        componentOnly: true, productSuccess: false, realStaging: false, realExecution: false, modelCalls: 0, note: MESSAGE });
      await refreshTasks();
      const status = await page.evaluate(id => window.electronAPI.getWorktreeStatus(id), task.id);
      assert.ok(status.success && status.data.exists);
      assert.equal(path.resolve(status.data.worktreePath), path.resolve(worktreePath));
      assert.equal(status.data.branch, branch);
      assert.equal(status.data.commitCount, 1);
      await click(button(task.title), 'Open synthetic staged Copy task component fixture');
      await dialog().getByText(branch, { exact: true }).waitFor();
      await click(button(await t('uiTasks', 'review.checkConflicts'), dialog()), 'Load actual no-AI local preview before synthetic Stage response');
      const stageOnly = dialog().getByRole('checkbox', { name: await t('taskReview', 'merge.status.stageOnly'), exact: true });
      await stageOnly.waitFor();
      // The checkbox is rendered only once the normal UI preview returned. The
      // enabled merge button additionally proves its parallel status request and
      // loading-finally settled before the separate verification preview.
      await expect(button(await t('taskReview', 'merge.buttons.mergeTo', { branch: mainBranch }), dialog())).toBeEnabled();
      const preview = await page.evaluate(id => window.electronAPI.mergeWorktreePreview(id), task.id);
      assert.ok(preview.success);
      assert.ok(preview.data.preview.files.includes('README.md'));
      assert.equal(preview.data.preview.conflicts.length, 0, 'Require a conflict-free local preview for the normal Stage button');
      baseline = { mainGit: await gitSnapshot(fixture), worktreeGit: await gitSnapshot(worktreePath),
        taskFiles: await treeSnapshot(task.specDir), worktreeFiles: await treeSnapshot(worktreePath) };

      // If a completed Main evaluate loses its acknowledgement, finally still
      // finds/restores only our own wrapper using the unique owner token.
      handlerInstalled = true;
      const installation = await app.evaluate(({ ipcMain, BrowserWindow }, config) => {
        if (globalThis[config.key]) throw new Error('A synthetic staged merge handler is already installed');
        const handlers = ipcMain._invokeHandlers;
        if (!(handlers instanceof Map)) throw new Error('Private Electron invoke-handler Map is unavailable');
        const original = handlers.get(config.channel);
        if (typeof original !== 'function') throw new Error('Missing original task worktree merge handler');
        const windows = BrowserWindow.getAllWindows().filter(candidate => candidate.webContents.getURL() === config.rendererURL);
        if (windows.length !== 1) throw new Error('Require one exact caller renderer');
        const senderId = windows[0].webContents.id;
        const state = { original, senderId, calls: [], rejected: [], channel: config.channel, owner: config.owner };
        state.wrapper = async (event, taskId, options, ...extra) => {
          const permitted = event?.sender?.id === senderId && taskId === config.taskId &&
            options && typeof options === 'object' && !Array.isArray(options) &&
            Object.keys(options).length === 1 && options.noCommit === true &&
            extra.length === 0 && state.calls.length === 0;
          if (!permitted) {
            state.rejected.push({ sameTask: taskId === config.taskId, sameSender: event?.sender?.id === senderId, noCommit: options?.noCommit === true });
            return { success: false, error: 'Synthetic staged component fixture rejected unexpected invocation before any Git/model handler' };
          }
          state.calls.push({ taskId, noCommit: true, componentOnly: true, originalHandlerInvoked: false });
          // Never delegate, authenticate, inspect Keychain, stage files or mutate task state.
          return { success: true, data: { success: true, staged: true,
            message: config.message, projectPath: config.fixture, suggestedCommitMessage: config.commit } };
        };
        ipcMain.removeHandler(config.channel);
        try { ipcMain.handle(config.channel, state.wrapper); }
        catch (error) { ipcMain.handle(config.channel, original); throw error; }
        globalThis[config.key] = state;
        return { originalCaptured: true, wrapperIdentityVerified: handlers.get(config.channel) === state.wrapper, originalHandlerInvoked: false };
      }, { key: INVOKE_STATE, channel: CHANNEL, rendererURL: page.url(), taskId: task.id, owner: handlerOwner,
        fixture, message: MESSAGE, commit: COMMIT });
      assert.equal(installation.wrapperIdentityVerified, true);
      report.fixtureSetup.push({ kind: 'synthetic-staged-result-interception', taskId: task.id, channel: CHANNEL,
        ...installation, componentOnly: true, productSuccess: false, realStaging: false, modelCalls: 0 });

      if (!(await stageOnly.isChecked())) await click(stageOnly, 'Enable Stage Only for exact synthetic component response');
      await expect(stageOnly).toBeChecked();
      await click(button(await t('taskReview', 'merge.buttons.stageTo', { branch: mainBranch }), dialog()), 'Click normal Stage button with exact synthetic IPC result; no real staging');
      await dialog().getByText(MESSAGE, { exact: true }).waitFor();
      const commitInput = dialog().getByPlaceholder(await t('taskReview', 'stagedSuccess.commitMessagePlaceholder'), { exact: true });
      await expect(commitInput).toHaveValue(COMMIT);
      await shot('synthetic-staged-copy-component-only');
      for (const key of ['deleteWorktreeAndMarkDone', 'markDoneOnly', 'reviewAgain']) {
        await blocked(await t('taskReview', `stagedSuccess.${key}`), 'This segment covers only fresh staged-message Copy feedback. No real staging occurred; task-status/reset/delete actions are not invoked as production staged-success evidence.');
      }

      const edited = `${COMMIT} (edited before real Copy)`;
      await fill(commitInput, edited, 'Edit explicit synthetic staged-message text');
      const actualSuccess = await preservingNativeCopy(edited, 'Copy synthetic staged message to native clipboard', async () => {
        await click(button(await t('taskReview', 'stagedSuccess.copy'), dialog()), 'Copy edited synthetic commit message through actual native clipboard');
        await expect(button(await t('taskReview', 'stagedSuccess.copied'), dialog())).toBeEnabled();
        await shot('synthetic-staged-copy-native-success');
      });
      report.fixtureSetup.push({ kind: 'synthetic-staged-copy-native-success', actualNativeSuccess: actualSuccess, productSuccess: false, componentOnly: true, originalContentsLogged: false });

      const retryText = `${COMMIT} (edited for failure and native Retry)`;
      await fill(commitInput, retryText, 'Edit synthetic message to reset Copy success feedback');
      let refusalInstalled = false;
      const refusalOwner = randomUUID();
      try {
        refusalInstalled = true;
        const refusal = await page.evaluate(({ key, owner }) => {
          if (window[key]) throw new Error('A staged clipboard refusal fixture is already active');
          if (typeof navigator.clipboard?.writeText !== 'function') return { supported: false };
          const clipboard = navigator.clipboard;
          const state = { clipboard, original: clipboard.writeText, owner,
            ownDescriptor: Object.getOwnPropertyDescriptor(clipboard, 'writeText'), calls: 0, reject: undefined, settled: false };
          state.wrapper = () => {
            state.calls++;
            if (state.calls !== 1) return Promise.reject(new Error('Synthetic refusal fixture rejected duplicate clipboard invocation'));
            return new Promise((_, reject) => { state.reject = reject; });
          };
          window[key] = state;
          try { Object.defineProperty(clipboard, 'writeText', { configurable: true, writable: true, value: state.wrapper }); }
          catch (error) { delete window[key]; throw error; }
          return { supported: true, wrapperIdentityVerified: clipboard.writeText === state.wrapper };
        }, { key: REFUSAL_STATE, owner: refusalOwner });
        if (!refusal.supported) {
          refusalInstalled = false;
          await blocked('Staged Copy controlled rejection', 'Clipboard support is unavailable in this renderer; no replacement or native write was attempted.');
        } else {
          refusalInstalled = true;
          assert.equal(refusal.wrapperIdentityVerified, true);
          await click(button(await t('taskReview', 'stagedSuccess.copy'), dialog()), 'Copy synthetic staged message using held transport Promise; no OS write');
          const copying = button(await t('taskReview', 'stagedSuccess.copying'), dialog());
          await expect(copying).toBeDisabled();
          await expect(copying).toHaveAttribute('aria-busy', 'true');
          assert.equal(await page.evaluate(key => window[key].calls, REFUSAL_STATE), 1);
          await page.evaluate(key => {
            const state = window[key];
            if (typeof state?.reject !== 'function') throw new Error('Missing held clipboard rejection');
            state.settled = true;
            state.reject(new Error('Synthetic clipboard refusal before OS mutation'));
          }, REFUSAL_STATE);
          await expect(dialog().getByRole('alert')).toHaveText(await t('taskReview', 'stagedSuccess.errors.failedToCopy'));
          await page.getByText(await t('taskReview', 'stagedSuccess.copyFailed'), { exact: true }).last().waitFor();
          await expect(button(await t('common', 'buttons.retry'), dialog())).toBeEnabled();
          await expect(commitInput).toHaveValue(retryText);
          await shot('synthetic-staged-copy-controlled-failure');
          report.fixtureSetup.push({ kind: 'synthetic-staged-copy-controlled-refusal', calls: 1,
            pendingDisabledAndBusyVerified: true, visibleLocalizedAlertAndToast: true, actualOSWrites: 0, productSuccess: false, componentOnly: true });
        }
      } finally {
        if (refusalInstalled) {
          const restoration = await page.evaluate(({ key, owner }) => {
            const state = window[key];
            if (!state) return null;
            if (state.owner !== owner) throw new Error('Refuse to restore another clipboard refusal handler');
            if (!state.settled) state.reject?.(new Error('Synthetic staged Copy fixture cleanup'));
            const identityBeforeRestore = state.clipboard.writeText === state.wrapper;
            if (state.ownDescriptor) Object.defineProperty(state.clipboard, 'writeText', state.ownDescriptor);
            else Reflect.deleteProperty(state.clipboard, 'writeText');
            const restoredSameFunction = state.clipboard.writeText === state.original;
            delete window[key];
            return { identityBeforeRestore, restoredSameFunction, calls: state.calls };
          }, { key: REFUSAL_STATE, owner: refusalOwner });
          assert.ok(restoration, 'Staged clipboard refusal installation was not acknowledged');
          assert.equal(restoration.identityBeforeRestore, true);
          assert.equal(restoration.restoredSameFunction, true);
          assert.equal(restoration.calls, 1);
          report.fixtureSetup.push({ kind: 'staged-copy-refusal-handler-restoration', ...restoration });
        }
      }
      if (refusalInstalled) {
        const actualRetry = await preservingNativeCopy(retryText, 'Retry synthetic staged message through restored native clipboard', async () => {
          await click(button(await t('common', 'buttons.retry'), dialog()), 'Retry staged Copy after restoring actual clipboard transport');
          await expect(dialog().getByRole('alert')).toHaveCount(0);
          await expect(button(await t('taskReview', 'stagedSuccess.copied'), dialog())).toBeEnabled();
          await shot('synthetic-staged-copy-native-retry-success');
        });
        report.fixtureSetup.push({ kind: 'synthetic-staged-copy-native-retry', actualNativeSuccess: actualRetry,
          refusalRestoredBeforeRetry: true, componentOnly: true, productSuccess: false, originalContentsLogged: false });
      }
    } finally {
      try {
        try {
          if (handlerInstalled) {
            const restoration = await app.evaluate(({ ipcMain }, { key, owner }) => {
              const state = globalThis[key];
              if (!state) return null;
              if (state.owner !== owner) throw new Error('Refuse to restore another synthetic staged handler');
              const handlers = ipcMain._invokeHandlers;
              const identityBeforeRestore = handlers?.get(state.channel) === state.wrapper;
              if (!identityBeforeRestore) throw new Error('Synthetic handler identity changed; refuse to overwrite another handler');
              ipcMain.removeHandler(state.channel);
              ipcMain.handle(state.channel, state.original);
              const restoredSameFunction = handlers.get(state.channel) === state.original;
              const result = { identityBeforeRestore, restoredSameFunction, calls: state.calls,
                rejected: state.rejected, originalHandlerInvoked: false };
              delete globalThis[key];
              return result;
            }, { key: INVOKE_STATE, owner: handlerOwner });
            assert.ok(restoration, 'Synthetic staged invoke-handler installation was not acknowledged');
            report.fixtureSetup.push({ kind: 'synthetic-staged-merge-handler-restoration', ...restoration,
              componentOnly: true, productSuccess: false, realStaging: false, modelCalls: 0 });
            assert.equal(restoration.restoredSameFunction, true);
            assert.equal(restoration.rejected.length, 0);
            assert.equal(restoration.calls.length, 1, 'Exactly one normal Stage click must receive the synthetic result');
          }
        } finally {
          if (baseline) {
            const after = { mainGit: await gitSnapshot(fixture), worktreeGit: await gitSnapshot(worktreePath),
              taskFiles: await treeSnapshot(task.specDir), worktreeFiles: await treeSnapshot(worktreePath) };
            invariantEvidence = { kind: 'synthetic-staged-copy-no-mutation-evidence', taskId: task.id,
              baseline, after, mainGitUnchanged: JSON.stringify(after.mainGit) === JSON.stringify(baseline.mainGit),
              worktreeGitUnchanged: JSON.stringify(after.worktreeGit) === JSON.stringify(baseline.worktreeGit),
              taskFilesUnchanged: JSON.stringify(after.taskFiles) === JSON.stringify(baseline.taskFiles),
              worktreeFilesUnchanged: JSON.stringify(after.worktreeFiles) === JSON.stringify(baseline.worktreeFiles),
              componentOnly: true, productSuccess: false, realStaging: false, modelCalls: 0,
              verifiedBeforeRealFixtureCleanup: true };
            report.fixtureSetup.push(invariantEvidence);
            assert.deepEqual(after, baseline, 'Synthetic Stage/Copy must preserve HEAD/index/status, task plan/metadata/spec and every worktree file');
          }
        }
      } finally {
        try { await closeLayers(); }
        finally {
          if (worktreeCreated && await exists(worktreePath)) {
            // Fixture lifecycle cleanup only. It is not staged-message action coverage.
            git(['worktree', 'remove', '--force', worktreePath]);
          }
          if (git(['branch', '--list', branch])) git(['branch', '-D', branch]);
          assert.equal(await exists(worktreePath), false);
          assert.equal(git(['branch', '--list', branch]), '');
          assert.equal(git(['rev-parse', 'HEAD']), mainHead);
          assert.equal(await readFile(path.join(fixture, 'README.md'), 'utf8'), mainReadme);
          assert.equal(git(['remote']), '');
          report.fixtureSetup.push({ kind: 'synthetic-staged-copy-local-fixture-cleanup', taskId: task.id,
            worktreeRemoved: true, branchRemoved: true, mainHeadUnchanged: true,
            noMutationEvidenceCapturedBeforeCleanup: !!invariantEvidence, productSuccess: false, componentOnly: true });
        }
      }
    }
  });
}
