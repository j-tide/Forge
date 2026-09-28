/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ProjectSettingsPage } from '../ProjectSettingsPage';
import type { Project } from '../../../../shared/types';
import en from '../../../../shared/i18n/locales/en/settings.json';
import zh from '../../../../shared/i18n/locales/zh-CN/settings.json';
import fr from '../../../../shared/i18n/locales/fr/settings.json';

const state = vi.hoisted(() => ({
  saveAppSettings: vi.fn(),
  saveProjectSettings: vi.fn(),
  error: null as string | null,
  envError: null as string | null,
}));
vi.mock('../GeneralSettings', () => ({ GeneralSettings: () => <div>App controls</div> }));
vi.mock('../ThemeSettings', () => ({ ThemeSettings: () => <div>Appearance controls</div> }));
vi.mock('../AccountSettings', () => ({ AccountSettings: () => <div>Account controls</div> }));
vi.mock('../hooks/useSettings', () => ({ useSettings: () => ({
  settings: {}, setSettings: vi.fn(), isSaving: false, error: null,
  saveSettings: state.saveAppSettings, revertTheme: vi.fn(), commitTheme: vi.fn(),
}) }));
vi.mock('../ProjectSettingsContent', async () => {
  const { useEffect } = await import('react');
  return { ProjectSettingsContent: ({ project, activeSection, onHookReady }: {
    project: Project; activeSection: string; onHookReady: (hook: unknown) => void;
  }) => {
    useEffect(() => { onHookReady({
      handleSave: state.saveProjectSettings,
      get error() { return state.error; },
      get envError() { return state.envError; },
    }); return () => onHookReady(null); }, [onHookReady]);
    return <div>Project {project.id}: {activeSection}</div>;
  } };
});
vi.mock('../../../stores/project-store', () => ({
  useProjectStore: (selector: (value: object) => unknown) => selector({
    projects: [{ id: 'project-resume', name: 'resume', path: '/projects/resume', settings: {} }],
    selectedProjectId: 'project-resume', selectProject: vi.fn(),
  }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const project = { id: 'project-resume', name: 'resume', path: '/projects/resume', settings: {} } as Project;
beforeEach(() => {
  vi.clearAllMocks(); state.error = null; state.envError = null;
  state.saveAppSettings.mockResolvedValue(true);
  state.saveProjectSettings.mockImplementation(async (close: () => void) => close());
  window.electronAPI.getAppVersion = vi.fn().mockResolvedValue('0.1.0-preview.4');
});
afterEach(cleanup);

describe('Project settings scope', () => {

  it('does not offer Cancel or redundant Save for immediate-only Linear settings', () => {
    const close = vi.fn();
    render(<ProjectSettingsPage project={project} onClose={close} initialSection="linear" />);
    expect(screen.getByText('projectSettings.integrationAutoSave')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common:buttons.cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'projectSettings.save' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'common:buttons.back' })[1]);
    expect(close).toHaveBeenCalledOnce();
    expect(state.saveProjectSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['github', 'gitlab', 'memory'] as const)('explains mixed persistence and retains required project Save for %s', (section) => {
    render(<ProjectSettingsPage project={project} onClose={vi.fn()} initialSection={section} />);
    expect(screen.getByText('projectSettings.integrationMixedSave')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common:buttons.cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'projectSettings.save' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'common:buttons.back' })).toHaveLength(2);
  });

  it('keeps the General draft cancel/save actions separate from immediate-save integration notices', () => {
    render(<ProjectSettingsPage project={project} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'common:buttons.cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'projectSettings.save' })).toBeInTheDocument();
    expect(screen.queryByText('projectSettings.integrationAutoSave')).not.toBeInTheDocument();
    expect(screen.queryByText('projectSettings.integrationMixedSave')).not.toBeInTheDocument();
  });

  it.each([['en', en], ['zh-CN', zh], ['fr', fr]] as const)('has explicit persistence guidance in %s', (_locale, copy) => {
    expect(copy.projectSettings.integrationAutoSave).toBeTruthy();
    expect(copy.projectSettings.integrationMixedSave).toBeTruthy();
    expect(copy.projectSettings.integrationAutoSave).not.toMatch(/projectSettings\./);
    expect(copy.projectSettings.integrationMixedSave).not.toMatch(/projectSettings\./);
  });

  it('shows only project settings when entered from a project tab', () => {
    render(<ProjectSettingsPage project={project} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'sections.appearance.title' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'projectSettings.title' })).toBeInTheDocument();
    expect(screen.getByText('resume')).toBeInTheDocument();
    expect(screen.getByText('Project project-resume: general')).toBeInTheDocument();
  });

  it('saves only the selected project, never the application settings', async () => {
    const close = vi.fn();
    render(<ProjectSettingsPage project={project} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'projectSettings.save' }));
    await waitFor(() => expect(state.saveProjectSettings).toHaveBeenCalledOnce());
    expect(state.saveAppSettings).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it('opens the requested project section and follows project-only navigation', () => {
    const { rerender } = render(<ProjectSettingsPage project={project} onClose={vi.fn()} initialSection="github" />);
    expect(screen.getByText('Project project-resume: github')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'projectSections.memory.title' }));
    expect(screen.getByText('Project project-resume: memory')).toBeInTheDocument();
    rerender(<ProjectSettingsPage project={project} onClose={vi.fn()} initialSection="gitlab" />);
    expect(screen.getByText('Project project-resume: gitlab')).toBeInTheDocument();
    expect(screen.queryByText('sections.accounts.title')).not.toBeInTheDocument();
  });

  it('keeps the project draft open on a persistence error', async () => {
    state.saveProjectSettings.mockImplementationOnce(async () => { state.error = 'Project save failed'; });
    const close = vi.fn();
    render(<ProjectSettingsPage project={project} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'projectSettings.save' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Project save failed'));
    expect(close).not.toHaveBeenCalled();
    expect(state.saveAppSettings).not.toHaveBeenCalled();
  });

  it('shows a thrown save failure and prevents duplicate saves while pending', async () => {
    let reject: (error: Error) => void = vi.fn();
    state.saveProjectSettings.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const close = vi.fn();
    render(<ProjectSettingsPage project={project} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'projectSettings.save' }));
    expect(screen.getByRole('button', { name: 'common:buttons.saving' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'common:buttons.back' })).toBeDisabled();
    reject(new Error('Storage unavailable'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Storage unavailable'));
    expect(close).not.toHaveBeenCalled();
    expect(state.saveProjectSettings).toHaveBeenCalledOnce();
  });

  it('moves focus to project settings and restores the opener on return', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Project settings opener';
    document.body.append(opener); opener.focus();
    const { unmount } = render(<ProjectSettingsPage project={project} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'projectSettings.title' })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('returns to the workspace without saving when Cancel is clicked', () => {
    const close = vi.fn();
    render(<ProjectSettingsPage project={project} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'common:buttons.cancel' }));
    expect(close).toHaveBeenCalledOnce();
    expect(state.saveProjectSettings).not.toHaveBeenCalled();
    expect(state.saveAppSettings).not.toHaveBeenCalled();
  });
});
