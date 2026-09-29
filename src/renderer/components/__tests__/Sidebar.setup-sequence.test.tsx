/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../Sidebar';
import type { GitStatus } from '../../../shared/types';

const state = vi.hoisted(() => ({ selectedId: 'project-1', checkGitStatus: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('../../stores/project-store', () => ({
  useProjectStore: (selector: (value: object) => unknown) => selector({ projects: [{ id: 'project-1', path: '/project-1' }, { id: 'project-2', path: '/project-2' }], selectedProjectId: state.selectedId }),
  initializeProject: vi.fn(), removeProject: vi.fn(),
}));
vi.mock('../../stores/settings-store', () => ({ useSettingsStore: (selector: (value: object) => unknown) => selector({ settings: {} }), saveSettings: vi.fn() }));
vi.mock('../../stores/project-env-store', () => ({ useProjectEnvStore: (selector: (value: object) => unknown) => selector({ envConfig: null }), loadProjectEnvConfig: vi.fn(), clearProjectEnvConfig: vi.fn() }));
vi.mock('../AddProjectModal', () => ({ AddProjectModal: () => null }));
vi.mock('../RateLimitIndicator', () => ({ RateLimitIndicator: () => null }));
vi.mock('../UpdateBanner', () => ({ UpdateBanner: () => null }));
vi.mock('../GitSetupModal', () => ({ GitSetupModal: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => open ? <section role="dialog" aria-label="Git setup"><button type="button" onClick={() => onOpenChange(false)}>Skip Git setup</button></section> : null }));

const readyStatus: GitStatus = { isGitRepo: true, hasCommits: true, currentBranch: 'main' };
beforeEach(() => {
  vi.clearAllMocks();
  state.selectedId = 'project-1';
  state.checkGitStatus.mockResolvedValue({ success: true, data: readyStatus });
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { checkGitStatus: state.checkGitStatus } });
});

describe('project setup prerequisite sequencing', () => {
  it('shows a retry when checking Git fails and keeps initialization deferred', async () => {
    state.checkGitStatus.mockResolvedValueOnce({ success: false });
    const onGitSetupStateChange = vi.fn();
    render(<Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} onGitSetupStateChange={onGitSetupStateChange} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('onboarding:wizard.gitCheckFailed');
    expect(onGitSetupStateChange).toHaveBeenLastCalledWith('project-1', false);
    fireEvent.click(screen.getByRole('button', { name: 'onboarding:wizard.retryGitCheck' }));
    await waitFor(() => expect(onGitSetupStateChange).toHaveBeenLastCalledWith('project-1', true));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('reports pending until Git status resolves, allowing the parent to defer Forge initialization', async () => {
    let resolveCheck!: (result: { success: boolean; data: GitStatus }) => void;
    state.checkGitStatus.mockReturnValue(new Promise(resolve => { resolveCheck = resolve; }));
    const onGitSetupStateChange = vi.fn();
    render(<Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} onGitSetupStateChange={onGitSetupStateChange} />);
    expect(onGitSetupStateChange).toHaveBeenCalledExactlyOnceWith('project-1', false);
    await act(async () => resolveCheck({ success: true, data: readyStatus }));
    expect(onGitSetupStateChange).toHaveBeenLastCalledWith('project-1', true);
    expect(screen.queryByRole('dialog', { name: 'Git setup' })).not.toBeInTheDocument();
  });

  it.each([{ isGitRepo: false, hasCommits: false, currentBranch: null }, { isGitRepo: true, hasCommits: false, currentBranch: 'main' }])('keeps initialization deferred for a repository requiring Git setup', async gitStatus => {
    state.checkGitStatus.mockResolvedValue({ success: true, data: gitStatus });
    const onGitSetupStateChange = vi.fn();
    render(<Sidebar onSettingsClick={vi.fn()} onNewTaskClick={vi.fn()} onGitSetupStateChange={onGitSetupStateChange} />);
    expect(await screen.findByRole('dialog', { name: 'Git setup' })).toBeInTheDocument();
    expect(onGitSetupStateChange).toHaveBeenLastCalledWith('project-1', false);
    fireEvent.click(screen.getByRole('button', { name: 'Skip Git setup' }));
    expect(onGitSetupStateChange).toHaveBeenLastCalledWith('project-1', true);
    expect(screen.queryByRole('dialog', { name: 'Git setup' })).not.toBeInTheDocument();
  });

  it('waits for project selection/onboarding dialogs to close before showing pending Git setup', async () => {
    state.checkGitStatus.mockResolvedValue({ success: true, data: { ...readyStatus, hasCommits: false } });
    const onGitSetupStateChange = vi.fn();
    const props = { onSettingsClick: vi.fn(), onNewTaskClick: vi.fn(), onGitSetupStateChange };
    const { rerender } = render(<Sidebar {...props} isSetupBlocked />);
    await waitFor(() => expect(state.checkGitStatus).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: 'Git setup' })).not.toBeInTheDocument();
    expect(onGitSetupStateChange).toHaveBeenLastCalledWith('project-1', false);
    rerender(<Sidebar {...props} isSetupBlocked={false} />);
    expect(await screen.findByRole('dialog', { name: 'Git setup' })).toBeInTheDocument();
  });

  it('ignores a stale Git check when the user switches projects', async () => {
    let resolveFirst!: (result: { success: boolean; data: GitStatus }) => void;
    state.checkGitStatus.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    const onGitSetupStateChange = vi.fn();
    const props = { onSettingsClick: vi.fn(), onNewTaskClick: vi.fn(), onGitSetupStateChange };
    const { rerender } = render(<Sidebar {...props} />);
    state.selectedId = 'project-2';
    rerender(<Sidebar {...props} />);
    await waitFor(() => expect(onGitSetupStateChange).toHaveBeenLastCalledWith('project-2', true));
    await act(async () => resolveFirst({ success: true, data: { ...readyStatus, hasCommits: false } }));
    expect(screen.queryByRole('dialog', { name: 'Git setup' })).not.toBeInTheDocument();
    expect(onGitSetupStateChange).toHaveBeenLastCalledWith('project-2', true);
  });
});
