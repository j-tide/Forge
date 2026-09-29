import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ipcMain } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, ProjectEnvConfig } from '../../shared/types';
import { registerEnvHandlers } from './env-handlers';
import { parseEnvFile } from './utils';

const fixture = vi.hoisted(() => ({ directory: '', projectPath: '', autoBuildPath: '.forge-glass-preview' }));
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => fixture.directory }
}));
vi.mock('../project-store', () => ({
  projectStore: { getProject: (id: string) => id === 'integration-project'
    ? { id, path: fixture.projectPath, autoBuildPath: fixture.autoBuildPath }
    : undefined }
}));

type EnvHandler = (_event: unknown, projectId: string, config?: Partial<ProjectEnvConfig>) => Promise<IPCResult<ProjectEnvConfig>>;
const providers = [
  { name: 'GitHub', flag: 'githubEnabled', credential: 'githubToken', envFlag: 'GITHUB_ENABLED', envCredential: 'GITHUB_TOKEN' },
  { name: 'Linear', flag: 'linearEnabled', credential: 'linearApiKey', envFlag: 'LINEAR_ENABLED', envCredential: 'LINEAR_API_KEY' },
  { name: 'GitLab', flag: 'gitlabEnabled', credential: 'gitlabToken', envFlag: 'GITLAB_ENABLED', envCredential: 'GITLAB_TOKEN' }
] as const;
let envPath: string;
let handlers: Map<string, EnvHandler>;

function registerHandlers() {
  handlers = new Map();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as EnvHandler);
  });
  registerEnvHandlers(() => null);
}

async function invoke(channel: string, config?: Partial<ProjectEnvConfig>) {
  const handler = handlers.get(channel);
  if (!handler) throw new Error('Environment handler not registered');
  return handler({}, 'integration-project', config);
}

async function getConfig() {
  // A fresh registration reads persisted state, rather than a cached draft.
  registerHandlers();
  const result = await invoke(IPC_CHANNELS.ENV_GET);
  expect(result.success).toBe(true);
  if (!result.data) throw new Error('Environment configuration not returned');
  return result.data;
}

beforeEach(() => {
  fixture.directory = mkdtempSync(path.join(tmpdir(), 'forge-integration-env-test-'));
  fixture.projectPath = path.join(fixture.directory, 'project');
  fixture.autoBuildPath = '.forge-glass-preview';
  mkdirSync(path.join(fixture.projectPath, fixture.autoBuildPath), { recursive: true });
  envPath = path.join(fixture.projectPath, fixture.autoBuildPath, '.env');
  registerHandlers();
});

afterEach(() => {
  rmSync(fixture.directory, { recursive: true, force: true });
  fixture.directory = '';
  fixture.projectPath = '';
});

describe.each(providers)('$name integration enabled persistence', (provider) => {
  it.each([
    { enabled: true, hasCredential: false },
    { enabled: false, hasCredential: false },
    { enabled: true, hasCredential: true },
    { enabled: false, hasCredential: true }
  ])('round-trips enabled=$enabled with credential=$hasCredential and toggles without losing the credential', async ({ enabled, hasCredential }) => {
    const credential = hasCredential ? `fixture-${provider.name.toLowerCase()}-credential` : '';
    const result = await invoke(IPC_CHANNELS.ENV_UPDATE, {
      [provider.flag]: enabled,
      [provider.credential]: credential
    });
    expect(result).toEqual({ success: true });
    expect(parseEnvFile(readFileSync(envPath, 'utf-8'))[provider.envFlag]).toBe(String(enabled));
    const saved = await getConfig();
    expect(saved[provider.flag]).toBe(enabled);
    expect(saved[provider.credential]).toBe(hasCredential ? credential : undefined);

    expect(await invoke(IPC_CHANNELS.ENV_UPDATE, { [provider.flag]: !enabled })).toEqual({ success: true });
    const toggled = await getConfig();
    expect(toggled[provider.flag]).toBe(!enabled);
    expect(toggled[provider.credential]).toBe(hasCredential ? credential : undefined);
  });

  it.each([false, true])('keeps the credential-derived legacy default with credential=%s after an unrelated save', async (hasCredential) => {
    writeFileSync(envPath, `${provider.envCredential}=${hasCredential ? 'fixture-legacy-credential' : ''}\nDEFAULT_BRANCH=main\n`, 'utf-8');
    expect((await getConfig())[provider.flag]).toBe(hasCredential);
    expect(await invoke(IPC_CHANNELS.ENV_UPDATE, { defaultBranch: 'develop' })).toEqual({ success: true });
    const vars = parseEnvFile(readFileSync(envPath, 'utf-8'));
    expect(Object.hasOwn(vars, provider.envFlag)).toBe(false);
    expect((await getConfig())[provider.flag]).toBe(hasCredential);
    expect(vars.DEFAULT_BRANCH).toBe('develop');
  });

  it.each([
    { raw: '" TRUE "', credential: '', enabled: true },
    { raw: '" FALSE "', credential: 'fixture-credential', enabled: false }
  ])('reads explicit quoted flag $raw independently of the credential', async ({ raw, credential, enabled }) => {
    writeFileSync(envPath, `${provider.envFlag}=${raw}\n${provider.envCredential}=${credential}\n`, 'utf-8');
    expect((await getConfig())[provider.flag]).toBe(enabled);
  });

  it('keeps explicit enabled after clearing the credential and updating another field', async () => {
    writeFileSync(envPath, `${provider.envFlag}=true\n${provider.envCredential}=fixture-credential\n`, 'utf-8');
    expect(await invoke(IPC_CHANNELS.ENV_UPDATE, { [provider.credential]: '', enableFancyUi: false })).toEqual({ success: true });
    const config = await getConfig();
    expect(config[provider.flag]).toBe(true);
    expect(config[provider.credential]).toBeUndefined();
    expect(config.enableFancyUi).toBe(false);
  });
});

it('changes only integration flags while retaining the existing managed environment fields', async () => {
  const existing = {
    AUTO_BUILD_MODEL: 'fixture-model',
    GITHUB_ENABLED: 'true', GITHUB_TOKEN: 'fixture-github-credential', GITHUB_REPO: 'fixture/repo', GITHUB_AUTO_SYNC: 'false',
    LINEAR_ENABLED: 'true', LINEAR_API_KEY: 'fixture-linear-credential', LINEAR_TEAM_ID: 'fixture-team', LINEAR_PROJECT_ID: 'fixture-project', LINEAR_REALTIME_SYNC: 'false',
    GITLAB_ENABLED: 'true', GITLAB_TOKEN: 'fixture-gitlab-credential', GITLAB_INSTANCE_URL: 'https://gitlab.example.test', GITLAB_PROJECT: 'fixture/project', GITLAB_AUTO_SYNC: 'false',
    DEFAULT_BRANCH: 'develop', ENABLE_FANCY_UI: 'false', GRAPHITI_ENABLED: 'true', GRAPHITI_EMBEDDER_PROVIDER: 'ollama',
    OPENAI_API_KEY: 'fixture-embedding-key', OPENAI_EMBEDDING_MODEL: 'fixture-embedding-model',
    AZURE_OPENAI_API_KEY: 'fixture-azure-key', AZURE_OPENAI_BASE_URL: 'https://azure.example.test', AZURE_OPENAI_EMBEDDING_DEPLOYMENT: 'fixture-deployment',
    VOYAGE_API_KEY: 'fixture-voyage-key', VOYAGE_EMBEDDING_MODEL: 'fixture-voyage-model', GOOGLE_API_KEY: 'fixture-google-key', GOOGLE_EMBEDDING_MODEL: 'fixture-google-model',
    OLLAMA_BASE_URL: 'http://localhost:11434', OLLAMA_EMBEDDING_MODEL: 'fixture-ollama-model', OLLAMA_EMBEDDING_DIM: '768',
    GRAPHITI_DATABASE: 'fixture-memory', GRAPHITI_DB_PATH: '/fixture/memory',
    CONTEXT7_ENABLED: 'false', LINEAR_MCP_ENABLED: 'true', ELECTRON_MCP_ENABLED: 'true', PUPPETEER_MCP_ENABLED: 'false',
    AGENT_MCP_planner_ADD: 'fixture-docs,fixture-search', AGENT_MCP_planner_REMOVE: 'fixture-old',
    CUSTOM_MCP_SERVERS: JSON.stringify([{ id: 'fixture-mcp', name: 'Fixture MCP', type: 'command', command: 'fixture-command' }])
  };
  writeFileSync(envPath, Object.entries(existing).map(([key, value]) => `${key}=${value}`).join('\n'), 'utf-8');
  expect(await invoke(IPC_CHANNELS.ENV_UPDATE, { githubEnabled: false, linearEnabled: false, gitlabEnabled: false })).toEqual({ success: true });
  expect(parseEnvFile(readFileSync(envPath, 'utf-8'))).toEqual({
    ...existing, GITHUB_ENABLED: 'false', LINEAR_ENABLED: 'false', GITLAB_ENABLED: 'false'
  });
  expect(await getConfig()).toMatchObject({
    githubEnabled: false, githubToken: existing.GITHUB_TOKEN, githubRepo: existing.GITHUB_REPO,
    linearEnabled: false, linearApiKey: existing.LINEAR_API_KEY, linearTeamId: existing.LINEAR_TEAM_ID,
    gitlabEnabled: false, gitlabToken: existing.GITLAB_TOKEN, gitlabInstanceUrl: existing.GITLAB_INSTANCE_URL,
    autoBuildModel: 'fixture-model', defaultBranch: 'develop', memoryEnabled: true, enableFancyUi: false,
    mcpServers: { context7Enabled: false, linearMcpEnabled: true, electronEnabled: true, puppeteerEnabled: false },
    agentMcpOverrides: { planner: { add: ['fixture-docs', 'fixture-search'], remove: ['fixture-old'] } }
  });
});
