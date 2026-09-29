/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveProviderInfo } from '../../hooks/useActiveProvider';
import type { ProviderAccount } from '../../../shared/types/provider-account';
import { useDownloadStore } from '../../stores/download-store';
import { AgentProfileSelector } from '../AgentProfileSelector';
import { OllamaModelSelector } from '../onboarding/OllamaModelSelector';
import { OllamaModelManager } from '../settings/OllamaModelManager';
import { ThinkingLevelSelect } from '../settings/ThinkingLevelSelect';
import { TooltipProvider } from '../ui/tooltip';
import i18n from '../../../shared/i18n';

const providerState = vi.hoisted(() => ({ current: null as ActiveProviderInfo | null }));
vi.mock('../../hooks/useActiveProvider', () => ({
  useActiveProvider: () => providerState.current,
}));

const remoteUrl = 'http://ollama.example.test:11434';
const secondaryUrl = 'http://other-ollama.example.test:11434';
const ollamaAccount = (baseUrl: string): ProviderAccount => ({
  id: baseUrl,
  provider: 'ollama',
  name: 'Configured Ollama',
  authType: 'api-key',
  billingModel: 'pay-per-use',
  baseUrl,
  createdAt: 1,
  updatedAt: 1,
});
const api = {
  checkOllamaStatus: vi.fn(),
  checkOllamaInstalled: vi.fn(),
  listOllamaEmbeddingModels: vi.fn(),
  listOllamaModels: vi.fn(),
  pullOllamaModel: vi.fn(),
};

beforeEach(() => {
  Object.assign(window.electronAPI, api);
  useDownloadStore.setState({ downloads: {} });
  api.checkOllamaStatus.mockResolvedValue({ success: true, data: { running: true } });
  api.checkOllamaInstalled.mockResolvedValue({ success: true, data: { installed: false } });
  api.listOllamaEmbeddingModels.mockResolvedValue({ success: true, data: { embedding_models: [] } });
  api.listOllamaModels.mockResolvedValue({ success: true, data: { models: [] } });
  api.pullOllamaModel.mockResolvedValue({ success: true });
  const account = ollamaAccount(remoteUrl);
  providerState.current = {
    account,
    provider: 'ollama',
    isAnthropic: false,
    connectedProviders: ['ollama'],
    orderedAccounts: [account],
    crossProviderOrderedAccounts: [account],
  };
});
afterEach(cleanup);

describe('Configured Ollama endpoint flows', () => {
  it('discovers and downloads remote embedding models without requiring a local installation', async () => {
    render(<OllamaModelSelector selectedModel="" onModelSelect={vi.fn()} baseUrl={remoteUrl} />);
    const download = await screen.findByRole('button', { name: /Download.*3\.1 GB/ });
    expect(api.checkOllamaStatus).toHaveBeenCalledWith(remoteUrl);
    expect(api.listOllamaEmbeddingModels).toHaveBeenCalledWith(remoteUrl);
    expect(api.checkOllamaInstalled).not.toHaveBeenCalled();
    fireEvent.click(download);
    await waitFor(() => expect(api.pullOllamaModel).toHaveBeenCalledWith('qwen3-embedding:4b', remoteUrl));
    await waitFor(() => expect(api.listOllamaEmbeddingModels).toHaveBeenCalledTimes(2));
  });

  it('offers retry for an unavailable remote endpoint without proposing a local installation', async () => {
    api.checkOllamaStatus.mockResolvedValue({ success: true, data: { running: false } });
    render(<OllamaModelSelector selectedModel="" onModelSelect={vi.fn()} baseUrl={remoteUrl} />);
    const retry = await screen.findByRole('button', { name: /Retry/ });
    expect(api.checkOllamaInstalled).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Install Ollama/ })).toBeNull();
    expect(screen.queryByText(/Ollama is installed but not running/)).toBeNull();
    api.checkOllamaStatus.mockResolvedValue({ success: true, data: { running: true } });
    fireEvent.click(retry);
    await screen.findByRole('button', { name: /Download.*3\.1 GB/ });
    expect(api.listOllamaEmbeddingModels).toHaveBeenCalledWith(remoteUrl);
  });

  it('retains local installation guidance when the default endpoint is unavailable', async () => {
    api.checkOllamaStatus.mockResolvedValue({ success: true, data: { running: false } });
    render(<OllamaModelSelector selectedModel="" onModelSelect={vi.fn()} />);
    await screen.findByRole('button', { name: /Install Ollama/ });
    expect(api.checkOllamaInstalled).toHaveBeenCalledOnce();
  });

  it('exposes installed embedding models as focusable toggle buttons and respects disabled selection', async () => {
    api.listOllamaEmbeddingModels.mockResolvedValue({
      success: true, data: { embedding_models: [{ name: 'qwen3-embedding:4b' }] },
    });
    const onModelSelect = vi.fn();
    const { rerender } = render(<OllamaModelSelector selectedModel="" onModelSelect={onModelSelect} baseUrl={remoteUrl} />);
    const model = await screen.findByRole('button', { name: /qwen3-embedding:4b/ });
    expect(model.tagName).toBe('BUTTON');
    model.focus();
    expect(document.activeElement).toBe(model);
    fireEvent.click(model);
    expect(onModelSelect).toHaveBeenCalledWith('qwen3-embedding:4b', 2560);
    rerender(<OllamaModelSelector selectedModel="qwen3-embedding:4b" onModelSelect={onModelSelect} baseUrl={remoteUrl} />);
    fireEvent.click(model);
    expect(onModelSelect).toHaveBeenLastCalledWith('', 0);
    onModelSelect.mockClear();
    rerender(<OllamaModelSelector selectedModel="" onModelSelect={onModelSelect} baseUrl={remoteUrl} disabled />);
    fireEvent.click(model);
    expect(onModelSelect).not.toHaveBeenCalled();
    expect((model as HTMLButtonElement).disabled).toBe(true);
  });

  it('uses the highest-priority Ollama account for model management even when another provider is active', async () => {
    const anthropic: ProviderAccount = { ...ollamaAccount(''), id: 'anthropic', provider: 'anthropic' };
    if (!providerState.current) throw new Error('Provider state missing');
    providerState.current = {
      ...providerState.current,
      account: anthropic,
      provider: 'anthropic',
      orderedAccounts: [anthropic, ollamaAccount(remoteUrl), ollamaAccount(secondaryUrl)],
    };
    render(<OllamaModelManager />);
    const [download] = await screen.findAllByRole('button', { name: /Download.*20 GB/ });
    expect(api.listOllamaModels).toHaveBeenCalledWith(remoteUrl);
    fireEvent.click(download);
    await waitFor(() => expect(api.pullOllamaModel).toHaveBeenCalledWith('qwen3:32b', remoteUrl));
  });

  it('lets users refresh model management after a connection failure', async () => {
    api.listOllamaModels.mockResolvedValueOnce({ success: false, error: 'Connection refused' });
    render(<OllamaModelManager />);
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh' }));
    await screen.findByRole('button', { name: /Download.*5\.2 GB/ });
    expect(api.listOllamaModels).toHaveBeenNthCalledWith(2, remoteUrl);
  });

  it('refreshes task model discovery when the active Ollama endpoint changes', async () => {
    const props = {
      profileId: 'auto', model: '' as const, thinkingLevel: '' as const,
      onProfileChange: vi.fn(), onModelChange: vi.fn(), onThinkingLevelChange: vi.fn(),
    };
    const { rerender } = render(<AgentProfileSelector {...props} />);
    await waitFor(() => expect(api.listOllamaModels).toHaveBeenCalledWith(remoteUrl));
    if (!providerState.current) throw new Error('Provider state missing');
    providerState.current = { ...providerState.current, account: ollamaAccount(secondaryUrl) };
    rerender(<AgentProfileSelector {...props} />);
    await waitFor(() => expect(api.listOllamaModels).toHaveBeenCalledWith(secondaryUrl));
  });

  it.each([
    { language: 'en', expand: /Phase Configuration/, phases: ['Spec Creation', 'Planning', 'Coding', 'QA Review'], model: 'Model', thinking: 'Thinking Level' },
    { language: 'zh-CN', expand: /阶段配置/, phases: ['需求整理', '规划', '开发', '质量审查'], model: '模型', thinking: '思考深度' },
  ])('names every expanded task phase field in $language', async ({ language, expand, phases, model, thinking }) => {
    await i18n.changeLanguage(language);
    render(<AgentProfileSelector
      profileId="auto" model="" thinkingLevel=""
      onProfileChange={vi.fn()} onModelChange={vi.fn()} onThinkingLevelChange={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: expand }));
    for (const phase of phases) {
      expect(screen.getByRole('combobox', { name: `${phase} ${model}` })).toBeDefined();
      expect(screen.getByRole('combobox', { name: `${phase} ${thinking}` })).toBeDefined();
    }
    expect(screen.getAllByRole('combobox')).toHaveLength(9);
  });

  it.each([
    { provider: 'ollama' as const, modelValue: 'qwen3:8b' },
    { provider: 'google' as const, modelValue: 'gemini-2.5-pro' },
    { provider: 'anthropic' as const, modelValue: 'sonnet' },
  ])('names $provider thinking controls with a localized default and optional context', ({ provider, modelValue }) => {
    const props = { provider, modelValue, value: 'high', onChange: vi.fn() };
    const { rerender } = render(<TooltipProvider><ThinkingLevelSelect {...props} /></TooltipProvider>);
    expect(screen.getByRole('combobox', { name: 'Thinking Level' })).toBeDefined();
    rerender(<TooltipProvider><ThinkingLevelSelect {...props} ariaLabel="Planning Thinking Level" /></TooltipProvider>);
    expect(screen.getByRole('combobox', { name: 'Planning Thinking Level' })).toBeDefined();
  });
});
