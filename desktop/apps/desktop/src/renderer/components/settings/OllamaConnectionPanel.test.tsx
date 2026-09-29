/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAccount } from '@shared/types/provider-account';
import { StrictMode } from 'react';
import { OllamaConnectionPanel } from './OllamaConnectionPanel';

const actions = vi.hoisted(() => ({ addProviderAccount: vi.fn(), updateProviderAccount: vi.fn() }));
vi.mock('../../stores/settings-store', () => ({ useSettingsStore: (selector: (state: unknown) => unknown) => selector(actions) }));
const account: ProviderAccount = { id: 'saved', provider: 'ollama', name: 'Saved Ollama', authType: 'api-key', billingModel: 'pay-per-use', baseUrl: 'http://saved.example:11434', createdAt: 1, updatedAt: 1 };

beforeEach(() => {
  window.electronAPI.checkOllamaInstalled = vi.fn().mockResolvedValue({ success: true, data: { installed: false } });
  window.electronAPI.checkOllamaStatus = vi.fn().mockResolvedValue({ success: true, data: { running: false } });
  window.electronAPI.listOllamaModels = vi.fn().mockResolvedValue({ success: true, data: { models: [] } });
  actions.addProviderAccount.mockResolvedValue({ success: true, data: account });
  actions.updateProviderAccount.mockResolvedValue({ success: true, data: account });
});
afterEach(cleanup);

describe('Ollama connection settings', () => {
  it('keeps an editable URL and explicit test action available without a local installation', async () => {
    render(<OllamaConnectionPanel accounts={[]} />);
    await screen.findByText('Ollama Not Installed');
    const url = screen.getByLabelText('Custom URL');
    fireEvent.change(url, { target: { value: 'http://remote.example:11434' } });
    expect(window.electronAPI.checkOllamaStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Custom URL')).toBe(url);
    window.electronAPI.checkOllamaStatus = vi.fn().mockResolvedValue({ success: true, data: { running: true } });
    fireEvent.submit(url.closest('form') as HTMLFormElement);
    await screen.findByText('Connected');
    expect(window.electronAPI.checkOllamaStatus).toHaveBeenCalledWith('http://remote.example:11434');
    expect(window.electronAPI.checkOllamaInstalled).toHaveBeenCalledTimes(1);
    expect(actions.addProviderAccount).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'http://remote.example:11434', provider: 'ollama' }));
  });

  it('uses a saved endpoint immediately and saves a successfully tested replacement', async () => {
    window.electronAPI.checkOllamaStatus = vi.fn().mockResolvedValue({ success: true, data: { running: true } });
    render(<OllamaConnectionPanel accounts={[account]} />);
    await screen.findByText('Connected');
    expect(window.electronAPI.checkOllamaStatus).toHaveBeenCalledWith(account.baseUrl);
    expect(window.electronAPI.listOllamaModels).toHaveBeenCalledWith(account.baseUrl);
    expect(window.electronAPI.checkOllamaInstalled).not.toHaveBeenCalled();
    expect(actions.updateProviderAccount).not.toHaveBeenCalled();
    const url = screen.getByLabelText('Custom URL');
    fireEvent.change(url, { target: { value: '  http://replacement.example:11434/  ' } });
    fireEvent.submit(url.closest('form') as HTMLFormElement);
    await waitFor(() => expect(actions.updateProviderAccount).toHaveBeenCalledWith('saved', { baseUrl: 'http://replacement.example:11434' }));
  });

  it('does not report a stale pending result or save it after the URL is edited', async () => {
    let resolveStatus: (value: unknown) => void = () => { throw new Error('Pending fixture not initialized'); };
    window.electronAPI.checkOllamaStatus = vi.fn().mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    render(<OllamaConnectionPanel accounts={[]} />);
    const url = screen.getByLabelText('Custom URL');
    fireEvent.change(url, { target: { value: 'http://new.example:11434' } });
    await act(async () => resolveStatus({ success: true, data: { running: true } }));
    expect(screen.queryByText('Connected')).toBeNull();
    expect(actions.addProviderAccount).not.toHaveBeenCalled();
    expect(window.electronAPI.listOllamaModels).not.toHaveBeenCalled();
  });

  it('rejects invalid URL input before a connection request', async () => {
    render(<OllamaConnectionPanel accounts={[]} />);
    await screen.findByText('Ollama Not Installed');
    const url = screen.getByLabelText('Custom URL');
    fireEvent.change(url, { target: { value: 'file:///tmp/fixture' } });
    fireEvent.submit(url.closest('form') as HTMLFormElement);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(window.electronAPI.checkOllamaStatus).toHaveBeenCalledTimes(1);
  });

  it('shows a persistence failure after a successful connection', async () => {
    window.electronAPI.checkOllamaStatus = vi.fn().mockResolvedValue({ success: true, data: { running: true } });
    actions.addProviderAccount.mockResolvedValue({ success: false, error: 'fixture-save-failure' });
    render(<OllamaConnectionPanel accounts={[]} />);
    await screen.findByText('Connected');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('restarts the initial check after React remounts effects', async () => {
    window.electronAPI.checkOllamaStatus = vi.fn().mockResolvedValue({ success: true, data: { running: true } });
    render(<StrictMode><OllamaConnectionPanel accounts={[account]} /></StrictMode>);
    await screen.findByText('Connected');
    expect(window.electronAPI.checkOllamaStatus).toHaveBeenCalledTimes(2);
  });
});
