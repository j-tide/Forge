import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type { ProviderAccount } from '../../shared/types/provider-account';
import type { AgentManager } from '../agent';

const settingsState = vi.hoisted(() => ({ path: '' }));

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  dialog: {},
  app: {},
  shell: {},
  session: {},
}));
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }));
vi.mock('../agent', () => ({ AgentManager: class {} }));
vi.mock('./context/memory-service-factory', () => ({ resetMemoryService: vi.fn() }));
vi.mock('../cli-tool-manager', () => ({
  configureTools: vi.fn(),
  getToolPath: vi.fn(),
  getToolInfo: vi.fn(),
  isPathFromWrongPlatform: vi.fn(),
  preWarmToolCache: vi.fn(),
}));
vi.mock('../utils/profile-manager', () => ({ loadProfilesFile: vi.fn() }));
vi.mock('../claude-profile/profile-storage', () => ({ loadProfileStore: vi.fn() }));
vi.mock('../settings-utils', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  return {
    getSettingsPath: () => settingsState.path,
    readSettingsFile: () => existsSync(settingsState.path)
      ? JSON.parse(readFileSync(settingsState.path, 'utf-8'))
      : undefined,
  };
});

type AccountDraft = Omit<ProviderAccount, 'id' | 'createdAt' | 'updatedAt'>;
type AccountHandler = (_event: unknown, ...args: unknown[]) => Promise<IPCResult<ProviderAccount>>;

const existingAccount: ProviderAccount = {
  id: 'existing-account',
  provider: 'openai-compatible',
  name: 'Existing endpoint',
  authType: 'api-key',
  billingModel: 'pay-per-use',
  apiKey: 'fixture-secret',
  baseUrl: 'https://existing.example.test/v1',
  createdAt: 10,
  updatedAt: 20,
};

function accountDraft(overrides: Partial<AccountDraft> = {}): AccountDraft {
  return {
    provider: 'openai-compatible',
    name: 'New endpoint',
    authType: 'api-key',
    billingModel: 'pay-per-use',
    apiKey: 'fixture-secret',
    baseUrl: 'https://new.example.test/v1',
    ...overrides,
  };
}

describe('provider account URL validation before persistence', () => {
  let directory: string;
  let handlers: Map<string, AccountHandler>;

  function readSettings(): { providerAccounts: ProviderAccount[]; globalPriorityOrder: string[]; theme: string } {
    return JSON.parse(readFileSync(settingsState.path, 'utf-8'));
  }

  function seedSettings(accounts: ProviderAccount[] = [existingAccount]): void {
    writeFileSync(settingsState.path, JSON.stringify({
      providerAccounts: accounts,
      globalPriorityOrder: accounts.map(account => account.id),
      theme: 'light',
    }, null, 2), 'utf-8');
  }

  async function invoke(channel: string, ...args: unknown[]): Promise<IPCResult<ProviderAccount>> {
    const handler = handlers.get(channel);
    if (!handler) throw new Error('Missing provider account handler');
    return handler({}, ...args);
  }

  beforeEach(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'forge-provider-url-test-'));
    settingsState.path = path.join(directory, 'settings.json');
    seedSettings();
    handlers = new Map();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as AccountHandler);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { registerSettingsHandlers } = await import('./settings-handlers');
    registerSettingsHandlers({} as AgentManager, () => null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
    settingsState.path = '';
  });

  it('saves a valid HTTPS endpoint and preserves unrelated settings', async () => {
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_SAVE, accountDraft());

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject(accountDraft());
    const settings = readSettings();
    expect(settings.theme).toBe('light');
    expect(settings.providerAccounts).toEqual([existingAccount, result.data]);
    expect(settings.globalPriorityOrder).toEqual([result.data?.id, existingAccount.id]);
  });

  it.each([
    ['invalid url', 'invalid-url'],
    ['ftp://example.test/v1', 'invalid-url'],
    ['https://username:credential-secret@example.test/v1', 'invalid-url'],
    ['https://example.test/v1?key=credential-secret', 'invalid-url'],
    ['https://example.test/v1#credential-secret', 'invalid-url'],
    ['http://remote.example.test/v1', 'insecure-url'],
  ])('rejects creating %s without changing the settings file', async (baseUrl, code) => {
    const before = readFileSync(settingsState.path, 'utf-8');
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_SAVE, accountDraft({ baseUrl }));

    expect(result).toEqual({ success: false, error: code });
    expect(readFileSync(settingsState.path, 'utf-8')).toBe(before);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('credential-secret');
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });

  it.each(['localhost', '127.0.0.1', '127.42.0.1', '[::1]'])('accepts HTTP with an API key on loopback %s', async hostname => {
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_SAVE, accountDraft({
      baseUrl: `http://${hostname}:11434/v1`,
    }));

    expect(result.success).toBe(true);
    expect(readSettings().providerAccounts).toContainEqual(result.data);
  });

  it('accepts an unauthenticated remote Ollama HTTP endpoint', async () => {
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_SAVE, accountDraft({
      provider: 'ollama',
      apiKey: undefined,
      baseUrl: 'http://ollama.example.test:11434',
    }));

    expect(result.success).toBe(true);
  });

  it.each(['openai-compatible', 'azure', 'ollama'] as const)('rejects a missing required URL for %s', async provider => {
    const before = readFileSync(settingsState.path, 'utf-8');
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_SAVE, accountDraft({ provider, baseUrl: undefined }));

    expect(result).toEqual({ success: false, error: 'invalid-url' });
    expect(readFileSync(settingsState.path, 'utf-8')).toBe(before);
  });

  it.each([undefined, '', '   '])('preserves default endpoint support for absent optional URL %s', async baseUrl => {
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_SAVE, accountDraft({ provider: 'anthropic', baseUrl }));

    expect(result.success).toBe(true);
  });

  it('rejects a non-string IPC URL without leaking the supplied value', async () => {
    const before = readFileSync(settingsState.path, 'utf-8');
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_SAVE, {
      ...accountDraft(),
      baseUrl: { secret: 'credential-secret' },
    });

    expect(result).toEqual({ success: false, error: 'invalid-url' });
    expect(readFileSync(settingsState.path, 'utf-8')).toBe(before);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('updates a valid URL while retaining the existing account identity and settings', async () => {
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_UPDATE, existingAccount.id, {
      baseUrl: 'https://edited.example.test/v1',
      id: 'attempted-id-override',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: existingAccount.id,
      apiKey: existingAccount.apiKey,
      baseUrl: 'https://edited.example.test/v1',
      createdAt: existingAccount.createdAt,
    });
    expect(readSettings()).toMatchObject({
      providerAccounts: [result.data],
      globalPriorityOrder: [existingAccount.id],
      theme: 'light',
    });
  });

  it.each([
    ['invalid url', 'invalid-url'],
    ['https://username:credential-secret@example.test/v1', 'invalid-url'],
    ['http://remote.example.test/v1', 'insecure-url'],
    [undefined, 'invalid-url'],
  ])('rejects editing a URL to %s and preserves the prior account', async (baseUrl, code) => {
    const before = readFileSync(settingsState.path, 'utf-8');
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_UPDATE, existingAccount.id, { baseUrl });

    expect(result).toEqual({ success: false, error: code });
    expect(readFileSync(settingsState.path, 'utf-8')).toBe(before);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('revalidates the resulting configuration when only the API key changes', async () => {
    seedSettings([{ ...existingAccount, provider: 'ollama', apiKey: undefined, baseUrl: 'http://ollama.example.test:11434' }]);
    const before = readFileSync(settingsState.path, 'utf-8');
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_UPDATE, existingAccount.id, { apiKey: 'added-secret' });

    expect(result).toEqual({ success: false, error: 'insecure-url' });
    expect(readFileSync(settingsState.path, 'utf-8')).toBe(before);
  });

  it('rejects an unrelated edit when a stored account has a malformed URL', async () => {
    seedSettings([{ ...existingAccount, baseUrl: 'old invalid URL' }]);
    const before = readFileSync(settingsState.path, 'utf-8');
    const result = await invoke(IPC_CHANNELS.PROVIDER_ACCOUNTS_UPDATE, existingAccount.id, { name: 'Renamed endpoint' });

    expect(result).toEqual({ success: false, error: 'invalid-url' });
    expect(readFileSync(settingsState.path, 'utf-8')).toBe(before);
  });

  it('does not block unrelated settings saves because of a legacy invalid account URL', async () => {
    const legacyAccount = { ...existingAccount, baseUrl: 'old invalid URL' };
    seedSettings([legacyAccount]);

    const result = await invoke(IPC_CHANNELS.SETTINGS_SAVE, { theme: 'dark' });

    expect(result).toEqual({ success: true });
    expect(readSettings()).toMatchObject({
      providerAccounts: [legacyAccount],
      theme: 'dark',
    });
  });

  it('prevents the general settings save from replacing the dedicated account table', async () => {
    const result = await invoke(IPC_CHANNELS.SETTINGS_SAVE, {
      providerAccounts: [{ ...existingAccount, baseUrl: 'attempted invalid URL' }],
      globalPriorityOrder: ['attempted-account-id'],
      theme: 'dark',
    });

    expect(result).toEqual({ success: true });
    expect(readSettings()).toMatchObject({
      providerAccounts: [existingAccount],
      globalPriorityOrder: [existingAccount.id],
      theme: 'dark',
    });
  });
});
