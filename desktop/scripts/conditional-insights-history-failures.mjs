/**
 * Actual partial archive/delete failures in disposable Insights history.
 * macOS immutable flags affect only labelled fixture session JSON files;
 * Main performs its normal filesystem mutations and supplies real outcomes.
 * The caller owns Electron. No model, network, or fabricated IPC result is used.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';

const SESSION_ID = /^session-(?:\d{1,20}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const inside = (target, root) => assert.ok(path.resolve(target).startsWith(path.resolve(root) + path.sep),
  'Immutable history guard must remain inside the disposable fixture');
const exists = file => access(file).then(() => true, () => false);
const flags = file => execFileSync('/usr/bin/stat', ['-f', '%Sf', file], { encoding: 'utf8', stdio: 'pipe' }).trim();
const changeFlags = (mode, file) => execFileSync('/usr/bin/chflags', [mode, file], { stdio: 'pipe' });

async function clearGuard(file, guard, allowMissing = false) {
  if (!(await exists(file))) {
    guard.restored = !guard.applied || allowMissing;
    guard.fileAbsentAfterUnsupportedProbe = allowMissing;
    assert.ok(guard.restored, 'A guarded session disappeared before immutable-flag restoration');
    return;
  }
  changeFlags('nouchg', file);
  guard.flagsAfter = flags(file);
  assert.ok(!/\buchg\b/.test(guard.flagsAfter), 'Immutable flag remains on disposable session');
  guard.restored = true;
}

async function proveImmutableGuard(fixture, projectId, report) {
  if (process.platform !== 'darwin') return { supported: false, reason: 'macOS immutable-file guard is unavailable on this platform.' };
  const probeDir = path.join(fixture, '.forge-glass-preview', 'insights', `history-guard-probe-${randomUUID()}`);
  const probe = path.join(probeDir, `session-${randomUUID()}.json`);
  const replacement = `${probe}.replacement.tmp`;
  inside(probe, fixture);
  await mkdir(probeDir, { recursive: true });
  inside(await realpath(probeDir), await realpath(fixture));
  const now = new Date().toISOString();
  const content = JSON.stringify({
    id: path.basename(probe, '.json'), projectId, title: 'EXPLICIT IMMUTABLE HISTORY GUARD PROBE ONLY',
    messages: [], createdAt: now, updatedAt: now,
  });
  await writeFile(probe, content, { flag: 'wx' });
  await writeFile(replacement, content, { flag: 'wx' });
  const guard = { kind: 'local-immutable-session-probe', path: probe, applied: false, restored: false };
  report.fixtureSetup.push(guard);
  const result = { supported: false, reason: 'The filesystem did not enforce both replacement and unlink refusal.' };
  try {
    changeFlags('uchg', probe);
    guard.applied = true;
    guard.flagsBefore = flags(probe);
    assert.ok(/\buchg\b/.test(guard.flagsBefore));
    assert.equal(await readFile(probe, 'utf8'), content, 'Immutable probe must remain readable');
    try {
      await rename(replacement, probe);
      guard.replacementRefused = false;
    } catch (error) {
      guard.replacementRefused = ['EPERM', 'EACCES'].includes(error.code);
      guard.replacementErrorCode = error.code;
    }
    try {
      await unlink(probe);
      guard.unlinkRefused = false;
    } catch (error) {
      guard.unlinkRefused = ['EPERM', 'EACCES'].includes(error.code);
      guard.unlinkErrorCode = error.code;
    }
    result.supported = guard.replacementRefused === true && guard.unlinkRefused === true;
    if (result.supported) {
      assert.equal(await readFile(probe, 'utf8'), content);
      delete result.reason;
    }
  } catch (error) {
    result.reason = `Disposable immutable-file probe unavailable (${error.code || error.name || 'unknown'}).`;
  } finally {
    // A failed probe cannot leave a filesystem flag behind, even when an earlier
    // assertion or command failed. Cleanup failure stops the caller's QA run.
    if (guard.applied) await clearGuard(probe, guard, !result.supported);
    else guard.restored = true;
    await rm(replacement, { force: true });
    await rm(probe, { force: true });
    await rm(probeDir, { recursive: true });
    guard.probeRemoved = !(await exists(probeDir));
    assert.ok(guard.probeRemoved);
  }
  return result;
}

export async function walkConditionalInsightsHistoryFailures(ctx) {
  const { app, page, projectId, fixture, profile, report, t, button, main, click,
    segment, shot, blocked, nav } = ctx;
  await segment('conditional-insights-history-partial-failures-and-retry', async () => {
    assert.equal(report.project?.path, fixture);
    assert.equal(report.effectiveDirectories?.userData, profile);
    const directories = await app.evaluate(({ app: application }) => ({
      userData: application.getPath('userData'), home: application.getPath('home'),
    }));
    assert.equal(path.resolve(directories.userData), path.resolve(profile));
    assert.ok(path.resolve(directories.home).startsWith(path.dirname(path.resolve(profile)) + path.sep));
    assert.match(await readFile(path.join(fixture, 'README.md'), 'utf8'), /CONDITIONAL UI FIXTURE/);
    const projects = await page.evaluate(() => window.electronAPI.getProjects());
    assert.ok(projects.success);
    const project = projects.data.find(candidate => candidate.id === projectId);
    assert.ok(project && path.resolve(project.path) === path.resolve(fixture));
    assert.equal(project.autoBuildPath, '.forge-glass-preview');
    const accounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
    assert.ok(accounts.success && accounts.data.accounts.length === 0, 'History failure QA requires no model accounts');
    report.fixtureSetup ??= [];
    const probe = await proveImmutableGuard(fixture, projectId, report);
    report.insightsHistoryImmutableProbe = probe;
    if (!probe.supported) {
      await blocked('Actual partial Insights archive/delete filesystem failures', probe.reason);
      return;
    }

    const sessionsDir = path.join(fixture, '.forge-glass-preview', 'insights', 'sessions');
    const suffix = randomUUID().slice(0, 8);
    const evidence = { pairs: [], partialOutcomes: [], retries: [], guardsRestored: false };
    report.insightsHistoryPartialFailures = evidence;
    const readSession = async entry => JSON.parse(await readFile(entry.file, 'utf8'));
    const rowFor = entry => main().locator('div[role="checkbox"]').filter({
      has: page.getByText(entry.title, { exact: true }),
    });
    const selectionMode = await t('common', 'insights.selectMode');
    const exitSelectionMode = await t('common', 'insights.exitSelectMode');
    const labels = {
      archive: {
        toolbar: await t('common', 'insights.archiveSelected'),
        failed: await t('common', 'insights.bulkArchiveFailed'),
        success: await t('common', 'insights.bulkArchiveSuccess'),
      },
      delete: {
        toolbar: await t('common', 'selection.deleteSelected'),
        failed: await t('common', 'insights.bulkDeleteFailed'),
        success: await t('common', 'insights.bulkDeleteSuccess'),
      },
    };
    const confirmName = async (action, count) => action === 'archive'
      ? t('common', 'insights.archiveConfirmButton', { count })
      : t('common', 'insights.bulkDeleteConfirm', { count });
    const applyGuard = async entry => {
      inside(entry.file, fixture);
      inside(await realpath(entry.file), await realpath(fixture));
      const guard = { kind: 'actual-insights-partial-filesystem-failure', action: entry.action,
        sessionId: entry.id, path: entry.file, applied: false, restored: false };
      report.fixtureSetup.push(guard);
      entry.guard = guard;
      changeFlags('uchg', entry.file);
      guard.applied = true;
      guard.flagsBefore = flags(entry.file);
      assert.ok(/\buchg\b/.test(guard.flagsBefore));
      assert.equal((await readSession(entry)).id, entry.id, 'Guarded session stays readable for list/selection');
      return guard;
    };
    const perform = async (action, count, label) => {
      await click(button(`${labels[action].toolbar} (${count})`, main()), label);
      const confirmation = page.getByRole('alertdialog');
      await expect(confirmation).toBeVisible();
      await click(button(await confirmName(action, count), confirmation), `Confirm actual ${action} of ${count} fixture conversation(s)`);
      await confirmation.waitFor({ state: 'hidden' });
    };

    for (const action of ['archive', 'delete']) {
      const entries = [];
      for (const outcome of ['writable', 'immutable']) {
        const created = await page.evaluate(id => window.electronAPI.newInsightsSession(id), projectId);
        assert.ok(created.success && created.data && SESSION_ID.test(created.data.id));
        const title = `EXPLICIT history ${action} ${outcome} fixture ${suffix}`;
        const renamed = await page.evaluate(({ projectId, id, title }) =>
          window.electronAPI.renameInsightsSession(projectId, id, title), { projectId, id: created.data.id, title });
        assert.ok(renamed.success);
        const entry = { id: created.data.id, title, action, file: path.join(sessionsDir, `${created.data.id}.json`) };
        inside(await realpath(entry.file), await realpath(fixture));
        const stored = await readSession(entry);
        assert.equal(stored.id, entry.id);
        assert.equal(stored.projectId, projectId);
        assert.equal(stored.title, title);
        assert.deepEqual(stored.messages, []);
        assert.ok(!stored.archivedAt);
        entries.push(entry);
      }
      const [writable, immutable] = entries;
      evidence.pairs.push({ action, ids: entries.map(entry => entry.id), titles: entries.map(entry => entry.title) });
      await nav('kanban');
      await nav('insights');
      const showSidebar = button(await t('uiKnowledgeContext', 'showSidebar'), main());
      if (await showSidebar.isVisible()) await click(showSidebar, 'Show actual Insights history sidebar');
      const hideArchived = button(await t('common', 'insights.hideArchived'), main());
      if (await hideArchived.isVisible()) await click(hideArchived, 'Hide archived history for actual partial-failure selection');
      if (await button(exitSelectionMode, main()).isVisible()) await click(button(exitSelectionMode, main()), 'Clear previous history selection mode');
      await click(button(selectionMode, main()), `Enter actual ${action} fixture history selection`);
      for (const entry of entries) {
        const row = rowFor(entry);
        await expect(row).toHaveCount(1);
        await click(row, `Select exact ${action} fixture history row ${entry.title}`);
        await expect(row).toHaveAttribute('aria-checked', 'true');
      }

      // Keep the file readable and listed. Only archive's atomic replacement or
      // delete's unlink fails in the real Main session storage implementation.
      try {
        await applyGuard(immutable);
        await perform(action, 2, `Open ${action} confirmation for writable and immutable session JSON`);
        await expect(page.getByText(labels[action].failed, { exact: true }).last()).toBeVisible();
        await expect(page.getByText(await t('common', 'insights.bulkResult', { completed: 1, failed: 1 }), { exact: true }).last()).toBeVisible();
        await expect(main().locator('div[role="checkbox"][aria-checked="true"]')).toHaveCount(1);
        await expect(rowFor(immutable)).toHaveAttribute('aria-checked', 'true');
        await expect(rowFor(writable)).toHaveCount(0);
        if (action === 'archive') {
          assert.ok((await readSession(writable)).archivedAt);
          assert.ok(!(await readSession(immutable)).archivedAt);
        } else {
          assert.equal(await exists(writable.file), false);
          assert.equal((await readSession(immutable)).id, immutable.id);
        }
        const listed = await page.evaluate(id => window.electronAPI.listInsightsSessions(id, true), projectId);
        assert.ok(listed.success && listed.data);
        assert.ok(listed.data.some(session => session.id === immutable.id && !session.archivedAt));
        if (action === 'archive') assert.ok(listed.data.some(session => session.id === writable.id && session.archivedAt));
        else assert.ok(!listed.data.some(session => session.id === writable.id));
        evidence.partialOutcomes.push({ action, completedId: writable.id, failedId: immutable.id,
          completed: 1, failed: 1, failedOnlySelected: true, guardKeptFailedRecordReadable: true });
        await shot(`insights-history-${action}-actual-partial-failure`);
      } finally {
        if (immutable.guard?.applied) await clearGuard(immutable.file, immutable.guard);
      }
      assert.ok(immutable.guard.restored, 'Require flag restoration before retrying selected failure');
      await expect(rowFor(immutable)).toHaveAttribute('aria-checked', 'true');
      await perform(action, 1, `Retry only the still-selected failed ${action} conversation`);
      await expect(page.getByText(labels[action].success, { exact: true }).last()).toBeVisible();
      await expect(page.getByText(await t('common', 'insights.bulkResult', { completed: 1, failed: 0 }), { exact: true }).last()).toBeVisible();
      await expect(main().locator('div[role="checkbox"][aria-checked="true"]')).toHaveCount(0);
      await expect(rowFor(immutable)).toHaveCount(0);
      if (action === 'archive') assert.ok((await readSession(immutable)).archivedAt);
      else assert.equal(await exists(immutable.file), false);
      evidence.retries.push({ action, retriedId: immutable.id, completed: 1, failed: 0, selectionCleared: true });
      await shot(`insights-history-${action}-same-selection-retry-succeeded`);
      await click(button(exitSelectionMode, main()), `Exit ${action} fixture selection mode`);
    }
    const final = await page.evaluate(id => window.electronAPI.listInsightsSessions(id, true), projectId);
    assert.ok(final.success && final.data);
    const archiveIds = evidence.pairs.find(pair => pair.action === 'archive').ids;
    const deleteIds = evidence.pairs.find(pair => pair.action === 'delete').ids;
    assert.ok(archiveIds.every(id => final.data.some(session => session.id === id && session.archivedAt)));
    assert.ok(deleteIds.every(id => !final.data.some(session => session.id === id)));
    evidence.finalPersistedFixtureIds = archiveIds;
    evidence.finalDeletedFixtureIds = deleteIds;
    evidence.guardsRestored = report.fixtureSetup.filter(entry =>
      entry.kind === 'actual-insights-partial-filesystem-failure').every(entry => entry.restored === true);
    assert.ok(evidence.guardsRestored);
    const finalAccounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
    assert.ok(finalAccounts.success && finalAccounts.data.accounts.length === 0);
    evidence.modelAccounts = 0;
    evidence.realMainFilesystemOutcomes = true;
  });
}
