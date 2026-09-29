/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AppSettingsPage } from '../AppSettings';

const form = vi.hoisted(() => ({
  settings: {}, setSettings: vi.fn(), isSaving: false, error: null as string | null,
  saveSettings: vi.fn(), revertTheme: vi.fn(), commitTheme: vi.fn(),
}));
vi.mock('../hooks/useSettings', () => ({ useSettings: () => form }));
vi.mock('../ThemeSettings', () => ({ ThemeSettings: () => <div>Appearance controls</div> }));
vi.mock('../GeneralSettings', () => ({ GeneralSettings: () => <div>General controls</div> }));
vi.mock('../AccountSettings', () => ({ AccountSettings: () => <div>Account controls</div> }));
vi.mock('../ProjectSettingsContent', () => ({ ProjectSettingsContent: () => <div>Project controls</div> }));
vi.mock('../../../stores/project-store', () => ({
  useProjectStore: (selector: (state: object) => unknown) => selector({ projects: [], selectedProjectId: null, selectProject: vi.fn() }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
  vi.clearAllMocks();
  form.error = null;
  form.saveSettings.mockResolvedValue(true);
  window.electronAPI.getAppVersion = vi.fn().mockResolvedValue('0.1.0-preview.4');
});
afterEach(cleanup);

describe('Settings as an application page', () => {
  it('renders inside its parent without a modal or portal and navigates sections', () => {
    const { container } = render(<AppSettingsPage onClose={vi.fn()} />);
    expect(container.querySelector('[aria-labelledby="settings-page-title"]')).toBeTruthy();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'appTitle' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'projectSections.general.title' })).not.toBeInTheDocument();
    expect(screen.queryByText('Project controls')).not.toBeInTheDocument();
    expect(container).toContainElement(screen.getByText('Appearance controls'));
    fireEvent.click(screen.getByRole('button', { name: /sections.accounts.title/ }));
    expect(screen.getByText('Account controls')).toBeInTheDocument();
  });

  it('reverts unsaved appearance previews when navigation leaves the page', () => {
    const { unmount } = render(<AppSettingsPage onClose={vi.fn()} />);
    unmount();
    expect(form.revertTheme).toHaveBeenCalledTimes(1);
  });

  it('commits a successful save before returning to the previous view', async () => {
    const close = vi.fn();
    render(<AppSettingsPage onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(form.commitTheme).toHaveBeenCalledTimes(1);
    expect(form.commitTheme.mock.invocationCallOrder[0]).toBeLessThan(close.mock.invocationCallOrder[0]);
  });

  it('keeps the page and draft open when saving fails', async () => {
    form.saveSettings.mockResolvedValue(false);
    form.error = 'Save failed';
    const close = vi.fn();
    render(<AppSettingsPage onClose={close} initialSection="accounts" />);
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
    await waitFor(() => expect(form.saveSettings).toHaveBeenCalledTimes(1));
    expect(close).not.toHaveBeenCalled();
    expect(form.commitTheme).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByText('Account controls')).toBeInTheDocument();
  });
});
