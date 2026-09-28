/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProjectEnvConfig } from '../../../../shared/types';
import { useProjectSettings } from './useProjectSettings';

const stores = vi.hoisted(() => ({ updateProjectSettings: vi.fn() }));
vi.mock('../../../stores/project-store', () => ({
  updateProjectSettings: stores.updateProjectSettings,
  checkProjectVersion: vi.fn(), initializeProject: vi.fn(),
}));
vi.mock('../../../stores/github', () => ({ checkGitHubConnection: vi.fn() }));
vi.mock('../../../stores/project-env-store', () => ({ setProjectEnvConfig: vi.fn() }));

const project: Project = {
  id: 'resume-project', name: 'resume', path: '/fixtures/resume', autoBuildPath: '', createdAt: new Date('2026-09-28T00:00:00Z'), updatedAt: new Date('2026-09-28T00:00:00Z'),
  settings: { model: 'model-from-project', memoryBackend: 'file', linearSync: false, notifications: { onTaskComplete: false, onTaskFailed: true, onReviewNeeded: true, sound: false } },
};

beforeEach(() => {
  vi.clearAllMocks(); stores.updateProjectSettings.mockResolvedValue(true);
  window.electronAPI.updateProjectEnv = vi.fn().mockResolvedValue({ success: true });
  window.electronAPI.saveSettings = vi.fn().mockResolvedValue({ success: true });
});
afterEach(cleanup);

describe('Project settings persistence boundary', () => {
  it('persists the explicit project and its draft without saving app settings', async () => {
    const close = vi.fn();
    const { result } = renderHook(() => useProjectSettings(project, true));
    act(() => result.current.setSettings({ ...project.settings, model: 'edited-project-model' }));
    await act(async () => { await result.current.handleSave(close); });
    expect(stores.updateProjectSettings).toHaveBeenCalledWith('resume-project', expect.objectContaining({ model: 'edited-project-model' }));
    expect(window.electronAPI.saveSettings).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not close when saving project metadata fails', async () => {
    stores.updateProjectSettings.mockResolvedValue(false);
    const close = vi.fn();
    const { result } = renderHook(() => useProjectSettings(project, true));
    await act(async () => { await result.current.handleSave(close); });
    expect(close).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
    expect(window.electronAPI.updateProjectEnv).not.toHaveBeenCalled();
    expect(window.electronAPI.saveSettings).not.toHaveBeenCalled();
  });

  it('saves environment configuration to the same project and keeps its failure visible', async () => {
    window.electronAPI.updateProjectEnv = vi.fn().mockResolvedValue({ success: false, error: 'Project environment is not writable' });
    const close = vi.fn();
    const { result } = renderHook(() => useProjectSettings(project, true));
    const env = { linearEnabled: false, githubEnabled: false, gitlabEnabled: false } as ProjectEnvConfig;
    act(() => result.current.setEnvConfig(env));
    await act(async () => { await result.current.handleSave(close); });
    expect(window.electronAPI.updateProjectEnv).toHaveBeenCalledWith('resume-project', env);
    expect(result.current.error).toBe('Project environment is not writable');
    expect(close).not.toHaveBeenCalled();
    expect(window.electronAPI.saveSettings).not.toHaveBeenCalled();
  });
});
