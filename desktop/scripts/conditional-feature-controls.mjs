/**
 * Conditional UI branches for the disposable Electron control walk.
 * Persisted records and renderer completion events below are synthetic QA inputs.
 * They are never evidence of a model run, product acceptance or completed work.
 * This module neither launches an application nor changes production source.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { captureNativeClipboard, restoreNativeClipboard } from './conditional-insights-stream.mjs';

export async function walkConditionalFeatures(ctx) {
  const { app, page, projectId, fixture, report, t, button, main, dialog,
    click, fill, press, segment, shot, blocked, nav, closeLayers, refreshTasks } = ctx;
  const syntheticNote = 'Synthetic isolated UI fixture; no agent execution or product success evidence.';
  report.fixtureSetup ??= [];
  report.uxFindings ??= [];
  const now = new Date().toISOString();
  const projects = await page.evaluate(() => window.electronAPI.getProjects());
  assert.equal(projects.success, true);
  const project = projects.data.find(candidate => candidate.id === projectId);
  assert.ok(project, 'Conditional fixtures require the actual initialized Main project');
  assert.equal(path.resolve(project.path), path.resolve(fixture), 'Never seed a production project');
  assert.ok(project.autoBuildPath, 'The fixture project must be initialized');
  report.project ??= project;
  const providers = await page.evaluate(() => window.electronAPI.getProviderAccounts());
  assert.ok(providers.success && providers.data?.accounts?.length === 0, 'Conditional walk requires no model accounts');
  // These two Main readers use AUTO_BUILD_PATHS, independently of autoBuildPath.
  const roadmapPath = path.join(fixture, '.forge-glass-preview', 'roadmap', 'roadmap.json');
  const competitorPath = path.join(fixture, '.forge-glass-preview', 'roadmap', 'competitor_analysis.json');
  const ideationPath = path.join(fixture, '.forge-glass-preview', 'ideation', 'ideation.json');
  const specsDir = path.isAbsolute(project.autoBuildPath)
    ? path.join(project.autoBuildPath, 'specs') : path.join(fixture, project.autoBuildPath, 'specs');
  assert.ok(path.relative(fixture, specsDir) && !path.relative(fixture, specsDir).startsWith('..'), 'Specs must remain inside disposable project');
  const json = async filename => JSON.parse(await readFile(filename, 'utf8'));
  async function seed(filename, content, kind = 'synthetic persisted conditional UI fixture') {
    const relative = path.relative(fixture, filename);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Fixture writes must stay in disposable project');
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8');
    report.fixtureSetup.push({ kind, path: filename, productData: false, modelCalls: 0, note: syntheticNote });
  }
  async function tabs(namespace, keys, prefix) {
    for (const key of keys) {
      const name = await t(namespace, key);
      await click(main().getByRole('tab', { name, exact: true }), `${prefix} ${name} tab`);
      await shot(`${prefix}-${key}`);
    }
  }
  async function selectOptions(locator, label) {
    const disabled = await locator.isDisabled();
    await click(locator, `${label} open`);
    if (disabled) return;
    const options = await page.getByRole('option').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length)
      .map(node => ({ name: (node.innerText || node.textContent).trim().replace(/\s+/g, ' '), disabled: node.getAttribute('aria-disabled') === 'true' })));
    await press('Escape', `${label} close options`);
    for (const option of options) {
      await click(locator, `${label} reopen`);
      await click(page.getByRole('option', { name: option.name, exact: true }), `${label} choose ${option.name}`);
      if (option.disabled) await press('Escape', `${label} close disabled option`);
    }
  }
  async function panel(title, label) {
    const titleButton = button(title, main());
    await click(await titleButton.count() ? titleButton : main().getByRole('heading', { name: title, exact: true }), label);
    await expect(dialog().getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  async function closeTask(label) {
    await expect(dialog()).toBeVisible();
    await click(button(await t('common', 'buttons.close'), dialog()).last(), label);
    await closeLayers();
  }
  async function assertBacklog(taskId, origin) {
    await expect.poll(async () => {
      const result = await page.evaluate(id => window.electronAPI.getTasks(id), projectId);
      assert.equal(result.success, true);
      return result.data.find(task => task.id === taskId)?.status;
    }, { message: `${origin} conversion must create only backlog`, timeout: 10000 }).toBe('backlog');
    const plan = await json(path.join(specsDir, taskId, 'implementation_plan.json'));
    assert.ok(['pending', 'backlog'].includes(plan.status), `${origin} must not start planning or execution`);
    assert.equal(plan.phases.length, 0, `${origin} must not fabricate execution subtasks`);
    report.cases.push({ name: `${origin}-conversion-persisted-backlog`, status: 'passed', taskId, planStatus: plan.status, modelCalls: 0 });
  }
  async function missing(label, reason) {
    report.uxFindings.push({ label, reason, evidence: 'actual conditional fixture UI and persisted Main state' });
    await blocked(label, reason);
  }
  async function showArchivedIdeas(label) {
    // Prefer a local entry if the UX repair supplies one. The original preview
    // exposes its shared archive view only from the Kanban Done column.
    const alreadyVisible = button(await t('uiIdeaDetails', 'actions.hideArchived'), main());
    if (await alreadyVisible.count() && await alreadyVisible.getAttribute('aria-pressed') === 'true') return;
    const local = button(await t('uiIdeaDetails', 'actions.showArchived'), main());
    if (await local.count()) {
      await click(local.first(), label);
      return;
    }
    await nav('kanban');
    const toggle = button(await t('common', 'accessibility.toggleShowArchivedAriaLabel'), main());
    await expect(toggle).toBeVisible();
    if (await toggle.getAttribute('aria-pressed') !== 'true') await click(toggle, `${label} through shared Kanban archive view`);
    await nav('ideation');
  }

  await segment('conditional-roadmap-fixture-setup', async () => {
    // Move away before writing so the real mount-time Main reader reloads it.
    await nav('ideation');
    const features = Array.from({ length: 8 }, (_, index) => ({
      id: `ui-feature-${index + 1}`, title: `QA roadmap feature ${index + 1}`,
      description: syntheticNote, rationale: 'Exercise feature controls without an agent.',
      phase_id: 'ui-phase-1', status: index === 1 ? 'done' : 'under_review',
      priority: ['must', 'should', 'could', 'wont'][index % 4], complexity: 'low', impact: 'medium',
      dependencies: index === 7 ? ['ui-feature-3'] : [],
      acceptance_criteria: ['This is only a UI fixture.'], user_stories: ['As a QA user I inspect feature details.'],
      ...(index === 0 ? { competitor_insight_ids: ['ui-pain-1'] } : {}),
    }));
    await seed(roadmapPath, {
      id: 'ui-conditional-roadmap', project_name: 'Synthetic QA Roadmap', version: '1.0', status: 'draft',
      vision: syntheticNote, target_audience: { primary: 'UI QA', secondary: ['Fixture reviewer'] },
      phases: [{ id: 'ui-phase-1', name: 'QA phase', description: syntheticNote, order: 1,
        status: 'planned', features: features.map(feature => feature.id), milestones: [] }], features,
      metadata: { created_at: now, updated_at: now },
    });
    await seed(competitorPath, {
      project_context: { project_name: 'Synthetic QA Roadmap', project_type: 'desktop', target_audience: 'UI QA' },
      competitors: [{ id: 'ui-competitor-1', name: 'Synthetic competitor', url: 'https://example.invalid',
        description: syntheticNote, relevance: 'medium', source: 'manual', market_position: 'fixture',
        strengths: ['Fixture strength'], pain_points: [{ id: 'ui-pain-1', description: 'Fixture pain point',
          source: 'synthetic fixture', severity: 'medium', frequency: 'once', opportunity: 'Exercise details' }] }],
      market_gaps: [], insights_summary: { top_pain_points: ['Fixture pain point'], differentiator_opportunities: [], market_trends: [] },
      research_metadata: { search_queries_used: [], sources_consulted: [], limitations: [syntheticNote] },
      metadata: { created_at: now },
    });
    const result = await page.evaluate(id => window.electronAPI.getRoadmap(id), projectId);
    assert.ok(result.success && result.data?.features.length === 8, 'Real Main must parse roadmap fixture');
    await nav('roadmap');
    await expect(main().getByRole('heading', { name: 'Synthetic QA Roadmap', exact: true })).toBeVisible();
    await shot('conditional-roadmap-populated');
  });

  await segment('conditional-roadmap-views-and-manual-add', async () => {
    await nav('roadmap');
    await tabs('uiKnowledge', ['kanban', 'phases', 'allFeatures', 'byPriority'], 'roadmap');
    await click(main().getByRole('tab', { name: await t('uiKnowledge', 'phases'), exact: true }), 'Roadmap phases expansion entry');
    const expansion = main().getByRole('button', { name: /^Show \d+ more feature/ });
    await click(expansion, 'Expand all phase features');
    await click(button(await t('common', 'roadmap.showLessFeatures'), main()), 'Collapse phase features');
    await click(button(await t('uiKnowledge', 'addFeature'), main()), 'Roadmap Add Feature entry');
    await expect(button(await t('dialogs', 'addFeature.addFeature'), dialog())).toBeDisabled();
    await click(button(await t('dialogs', 'addFeature.cancel'), dialog()), 'Cancel empty manual feature');
    await click(button(await t('uiKnowledge', 'addFeature'), main()), 'Reopen manual feature');
    await fill(page.locator('#add-feature-title'), 'QA manually added feature', 'Manual feature title');
    await fill(page.locator('#add-feature-description'), syntheticNote, 'Manual feature description');
    await fill(page.locator('#add-feature-rationale'), 'Exercise every classification control.', 'Manual feature rationale');
    for (const field of ['phase', 'priority', 'complexity', 'impact']) {
      await selectOptions(page.locator(`#add-feature-${field}`), `Manual feature ${field}`);
    }
    await click(button(await t('dialogs', 'addFeature.addFeature'), dialog()), 'Save manual feature through real Main persistence');
    await expect.poll(async () => (await json(roadmapPath)).features.some(feature => feature.title === 'QA manually added feature')).toBe(true);
    await click(main().getByRole('tab', { name: await t('uiKnowledge', 'allFeatures'), exact: true }), 'Open all features after add');
    await panel('QA manually added feature', 'Open manually added feature details');
    await click(button(await t('common', 'accessibility.closeFeatureDetailsAriaLabel'), dialog()), 'Close manual feature details');
    await shot('conditional-roadmap-manual-feature-saved');
  });

  await segment('conditional-roadmap-competitor-view-and-add', async () => {
    await nav('roadmap');
    await click(main().getByText(await t('uiKnowledge', 'competitorAnalysis'), { exact: true }), 'Open persisted competitor analysis viewer');
    await expect(dialog().getByRole('heading', { name: await t('common', 'competitorAnalysis.analysisResults'), exact: true })).toBeVisible();
    await blocked('Visit synthetic competitor website', 'This fixture intentionally uses an invalid external URL; no real competitor research is represented');
    await click(button(await t('common', 'competitorAnalysis.addCompetitor'), dialog()), 'Add competitor from existing analysis viewer');
    await expect(button(await t('dialogs', 'addCompetitor.addCompetitor'), dialog())).toBeDisabled();
    await fill(page.locator('#add-competitor-name'), 'QA manually added competitor', 'Manual competitor name');
    await fill(page.locator('#add-competitor-url'), 'example.invalid', 'Manual competitor URL without protocol');
    await fill(page.locator('#add-competitor-description'), syntheticNote, 'Manual competitor description');
    await selectOptions(page.locator('#add-competitor-relevance'), 'Manual competitor relevance');
    await click(button(await t('dialogs', 'addCompetitor.addCompetitor'), dialog()), 'Save isolated manual competitor');
    await expect.poll(async () => (await json(competitorPath)).competitors.find(item => item.name === 'QA manually added competitor')?.url).toBe('https://example.invalid');
    await click(button(await t('common', 'buttons.close'), dialog()), 'Close competitor analysis viewer');
    await click(button(await t('common', 'accessibility.regenerateRoadmapAriaLabel'), main()), 'Open existing-analysis regeneration choices');
    const alert = page.getByRole('alertdialog');
    await expect(alert).toBeVisible();
    await shot('conditional-roadmap-existing-analysis-options');
    for (const choice of ['useExistingTitle', 'runNewTitle', 'skipTitle']) {
      await blocked(`Roadmap existing-analysis ${await t('dialogs', `existingCompetitorAnalysis.${choice}`)}`, 'This choice launches model-backed roadmap generation; no account is configured');
    }
    const addKnown = alert.getByRole('button').filter({ hasText: await t('dialogs', 'competitorAnalysis.addKnownCompetitors') });
    await click(addKnown, 'Open known competitor form from existing-analysis choices');
    await click(button(await t('dialogs', 'addCompetitor.cancel'), dialog()), 'Cancel nested known competitor form');
    await click(button(await t('dialogs', 'existingCompetitorAnalysis.cancel'), alert), 'Cancel existing-analysis regeneration choices');
  });

  await segment('conditional-roadmap-delete-and-archive', async () => {
    await nav('roadmap');
    await click(main().getByRole('tab', { name: await t('uiKnowledge', 'allFeatures'), exact: true }), 'Roadmap all feature mutations entry');
    await panel('QA roadmap feature 3', 'Open deletable roadmap feature');
    await click(button(await t('common', 'accessibility.deleteFeatureAriaLabel'), dialog()), 'Open feature deletion confirmation');
    await click(button(await t('uiKnowledge', 'cancel'), dialog()), 'Cancel feature deletion');
    assert.ok((await json(roadmapPath)).features.some(feature => feature.id === 'ui-feature-3'));
    await click(button(await t('common', 'accessibility.deleteFeatureAriaLabel'), dialog()), 'Reopen feature deletion');
    await click(button(await t('uiKnowledge', 'delete'), dialog()), 'Confirm isolated feature deletion');
    await expect.poll(async () => (await json(roadmapPath)).features.some(feature => feature.id === 'ui-feature-3')).toBe(false);
    assert.ok((await json(roadmapPath)).features.every(feature => !feature.dependencies.includes('ui-feature-3')), 'Delete must remove stale dependency references');
    await panel('QA roadmap feature 2', 'Open synthetic completed feature');
    await click(button(await t('common', 'accessibility.archiveFeatureAriaLabel'), dialog()), 'Open roadmap archive confirmation');
    const alert = page.getByRole('alertdialog');
    await click(button(await t('common', 'buttons.cancel'), alert), 'Cancel roadmap archive');
    assert.ok((await json(roadmapPath)).features.some(feature => feature.id === 'ui-feature-2'));
    await click(button(await t('common', 'accessibility.archiveFeatureAriaLabel'), dialog()), 'Reopen roadmap archive');
    await click(button(await t('common', 'roadmap.archiveFeature'), alert), 'Confirm isolated roadmap archive');
    await expect.poll(async () => (await json(roadmapPath)).features.some(feature => feature.id === 'ui-feature-2')).toBe(false);
    await shot('conditional-roadmap-mutations-persisted');
  });

  await segment('conditional-roadmap-convert-and-linked-task', async () => {
    await nav('roadmap');
    await click(main().getByRole('tab', { name: await t('uiKnowledge', 'allFeatures'), exact: true }), 'Roadmap conversion source view');
    await panel('QA roadmap feature 1', 'Open roadmap conversion details');
    await click(button(await t('common', 'roadmap.convertToTask'), dialog()), 'Convert roadmap feature to backlog only');
    await expect.poll(async () => (await json(roadmapPath)).features.find(feature => feature.id === 'ui-feature-1')?.linked_spec_id).toBeTruthy();
    const feature = (await json(roadmapPath)).features.find(item => item.id === 'ui-feature-1');
    assert.equal(feature.status, 'planned');
    await assertBacklog(feature.linked_spec_id, 'roadmap');
    await click(button(await t('common', 'roadmap.goToTask'), dialog()), 'Roadmap linked task user entry');
    await expect(dialog().getByRole('heading', { name: 'QA roadmap feature 1', level: 2, exact: true })).toBeVisible();
    const expand = button(await t('tasks', 'metadata.showMore'), dialog());
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    const descriptionId = await expand.getAttribute('aria-controls');
    assert.ok(descriptionId, 'Task description expansion must identify its controlled content');
    const description = dialog().locator(`[id=${JSON.stringify(descriptionId)}]`);
    const collapsedText = await description.innerText();
    await click(expand, 'Expand real linked roadmap task description');
    const collapse = button(await t('tasks', 'metadata.showLess'), dialog());
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await expect(collapse).toHaveAttribute('aria-controls', descriptionId);
    assert.equal(await description.innerText(), collapsedText, 'Expansion must preserve the actual persisted description');
    await click(collapse, 'Collapse real linked roadmap task description');
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await closeTask('Close roadmap linked task');
    await assertBacklog(feature.linked_spec_id, 'roadmap-after-task-open');
  });

  await segment('conditional-roadmap-build-button-controls', async () => {
    const created = [];
    const layouts = [
      { key: 'kanban', link: 'task' },
      { key: 'phases', link: 'viewTask' },
      { key: 'allFeatures', link: 'goToTask' },
    ];
    // Add independent, labelled inputs for each distinct Build implementation.
    // Preserve earlier fixture features and their existing task links. Main's
    // convert endpoint only writes a pending task and never starts its executor.
    for (const layout of layouts) {
      await nav('ideation');
      const roadmap = await json(roadmapPath);
      assert.equal(roadmap.id, 'ui-conditional-roadmap');
      assert.ok(roadmap.features.every(feature => /^QA /.test(feature.title)), 'Build input must contain only this isolated QA roadmap');
      const phase = roadmap.phases.find(candidate => candidate.id === 'ui-phase-1');
      assert.ok(phase, 'Build fixture phase must remain present');
      const added = [1, 2].map(index => ({
        id: `ui-build-${layout.key}-${index}`, title: `QA roadmap ${layout.key} Build ${index}`,
        description: syntheticNote, rationale: 'Inspect the normal local Build button in this layout.',
        phase_id: phase.id, status: 'under_review', priority: index === 1 ? 'must' : 'could',
        complexity: 'low', impact: 'medium', dependencies: [],
        acceptance_criteria: ['Only create a backlog task; do not start execution.'],
        user_stories: ['As a QA user I exercise a real local Build control.'],
      }));
      assert.ok(added.every(feature => !roadmap.features.some(candidate => candidate.id === feature.id)), 'Build fixture IDs must be new');
      roadmap.features.push(...added);
      phase.features.push(...added.map(feature => feature.id));
      await seed(roadmapPath, roadmap, `synthetic persisted ${layout.key} Build control inputs`);
      const tabName = await t('uiKnowledge', layout.key);
      const view = main().getByRole('tabpanel', { name: tabName, exact: true });
      const openView = async () => {
        await nav('roadmap');
        await expect(main().getByRole('heading', { name: 'Synthetic QA Roadmap', exact: true })).toBeVisible();
        await click(main().getByRole('tab', { name: tabName, exact: true }), `Open ${tabName} Build controls`);
        await expect(view).toBeVisible();
        if (layout.key === 'phases') {
          const more = view.getByRole('button', { name: /^Show \d+ more feature/ });
          while (await more.count()) await click(more.first(), 'Reveal all phase Build controls');
        }
      };
      await openView();
      const eligible = roadmap.features.filter(feature => feature.status !== 'done' && !feature.linked_spec_id && !feature.task_outcome);
      assert.ok(eligible.length >= added.length, 'Every layout must expose fresh eligible Build inputs');
      const buildName = await t('common', 'roadmap.build');
      await expect(button(buildName, view)).toHaveCount(eligible.length);
      const scopeFor = title => layout.key === 'phases'
        ? view.getByRole('button').filter({ has: page.getByText(title, { exact: true }) }).locator('..')
        : view.locator('.forge-card').filter({ has: page.getByRole('heading', { name: title, exact: true, level: 3 }) });
      for (const feature of eligible) {
        const scope = scopeFor(feature.title);
        await expect(scope).toHaveCount(1);
        const build = button(buildName, scope);
        await expect(build).toBeEnabled();
        await click(build, `${tabName} Build ${feature.title}`);
        await expect.poll(async () => (await json(roadmapPath)).features.find(candidate => candidate.id === feature.id)?.linked_spec_id,
          { message: 'The actual Build control must persist its local task link' }).toBeTruthy();
        const persisted = (await json(roadmapPath)).features.find(candidate => candidate.id === feature.id);
        assert.equal(persisted.status, 'planned');
        await assertBacklog(persisted.linked_spec_id, `roadmap-${layout.key}-build`);
        const metadata = await json(path.join(specsDir, persisted.linked_spec_id, 'task_metadata.json'));
        assert.equal(metadata.sourceType, 'roadmap');
        assert.equal(metadata.featureId, feature.id);
        await expect(build).toHaveCount(0);
        const taskLink = button(await t('common', `roadmap.${layout.link}`), scopeFor(feature.title));
        await expect(taskLink).toBeVisible();
        await click(taskLink, `${tabName} open actual backlog task ${feature.title}`);
        await expect(dialog().getByRole('heading', { name: feature.title, exact: true, level: 2 })).toBeVisible();
        await closeTask(`Close ${tabName} Build task ${feature.title}`);
        await openView();
        created.push({ layout: layout.key, featureId: feature.id, taskId: persisted.linked_spec_id });
      }
      await expect(button(buildName, view)).toHaveCount(0);
      await shot(`conditional-roadmap-${layout.key}-build-controls`);
    }
    assert.equal(new Set(created.map(entry => entry.taskId)).size, created.length, 'Each Build button must create an independent task');
    for (const entry of created) await assertBacklog(entry.taskId, `roadmap-${entry.layout}-build-final`);
    const finalAccounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
    assert.ok(finalAccounts.success && finalAccounts.data?.accounts?.length === 0, 'Build walk must never configure a model account');
    report.roadmapBuildControls = { created, layouts: layouts.map(layout => layout.key), modelCalls: 0, executionStarted: false };
  });

  await segment('conditional-roadmap-view-title-entry-controls', async () => {
    await nav('roadmap');
    const before = await readFile(roadmapPath, 'utf8');
    const roadmap = JSON.parse(before);
    assert.equal(roadmap.id, 'ui-conditional-roadmap');
    assert.ok(roadmap.features.every(feature => /^QA /.test(feature.title)), 'Only isolated fixture feature titles may be walked');
    const opened = [];
    for (const key of ['phases', 'byPriority']) {
      const tabName = await t('uiKnowledge', key);
      await click(main().getByRole('tab', { name: tabName, exact: true }), `Open ${tabName} feature title entries`);
      const view = main().getByRole('tabpanel', { name: tabName, exact: true });
      await expect(view).toBeVisible();
      if (key === 'phases') {
        const more = view.getByRole('button', { name: /^Show \d+ more feature/ });
        while (await more.count()) await click(more.first(), 'Reveal every phase feature title button');
      }
      const features = key === 'phases'
        ? roadmap.features.filter(feature => roadmap.phases.some(phase => phase.id === feature.phase_id))
        : roadmap.features;
      assert.ok(features.length, 'Every title layout must contain visible fixture inputs');
      for (const feature of features) {
        const title = view.getByRole('button').filter({ has: page.getByText(feature.title, { exact: true }) });
        await expect(title).toHaveCount(1);
        await expect(title).toBeEnabled();
        await click(title, `${tabName} feature title ${feature.title}`);
        await expect(dialog().getByRole('heading', { name: feature.title, exact: true })).toBeVisible();
        await click(button(await t('common', 'accessibility.closeFeatureDetailsAriaLabel'), dialog()), `Close ${tabName} feature title details ${feature.title}`);
        await expect(view).toBeVisible();
        opened.push({ layout: key, featureId: feature.id });
      }
      await shot(`conditional-roadmap-${key}-title-entries`);
    }
    assert.equal(await readFile(roadmapPath, 'utf8'), before, 'Opening and closing titles must preserve persisted roadmap data');
    report.roadmapViewTitleEntries = { opened, modelCalls: 0, persistedDataPreserved: true };
  });

  const ideaTypes = ['code_improvements', 'ui_ux_improvements', 'documentation_gaps', 'security_hardening', 'performance_optimizations', 'code_quality'];
  await segment('conditional-ideation-fixture-setup-and-details', async () => {
    await nav('roadmap');
    await seed(ideationPath, {
      id: 'ui-conditional-ideation', config: { enabled_types: ideaTypes, include_roadmap_context: true,
        include_kanban_context: true, max_ideas_per_type: 3 },
      ideas: [...ideaTypes.map((type, index) => ({ id: `ui-idea-${index + 1}`, type,
        title: `QA idea ${index + 1}`, description: syntheticNote, rationale: 'Exercise all idea detail variants.',
        status: 'draft', created_at: now })),
      { id: 'ui-idea-dismissed', type: 'ui_ux_improvements', title: 'QA dismissed idea', description: syntheticNote, rationale: 'Restore branch fixture', status: 'dismissed', created_at: now },
      { id: 'ui-idea-archived', type: 'documentation_gaps', title: 'QA archived idea', description: syntheticNote, rationale: 'Archive branch fixture', status: 'archived', created_at: now }],
      generated_at: now, updated_at: now,
    });
    const result = await page.evaluate(id => window.electronAPI.getIdeation(id), projectId);
    assert.ok(result.success && result.data?.ideas.length === 8, 'Real Main must parse idea fixtures');
    await nav('ideation');
    await tabs('uiKnowledgeIdeas', ['all', 'code', 'uiUx', 'docs', 'security', 'performance'], 'ideation');
    await click(main().getByRole('tab', { name: await t('uiKnowledgeIdeas', 'all'), exact: true }), 'Ideation all details entry');
    for (let index = 1; index <= 6; index++) {
      await panel(`QA idea ${index}`, `Open idea detail variant ${ideaTypes[index - 1]}`);
      await shot(`conditional-idea-detail-${index}`);
      await click(button(await t('common', 'accessibility.closePanelAriaLabel'), dialog()), `Close idea detail variant ${index}`);
    }
    await click(button(await t('common', 'accessibility.configureAriaLabel'), main()), 'Open populated ideation configuration');
    const switches = dialog().getByRole('switch');
    for (let index = 0, count = await switches.count(); index < count; index++) {
      const state = await switches.nth(index).getAttribute('aria-checked');
      await click(switches.nth(index), `Ideation configuration switch ${index + 1}`);
      await expect(switches.nth(index)).not.toHaveAttribute('aria-checked', state);
      await click(switches.nth(index), `Restore ideation configuration switch ${index + 1}`);
      await expect(switches.nth(index)).toHaveAttribute('aria-checked', state);
    }
    await click(button(await t('uiKnowledgeIdeas', 'close'), dialog()).first(), 'Close populated ideation configuration footer');
    await click(button(await t('common', 'accessibility.configureAriaLabel'), main()), 'Reopen ideation configuration for header close');
    await click(button(await t('uiKnowledgeIdeas', 'close'), dialog()).last(), 'Close populated ideation configuration header');
    const beforeRegeneration = await readFile(ideationPath, 'utf8');
    await click(button(await t('common', 'accessibility.regenerateIdeasAriaLabel'), main()), 'Regenerate ideas without a configured provider');
    await expect(page.getByText(await t('uiKnowledgeIdeas', 'providerErrorTitle'), { exact: true }).last()).toBeVisible();
    assert.equal(await readFile(ideationPath, 'utf8'), beforeRegeneration, 'No-provider regeneration must preserve existing ideas');
    await blocked('Successful idea regeneration', 'The real user control rejected the absent provider before generation; a model result remains unverified');
  });

  await segment('conditional-ideation-selection-bulk-delete-and-dismiss', async () => {
    await nav('ideation');
    await click(button(await t('common', 'accessibility.selectAllAriaLabel'), main()), 'Select all visible ideas');
    await click(button(await t('common', 'accessibility.clearSelectionAriaLabel'), main()), 'Clear all selected ideas');
    for (const index of [3, 4]) {
      const checkbox = main().getByRole('checkbox', { name: await t('common', 'accessibility.selectIdeaAriaLabel', { title: `QA idea ${index}` }), exact: true });
      await click(checkbox, `Select idea ${index} for bulk delete`);
      await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    }
    await click(button(await t('uiKnowledgeIdeas', 'delete'), main()), 'Bulk delete two isolated ideas');
    await expect.poll(async () => (await json(ideationPath)).ideas.filter(idea => ['ui-idea-3', 'ui-idea-4'].includes(idea.id)).length).toBe(0);
    await panel('QA idea 2', 'Open idea dismissal details');
    await click(button(await t('common', 'ideation.dismissIdea'), dialog()), 'Dismiss idea through detail panel');
    await expect.poll(async () => (await json(ideationPath)).ideas.find(idea => idea.id === 'ui-idea-2')?.status).toBe('dismissed');
    await click(button(await t('common', 'accessibility.closePanelAriaLabel'), dialog()), 'Close dismissed idea detail');
    await click(button(await t('common', 'accessibility.showDismissedAriaLabel'), main()), 'Show dismissed ideas');
    await panel('QA dismissed idea', 'Inspect dismissed idea restore branch');
    const restore = dialog().getByRole('button', { name: /restore/i });
    if (await restore.count()) {
      await click(restore.first(), 'Restore dismissed idea from normal user entry');
      await expect.poll(async () => (await json(ideationPath)).ideas.find(idea => idea.id === 'ui-idea-dismissed')?.status).toBe('draft');
    } else await missing('Restore dismissed idea', 'Dismissed idea detail has no restore control although Main supports updateIdeaStatus(id, draft)');
    await closeLayers();
    await click(button(await t('common', 'accessibility.hideDismissedAriaLabel'), main()), 'Hide dismissed ideas again');
    await shot('conditional-ideation-mutations');
  });

  let convertedIdeaTask;
  let convertedIdeaStatus = 'archived';
  await segment('conditional-ideation-convert-and-linked-task', async () => {
    await nav('ideation');
    await panel('QA idea 1', 'Open ideation conversion details');
    await click(button(await t('common', 'ideation.convertToTask'), dialog()), 'Convert idea to backlog only');
    await expect.poll(async () => (await json(ideationPath)).ideas.find(idea => idea.id === 'ui-idea-1')?.linked_task_id).toBeTruthy();
    const idea = (await json(ideationPath)).ideas.find(item => item.id === 'ui-idea-1');
    assert.equal(idea.status, 'archived');
    convertedIdeaTask = idea.linked_task_id;
    await assertBacklog(convertedIdeaTask, 'ideation');
    await closeLayers();
    // Archived visibility is a shell control, not a direct store mutation.
    await showArchivedIdeas('Show archived ideas after conversion');
    await click(button(await t('uiIdeaDetails', 'actions.hideArchived'), main()), 'Hide archived ideas locally');
    await expect(main().getByRole('heading', { name: 'QA idea 1', exact: true })).toBeHidden();
    await showArchivedIdeas('Show archived ideas locally again');
    const archivedFixtureCard = main().locator('div.cursor-pointer').filter({ has: page.getByRole('heading', { name: 'QA archived idea', exact: true }) }).last();
    const restoreArchivedCard = archivedFixtureCard.getByRole('button', { name: /restore/i });
    if (await restoreArchivedCard.count()) {
      await click(restoreArchivedCard.first(), 'Restore unlinked archived idea from card action');
      await expect.poll(async () => (await json(ideationPath)).ideas.find(idea => idea.id === 'ui-idea-archived')?.status).toBe('draft');
    } else await missing('Restore archived idea from card', 'Archived fixture card has no restore user control');
    const linkedCard = main().locator('div.cursor-pointer').filter({ has: page.getByRole('heading', { name: 'QA idea 1', exact: true }) }).last();
    const linked = button(await t('common', 'accessibility.goToTaskAriaLabel'), linkedCard);
    if (await linked.count() && await linked.first().isVisible()) {
      await click(linked.first(), 'Ideation freshly converted linked task entry');
      await expect(dialog().getByRole('heading', { name: 'QA idea 1', level: 2, exact: true })).toBeVisible();
      await closeTask('Close ideation linked task');
      await assertBacklog(convertedIdeaTask, 'ideation-after-task-open');
    } else await missing('Ideation converted task navigation', 'Converted idea is persisted but no visible linked task user control is available');
    await nav('roadmap');
    await nav('ideation');
    if (!await main().getByRole('heading', { name: 'QA idea 1', exact: true }).isVisible()) {
      await showArchivedIdeas('Show persisted archived ideas after remount');
    }
    const persistedTitle = main().getByRole('heading', { name: 'QA idea 1', exact: true });
    if (await persistedTitle.count() && await persistedTitle.isVisible()) {
      await panel('QA idea 1', 'Open persisted converted idea');
      if (!await button(await t('common', 'ideation.goToTask'), dialog()).count()) {
        await missing('Persisted idea linked task navigation', 'Main persisted linked_task_id is not exposed as taskId after reading the idea file');
      } else {
        await click(button(await t('common', 'ideation.goToTask'), dialog()), 'Open persisted ideation linked task after remount');
        await closeTask('Close persisted ideation linked task');
        await nav('ideation');
        await panel('QA idea 1', 'Reopen persisted converted idea restore details');
      }
      if (await button(await t('common', 'ideation.convertToTask'), dialog()).count()) {
        await missing('Archived idea still offers Convert/Dismiss', 'An already converted archived detail should show the linked task instead of another conversion action');
      }
      const restoreLinked = dialog().getByRole('button', { name: /restore/i });
      if (await restoreLinked.count()) {
        await click(restoreLinked.first(), 'Restore linked archived idea through detail action');
        await expect.poll(async () => (await json(ideationPath)).ideas.find(idea => idea.id === 'ui-idea-1')?.status).toBe('converted');
        assert.equal((await json(ideationPath)).ideas.find(idea => idea.id === 'ui-idea-1')?.linked_task_id, convertedIdeaTask);
        convertedIdeaStatus = 'converted';
        await assertBacklog(convertedIdeaTask, 'ideation-linked-restore');
      }
      await closeLayers();
    }
  });

  await segment('conditional-ideation-card-action-controls', async () => {
    await nav('roadmap');
    const session = await json(ideationPath);
    assert.equal(session.id, 'ui-conditional-ideation');
    assert.ok(session.ideas.every(idea => /^QA /.test(idea.title)), 'Card actions require only this isolated QA ideation session');
    const originalIdeas = structuredClone(session.ideas);
    const cardInputs = [
      { id: 'ui-idea-card-convert', type: 'ui_ux_improvements', title: 'QA card conversion idea',
        description: syntheticNote, rationale: 'Exercise only the normal card conversion entry.', status: 'draft', created_at: now },
      { id: 'ui-idea-card-dismiss', type: 'documentation_gaps', title: 'QA card dismissal idea',
        description: syntheticNote, rationale: 'Exercise only the normal card dismissal entry.', status: 'draft', created_at: now },
    ];
    assert.ok(cardInputs.every(idea => !session.ideas.some(candidate => candidate.id === idea.id)), 'Card fixture IDs must be independent and new');
    session.ideas.push(...cardInputs);
    await seed(ideationPath, session, 'synthetic persisted draft idea card action inputs');
    await nav('ideation');
    await click(main().getByRole('tab', { name: await t('uiKnowledgeIdeas', 'all'), exact: true }), 'Open all idea card actions');
    const card = title => main().locator('.forge-card').filter({ has: page.getByRole('heading', { name: title, exact: true, level: 3 }) });
    const [conversion, dismissal] = cardInputs;
    const convertCard = card(conversion.title);
    await expect(convertCard).toHaveCount(1);
    await click(button(await t('common', 'accessibility.convertToTaskAriaLabel'), convertCard), 'Convert fresh draft idea from actual card button');
    await expect.poll(async () => (await json(ideationPath)).ideas.find(idea => idea.id === conversion.id)?.linked_task_id,
      { message: 'Actual card conversion must persist a task link' }).toBeTruthy();
    const converted = (await json(ideationPath)).ideas.find(idea => idea.id === conversion.id);
    assert.equal(converted.status, 'archived');
    await assertBacklog(converted.linked_task_id, 'ideation-card');
    // Reload the actual persisted pending task before normal card task navigation.
    await refreshTasks();
    await nav('ideation');
    await click(main().getByRole('tab', { name: await t('uiKnowledgeIdeas', 'all'), exact: true }), 'Return to all idea cards after task refresh');
    await showArchivedIdeas('Reveal freshly card-converted archived idea');
    const taskLink = button(await t('common', 'accessibility.goToTaskAriaLabel'), card(conversion.title));
    await expect(taskLink).toBeEnabled();
    await click(taskLink, 'Open actual backlog task from archived idea card');
    await expect(dialog().getByRole('heading', { name: conversion.title, exact: true, level: 2 })).toBeVisible();
    await closeTask('Close actual card-converted backlog task');
    await assertBacklog(converted.linked_task_id, 'ideation-card-after-task-open');
    await nav('ideation');
    await click(main().getByRole('tab', { name: await t('uiKnowledgeIdeas', 'all'), exact: true }), 'Return to independent idea card dismissal');
    await showArchivedIdeas('Show archived card restore action');
    const restore = button(await t('uiIdeaDetails', 'actions.restore'), card(conversion.title));
    let restored = false;
    if (await restore.count()) {
      await click(restore, 'Restore linked archived idea through actual card button');
      await expect.poll(async () => (await json(ideationPath)).ideas.find(idea => idea.id === conversion.id)?.status).toBe('converted');
      assert.equal((await json(ideationPath)).ideas.find(idea => idea.id === conversion.id)?.linked_task_id, converted.linked_task_id);
      await expect(button(await t('common', 'accessibility.convertToTaskAriaLabel'), card(conversion.title))).toHaveCount(0);
      await assertBacklog(converted.linked_task_id, 'ideation-card-after-restore');
      restored = true;
    } else await blocked('Restore freshly converted archived idea card', 'No visible card Restore entry is exposed by this built version; linked task remains archived in ideation');
    const dismissCard = card(dismissal.title);
    await expect(dismissCard).toHaveCount(1);
    await click(button(await t('common', 'accessibility.dismissAriaLabel'), dismissCard), 'Dismiss independent draft idea from actual card button');
    await expect.poll(async () => (await json(ideationPath)).ideas.find(idea => idea.id === dismissal.id)?.status).toBe('dismissed');
    const finalSession = await json(ideationPath);
    assert.equal(finalSession.ideas.find(idea => idea.id === dismissal.id)?.linked_task_id, undefined, 'Dismissing a card must not create a task');
    assert.deepEqual(finalSession.ideas.filter(idea => originalIdeas.some(original => original.id === idea.id)), originalIdeas,
      'Independent card inputs must preserve all earlier fixture ideas');
    await assertBacklog(converted.linked_task_id, 'ideation-card-final');
    const finalAccounts = await page.evaluate(() => window.electronAPI.getProviderAccounts());
    assert.ok(finalAccounts.success && finalAccounts.data?.accounts?.length === 0, 'Idea card actions must not configure a model');
    report.ideationCardActions = { convertedIdeaId: conversion.id, taskId: converted.linked_task_id,
      dismissedIdeaId: dismissal.id, restored, modelCalls: 0, executionStarted: false, earlierIdeasPreserved: true };
    await shot('conditional-ideation-card-actions');
  });

  await segment('conditional-ideation-add-types-and-bulk-dismiss', async () => {
    await nav('ideation');
    const addMore = button(await t('common', 'accessibility.addMoreAriaLabel'), main());
    if (await addMore.count()) {
      await click(addMore, 'Open add more ideation types');
      const available = dialog().locator('div.cursor-pointer');
      for (let index = 0, count = await available.count(); index < count; index++) {
        await click(available.nth(index), `Choose available additional idea type ${index + 1}`);
        await click(available.nth(index), `Deselect available additional idea type ${index + 1}`);
      }
      if (await available.count()) {
        await click(available.first(), 'Select one type for no-provider additional-generation rejection');
        const beforeGeneration = await readFile(ideationPath, 'utf8');
        await click(button(await t('uiKnowledgeIdeas', 'generateTypes', { count: 1 }), dialog()), 'Generate additional type without configured provider');
        await expect(page.getByText(await t('uiKnowledgeIdeas', 'providerErrorTitle'), { exact: true }).last()).toBeVisible();
        assert.equal(await readFile(ideationPath, 'utf8'), beforeGeneration, 'No-provider additional generation must preserve persisted ideas');
      }
      await blocked('Successful additional idea generation', 'The user action rejects the missing model provider; a generated model result is unverified');
      await click(button(await t('uiKnowledgeIdeas', 'cancel'), dialog()), 'Cancel add more idea generation');
    } else await blocked('Add More idea types', 'No eligible type is exposed in current persisted fixture');
    const dismissAll = button(await t('common', 'accessibility.dismissAllAriaLabel'), main());
    await click(dismissAll, 'Dismiss all remaining active fixture ideas');
    await expect.poll(async () => (await json(ideationPath)).ideas.filter(idea => ['ui-idea-5', 'ui-idea-6'].includes(idea.id)).every(idea => idea.status === 'dismissed')).toBe(true);
    if (convertedIdeaTask) assert.equal((await json(ideationPath)).ideas.find(idea => idea.id === 'ui-idea-1')?.status, convertedIdeaStatus, 'Bulk dismiss must preserve already converted ideas');
    await shot('conditional-ideation-bulk-dismiss-persisted');
  });

  const completedIds = ['901-qa-synthetic-completed-one', '902-qa-synthetic-completed-two'];
  await segment('conditional-changelog-completed-task-fixture', async () => {
    await nav('roadmap');
    for (const [index, taskId] of completedIds.entries()) {
      const title = `QA synthetic completed task ${index + 1}`;
      await seed(path.join(specsDir, taskId, 'implementation_plan.json'), {
        feature: title, description: syntheticNote, workflow_type: 'feature', status: 'done',
        xstateState: 'done', executionPhase: 'complete', created_at: now, updated_at: now,
        spec_file: 'spec.md', final_acceptance: [], phases: [],
      }, 'synthetic completed task record for changelog UI; no execution evidence');
      await seed(path.join(specsDir, taskId, 'spec.md'), `# ${title}\n\n${syntheticNote}\n`);
      await seed(path.join(specsDir, taskId, 'task_metadata.json'), { sourceType: 'manual', category: 'feature' });
    }
    await refreshTasks();
    await expect.poll(async () => {
      const result = await page.evaluate(id => window.electronAPI.getChangelogDoneTasks(id), projectId);
      return result.success && completedIds.every(id => result.data.some(task => task.id === id));
    }, { message: 'Real changelog getter must expose synthetic completed fixtures' }).toBe(true);
    await nav('changelog');
    await click(main().getByRole('radio').first(), 'Select completed-task changelog source');
    await click(button(await t('uiChangelogExtra', 'refresh'), main()), 'Refresh completed changelog sources');
    await click(button(await t('uiChangelogExtra', 'selectAll'), main()), 'Select all synthetic completed tasks');
    await click(button(await t('uiChangelogExtra', 'clear'), main()), 'Clear selected changelog tasks');
    for (const index of [1, 2]) {
      const taskCard = main().locator('label').filter({ has: page.getByRole('heading', { name: `QA synthetic completed task ${index}`, exact: true }) });
      await click(taskCard.getByRole('checkbox'), `Select synthetic completed task ${index}`);
      await expect(taskCard.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    }
    const continueName = await t('uiChangelogExtra', 'continue');
    await click(main().getByRole('button', { name: new RegExp(`^${continueName}`) }), 'Continue task-source changelog configuration');
    await fill(page.locator('#version'), '0.0.1-ui-fixture', 'Set fixture changelog version');
    await fill(page.locator('#date'), '2026-09-28', 'Set fixture changelog date');
    const selects = main().getByRole('combobox');
    for (let index = 0, count = await selects.count(); index < count; index++) await selectOptions(selects.nth(index), `Changelog output style ${index + 1}`);
    await click(button(await t('uiChangelogExtra', 'advanced'), main()), 'Expand changelog advanced options');
    await fill(page.locator('#instructions'), syntheticNote, 'Edit changelog custom instructions');
    await click(button(await t('uiChangelogExtra', 'advanced'), main()), 'Collapse changelog advanced options');
    await blocked('Real changelog model generation', 'No configured model account or billing authorization; generated-state UI is covered using an explicitly synthetic event');
    await shot('conditional-changelog-configured');
  });

  await segment('conditional-changelog-preview-edit-copy-save-archive', async () => {
    const content = '# Synthetic UI Fixture\n\n## [0.0.1-ui-fixture] - 2026-09-28\n\n### Added\n- Synthetic record for controls only; no agent ran.\n';
    report.fixtureSetup.push({ kind: 'synthetic renderer event generated-state UI fixture', channel: 'changelog:generationComplete',
      projectId, productData: false, modelCalls: 0, note: syntheticNote });
    await app.evaluate(({ BrowserWindow }, payload) => {
      const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes('/renderer/index.html'));
      if (!window) throw new Error('Fixture renderer missing');
      window.webContents.send('changelog:generationComplete', payload.projectId, {
        success: true, changelog: payload.content, version: '0.0.1-ui-fixture', tasksIncluded: 2,
      });
    }, { projectId, content });
    const editor = main().getByPlaceholder(await t('uiChangelogExtra', 'generatedPlaceholder'), { exact: true });
    await expect(editor).toHaveValue(content);
    await click(button(await t('uiChangelogExtra', 'preview'), main()), 'View rendered synthetic changelog preview');
    await expect(main().getByRole('heading', { name: 'Synthetic UI Fixture', exact: true })).toBeVisible();
    await click(button(await t('uiChangelogExtra', 'markdown'), main()), 'Return to editable changelog Markdown');
    const edited = `${content}\n- Manual UI edit persisted through real save IPC.\n`;
    await fill(editor, edited, 'Edit generated-state fixture changelog');
    // Keep the transient native snapshot out of reports and errors. Unsupported
    // image/custom/bookmark formats forbid the UI Copy action before any write.
    const clipboardSnapshot = await captureNativeClipboard(app);
    if (clipboardSnapshot.unsupported.length) {
      await blocked('Copy edited fixture changelog', 'Native clipboard contains a format that cannot be restored completely; Copy was not clicked and native contents were preserved');
    } else {
      try {
        await click(button(await t('uiChangelogExtra', 'copy'), main()), 'Copy edited fixture changelog');
        assert.ok((await app.evaluate(({ clipboard }) => clipboard.readText())) === edited, 'Copy must contain actual edited Markdown');
      } finally {
        await restoreNativeClipboard(app, clipboardSnapshot);
      }
      report.cases.push({ name: 'changelog-native-clipboard-restoration', status: 'passed', restoredAndVerified: true });
    }
    await click(button(await t('uiChangelogExtra', 'saveChangelog'), main()), 'Save edited changelog to isolated project');
    await expect.poll(async () => readFile(path.join(fixture, 'CHANGELOG.md'), 'utf8').catch(() => '')).toContain(edited);
    await expect(main().getByRole('heading', { name: await t('uiChangelogExtra', 'changelogSaved'), exact: true })).toBeVisible();
    await shot('conditional-changelog-saved');
    await blocked('Create GitHub Release and open published Release', 'External publishing is outside fixture QA; no remote or release is created');
    await click(button(await t('uiChangelogExtra', 'archiveButton', { count: 2 }), main()), 'Archive two synthetic completed fixture tasks');
    await expect.poll(async () => {
      const metadata = await Promise.all(completedIds.map(id => json(path.join(specsDir, id, 'task_metadata.json'))));
      return metadata.every(record => record.archivedAt && record.archivedInVersion === '0.0.1-ui-fixture');
    }).toBe(true);
    const remaining = await page.evaluate(id => window.electronAPI.getChangelogDoneTasks(id), projectId);
    assert.ok(remaining.success && completedIds.every(id => !remaining.data.some(task => task.id === id)), 'Archived tasks must disappear from completed changelog candidates');
    await click(button(await t('uiChangelogExtra', 'done'), main()), 'Finish changelog and return to source selection');
    await expect(button(await t('uiChangelogExtra', 'continue'), main())).toBeDisabled();
    if (convertedIdeaTask) await assertBacklog(convertedIdeaTask, 'ideation-after-changelog-archive');
    await shot('conditional-changelog-archived');
  });
}
