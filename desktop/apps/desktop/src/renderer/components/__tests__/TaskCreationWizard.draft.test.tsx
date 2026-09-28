/** @vitest-environment jsdom */
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitBranchDetail, Project, TaskDraft } from '../../../shared/types';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants';
import { useProjectStore } from '../../stores/project-store';
import { useSettingsStore } from '../../stores/settings-store';
import { isDraftEmpty, loadDraft, saveDraft } from '../../stores/task-store';
import { TaskCreationWizard } from '../TaskCreationWizard';

// Provider/network discovery is not part of draft persistence. The wizard,
// form, branch selector and localStorage implementation remain real.
vi.mock('../AgentProfileSelector', () => ({
  AgentProfileSelector: () => <span>Fixture agent configuration</span>,
}));

const projectId = 'draft-project';
const branches: GitBranchDetail[] = [
  { name: 'main', displayName: 'main', type: 'local' },
  { name: 'feature/draft-base', displayName: 'feature/draft-base', type: 'local' },
];
const createTask = vi.fn();

function showWizard() {
  function Wizard() {
    const [open, setOpen] = useState(true);
    return <>
      <button type="button" onClick={() => setOpen(true)}>Reopen task</button>
      <TaskCreationWizard projectId={projectId} open={open} onOpenChange={setOpen} />
    </>;
  }
  return render(<Wizard />);
}

async function branchSelector() {
  const disclosure = screen.getByRole('button', { name: /Git Options/ });
  if (disclosure.getAttribute('aria-expanded') !== 'true') fireEvent.click(disclosure);
  const selector = screen.getByRole('combobox', { name: 'Base Branch (optional)' });
  await waitFor(() => expect(selector).toBeEnabled());
  return selector;
}

function legacyDraft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    projectId, title: 'Saved requirement', description: 'Keep the selected branch',
    category: 'feature', priority: 'high', complexity: 'small', impact: 'medium',
    profileId: 'balanced', model: 'sonnet', thinkingLevel: 'medium',
    phaseModels: { spec: 'sonnet', planning: 'opus', coding: 'sonnet', qa: 'sonnet' },
    phaseThinking: { spec: 'low', planning: 'high', coding: 'medium', qa: 'high' },
    images: [], referencedFiles: [{ id: 'reference-1', path: 'src/example.ts', name: 'example.ts', isDirectory: false, addedAt: new Date('2026-09-27T00:00:00Z') }],
    requireReviewBeforeCoding: true, fastMode: true, pushNewBranches: false,
    savedAt: new Date('2026-09-27T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  useProjectStore.setState({ projects: [{ id: projectId, name: 'Draft fixture', path: '/fixture/project', settings: { pushNewBranches: true } } as Project] });
  useSettingsStore.setState({ settings: DEFAULT_APP_SETTINGS, providerAccounts: [] });
  Object.assign(window.electronAPI, {
    getGitBranchesWithInfo: vi.fn().mockResolvedValue({ success: true, data: branches }),
    getProjectEnv: vi.fn().mockResolvedValue({ success: true, data: { defaultBranch: 'main' } }),
    detectMainBranch: vi.fn().mockResolvedValue({ success: true, data: 'main' }),
    createTask,
  });
  createTask.mockReset();
  createTask.mockResolvedValue({ success: false, error: 'Fixture does not create tasks' });
});
afterEach(cleanup);

describe('Task creation draft restoration', () => {
  it('keeps the explicitly selected base branch after closing and reopening the form', async () => {
    showWizard();
    fireEvent.change(screen.getByRole('textbox', { name: /Description/ }), { target: { value: 'Implement the feature from its exact base' } });
    const selector = await branchSelector();
    fireEvent.click(selector);
    fireEvent.click(screen.getByRole('option', { name: /feature\/draft-base/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(loadDraft(projectId)).toMatchObject({ baseBranch: 'feature/draft-base', useWorktree: true });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen task' }));
    expect(await branchSelector()).toHaveTextContent('feature/draft-base');
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][3]).toMatchObject({ baseBranch: 'feature/draft-base', useLocalBranch: true });
  });

  it('restores a persisted draft in a fresh component instance without losing execution and review fields', async () => {
    const stored = { ...legacyDraft(), baseBranch: 'feature/draft-base', useWorktree: false };
    saveDraft(stored);
    const view = showWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    view.unmount();
    showWizard();
    await branchSelector();
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(createTask).toHaveBeenCalled());

    expect(createTask.mock.calls[0][3]).toMatchObject({
      baseBranch: 'feature/draft-base', useWorktree: false, pushNewBranches: false,
      requireReviewBeforeCoding: true, fastMode: true,
      category: stored.category, priority: stored.priority, complexity: stored.complexity,
      impact: stored.impact, model: stored.model, thinkingLevel: stored.thinkingLevel,
      phaseModels: stored.phaseModels, phaseThinking: stored.phaseThinking,
      referencedFiles: [expect.objectContaining({ path: 'src/example.ts' })],
    });
  });

  it('uses the existing project default and isolated workspace for legacy drafts with absent Git fields', async () => {
    saveDraft(legacyDraft());
    showWizard();
    await waitFor(() => expect(window.electronAPI.getProjectEnv).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(createTask.mock.calls[0][3]).toMatchObject({ baseBranch: 'main' });
    expect(createTask.mock.calls[0][3].useWorktree).not.toBe(false);
  });

  it('keeps a removed branch visible and refuses creation instead of substituting the project default', async () => {
    saveDraft({ ...legacyDraft(), baseBranch: 'removed/branch' });
    showWizard();
    expect(await branchSelector()).toHaveTextContent('removed/branch');
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('removed/branch');
    expect(createTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(loadDraft(projectId)).toMatchObject({ baseBranch: 'removed/branch' });
  });

  it('does not discard a branch-only draft when the request has not been written yet', async () => {
    showWizard();
    fireEvent.click(await branchSelector());
    fireEvent.click(screen.getByRole('option', { name: /feature\/draft-base/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(loadDraft(projectId)).toMatchObject({ description: '', baseBranch: 'feature/draft-base' });
    fireEvent.click(screen.getByRole('button', { name: 'Reopen task' }));
    expect(await branchSelector()).toHaveTextContent('feature/draft-base');
  });

  it('preserves model-only configuration and leaves a completely untouched form without a draft', () => {
    const configurationOnly = legacyDraft({
      title: '', description: '', category: '', priority: '', complexity: '', impact: '',
      referencedFiles: [], requireReviewBeforeCoding: false, fastMode: false, pushNewBranches: true,
    });
    saveDraft(configurationOnly);
    const view = showWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(loadDraft(projectId)).toMatchObject({ model: 'sonnet', profileId: 'balanced', phaseModels: configurationOnly.phaseModels });
    view.unmount();
    localStorage.clear();
    showWizard();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(loadDraft(projectId)).toBeNull();
  });

  it('refuses an explicit branch when the branch probe failed without converting its selection', async () => {
    vi.mocked(window.electronAPI.getGitBranchesWithInfo).mockResolvedValue({ success: false, error: 'Git unavailable' });
    saveDraft({ ...legacyDraft(), baseBranch: 'feature/draft-base' });
    showWizard();
    expect(await branchSelector()).toHaveTextContent('feature/draft-base');
    fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not verify Git branches');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('preserves reference timestamps and thumbnail data while intentionally omitting large image payloads', () => {
    const draft = legacyDraft({ images: [{ id: 'image-1', filename: 'wireframe.png', mimeType: 'image/png', size: 1024, thumbnail: 'thumbnail', data: 'full-payload' }] });
    saveDraft(draft);
    const restored = loadDraft(projectId);
    expect(restored?.referencedFiles[0].addedAt).toEqual(draft.referencedFiles[0].addedAt);
    expect(restored?.images[0]).toMatchObject({ thumbnail: 'thumbnail', filename: 'wireframe.png' });
    expect(restored?.images[0].data).toBeUndefined();
    expect(isDraftEmpty(legacyDraft({ title: '', description: '', images: [], category: '', priority: '', complexity: '', impact: '' }))).toBe(false);
  });

  it('does not reload saved defaults over the in-progress request when project settings refresh', () => {
    showWizard();
    const description = screen.getByRole('textbox', { name: /Description/ });
    fireEvent.change(description, { target: { value: 'Do not overwrite my unsaved request' } });
    act(() => useProjectStore.getState().updateProject(projectId, { settings: { ...useProjectStore.getState().projects[0].settings, pushNewBranches: false } }));
    expect(description).toHaveValue('Do not overwrite my unsaved request');
  });
});
