/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AgentTools } from '../AgentTools';
import type { IPCResult, ProjectEnvConfig } from '../../../shared/types';

const state = vi.hoisted(() => ({
  projects: [
    { id: 'a', name: 'Project A', autoBuildPath: '.forge' },
    { id: 'b', name: 'Project B', autoBuildPath: '.forge' },
  ],
  selectedProjectId: 'a',
}));
vi.mock('../../stores/project-store', () => ({ useProjectStore: (selector: (value: typeof state) => unknown) => selector(state) }));
vi.mock('../../stores/settings-store', () => ({ useSettingsStore: (selector: (value: object) => unknown) => selector({ settings: {} }) }));
vi.mock('../../hooks/useActiveProvider', () => ({ useActiveProvider: () => ({ provider: null }) }));
vi.mock('../../hooks', () => ({
  useResolvedAgentSettings: () => ({ phaseModels: {}, phaseThinking: {}, featureModels: {}, featureThinking: {} }),
  resolveAgentSettings: () => ({ model: 'opus', thinking: 'high' }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const server = { id: 'my-server', name: 'My Server', type: 'command' as const, command: 'node', args: [] };
const config = (overrides: Partial<ProjectEnvConfig> = {}) => ({
  mcpServers: { context7Enabled: true, electronEnabled: false, puppeteerEnabled: false },
  customMcpServers: [],
  ...overrides,
}) as ProjectEnvConfig;

beforeEach(() => {
  state.selectedProjectId = 'a';
  window.electronAPI.getProjectEnv = vi.fn().mockResolvedValue({ success: true, data: config() });
  window.electronAPI.updateProjectEnv = vi.fn().mockResolvedValue({ success: true });
  window.electronAPI.checkMcpHealth = vi.fn().mockResolvedValue({ success: true, data: { serverId: server.id, status: 'unknown' } });
  window.electronAPI.testMcpConnection = vi.fn().mockResolvedValue({ success: true, data: { success: true, message: 'Connected' } });
});
afterEach(cleanup);

async function openTools() {
  const view = render(<AgentTools />);
  await screen.findByText('MCP Server Configuration');
  return view;
}
const contextSwitch = () => screen.getAllByRole('switch')[0];

describe('AgentTools persistence feedback', () => {
  it('keeps the persisted toggle and displays an error when IPC returns success false', async () => {
    vi.mocked(window.electronAPI.updateProjectEnv).mockResolvedValue({ success: false, error: 'sensitive provider details' });
    await openTools();
    fireEvent.click(contextSwitch());
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(contextSwitch().getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(/sensitive provider details/)).toBeNull();
  });

  it('serializes changes until persistence confirms success', async () => {
    const pending = deferred<IPCResult>();
    vi.mocked(window.electronAPI.updateProjectEnv).mockReturnValue(pending.promise);
    await openTools();
    fireEvent.click(contextSwitch());
    fireEvent.click(contextSwitch());
    expect(window.electronAPI.updateProjectEnv).toHaveBeenCalledTimes(1);
    expect(contextSwitch()).toHaveProperty('disabled', true);
    expect(contextSwitch().getAttribute('aria-checked')).toBe('true');
    await act(async () => pending.resolve({ success: true }));
    expect(contextSwitch().getAttribute('aria-checked')).toBe('false');
    expect(contextSwitch()).toHaveProperty('disabled', false);
  });

  it('does not overwrite another project after the previous save finishes', async () => {
    const pending = deferred<IPCResult>();
    vi.mocked(window.electronAPI.updateProjectEnv).mockReturnValue(pending.promise);
    vi.mocked(window.electronAPI.getProjectEnv).mockImplementation(async (id) => ({ success: true, data: config({ mcpServers: { context7Enabled: id === 'a' } }) }));
    const view = await openTools();
    fireEvent.click(contextSwitch());
    state.selectedProjectId = 'b';
    view.rerender(<AgentTools />);
    await waitFor(() => expect(contextSwitch().getAttribute('aria-checked')).toBe('false'));
    await act(async () => pending.resolve({ success: false }));
    expect(contextSwitch().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a stale project configuration load', async () => {
    const pending = deferred<IPCResult<ProjectEnvConfig>>();
    vi.mocked(window.electronAPI.getProjectEnv).mockImplementation((id) => id === 'a' ? pending.promise : Promise.resolve({ success: true, data: config({ mcpServers: { context7Enabled: false } }) }));
    const view = render(<AgentTools />);
    state.selectedProjectId = 'b';
    view.rerender(<AgentTools />);
    await screen.findByText('MCP Server Configuration');
    await act(async () => pending.resolve({ success: true, data: config() }));
    expect(contextSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('keeps an existing custom server when its deletion fails', async () => {
    vi.mocked(window.electronAPI.getProjectEnv).mockResolvedValue({ success: true, data: config({ customMcpServers: [server] }) });
    vi.mocked(window.electronAPI.updateProjectEnv).mockResolvedValue({ success: false });
    await openTools();
    fireEvent.click(screen.getByTitle('Delete'));
    await screen.findByRole('alert');
    expect(screen.getByText('My Server')).toBeDefined();
  });

  it('keeps agent defaults after a failed removal', async () => {
    vi.mocked(window.electronAPI.updateProjectEnv).mockResolvedValue({ success: false });
    await openTools();
    fireEvent.click(screen.getByRole('button', { name: /Planner/ }));
    const plannerCard = screen.getByRole('heading', { name: 'Planner' }).closest('div.border') as HTMLElement;
    fireEvent.click(within(plannerCard).getAllByTitle('Remove')[0]);
    await screen.findByRole('alert');
    expect(within(plannerCard).getByText('Context7')).toBeDefined();
    expect(within(plannerCard).queryByTitle('Restore')).toBeNull();
  });

  it('reports an unavailable configuration instead of silently omitting controls', async () => {
    vi.mocked(window.electronAPI.getProjectEnv).mockResolvedValue({ success: false });
    render(<AgentTools />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not load/);
    expect(screen.queryByText('MCP Server Configuration')).toBeNull();
  });

  it('retains custom server fields when saving fails and closes only after success', async () => {
    vi.mocked(window.electronAPI.updateProjectEnv).mockResolvedValueOnce({ success: false }).mockResolvedValueOnce({ success: true });
    await openTools();
    fireEvent.click(screen.getByRole('button', { name: 'Add Custom Server' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'My Server' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Server' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toBeDefined());
    expect(within(dialog).getByLabelText('Name')).toHaveProperty('value', 'My Server');
    expect(screen.queryByText('My Server', { selector: 'span' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Server' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('My Server')).toBeDefined();
  });

  it('does not close an agent add dialog when saving the override fails', async () => {
    vi.mocked(window.electronAPI.updateProjectEnv).mockResolvedValue({ success: false });
    await openTools();
    fireEvent.click(screen.getByRole('button', { name: /Planner/ }));
    const plannerCard = screen.getByRole('heading', { name: 'Planner' }).closest('div.border') as HTMLElement;
    fireEvent.click(within(plannerCard as HTMLElement).getByRole('button', { name: 'Add Server' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Electron MCP').closest('button') as HTMLButtonElement);
    await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('shows a failed connection test instead of keeping a previous healthy status', async () => {
    vi.mocked(window.electronAPI.getProjectEnv).mockResolvedValue({ success: true, data: config({ customMcpServers: [server] }) });
    vi.mocked(window.electronAPI.checkMcpHealth).mockResolvedValue({ success: true, data: { serverId: server.id, status: 'healthy', message: 'Previous success', checkedAt: new Date().toISOString() } });
    vi.mocked(window.electronAPI.testMcpConnection).mockResolvedValue({ success: false });
    await openTools();
    await screen.findByText('Previous success');
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    await screen.findByText('Connection test failed');
    expect(screen.queryByText('Previous success')).toBeNull();
  });

  it('stops showing health as checking when the health request returns success false', async () => {
    vi.mocked(window.electronAPI.getProjectEnv).mockResolvedValue({ success: true, data: config({ customMcpServers: [server] }) });
    vi.mocked(window.electronAPI.checkMcpHealth).mockResolvedValue({ success: false });
    await openTools();
    expect(await screen.findByText('Health check failed')).toBeDefined();
  });

  it('does not show old connection results in another project', async () => {
    const pending = deferred<Awaited<ReturnType<typeof window.electronAPI.testMcpConnection>>>();
    vi.mocked(window.electronAPI.getProjectEnv).mockResolvedValue({ success: true, data: config({ customMcpServers: [server] }) });
    vi.mocked(window.electronAPI.testMcpConnection).mockReturnValue(pending.promise);
    const view = await openTools();
    fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    state.selectedProjectId = 'b';
    view.rerender(<AgentTools />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test' })).toHaveProperty('disabled', false));
    await act(async () => pending.resolve({ success: true, data: { success: true, serverId: server.id, message: 'Old project connection', tools: [] } }));
    expect(screen.queryByText('Old project connection')).toBeNull();
  });

  it('does not continue checking removed servers after a configuration update', async () => {
    const pending = deferred<Awaited<ReturnType<typeof window.electronAPI.checkMcpHealth>>>();
    const second = { ...server, id: 'second', name: 'Second' };
    vi.mocked(window.electronAPI.getProjectEnv).mockResolvedValue({ success: true, data: config({ customMcpServers: [server, second] }) });
    vi.mocked(window.electronAPI.checkMcpHealth).mockReturnValueOnce(pending.promise).mockResolvedValue({ success: false });
    await openTools();
    expect(window.electronAPI.checkMcpHealth).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByTitle('Delete')[1]);
    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());
    await act(async () => pending.resolve({ success: true, data: { serverId: server.id, status: 'healthy', message: 'Obsolete check', checkedAt: new Date().toISOString() } }));
    expect(vi.mocked(window.electronAPI.checkMcpHealth).mock.calls.some(([value]) => value.id === 'second')).toBe(false);
    expect(screen.queryByText('Obsolete check')).toBeNull();
  });
});
