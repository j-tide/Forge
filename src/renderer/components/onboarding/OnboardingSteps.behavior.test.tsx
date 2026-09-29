/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DevToolsStep } from './DevToolsStep';
import { MemoryStep } from './MemoryStep';
import { PrivacyStep } from './PrivacyStep';
import type { AppSettings } from '../../../shared/types';

const mocks = vi.hoisted(() => ({ settings: {} as Partial<AppSettings>, updateSettings: vi.fn(), saveSettings: vi.fn(), detectTools: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('../../stores/settings-store', () => ({ useSettingsStore: () => ({ settings: mocks.settings, updateSettings: mocks.updateSettings }) }));
vi.mock('../../lib/sentry', () => ({ notifySentryStateChanged: vi.fn() }));
vi.mock('./OllamaModelSelector', () => ({ OllamaModelSelector: () => <div>Ollama model selector</div> }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings = {};
  mocks.saveSettings.mockResolvedValue({ success: true });
  mocks.detectTools.mockResolvedValue({ success: true, data: { ides: [], terminals: [], clis: [] } });
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { saveSettings: mocks.saveSettings, worktreeDetectTools: mocks.detectTools } });
});

describe('developer tools setup', () => {
  it('exposes detection errors and retries without discarding selections', async () => {
    mocks.detectTools.mockResolvedValueOnce({ success: false });
    render(<DevToolsStep onNext={vi.fn()} onBack={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('devtools.detectionFailed');
    expect(screen.getByRole('combobox', { name: 'devtools.ide.label' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'devtools.terminal.label' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'devtools.cli.label' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'devtools.detectAgain' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mocks.detectTools).toHaveBeenCalledTimes(2);
  });

  it.each(['IDE', 'Terminal', 'CLI'])('requires the selected custom %s path before saving', async tool => {
    mocks.settings = { [`preferred${tool}`]: 'custom' };
    render(<DevToolsStep onNext={vi.fn()} onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'devtools.saveAndContinue' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'devtools.saveAndContinue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('devtools.customPathRequired');
    expect(mocks.saveSettings).not.toHaveBeenCalled();
  });

  it('locks navigation and fields until its save completes', async () => {
    let resolveSave!: (value: { success: boolean }) => void;
    mocks.saveSettings.mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));
    const onNext = vi.fn();
    render(<DevToolsStep onNext={onNext} onBack={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'devtools.saveAndContinue' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'devtools.saveAndContinue' }));
    expect(screen.getByRole('button', { name: 'common:buttons.back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'devtools.detectAgain' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'devtools.ide.label' })).toBeDisabled();
    expect(onNext).not.toHaveBeenCalled();
    await act(async () => resolveSave({ success: true }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe('memory setup', () => {
  it('preserves a saved disabled preference when re-running the wizard', async () => {
    mocks.settings = { memoryEnabled: false, memoryEmbeddingProvider: 'voyage', memoryVoyageApiKey: 'saved-voyage-key', memoryVoyageEmbeddingModel: 'voyage-saved' };
    render(<MemoryStep onNext={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'memory.enableMemory' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'memory.saveAndContinue' }));
    await waitFor(() => expect(mocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ memoryEnabled: false, memoryEmbeddingProvider: 'voyage', memoryVoyageApiKey: 'saved-voyage-key', memoryVoyageEmbeddingModel: 'voyage-saved' })));
  });

  it('keeps Azure settings and disables credential editing during save', async () => {
    mocks.settings = { memoryEnabled: true, memoryEmbeddingProvider: 'azure_openai', memoryAzureApiKey: 'saved-azure-key', memoryAzureBaseUrl: 'https://azure.example', memoryAzureEmbeddingDeployment: 'embedding' };
    let resolveSave!: (value: { success: boolean }) => void;
    mocks.saveSettings.mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));
    const onNext = vi.fn();
    render(<MemoryStep onNext={onNext} onBack={vi.fn()} />);
    expect(screen.getByLabelText('memory.azureApiKey')).toHaveValue('saved-azure-key');
    expect(screen.getByLabelText('memory.azureBaseUrl')).toHaveValue('https://azure.example');
    expect(screen.getByLabelText('memory.azureEmbeddingDeployment')).toHaveValue('embedding');
    fireEvent.click(screen.getByRole('button', { name: 'memory.saveAndContinue' }));
    expect(screen.getByLabelText('memory.azureApiKey')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'showPassword' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'memory.back' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'memory.skip' })).toBeDisabled();
    await act(async () => resolveSave({ success: true }));
    expect(mocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ memoryAzureApiKey: 'saved-azure-key', memoryAzureBaseUrl: 'https://azure.example', memoryAzureEmbeddingDeployment: 'embedding' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});

describe('privacy setup', () => {
  it('locks the toggle and navigation during save, retaining the step on failure', async () => {
    let resolveSave!: (value: { success: boolean }) => void;
    mocks.saveSettings.mockReturnValue(new Promise(resolve => { resolveSave = resolve; }));
    const onNext = vi.fn();
    render(<PrivacyStep onNext={onNext} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'common:buttons.continue' }));
    expect(screen.getByRole('switch', { name: 'onboarding:privacy.toggle.label' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'common:buttons.back' })).toBeDisabled();
    await act(async () => resolveSave({ success: false }));
    expect(screen.getByRole('alert')).toHaveTextContent('uiShellOnboarding:privacySaveFailed');
    expect(onNext).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'onboarding:privacy.toggle.label' })).toBeEnabled();
  });
});
