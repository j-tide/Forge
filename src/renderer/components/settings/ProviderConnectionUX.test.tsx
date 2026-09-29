/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ProviderAccount } from '@shared/types/provider-account';
import i18n from '../../../shared/i18n';
import { TooltipProvider } from '../ui/tooltip';
import { AddAccountDialog } from './AddAccountDialog';
import { ProviderAccountCard } from './ProviderAccountCard';
import { ProviderAccountsList } from './ProviderAccountsList';

const store = vi.hoisted(() => ({
  addProviderAccount: vi.fn(), updateProviderAccount: vi.fn(), deleteProviderAccount: vi.fn(),
  loadProviderAccounts: vi.fn(), checkEnvCredentials: vi.fn(),
  providerAccounts: [] as ProviderAccount[], envCredentials: {} as Record<string, boolean>,
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock('../../stores/settings-store', () => ({ useSettingsStore: () => store }));
vi.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('./OllamaConnectionPanel', () => ({ OllamaConnectionPanel: () => <div>Ollama connection</div> }));

const account: ProviderAccount = {
  id: 'test-account', name: 'Test account', provider: 'openai', authType: 'api-key',
  billingModel: 'pay-per-use', apiKey: 'test-key', createdAt: 1, updatedAt: 1,
};
const customAccount: ProviderAccount = { ...account, provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1' };

beforeEach(() => {
  vi.clearAllMocks();
  store.providerAccounts = [];
  store.envCredentials = {};
  store.loadProviderAccounts.mockResolvedValue(undefined);
  store.checkEnvCredentials.mockResolvedValue(undefined);
  store.addProviderAccount.mockResolvedValue({ success: true, data: account });
  store.updateProviderAccount.mockResolvedValue({ success: true, data: account });
  window.electronAPI.testProviderConnection = vi.fn().mockResolvedValue({ success: true, data: { success: true, message: 'Endpoint checked' } });
  window.electronAPI.requestAllProfilesUsage = vi.fn().mockResolvedValue({ success: false });
});
afterEach(cleanup);

describe('Provider connection controls', () => {
  it('tests an unsaved draft only on click and invalidates its result when input changes', async () => {
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="openai" authType="api-key" />);
    const test = screen.getByRole('button', { name: 'Test connection' });
    expect(test).toBeDisabled();
    expect(window.electronAPI.testProviderConnection).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'draft-key' } });
    fireEvent.click(test);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Check passed'));
    expect(window.electronAPI.testProviderConnection).toHaveBeenCalledWith('openai', expect.objectContaining({ apiKey: 'draft-key', authType: 'api-key', mode: 'connection' }));
    expect(store.addProviderAccount).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'changed-key' } });
    expect(screen.queryByText('Check passed')).not.toBeInTheDocument();
  });

  it('discards an in-flight result after configuration changes', async () => {
    let finish!: (value: { success: boolean; data: { success: boolean; message: string } }) => void;
    window.electronAPI.testProviderConnection = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="openai" authType="api-key" editAccount={account} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(screen.getByRole('button', { name: 'Testing connection...' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'new-key' } });
    await act(async () => finish({ success: true, data: { success: true, message: 'Stale success' } }));
    expect(screen.queryByText('Stale success')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();
  });

  it('shows backend failure rather than reporting the IPC call itself as a pass', async () => {
    window.electronAPI.testProviderConnection = vi.fn().mockResolvedValue({ success: true, data: { success: false, error: 'Authentication rejected' } });
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="openai" authType="api-key" editAccount={account} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Authentication rejected'));
    expect(screen.queryByText('Check passed')).not.toBeInTheDocument();
  });

  it('handles IPC rejection without leaking transport errors or leaving the button busy', async () => {
    window.electronAPI.testProviderConnection = vi.fn().mockRejectedValue(new Error('transport included private-key'));
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="openai" authType="api-key" editAccount={account} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The check could not be completed'));
    expect(screen.queryByText(/private-key/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();
  });

  it('localizes backend status codes instead of exposing English diagnostics in the Chinese UI', async () => {
    await i18n.changeLanguage('zh-CN');
    window.electronAPI.testProviderConnection = vi.fn().mockResolvedValue({ success: true, data: { success: false, code: 'auth', error: 'English authentication diagnostic' } });
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="openai" authType="api-key" editAccount={account} />);
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('认证失败，请检查 API 密钥和账户权限。'));
    expect(screen.queryByText('English authentication diagnostic')).not.toBeInTheDocument();
  });

  it('retains the HTTP status when localizing a server failure', async () => {
    window.electronAPI.testProviderConnection = vi.fn().mockResolvedValue({ success: true, data: { success: false, code: 'http', status: 503 } });
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="openai" authType="api-key" editAccount={account} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('HTTP 503'));
  });

  it('requires an explicit ZAI model test click after displaying cost and quota information', async () => {
    const zai = { ...account, provider: 'zai' as const, billingModel: 'subscription' as const, baseUrl: 'https://api.z.ai/api/anthropic' };
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="zai" authType="api-key" editAccount={zai} />);
    expect(screen.getByText(/may incur API charges or consume Coding Plan quota/)).toBeInTheDocument();
    expect(screen.getByText(/Add your Z.AI Coding Plan API key/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Model to test' })).toHaveTextContent('GLM-5');
    expect(window.electronAPI.testProviderConnection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Test model' }));
    await waitFor(() => expect(window.electronAPI.testProviderConnection).toHaveBeenCalledWith('zai', expect.objectContaining({ billingModel: 'subscription', baseUrl: zai.baseUrl, mode: 'model', model: 'glm-5' })));
  });

  it('provides named actions and tests the current saved account', async () => {
    const edit = vi.fn();
    render(<TooltipProvider><ProviderAccountCard account={account} onEdit={edit} onDelete={vi.fn()} /></TooltipProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Edit account' }));
    expect(edit).toHaveBeenCalledWith(account);
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeInTheDocument();
    const test = screen.getByRole('button', { name: 'Test connection for Test account' });
    expect(test).toHaveTextContent('Test connection');
    fireEvent.click(test);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Endpoint checked'));
    expect(window.electronAPI.testProviderConnection).toHaveBeenCalledWith('openai', expect.objectContaining({ accountId: account.id, apiKey: account.apiKey }));
  });

  it('shows an explicit model test button on a saved ZAI account', () => {
    const zai = { ...account, provider: 'zai' as const, billingModel: 'subscription' as const };
    render(<TooltipProvider><ProviderAccountCard account={zai} onEdit={vi.fn()} onDelete={vi.fn()} /></TooltipProvider>);
    expect(screen.getByRole('button', { name: 'Test model for Test account' })).toHaveTextContent('Test model');
    expect(window.electronAPI.testProviderConnection).not.toHaveBeenCalled();
  });

  it('preserves draft fields and keeps the dialog open when saving rejects', async () => {
    store.addProviderAccount.mockRejectedValue(new Error('private transport details'));
    const close = vi.fn();
    render(<AddAccountDialog open onOpenChange={close} provider="openai" authType="api-key" />);
    fireEvent.change(screen.getByLabelText('Account Name'), { target: { value: 'Draft account' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'draft-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Account' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Failed to save account' })));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Account Name')).toHaveValue('Draft account');
    expect(screen.getByLabelText('API Key')).toHaveValue('draft-key');
    expect(screen.getByRole('button', { name: 'Add Account' })).toBeEnabled();
  });

  it('makes custom-model add/remove usable by name and preserves duplicate input with feedback', () => {
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="openai-compatible" authType="api-key" />);
    const input = screen.getByRole('textbox', { name: 'Model ID' });
    fireEvent.change(input, { target: { value: 'custom-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add model' }));
    expect(screen.getByRole('button', { name: 'Remove model custom-model' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'custom-model' } });
    expect(screen.getByRole('alert')).toHaveTextContent('already in the list');
    expect(screen.getByRole('button', { name: 'Add model' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('custom-model');
    fireEvent.click(screen.getByRole('button', { name: 'Remove model custom-model' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['openai', 'OPENAI_API_KEY'])('displays environment credentials returned under %s', (key) => {
    store.envCredentials = { [key]: true };
    render(<ProviderAccountsList />);
    expect(screen.getByText('From env')).toBeInTheDocument();
    const toggle = screen.getByText('OpenAI').closest('button');
    if (!toggle) throw new Error('Provider section must have a button');
    fireEvent.click(toggle);
    expect(screen.getByText('Credentials detected from OPENAI_API_KEY environment variable')).toBeInTheDocument();
  });
});

describe.each([
  { mode: 'adding', editAccount: undefined },
  { mode: 'editing', editAccount: customAccount },
])('Provider URL validation when $mode', ({ editAccount }) => {
  it.each([
    'invalid url', 'file:///tmp/models',
    'https://private-user:private-password@example.com/v1',
    'https://example.com/v1?api_key=private-key',
    'https://example.com/v1#private-key', 'http://192.168.1.2:8080/v1',
  ])('blocks save/test and lets the user correct an invalid address', (url) => {
    render(<AddAccountDialog open onOpenChange={vi.fn()} provider="openai-compatible" authType="api-key" editAccount={editAccount} />);
    if (!editAccount) {
      fireEvent.change(screen.getByLabelText('Account Name'), { target: { value: 'Draft endpoint' } });
      fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'fake-key' } });
    }
    const address = screen.getByLabelText('Base URL');
    fireEvent.change(address, { target: { value: url } });
    const save = screen.getByRole('button', { name: editAccount ? 'Save Changes' : 'Add Account' });
    expect(save).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
    expect(address).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).not.toHaveTextContent('private-key');
    expect(screen.getByRole('alert')).not.toHaveTextContent('private-password');
    fireEvent.click(save);
    expect(store.addProviderAccount).not.toHaveBeenCalled();
    expect(store.updateProviderAccount).not.toHaveBeenCalled();
    expect(window.electronAPI.testProviderConnection).not.toHaveBeenCalled();

    fireEvent.change(address, { target: { value: 'https://api.example.com/v1' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(save).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();
  });
});
