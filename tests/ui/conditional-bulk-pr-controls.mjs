/**
 * Bulk PR controls exercised against disposable tasks without worktrees.
 * Actual Main preflight failures are used; no PR result, provider response,
 * publication, or task execution is fabricated. The caller owns Electron.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';

export async function walkConditionalBulkPR(ctx) {
  const {
    app, page, projectId, fixture, profile, report, t, button, main, dialog,
    click, fill, segment, shot, blocked, createTaskFixture, refreshTasks,
  } = ctx;

  await segment('conditional-bulk-pr-no-worktree-controls', async () => {
    const fixturePath = path.resolve(fixture);
    const directories = await app.evaluate(({ app: application }) => ({
      userData: application.getPath('userData'),
      home: application.getPath('home'),
    }));
    assert.equal(path.resolve(directories.userData), path.resolve(profile));
    assert.ok(path.resolve(directories.home).startsWith(path.dirname(path.resolve(profile)) + path.sep),
      'Require the runner isolated home before bulk PR controls');
    assert.match(await readFile(path.join(fixturePath, 'README.md'), 'utf8'), /CONDITIONAL UI FIXTURE/);

    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.ok(projects.success);
    const project = projects.data.find(candidate => candidate.id === projectId);
    assert.ok(project);
    assert.equal(path.resolve(project.path), fixturePath);
    assert.equal(project.autoBuildPath, '.forge-glass-preview');

    const git = args => execFileSync('git', [
      '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args,
    ], {
      cwd: fixturePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' },
    }).trim();
    assert.equal(git(['remote']), '', 'Bulk PR fixture must not have a remote');
    const gitBefore = { head: git(['rev-parse', 'HEAD']), worktrees: git(['worktree', 'list', '--porcelain']) };
    const fixtures = [];
    for (const suffix of ['A', 'B']) {
      const task = await createTaskFixture(`Conditional offline bulk PR fixture ${suffix}`, {
        status: 'backlog', xstateState: 'backlog', executionPhase: 'idle', subtaskStatus: 'pending',
      });
      assert.ok(path.resolve(task.specDir).startsWith(fixturePath + path.sep));
      assert.ok((await stat(task.specDir)).isDirectory(), 'Actual spec directory must exist for Main preflight');
      fixtures.push({
        task,
        planBefore: await readFile(task.planPath, 'utf8'),
        metadataBefore: await readFile(path.join(task.specDir, 'task_metadata.json'), 'utf8'),
      });
    }
    await refreshTasks();

    // Read-only Main preflight is the safety boundary: the real Create PR handler
    // returns no-worktree before locating gh or calling the push/PR runner.
    const worktreeStates = [];
    for (const { task } of fixtures) {
      const result = await page.evaluate(id => window.electronAPI.getWorktreeStatus(id), task.id);
      assert.ok(result.success && result.data);
      assert.equal(result.data.exists, false, 'Refuse bulk submission for any task with a worktree');
      worktreeStates.push({ taskId: task.id, ...result.data });
    }
    report.fixtureSetup.push({
      kind: 'offline-bulk-pr-main-no-worktree-preflight',
      projectId,
      tasks: fixtures.map(({ task }) => ({ id: task.id, specDir: task.specDir })),
      worktreeStates,
      hasRemote: false,
      realExecution: false,
      note: 'Real Main no-worktree failures; no successful PR outcome is synthesized.',
    });

    const clearSelection = button(await t('tasks', 'kanban.clearSelection'), main());
    if (await clearSelection.isVisible()) await click(clearSelection, 'Clear previous isolated task selection');
    const backlog = main().locator('.forge-glass-board-column[data-status="backlog"]');
    if (await backlog.getAttribute('data-collapsed') === 'true') {
      await click(button(await t('tasks', 'kanban.expandColumn'), backlog), 'Expand backlog for offline bulk PR fixture');
    }
    const checkboxFor = async task => main().getByRole('checkbox', {
      name: await t('tasks', 'actions.selectTask', { title: task.title }), exact: true,
    });
    const firstCheckbox = await checkboxFor(fixtures[0].task);
    await click(firstCheckbox, 'Select first offline bulk PR task');
    await expect(firstCheckbox).toBeChecked();
    assert.equal(await page.getByRole('dialog').count(), 0, 'Task checkbox must not open task detail');
    await click(clearSelection, 'Clear actual single-task selection');
    await expect(firstCheckbox).not.toBeChecked();
    for (const { task } of fixtures) {
      const checkbox = await checkboxFor(task);
      await click(checkbox, `Select ${task.title} for offline bulk PR controls`);
      await expect(checkbox).toBeChecked();
    }

    const openBulk = button(await t('tasks', 'kanban.createPRs'), main());
    const bulkTitle = await t('taskReview', 'bulkPR.title');
    const createAllName = await t('taskReview', 'bulkPR.createAll', { count: fixtures.length });
    const draftName = await t('taskReview', 'pr.labels.draftPR');
    await click(openBulk, 'Open actual two-task bulk PR dialog');
    await expect(dialog().getByRole('heading', { name: bulkTitle, exact: true })).toBeVisible();
    for (const { task } of fixtures) await expect(dialog().getByText(task.title, { exact: true })).toBeVisible();
    const branch = dialog().locator('#bulkTargetBranch');
    const draft = dialog().getByRole('checkbox', { name: draftName, exact: true });
    const createAll = button(createAllName, dialog());
    await fill(branch, 'main', 'Edit shared offline bulk PR target branch');
    await click(draft, 'Enable shared bulk draft preference');
    await expect(draft).toBeChecked();
    await click(draft, 'Disable shared bulk draft preference');
    await expect(draft).not.toBeChecked();
    await fill(branch, 'invalid branch', 'Enter invalid bulk PR branch for visible validation');
    await expect(dialog().getByRole('alert')).toHaveText(await t('taskReview', 'pr.errors.invalidBranchName'));
    await expect(branch).toHaveAttribute('aria-invalid', 'true');
    await expect(createAll).toBeDisabled();
    await shot('bulk-pr-invalid-branch-disabled-submission');
    await click(button(await t('common', 'buttons.cancel'), dialog()), 'Cancel invalid bulk PR form');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });

    await click(openBulk, 'Reopen actual offline bulk PR dialog');
    await expect(dialog().locator('#bulkTargetBranch')).toHaveValue('');
    await expect(dialog().getByRole('checkbox', { name: draftName, exact: true })).not.toBeChecked();
    await expect(dialog().getByRole('alert')).toHaveCount(0);
    await fill(dialog().locator('#bulkTargetBranch'), 'main', 'Set valid local target for no-worktree preflight');
    await click(dialog().getByRole('checkbox', { name: draftName, exact: true }), 'Set draft before actual no-worktree submission');

    // Recheck immediately before the actual UI submission. No fixture method
    // supplies a successful PR result or replaces the Main handler.
    for (const { task } of fixtures) {
      const result = await page.evaluate(id => window.electronAPI.getWorktreeStatus(id), task.id);
      assert.ok(result.success && result.data?.exists === false);
    }
    assert.equal(git(['remote']), '');
    await click(button(createAllName, dialog()), 'Create two PRs through actual Main no-worktree failures');
    await expect(dialog().getByText(await t('taskReview', 'bulkPR.resultsDescriptionWithSkipped', {
      success: 0, skipped: fixtures.length, failed: 0,
    }), { exact: true })).toBeVisible();
    await expect(dialog().getByText(await t('taskReview', 'bulkPR.noWorktree'), { exact: true })).toHaveCount(fixtures.length);
    for (const { task } of fixtures) await expect(dialog().getByText(task.title, { exact: true })).toBeVisible();
    await shot('bulk-pr-real-no-worktree-skipped-results');
    await blocked('Successful bulk PR result links',
      'They require a real remote PR result. This fixture has no worktrees or remote and does not authorize push or publication.');
    // DialogContent also exposes its standard Close icon; the final matching
    // button is the results footer, which calls onComplete and clears selection.
    await click(button(await t('common', 'buttons.close'), dialog()).last(), 'Close real bulk PR results and clear selection');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await expect(clearSelection).toHaveCount(0);
    for (const { task } of fixtures) await expect(await checkboxFor(task)).not.toBeChecked();

    const stored = await page.evaluate(id => window.electronAPI.getTasks(id, { forceRefresh: true }), projectId);
    assert.ok(stored.success && stored.data);
    for (const entry of fixtures) {
      const task = stored.data.find(candidate => candidate.id === entry.task.id);
      assert.ok(task);
      assert.equal(task.status, 'backlog');
      assert.ok(!task.metadata?.prUrl, 'No PR URL may be added by local no-worktree failure');
      assert.equal(await readFile(entry.task.planPath, 'utf8'), entry.planBefore,
        'Bulk PR preflight must not alter task execution or state');
      assert.equal(await readFile(path.join(entry.task.specDir, 'task_metadata.json'), 'utf8'), entry.metadataBefore);
    }
    assert.deepEqual({ head: git(['rev-parse', 'HEAD']), worktrees: git(['worktree', 'list', '--porcelain']) }, gitBefore);
    assert.equal(git(['remote']), '');
    report.bulkPRNoWorktree = {
      taskIds: fixtures.map(({ task }) => task.id),
      actualMainNoWorktreeResults: fixtures.length,
      invalidBranchVisible: true,
      invalidSubmissionDisabled: true,
      formResetOnReopen: true,
      skippedResults: fixtures.length,
      selectionClearedOnClose: true,
      persistedTaskPlansUnchanged: true,
      prMetadataAbsent: true,
      gitHeadAndWorktreesUnchanged: true,
      remoteWrites: 0,
      realExecution: false,
    };
  });
}
