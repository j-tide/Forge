/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@shared/types';
import { CrossProviderTabContent } from './CrossProviderTabContent';
import { MixedPhaseEditor } from './MixedPhaseEditor';
import { MixedFeatureEditor } from './MixedFeatureEditor';

const store = vi.hoisted(() => ({ settings: { customMixedProfileActive: false } as Partial<AppSettings>, saveSettings: vi.fn() }));
vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) => selector(store),
  saveSettings: store.saveSettings,
}));
vi.mock('./MultiProviderModelSelect', () => ({
  MultiProviderModelSelect: ({ onChange }: { onChange: (model: string, provider: string) => void }) => <div>
    <button type="button" onClick={() => onChange('dynamic-model:latest', 'ollama')}>Pick dynamic Ollama</button>
    <button type="button" onClick={() => onChange('private-model', 'openai-compatible')}>Pick custom endpoint</button>
  </div>,
}));
vi.mock('./ThinkingLevelSelect', () => ({ ThinkingLevelSelect: () => <span>Thinking selector</span> }));
beforeEach(() => {
  store.settings = { customMixedProfileActive: false };
  store.saveSettings.mockResolvedValue(true);
});
afterEach(cleanup);

describe('Cross-provider configuration', () => {
  it('does not activate cross-provider execution by visiting the tab', () => {
    render(<CrossProviderTabContent />);
    expect(store.saveSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('activates only on the explicit labeled switch', async () => {
    render(<CrossProviderTabContent />);
    fireEvent.click(screen.getByRole('switch', { name: 'Use this configuration for new tasks' }));
    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledWith({ customMixedProfileActive: true }));
  });

  it('reports persistence failure without showing the switch as enabled', async () => {
    store.saveSettings.mockResolvedValue(false);
    render(<CrossProviderTabContent />);
    fireEvent.click(screen.getByRole('switch'));
    await screen.findByRole('alert');
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('persists the selected dynamic provider for pipeline phases', async () => {
    render(<MixedPhaseEditor />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Pick dynamic Ollama' })[0]);
    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      customMixedPhaseConfig: expect.objectContaining({ spec: expect.objectContaining({ modelId: 'dynamic-model:latest', provider: 'ollama' }) }),
    })));
  });

  it('persists the selected custom endpoint provider for features', async () => {
    render(<MixedFeatureEditor />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Pick custom endpoint' })[0]);
    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      customMixedFeatureConfig: expect.objectContaining({ insights: expect.objectContaining({ modelId: 'private-model', provider: 'openai-compatible' }) }),
    })));
  });

  it('includes AI naming in editable cross-provider features', async () => {
    render(<MixedFeatureEditor />);
    expect(screen.getByText('AI Naming')).toBeTruthy();
    const modelButtons = screen.getAllByRole('button', { name: 'Pick custom endpoint' });
    fireEvent.click(modelButtons[6]);
    await waitFor(() => expect(store.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      customMixedFeatureConfig: expect.objectContaining({ naming: expect.objectContaining({ modelId: 'private-model', provider: 'openai-compatible' }) }),
    })));
  });
});
