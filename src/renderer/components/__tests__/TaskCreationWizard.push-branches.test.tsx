/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Task, TaskDraft, TaskMetadata } from '../../../shared/types';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants';
import { useProjectStore } from '../../stores/project-store';
import { useSettingsStore } from '../../stores/settings-store';
import { saveDraft, useTaskStore } from '../../stores/task-store';
import { TaskCreationWizard } from '../TaskCreationWizard';

// Keep the actual wizard, form, project settings, draft restoration and task
// store submission path. Model discovery and the final IPC endpoint are fixtures.
vi.mock('../AgentProfileSelector', () => ({
  AgentProfileSelector: () => <span>Fixture agent configuration</span>,
}));

const projectId = 'push-choice-project';
const projectPath = '/fixture/push-choice';
const createTask = vi.fn();
const createdTask: Task = {
  id: 'created-push-choice-task', specId: 'created-push-choice-spec', projectId,
  title: 'Push preference fixture', description: 'Create a fixture task', status: 'backlog',
  subtasks: [], logs: [], createdAt: new Date(), updatedAt: new Date(),
};

function setProjectDefault(pushNewBranches?: boolean) {
  useProjectStore.setState({ projects: [{
    id: projectId, name: 'Push preference fixture', path: projectPath,
    settings: pushNewBranches === undefined ? {} : { pushNewBranches },
  } as Project] });
}

beforeEach(() => {
  setProjectDefault(true);
  useSettingsStore.setState({ settings: DEFAULT_APP_SETTINGS, providerAccounts: [] });
  useTaskStore.setState({ tasks: [], error: null });
  createTask.mockReset().mockResolvedValue({ success: true, data: createdTask });
  Object.assign(window.electronAPI, {
    getGitBranchesWithInfo: vi.fn().mockResolvedValue({ success: true, data: [{ name: 'main', displayName: 'main', type: 'local' }] }),
    getProjectEnv: vi.fn().mockResolvedValue({ success: true, data: { defaultBranch: 'main' } }),
    detectMainBranch: vi.fn().mockResolvedValue({ success: true, data: 'main' }),
    createTask,
    startTask: vi.fn(),
  });
});
afterEach(cleanup);

async function showWizard() {
  const onOpenChange = vi.fn();
  render(<TaskCreationWizard projectId={projectId} open onOpenChange={onOpenChange} />);
  const description = screen.getByRole('textbox', { name: /Description/ });
  if (!description.textContent) fireEvent.change(description, { target: { value: 'Create a task with my branch publishing choice' } });
  const disclosure = screen.getByRole('button', { name: /Git Options/ });
  if (disclosure.getAttribute('aria-expanded') !== 'true') fireEvent.click(disclosure);
  const selector = screen.getByRole('combobox', { name: 'Base Branch (optional)' });
  await waitFor(() => expect(selector).toBeEnabled());
  const section = selector.closest('#git-options-section');
  if (!section) throw new Error('Git options section is missing');
  return { onOpenChange, gitOptions: within(section as HTMLElement) };
}

async function submitAndExpect(onOpenChange: ReturnType<typeof vi.fn>, pushNewBranches: boolean) {
  fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
  await waitFor(() => expect(createTask).toHaveBeenCalledOnce());
  const [submittedProject, , , metadata] = createTask.mock.calls[0] as [string, string, string, TaskMetadata];
  expect(submittedProject).toBe(projectId);
  expect(metadata).toHaveProperty('pushNewBranches', pushNewBranches);
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(useTaskStore.getState().tasks).toContainEqual(expect.objectContaining({ id: createdTask.id, status: 'backlog' }));
  expect(window.electronAPI.startTask).not.toHaveBeenCalled();
}

describe('Task creation branch publishing choice', () => {
  it.each([
    { projectDefault: false, initial: 'Off', chosen: 'On', expected: true },
    { projectDefault: true, initial: 'On', chosen: 'Off', expected: false },
  ])('submits an explicit $chosen choice over project default $projectDefault', async ({ projectDefault, initial, chosen, expected }) => {
    setProjectDefault(projectDefault);
    const { onOpenChange, gitOptions } = await showWizard();
    fireEvent.click(gitOptions.getByRole('button', { name: initial }));
    expect(gitOptions.getByRole('button', { name: chosen })).toBeEnabled();
    await submitAndExpect(onOpenChange, expected);
  });

  it.each([
    { projectDefault: false, displayed: 'Off', expected: false },
    { projectDefault: true, displayed: 'On', expected: true },
    { projectDefault: undefined, displayed: 'On', expected: true },
  ])('submits the displayed default when project preference is $projectDefault', async ({ projectDefault, displayed, expected }) => {
    setProjectDefault(projectDefault);
    const { onOpenChange, gitOptions } = await showWizard();
    expect(gitOptions.getByRole('button', { name: displayed })).toBeEnabled();
    await submitAndExpect(onOpenChange, expected);
  });

  it.each([true, false])('preserves a restored draft choice of %s over the opposite project preference', async (pushNewBranches) => {
    setProjectDefault(!pushNewBranches);
    const draft: TaskDraft = {
      projectId, title: 'Saved branch preference', description: 'Keep my saved branch publishing choice',
      category: '', priority: '', complexity: '', impact: '', profileId: 'auto', model: '', thinkingLevel: '',
      images: [], referencedFiles: [], pushNewBranches, savedAt: new Date(),
    };
    saveDraft(draft);
    const { onOpenChange, gitOptions } = await showWizard();
    expect(gitOptions.getByRole('button', { name: pushNewBranches ? 'On' : 'Off' })).toBeEnabled();
    await submitAndExpect(onOpenChange, pushNewBranches);
  });
});
