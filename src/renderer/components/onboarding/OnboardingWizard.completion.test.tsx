/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OnboardingWizard } from './OnboardingWizard';

const { saveSettings, updateSettings } = vi.hoisted(() => ({ saveSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../stores/settings-store', () => ({ useSettingsStore: () => ({ updateSettings }) }));
vi.mock('./WelcomeStep', () => ({ WelcomeStep: ({ onGetStarted, onSkip }: { onGetStarted: () => void; onSkip: () => void }) => <><button type="button" onClick={onGetStarted}>Start</button><button type="button" onClick={onSkip}>Skip setup</button></> }));
vi.mock('./AccountsStep', () => ({ AccountsStep: ({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) => <><button type="button" onClick={onNext}>Next</button><button type="button" onClick={onSkip}>Skip accounts</button></> }));
vi.mock('./DevToolsStep', () => ({ DevToolsStep: ({ onNext, onSavingChange }: { onNext: () => void; onSavingChange?: (saving: boolean) => void }) => <><button type="button" onClick={onNext}>Next</button><button type="button" onClick={() => onSavingChange?.(true)}>Save step pending</button></> }));
vi.mock('./PrivacyStep', () => ({ PrivacyStep: ({ onNext }: { onNext: () => void }) => <button type="button" onClick={onNext}>Next</button> }));
vi.mock('./MemoryStep', () => ({ MemoryStep: ({ onNext }: { onNext: () => void }) => <button type="button" onClick={onNext}>Next</button> }));

function showCompletion(props: { onOpenChange: (open: boolean) => void; onOpenTaskCreator?: () => void; onOpenSettings?: () => void }) {
  const rendered = render(<OnboardingWizard open {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  for (let index = 0; index < 4; index++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  saveSettings.mockResolvedValue({ success: true });
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { saveSettings, openExternal: vi.fn().mockResolvedValue(undefined) } });
});

describe('onboarding completion persistence', () => {
  it.each([
    ['completion.finish', 'finish'],
    ['completion.createTask.action', 'task'],
    ['completion.customizeSettings.action', 'settings']
  ])('saves before following %s and resets the wizard', async (label, action) => {
    let resolveSave!: (value: { success: boolean }) => void;
    saveSettings.mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));
    const onOpenChange = vi.fn();
    const onOpenTaskCreator = vi.fn();
    const onOpenSettings = vi.fn();
    const { rerender } = showCompletion({ onOpenChange, onOpenTaskCreator, onOpenSettings });
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(saveSettings).toHaveBeenCalledExactlyOnceWith({ onboardingCompleted: true });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onOpenTaskCreator).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'completion.finish' })).toBeDisabled();
    await act(async () => resolveSave({ success: true }));
    expect(updateSettings).toHaveBeenCalledWith({ onboardingCompleted: true });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onOpenTaskCreator).toHaveBeenCalledTimes(action === 'task' ? 1 : 0);
    expect(onOpenSettings).toHaveBeenCalledTimes(action === 'settings' ? 1 : 0);
    rerender(<OnboardingWizard open onOpenChange={onOpenChange} />);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it.each(['task', 'settings'])('retains completion and retries the requested %s action after a failed save', async action => {
    saveSettings.mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
    const onOpenChange = vi.fn();
    const onOpenTaskCreator = vi.fn();
    const onOpenSettings = vi.fn();
    showCompletion({ onOpenChange, onOpenTaskCreator, onOpenSettings });
    fireEvent.click(screen.getByRole('button', { name: action === 'task' ? 'completion.createTask.action' : 'completion.customizeSettings.action' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('wizard.completionSaveFailed');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(onOpenTaskCreator).not.toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'completion.finish' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'wizard.retry' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onOpenTaskCreator).toHaveBeenCalledTimes(action === 'task' ? 1 : 0);
    expect(onOpenSettings).toHaveBeenCalledTimes(action === 'settings' ? 1 : 0);
  });

  it('keeps the welcome step open when saving completion throws', async () => {
    saveSettings.mockRejectedValueOnce(new Error('unavailable'));
    const onOpenChange = vi.fn();
    render(<OnboardingWizard open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('wizard.completionSaveFailed');
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('does not duplicate a pending save when the close control is clicked', async () => {
    saveSettings.mockReturnValue(new Promise(() => { /* Intentionally pending to verify the close guard. */ }));
    render(<OnboardingWizard open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(saveSettings).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss the wizard while the current step is saving', () => {
    const onOpenChange = vi.fn();
    render(<OnboardingWizard open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save step pending' }));
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('opens real documentation without completing setup', async () => {
    const onOpenChange = vi.fn();
    showCompletion({ onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: 'completion.exploreDocs.action' }));
    await waitFor(() => expect(window.electronAPI.openExternal).toHaveBeenCalledWith('https://github.com/j-tide/Forge#readme'));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });
});
