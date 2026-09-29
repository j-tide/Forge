/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Ideation } from './Ideation';
import { useIdeationStore } from '../../stores/ideation-store';
import { ViewStateProvider } from '../../contexts/ViewStateContext';
import { TooltipProvider } from '../ui/tooltip';
import type { CodeImprovementIdea, IdeationSession } from '../../../shared/types';
import { transformSessionFromSnakeCase } from '../../../main/ipc-handlers/ideation/transformers';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('./hooks/useIdeationAuth', () => ({ useIdeationAuth: () => ({ hasToken: true, isLoading: false }) }));
vi.mock('../../hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('../../stores/task-store', () => ({ loadTasks: vi.fn() }));
vi.mock('../../stores/ideation-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../stores/ideation-store')>(),
  loadIdeation: vi.fn(), setupIdeationListeners: vi.fn(() => vi.fn()),
}));

const draft: CodeImprovementIdea = { id: 'draft', type: 'code_improvements', title: 'Draft idea', description: 'Description', rationale: 'Rationale', status: 'draft', createdAt: new Date(), buildsUpon: [], estimatedEffort: 'small', affectedFiles: [], existingPatterns: [], implementationApproach: '' };
const dismissed = { ...draft, id: 'dismissed', title: 'Dismissed idea', status: 'dismissed' as const };
const archived = { ...draft, id: 'archived', title: 'Archived idea', status: 'archived' as const, taskId: '001-linked-task' };
const session: IdeationSession = { id: 'session', projectId: 'project-a', ideas: [draft, dismissed, archived], config: { enabledTypes: ['code_improvements'], includeRoadmapContext: false, includeKanbanContext: false, maxIdeasPerType: 3 }, projectContext: { existingFeatures: [], techStack: [], plannedFeatures: [] }, generatedAt: new Date(), updatedAt: new Date() };

function mount() {
  const onGoToTask = vi.fn();
  render(<ViewStateProvider><TooltipProvider><Ideation projectId="project-a" onGoToTask={onGoToTask} /></TooltipProvider></ViewStateProvider>);
  return onGoToTask;
}

beforeEach(() => {
  vi.clearAllMocks();
  useIdeationStore.setState({ currentProjectId: 'project-a', session, isGenerating: false, selectedIds: new Set(), logs: [] });
  window.electronAPI.updateIdeaStatus = vi.fn().mockResolvedValue({ success: true });
  window.electronAPI.dismissIdea = vi.fn().mockResolvedValue({ success: true });
  window.electronAPI.convertIdeaToTask = vi.fn().mockResolvedValue({ success: true, data: { id: '002-created-task', specId: '002-created-task', projectId: 'project-a', status: 'backlog' } });
});

describe('rendered idea lifecycle actions', () => {
  it('selects one idea with a single checkbox click and exposes keyboard accessible details', () => {
    mount();
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(useIdeationStore.getState().selectedIds).toEqual(new Set(['draft']));
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    const details = screen.getByRole('button', { name: 'Draft idea' });
    fireEvent.click(details);
    expect(screen.getByRole('dialog', { name: 'Draft idea' })).toBeInTheDocument();
  });

  it('offers archived visibility, restored task links after reload, and useful archived detail actions', async () => {
    useIdeationStore.getState().setSession(transformSessionFromSnakeCase({ id: 'session', ideas: [{ id: archived.id, type: archived.type, title: archived.title, description: archived.description, rationale: archived.rationale, status: 'archived', linked_task_id: archived.taskId }] }, 'project-a'));
    const onGoToTask = mount();
    expect(screen.queryByRole('button', { name: 'Archived idea' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'actions.showArchived' }));
    expect(screen.getByRole('button', { name: 'actions.hideArchived' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Archived idea' }));
    const panel = within(screen.getByRole('dialog', { name: 'Archived idea' }));
    expect(panel.queryByRole('button', { name: 'common:ideation.convertToTask' })).not.toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'common:ideation.dismissIdea' })).not.toBeInTheDocument();
    fireEvent.click(panel.getByRole('button', { name: 'common:ideation.goToTask' }));
    expect(onGoToTask).toHaveBeenCalledWith('001-linked-task');
    fireEvent.click(panel.getByRole('button', { name: 'uiIdeaDetails:actions.restore' }));
    await waitFor(() => expect(window.electronAPI.updateIdeaStatus).toHaveBeenCalledWith('project-a', 'archived', 'converted'));
    await waitFor(() => expect(useIdeationStore.getState().session?.ideas[0].status).toBe('converted'));
    expect(useIdeationStore.getState().session?.ideas[0].taskId).toBe('001-linked-task');
    expect(panel.getByRole('button', { name: 'common:ideation.goToTask' })).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'common:ideation.convertToTask' })).not.toBeInTheDocument();
  });

  it('keeps failed dismissals open for retry and updates detail after a successful retry', async () => {
    vi.mocked(window.electronAPI.dismissIdea).mockResolvedValueOnce({ success: false, error: 'Cannot save idea' });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft idea' }));
    const panel = within(screen.getByRole('dialog', { name: 'Draft idea' }));
    fireEvent.click(panel.getByRole('button', { name: 'common:ideation.dismissIdea' }));
    expect(await panel.findByRole('alert')).toHaveTextContent('Cannot save idea');
    expect(useIdeationStore.getState().session?.ideas[0].status).toBe('draft');
    fireEvent.click(panel.getByRole('button', { name: 'common:ideation.dismissIdea' }));
    await waitFor(() => expect(useIdeationStore.getState().session?.ideas[0].status).toBe('dismissed'));
    expect(panel.getByRole('button', { name: 'uiIdeaDetails:actions.restore' })).toBeEnabled();
  });

  it('restores dismissed ideas after persistence and prevents duplicate pending requests', async () => {
    let resolveRestore!: (value: { success: boolean }) => void;
    vi.mocked(window.electronAPI.updateIdeaStatus).mockReturnValue(new Promise(resolve => { resolveRestore = resolve; }));
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'accessibility.showDismissedAriaLabel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismissed idea' }));
    const panel = within(screen.getByRole('dialog', { name: 'Dismissed idea' }));
    fireEvent.click(panel.getByRole('button', { name: 'uiIdeaDetails:actions.restore' }));
    fireEvent.click(panel.getByRole('button', { name: 'uiIdeaDetails:actions.restore' }));
    expect(window.electronAPI.updateIdeaStatus).toHaveBeenCalledExactlyOnceWith('project-a', 'dismissed', 'draft');
    expect(panel.getByRole('button', { name: 'uiIdeaDetails:actions.restore' })).toBeDisabled();
    expect(useIdeationStore.getState().session?.ideas[1].status).toBe('dismissed');
    await act(async () => resolveRestore({ success: true }));
    expect(useIdeationStore.getState().session?.ideas[1].status).toBe('draft');
    expect(panel.getByRole('button', { name: 'common:ideation.convertToTask' })).toBeEnabled();
  });

  it('changes an open detail to archived with task navigation when conversion succeeds', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Draft idea' }));
    const panel = within(screen.getByRole('dialog', { name: 'Draft idea' }));
    fireEvent.click(panel.getByRole('button', { name: 'common:ideation.convertToTask' }));
    await waitFor(() => expect(panel.getByRole('button', { name: 'common:ideation.goToTask' })).toBeInTheDocument());
    expect(useIdeationStore.getState().session?.ideas[0]).toMatchObject({ status: 'archived', taskId: '002-created-task' });
    expect(panel.queryByRole('button', { name: 'common:ideation.convertToTask' })).not.toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'common:ideation.dismissIdea' })).not.toBeInTheDocument();
  });
});
