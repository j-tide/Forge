/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiProviderModelSelect } from './MultiProviderModelSelect';
import type { ProviderAccount } from '@shared/types/provider-account';

const store = vi.hoisted(() => ({
  settings: { globalPriorityOrder: [] as string[] },
  providerAccounts: [] as ProviderAccount[],
}));

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) => selector(store),
}));
beforeEach(() => {
  store.providerAccounts = [];
  store.settings.globalPriorityOrder = [];
  window.electronAPI.listOllamaModels = vi.fn().mockResolvedValue({ success: true, data: { models: [] } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Multi-provider model picker overlay', () => {
  it('escapes clipped settings content, selects a model once, and restores keyboard focus', async () => {
    const onChange = vi.fn();
    render(<div data-testid="settings-scroll" style={{ overflow: 'hidden', height: 48 }}>
      <MultiProviderModelSelect value="sonnet" onChange={onChange} filterProvider="anthropic" />
    </div>);
    const trigger = screen.getByRole('button', { name: /Sonnet/ });
    trigger.focus();
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText('Search models...');
    expect(screen.getByTestId('settings-scroll').contains(search)).toBe(false);
    fireEvent.change(search, { target: { value: 'Opus' } });
    const option = screen.getByText('Claude Opus 4.6', { exact: true }).closest('button');
    if (!option) throw new Error('Model option button missing');
    fireEvent.click(option);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('opus', 'anthropic');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes with Escape and retains custom model input behavior', async () => {
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="sonnet" onChange={onChange} filterProvider="anthropic" />);
    const trigger = screen.getByRole('button', { name: /Sonnet/ });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByPlaceholderText('Search models...');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByPlaceholderText('Search models...')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger);
    const custom = await screen.findByPlaceholderText('Enter model ID...');
    fireEvent.change(custom, { target: { value: '  custom-ui-fixture  ' } });
    fireEvent.keyDown(custom, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('custom-ui-fixture', 'anthropic');
  });

  it('moves through available model results with the keyboard without submitting a model', async () => {
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="sonnet" onChange={onChange} filterProvider="anthropic" />);
    fireEvent.click(screen.getByRole('button', { name: /Sonnet/ }));
    const search = await screen.findByPlaceholderText('Search models...');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const first = document.activeElement as HTMLElement;
    expect(first.hasAttribute('data-model-option')).toBe(true);
    fireEvent.keyDown(first, { key: 'End' });
    const last = document.activeElement;
    expect(last).not.toBe(first);
    if (!last) throw new Error('Focused model option missing');
    fireEvent.keyDown(last, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('loads the saved Ollama endpoint and returns its provider for dynamic models', async () => {
    store.providerAccounts = [{ id: 'remote', provider: 'ollama', name: 'Remote Ollama', authType: 'api-key', billingModel: 'pay-per-use', baseUrl: 'http://ollama.example:11434', createdAt: 1, updatedAt: 1 }];
    window.electronAPI.listOllamaModels = vi.fn().mockResolvedValue({ success: true, data: { models: [{ name: 'fixture-local:latest', is_embedding: false, size_bytes: 2e9, size_gb: 2 }] } });
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="opus" onChange={onChange} currentProvider="anthropic" />);
    await waitFor(() => expect(window.electronAPI.listOllamaModels).toHaveBeenCalledWith('http://ollama.example:11434'));
    fireEvent.click(screen.getByRole('button', { name: /Opus/ }));
    fireEvent.click(await screen.findByRole('button', { name: /fixture-local:latest/ }));
    expect(onChange).toHaveBeenCalledWith('fixture-local:latest', 'ollama');
  });

  it('returns the custom endpoint provider for catalog and manually entered models', async () => {
    store.providerAccounts = [{ id: 'custom', provider: 'openai-compatible', name: 'Fixture endpoint', authType: 'api-key', apiKey: 'fixture-key', billingModel: 'pay-per-use', customModels: [{ id: 'private-model', label: 'Private model' }], createdAt: 1, updatedAt: 1 }];
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="opus" onChange={onChange} currentProvider="anthropic" />);
    fireEvent.click(screen.getByRole('button', { name: /Opus/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Private model/ }));
    expect(onChange).toHaveBeenCalledWith('private-model', 'openai-compatible');
    fireEvent.click(screen.getByRole('button', { name: /Opus/ }));
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'openai-compatible' } });
    const custom = screen.getByPlaceholderText('Enter model ID...');
    fireEvent.change(custom, { target: { value: 'manual-private-model' } });
    fireEvent.keyDown(custom, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('manual-private-model', 'openai-compatible');
  });

  it('opens above a field near the window footer while retaining model and custom selection', async () => {
    store.providerAccounts = [{ id: 'claude', provider: 'anthropic', name: 'Fixture Claude', authType: 'oauth', billingModel: 'subscription', createdAt: 1, updatedAt: 1 }];
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="opus" onChange={onChange} currentProvider="anthropic" />);
    const trigger = screen.getByRole('button', { name: /Opus/ });
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(1000);
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ x: 493, y: 761, top: 761, bottom: 797, left: 493, right: 784, width: 291, height: 36, toJSON: () => ({}) });
    trigger.focus();
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText('Search models...');
    const dialog = search.closest('[role="dialog"]');
    expect(dialog?.getAttribute('data-side')).toBe('top');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const first = document.activeElement as HTMLElement;
    expect(first.hasAttribute('data-model-option')).toBe(true);
    fireEvent.click(first);
    expect(onChange).toHaveBeenCalledWith('opus', 'anthropic');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger);
    const custom = await screen.findByPlaceholderText('Enter model ID...');
    fireEvent.change(custom, { target: { value: 'footer-custom-model' } });
    fireEvent.keyDown(custom, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('footer-custom-model', 'anthropic');
  });

  it('uses the displayed configured provider when the current model provider has no account', async () => {
    store.providerAccounts = [{ id: 'zai', provider: 'zai', name: 'Fixture ZAI', authType: 'api-key', apiKey: 'fixture-key', billingModel: 'pay-per-use', createdAt: 1, updatedAt: 1 }];
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="opus" onChange={onChange} currentProvider="anthropic" />);
    fireEvent.click(screen.getByRole('button', { name: /Opus/ }));
    const provider = await screen.findByRole('combobox', { name: 'Custom model provider' }) as HTMLSelectElement;
    expect(provider.value).toBe('zai');
    expect(provider.options[provider.selectedIndex].text).toBe('Z.AI');
    expect(Array.from(provider.options).some((option) => option.value === 'anthropic')).toBe(false);
    fireEvent.change(screen.getByPlaceholderText('Enter model ID...'), { target: { value: 'zai-private-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onChange).toHaveBeenCalledWith('zai-private-model', 'zai');
  });

  it('disables unfiltered custom submission with no configured provider, including Enter', async () => {
    const onChange = vi.fn();
    render(<MultiProviderModelSelect value="opus" onChange={onChange} currentProvider="anthropic" />);
    fireEvent.click(screen.getByRole('button', { name: /Opus/ }));
    const provider = await screen.findByRole('combobox', { name: 'Custom model provider' }) as HTMLSelectElement;
    expect(provider.disabled).toBe(true);
    const custom = screen.getByPlaceholderText('Enter model ID...');
    fireEvent.change(custom, { target: { value: 'no-provider-model' } });
    expect((screen.getByRole('button', { name: 'Use' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(custom, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
