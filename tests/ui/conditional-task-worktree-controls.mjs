/**
 * Task worktree review controls in the disposable Electron UI fixture.
 * Local branches and completed-plan records below are synthetic QA inputs.
 * They never certify agent execution, model output or Forge Host acceptance.
 * This module does not launch an application or publish/merge any changes.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';

export async function walkConditionalTaskWorktree(ctx) {
  const { page, projectId, fixture, profile, report, t, button, dialog,
    click, fill, press, segment, shot, blocked, closeLayers, createTaskFixture,
    refreshTasks } = ctx;
  const note = 'Synthetic isolated worktree UI fixture; no agent, QA or model ran.';
  const taskGitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (args, cwd = fixture) => execFileSync('git', [
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'user.name=Forge Conditional UI QA',
    '-c', 'user.email=ui-qa@example.invalid', ...args,
  ], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...taskGitEnv, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' } }).trim();
  const exists = async file => access(file).then(() => true, () => false);
  const withinFixture = file => assert.ok(path.resolve(file).startsWith(path.resolve(fixture) + path.sep), 'Worktree QA must stay inside the disposable project');
  report.fixtureSetup ??= [];
  report.uxFindings ??= [];

  await segment('conditional-task-worktree-review-controls', async () => {
    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.equal(projects.success, true);
    const project = projects.data.find(candidate => candidate.id === projectId);
    assert.ok(project);
    assert.equal(path.resolve(project.path), path.resolve(fixture), 'Refuse production worktrees');
    assert.equal(project.autoBuildPath, '.forge-glass-preview');
    assert.match(await readFile(path.join(fixture, 'README.md'), 'utf8'), /CONDITIONAL UI FIXTURE/);
    assert.equal(await realpath(git(['rev-parse', '--show-toplevel'])), await realpath(fixture));
    assert.equal(git(['remote']), '', 'The worktree fixture must have no remote');
    const userDirectories = await ctx.app.evaluate(({ app }) => ({ home: app.getPath('home'), userData: app.getPath('userData') }));
    assert.equal(path.resolve(userDirectories.userData), path.resolve(profile));
    assert.ok(path.resolve(userDirectories.home).startsWith(path.dirname(path.resolve(profile)) + path.sep), 'Require the runner isolated home');

    const task = await createTaskFixture('Conditional task worktree review fixture', { reviewReason: 'completed' });
    const worktreePath = path.join(fixture, '.forge-glass-preview', 'worktrees', 'tasks', task.id);
    // Cleanup validates this exact branch, not an Aperant or auto-claude prefix.
    const branch = `forge-glass-preview/${task.id}`;
    withinFixture(worktreePath);
    assert.equal(await exists(worktreePath), false);
    const mainHead = git(['rev-parse', 'HEAD']);
    const mainBranch = git(['branch', '--show-current']);
    const mainReadme = await readFile(path.join(fixture, 'README.md'), 'utf8');
    await mkdir(path.dirname(worktreePath), { recursive: true });
    git(['worktree', 'add', '-b', branch, worktreePath, mainBranch]);
    assert.equal(git(['branch', '--show-current'], worktreePath), branch);
    await writeFile(path.join(worktreePath, 'README.md'), `${mainReadme}\n${note}\nThis local branch exists only to render the real Diff controls.\n`);
    await writeFile(path.join(worktreePath, 'conditional-ui-diff.txt'), `${note}\nAdded file for the actual git diff.\n`);
    git(['add', '--', 'README.md', 'conditional-ui-diff.txt'], worktreePath);
    git(['commit', '-m', 'Create explicit task worktree UI fixture'], worktreePath);
    const worktreeHead = git(['rev-parse', 'HEAD'], worktreePath);
    const settingsResult = await page.evaluate(() => window.electronAPI.getSettings());
    assert.equal(settingsResult.success, true);
    const previousTools = Object.fromEntries(['preferredIDE', 'customIDEPath', 'preferredTerminal', 'customTerminalPath'].map(key => [key, settingsResult.data[key]]));
    const toolDir = path.join(fixture, '.forge-glass-preview', 'conditional-ui-tools');
    const boundedTools = { preferredIDE: 'custom', customIDEPath: path.join(toolDir, 'missing-ide'), preferredTerminal: 'custom', customTerminalPath: path.join(toolDir, 'missing-terminal') };
    await mkdir(toolDir, { recursive: true });
    for (const executable of [boundedTools.customIDEPath, boundedTools.customTerminalPath]) {
      withinFixture(executable);
      assert.equal(await exists(executable), false, 'The bounded tool path must not execute a program');
    }
    report.fixtureSetup.push({ kind: 'real-isolated-task-worktree', taskId: task.id, worktreePath, branch, mainHead, worktreeHead, noRemote: true, realExecution: false, note });
    report.fixtureSetup.push({ kind: 'bounded-external-tool-failure', ...boundedTools, reason: 'Missing fixture-owned paths fail execFile before launching an external IDE or terminal' });

    try {
      const savedTools = await page.evaluate(settings => window.electronAPI.saveSettings(settings), boundedTools);
      assert.equal(savedTools.success, true);
      // The App normally loads these persisted preferences at renderer startup.
      await page.reload();
      await page.locator('.forge-glass-sidebar').waitFor();
      await refreshTasks();
      const status = await page.evaluate(id => window.electronAPI.getWorktreeStatus(id), task.id);
      assert.equal(status.success, true);
      assert.equal(status.data.exists, true);
      assert.equal(path.resolve(status.data.worktreePath), path.resolve(worktreePath));
      assert.equal(status.data.branch, branch);
      assert.equal(status.data.currentProjectBranch, mainBranch);
      assert.equal(status.data.commitCount, 1);
      const diff = await page.evaluate(id => window.electronAPI.getWorktreeDiff(id), task.id);
      assert.equal(diff.success, true);
      assert.ok(diff.data.files.some(file => file.path === 'README.md' && file.status === 'modified'));
      assert.ok(diff.data.files.some(file => file.path === 'conditional-ui-diff.txt' && file.status === 'added'));

      await click(button(task.title), 'Open real isolated task-worktree review');
      await dialog().getByText(branch, { exact: true }).waitFor();

      await click(dialog().getByRole('tab', { name: await t('tasks', 'files.tab'), exact: true }), 'Open isolated task Files lifecycle');
      const files = dialog().getByRole('listbox', { name: await t('tasks', 'files.title'), exact: true });
      await files.getByRole('option', { name: 'spec.md', exact: true }).waitFor();
      const fileNames = (await files.getByRole('option').allTextContents()).map(name => name.trim());
      assert.ok(fileNames.length > 1);
      for (const fileName of fileNames) {
        const option = files.getByRole('option', { name: fileName, exact: true });
        await click(option, `Read task Files option ${fileName}`);
        await expect(option).toHaveAttribute('aria-selected', 'true');
      }
      for (const [key, expectedName] of [['Home', fileNames[0]], ['ArrowDown', fileNames[1]], ['ArrowUp', fileNames[0]], ['End', fileNames.at(-1)]]) {
        await files.focus();
        await press(key, `Task Files focused listbox ${key} selects ${expectedName}`);
        await expect(files.getByRole('option', { name: expectedName, exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(files.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
      }
      await shot('task-files-keyboard-selection');

      const heldSpecDir = path.join(fixture, '.forge-glass-preview', 'conditional-held-specs', task.id);
      withinFixture(heldSpecDir);
      assert.equal(await exists(heldSpecDir), false);
      await mkdir(path.dirname(heldSpecDir), { recursive: true });
      await rename(task.specDir, heldSpecDir);
      report.fixtureSetup.push({ kind: 'real-task-files-directory-failure', original: task.specDir, held: heldSpecDir, reason: 'Temporarily missing fixture directory forces the real Main listDirectory failure' });
      try {
        await click(button(await t('common', 'buttons.refresh'), dialog()), 'Refresh Files after moving the isolated spec directory');
        await expect(files).toContainText(await t('tasks', 'files.errorLoading'));
        await click(button(await t('tasks', 'files.retry'), files), 'Retry Files directory listing while the real fixture directory is missing');
        await expect(files).toContainText(await t('tasks', 'files.errorLoading'));
        const listing = await page.evaluate(specDir => window.electronAPI.listDirectory(specDir), task.specDir);
        assert.equal(listing.success, false);
        report.fixtureSetup.push({ kind: 'actual-task-files-listing-failure', taskId: task.id, listing });
        await shot('task-files-directory-failure-retry');
      } finally {
        await rename(heldSpecDir, task.specDir);
      }
      await click(button(await t('tasks', 'files.retry'), files), 'Retry Files after restoring the actual fixture directory');
      await files.getByRole('option', { name: 'spec.md', exact: true }).waitFor();
      await click(button(await t('common', 'buttons.refresh'), dialog()), 'Refresh restored task Files directory');
      await files.getByRole('option', { name: 'spec.md', exact: true }).waitFor();

      const specFile = path.join(task.specDir, 'spec.md');
      const heldSpecFile = path.join(task.specDir, 'spec.md.conditional-held');
      assert.equal(await exists(heldSpecFile), false);
      await rename(specFile, heldSpecFile);
      try {
        await click(files.getByRole('option', { name: 'spec.md', exact: true }), 'Read cached Files option after moving the actual fixture file');
        await expect(dialog()).toContainText(await t('tasks', 'files.errorLoadingContent'));
        await click(button(await t('tasks', 'files.retry'), dialog()), 'Retry reading the actually missing fixture content');
        await expect(dialog()).toContainText(await t('tasks', 'files.errorLoadingContent'));
        const content = await page.evaluate(file => window.electronAPI.readFile(file), specFile);
        assert.equal(content.success, false);
        report.fixtureSetup.push({ kind: 'actual-task-files-content-failure', taskId: task.id, file: specFile, content });
      } finally {
        await rename(heldSpecFile, specFile);
      }
      await click(button(await t('tasks', 'files.retry'), dialog()), 'Retry Files content after restoring the actual fixture file');
      await expect(dialog().getByText('This document renders UI states only.', { exact: false })).toBeVisible();
      await click(button(await t('tasks', 'files.openInIDE'), dialog()), 'Open Files content in IDE through the bounded missing executable');
      const fileIDEAlert = dialog().getByRole('alert');
      await expect(fileIDEAlert).toContainText('missing-ide');
      await click(button(await t('tasks', 'files.openInIDE'), dialog()), 'Retry Files IDE launch through the same bounded failure');
      await expect(fileIDEAlert).toContainText('missing-ide');
      const fileIDEResult = await page.evaluate(async ({ specDir, customIDEPath }) => window.electronAPI.worktreeOpenInIDE(specDir, 'custom', customIDEPath), { specDir: task.specDir, customIDEPath: boundedTools.customIDEPath });
      assert.equal(fileIDEResult.success, false);
      report.fixtureSetup.push({ kind: 'actual-task-files-IDE-failure', taskId: task.id, fileIDEResult, visibleAlert: await fileIDEAlert.innerText(), realExternalAppOpened: false });
      await shot('task-files-IDE-visible-failure');
      await click(dialog().getByRole('tab', { name: await t('uiTasks', 'tabs.overview'), exact: true }), 'Return from task Files lifecycle to worktree review');
      await dialog().getByText(branch, { exact: true }).waitFor();

      await click(button(await t('uiTasks', 'review.view'), dialog()), 'View actual local worktree Diff');
      const diffDialog = page.getByRole('alertdialog').last();
      await expect(diffDialog).toContainText('README.md');
      await expect(diffDialog).toContainText('conditional-ui-diff.txt');
      await shot('task-worktree-real-diff');
      await click(button(await t('common', 'buttons.close'), diffDialog), 'Close real worktree Diff');

      await click(button(await t('uiTasks', 'review.openIn', { app: 'IDE' }), dialog()), 'Open in IDE bounded missing-executable branch');
      await expect(dialog().getByRole('alert')).toContainText(await t('uiTasks', 'errors.openIDEFailed'));
      await click(button(await t('common', 'buttons.retry'), dialog().getByRole('alert')), 'Retry bounded worktree IDE failure');
      await expect(dialog().getByRole('alert')).toContainText(await t('uiTasks', 'errors.openIDEFailed'));
      await click(button(await t('uiTasks', 'review.openIn', { app: await t('uiTasks', 'review.terminal') }), dialog()), 'Open in Terminal bounded missing-executable branch');
      await expect(dialog().getByRole('alert')).toContainText(/terminal/i);
      await click(button(await t('common', 'buttons.retry'), dialog().getByRole('alert')), 'Retry bounded worktree Terminal failure');
      await expect(dialog().getByRole('alert')).toContainText(/terminal/i);
      const boundedResults = await page.evaluate(async ({ worktreePath, boundedTools }) => {
        const [ide, terminal] = await Promise.all([
          window.electronAPI.worktreeOpenInIDE(worktreePath, 'custom', boundedTools.customIDEPath),
          window.electronAPI.worktreeOpenInTerminal(worktreePath, 'custom', boundedTools.customTerminalPath),
        ]);
        return { ide, terminal };
      }, { worktreePath, boundedTools });
      assert.equal(boundedResults.ide.success, false);
      assert.equal(boundedResults.terminal.success, false);
      report.fixtureSetup.push({ kind: 'actual-worktree-external-tool-failures', taskId: task.id, boundedTools, boundedResults, visibleAlert: await dialog().getByRole('alert').innerText(), retryControlsClicked: true, realExternalAppOpened: false });

      await click(button(await t('uiTasks', 'review.checkConflicts'), dialog()), 'Run actual local conflict preview (enableAi:false, dryRun:true)');
      const stageLabel = await t('taskReview', 'merge.status.stageOnly');
      const stageOnly = dialog().getByRole('checkbox', { name: stageLabel, exact: true });
      await stageOnly.waitFor();
      await click(stageOnly, 'Enable stage-only preference without staging files');
      await expect(stageOnly).toBeChecked();
      await blocked(await t('taskReview', 'merge.buttons.stageTo', { branch: mainBranch }), 'A real Stage action enters the enabled merge/AI resolver engine; this walk permits preview only and does not apply changes.');
      await click(stageOnly, 'Disable stage-only preference without merging files');
      await expect(stageOnly).not.toBeChecked();
      await blocked(await t('taskReview', 'merge.buttons.mergeTo', { branch: mainBranch }), 'A real Merge action applies changes and can run a model resolver; no merge or model execution is authorized by this fixture walk.');
      await click(dialog().getByRole('button', { name: await t('taskReview', 'merge.status.refresh'), exact: true }), 'Refresh actual no-AI worktree preview');
      await stageOnly.waitFor();
      const preview = await page.evaluate(id => window.electronAPI.mergeWorktreePreview(id), task.id);
      assert.equal(preview.success, true);
      assert.ok(preview.data.preview.files.includes('README.md'));
      report.fixtureSetup.push({ kind: 'actual-no-AI-worktree-preview', taskId: task.id, preview: preview.data.preview, enableAi: false, dryRun: true });
      const details = button(await t('taskReview', 'merge.status.details'), dialog());
      if (await details.isVisible()) {
        await click(details, 'Open actual no-AI conflict details');
        const conflicts = page.getByRole('alertdialog').last();
        await conflicts.getByText(await t('uiTasks', 'review.conflictPreview'), { exact: true }).waitFor();
        await blocked(await t('taskReview', 'merge.buttons.mergeWithAI'), 'Conflict resolution invokes the model merge engine; inspecting and closing its dialog is covered.');
        await shot('task-worktree-conflict-details');
        await click(button(await t('common', 'buttons.close'), conflicts), 'Close actual conflict details');
      } else {
        await blocked(await t('taskReview', 'merge.status.details'), 'The real single-task dry-run preview returned no conflict details. The UI branch cannot be asserted through a fabricated model or merge outcome.');
      }

      const createPR = button(await t('common', 'buttons.createPR'), dialog());
      await click(createPR, 'Open worktree Create PR configuration');
      await dialog().getByRole('heading', { name: await t('taskReview', 'pr.title'), exact: true }).waitFor();
      await fill(dialog().locator('#targetBranch'), mainBranch, 'Edit local PR target branch');
      await fill(dialog().locator('#prTitle'), 'Explicit synthetic task worktree UI fixture', 'Edit local PR title');
      const draft = dialog().getByRole('checkbox', { name: await t('taskReview', 'pr.labels.draftPR'), exact: true });
      await click(draft, 'Enable draft PR form preference');
      await expect(draft).toBeChecked();
      await click(draft, 'Disable draft PR form preference');
      await expect(draft).not.toBeChecked();
      await fill(dialog().locator('#targetBranch'), 'invalid branch', 'Enter invalid PR branch for frontend-only validation');
      await click(button(await t('taskReview', 'pr.actions.create'), dialog()), 'Create PR button invalid-branch validation (no Main publish call)');
      await expect(dialog()).toContainText(await t('taskReview', 'pr.errors.invalidBranchName'));
      await click(button(await t('taskReview', 'pr.actions.retry'), dialog()), 'Retry invalid PR form without invoking publication');
      await expect(dialog()).toContainText(await t('taskReview', 'pr.errors.invalidBranchName'));
      await click(button(await t('common', 'buttons.cancel'), dialog()), 'Cancel invalid PR dialog');
      await click(button(await t('common', 'buttons.createPR'), dialog()), 'Reopen PR form after validation failure');
      await fill(dialog().locator('#prTitle'), '', 'Enter empty PR title for frontend-only validation');
      await click(button(await t('taskReview', 'pr.actions.create'), dialog()), 'Create PR button empty-title validation (no Main publish call)');
      await expect(dialog()).toContainText(await t('taskReview', 'pr.errors.emptyTitle'));
      await click(button(await t('common', 'buttons.cancel'), dialog()), 'Cancel empty-title PR dialog');
      await click(button(await t('common', 'buttons.createPR'), dialog()), 'Open valid PR form for final publish boundary');
      await blocked(await t('taskReview', 'pr.actions.create'), 'Valid submission pushes the task branch and creates a GitHub PR. The fixture has no remote and this walk does not authorize publication.');
      await click(button(await t('common', 'buttons.cancel'), dialog()), 'Cancel valid PR form before any remote write');

      const discardTitle = await t('taskReview', 'merge.status.discardBuild');
      await click(dialog().getByRole('button', { name: discardTitle, exact: true }), 'Open local Discard Build confirmation');
      let discard = page.getByRole('alertdialog').last();
      await expect(discard).toContainText(await t('uiTasks', 'review.discardWarning'));
      await click(button(await t('common', 'buttons.cancel'), discard), 'Cancel local worktree discard');
      assert.equal(await exists(worktreePath), true);
      assert.equal(git(['rev-parse', 'HEAD'], worktreePath), worktreeHead);
      await click(dialog().getByRole('button', { name: discardTitle, exact: true }), 'Reopen local Discard Build confirmation');
      discard = page.getByRole('alertdialog').last();
      await click(button(await t('uiTasks', 'review.discardBuild'), discard), 'Confirm real removal of the isolated task worktree');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await expect.poll(() => exists(worktreePath)).toBe(false);
      assert.equal(git(['branch', '--list', branch]), '', 'Discard must remove the exact fixture task branch');
      assert.equal(git(['rev-parse', 'HEAD']), mainHead, 'No worktree content may be merged into the main fixture');
      assert.equal(git(['branch', '--show-current']), mainBranch);
      assert.equal(await readFile(path.join(fixture, 'README.md'), 'utf8'), mainReadme);
      assert.equal(await exists(path.join(fixture, 'conditional-ui-diff.txt')), false);
      assert.equal((await page.evaluate(id => window.electronAPI.checkTaskRunning(id), task.id)).data, false);
      report.fixtureSetup.push({ kind: 'real-local-worktree-discard-verified', taskId: task.id, removedPath: worktreePath, removedBranch: branch, mainHeadUnchanged: true, realExecution: false });
      await shot('task-worktree-discard-result');
    } finally {
      // Preserve the runner preferences even when a control assertion fails.
      try {
        await closeLayers();
      } finally {
        if (await exists(worktreePath)) {
          const cleanup = await page.evaluate(id => window.electronAPI.discardWorktree(id), task.id);
          report.fixtureSetup.push({ kind: 'failure-path-worktree-cleanup', taskId: task.id, cleanup, noUICoverageClaimed: true });
          assert.ok(cleanup.success && cleanup.data?.success, 'Disposable worktree cleanup must complete');
          assert.equal(await exists(worktreePath), false);
          assert.equal(git(['branch', '--list', branch]), '');
        }
        const restored = await page.evaluate(settings => window.electronAPI.saveSettings(settings), previousTools);
        assert.equal(restored.success, true);
        await page.reload();
        await page.locator('.forge-glass-sidebar').waitFor();
        assert.equal(git(['rev-parse', 'HEAD']), mainHead);
        assert.equal(git(['remote']), '');
      }
    }
  });
}
