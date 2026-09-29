// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectContextData, RendererMemory } from '../../../shared/types';
import {
  deprecateMemory, loadProjectContext, loadRecentMemories, pinMemory,
  refreshProjectIndex, searchMemories, useContextStore, verifyMemory
} from '../context-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const memory = (id: string): RendererMemory => ({
  id, type: 'pattern', content: id, confidence: 0.8, tags: [], relatedFiles: [],
  relatedModules: [], createdAt: '2026-09-28T00:00:00Z', lastAccessedAt: '2026-09-28T00:00:00Z',
  accessCount: 0, scope: 'global', source: 'user_taught', userVerified: false, pinned: false
});
const context = (project: string): ProjectContextData => ({
  projectIndex: { project_root: project, project_type: 'single', services: {}, infrastructure: {}, conventions: {} },
  memoryStatus: { available: true, enabled: true, database: project }, memoryState: null,
  recentMemories: [memory(`${project}-memory`)], isLoading: false
});

const api = {
  getProjectContext: vi.fn(), refreshProjectIndex: vi.fn(), searchMemories: vi.fn(),
  getRecentMemories: vi.fn(), verifyMemory: vi.fn(), pinMemory: vi.fn(),
  deprecateMemory: vi.fn(), deleteMemory: vi.fn()
};
let previousAPI: typeof window.electronAPI;

beforeEach(() => {
  previousAPI = window.electronAPI;
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
  Object.values(api).forEach((mock) => mock.mockReset());
  useContextStore.getState().clearAll();
});
afterEach(() => {
  useContextStore.getState().clearAll();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: previousAPI });
});

describe('project scoped context requests', () => {
  it('clears A immediately when B begins, including errors and search state', async () => {
    api.getProjectContext.mockResolvedValueOnce({ success: true, data: context('A') });
    await loadProjectContext('A');
    api.searchMemories.mockResolvedValue({ success: true, data: [{ content: 'A result', type: 'pattern', score: 1 }] });
    await searchMemories('A', 'query');
    const pending = deferred<{ success: boolean; error: string }>();
    api.getProjectContext.mockReturnValueOnce(pending.promise);
    const request = loadProjectContext('B');
    expect(useContextStore.getState().projectIndex).toBeNull();
    expect(useContextStore.getState().recentMemories).toEqual([]);
    expect(useContextStore.getState().searchResults).toEqual([]);
    pending.resolve({ success: false, error: 'B unavailable' });
    await request;
    expect(useContextStore.getState().projectId).toBe('B');
    expect(useContextStore.getState().memoryError).toBe('B unavailable');
  });

  it('rejects a delayed A result after B has loaded', async () => {
    const a = deferred<{ success: boolean; data: ProjectContextData }>();
    api.getProjectContext.mockReturnValueOnce(a.promise).mockResolvedValueOnce({ success: true, data: context('B') });
    const first = loadProjectContext('A');
    await loadProjectContext('B');
    a.resolve({ success: true, data: context('A') });
    await first;
    expect(useContextStore.getState().projectIndex?.project_root).toBe('B');
    expect(useContextStore.getState().recentMemories[0].id).toBe('B-memory');
  });

  it('does not end B loading when an older A request ends', async () => {
    const a = deferred<{ success: boolean; error: string }>();
    const b = deferred<{ success: boolean; data: ProjectContextData }>();
    api.getProjectContext.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = loadProjectContext('A');
    const second = loadProjectContext('B');
    a.resolve({ success: false, error: 'A failed' });
    await first;
    expect(useContextStore.getState().indexLoading).toBe(true);
    expect(useContextStore.getState().memoryLoading).toBe(true);
    b.resolve({ success: true, data: context('B') });
    await second;
  });

  it('keeps a newer same-project refresh when an older context request finishes', async () => {
    const old = deferred<{ success: boolean; data: ProjectContextData }>();
    api.getProjectContext.mockReturnValue(old.promise);
    const load = loadProjectContext('A');
    api.refreshProjectIndex.mockResolvedValue({ success: true, data: context('latest').projectIndex });
    await refreshProjectIndex('A');
    old.resolve({ success: true, data: context('old') });
    await load;
    expect(useContextStore.getState().projectIndex?.project_root).toBe('latest');
  });

  it('invalidates pending requests when cleared', async () => {
    const pending = deferred<{ success: boolean; data: ProjectContextData }>();
    api.getProjectContext.mockReturnValue(pending.promise);
    const load = loadProjectContext('A');
    useContextStore.getState().clearAll();
    pending.resolve({ success: true, data: context('A') });
    await load;
    expect(useContextStore.getState().projectIndex).toBeNull();
  });

  it('search keeps the latest query and cancels pending results when cleared', async () => {
    const old = deferred<{ success: boolean; data: [] }>();
    api.searchMemories.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ success: true, data: [{ content: 'new', type: 'pattern', score: 1 }] });
    const first = searchMemories('A', 'old');
    await searchMemories('A', 'new');
    old.resolve({ success: true, data: [] });
    await first;
    expect(useContextStore.getState().searchResults[0]?.content).toBe('new');
    const pending = deferred<{ success: boolean; data: [] }>();
    api.searchMemories.mockReturnValueOnce(pending.promise);
    const request = searchMemories('A', 'pending');
    await searchMemories('A', '');
    expect(useContextStore.getState().searchLoading).toBe(false);
    pending.resolve({ success: true, data: [] });
    await request;
    expect(useContextStore.getState().searchQuery).toBe('');
  });

  it('distinguishes successful empty search from a failed search', async () => {
    api.searchMemories.mockResolvedValueOnce({ success: true, data: [] }).mockResolvedValueOnce({ success: false, error: 'Search offline' });
    await searchMemories('A', 'nothing');
    expect(useContextStore.getState().searchError).toBeNull();
    expect(useContextStore.getState().searchCompleted).toBe(true);
    await searchMemories('A', 'again');
    expect(useContextStore.getState().searchError).toBe('Search offline');
    expect(useContextStore.getState().searchCompleted).toBe(false);
  });

  it('surfaces recent-memory failures and clears old data', async () => {
    api.getProjectContext.mockResolvedValue({ success: true, data: context('A') });
    await loadProjectContext('A');
    api.getRecentMemories.mockRejectedValue(new Error('Storage unavailable'));
    await loadRecentMemories('A');
    expect(useContextStore.getState().recentMemories).toEqual([]);
    expect(useContextStore.getState().memoryError).toBe('Storage unavailable');
  });

  it('blocks stale search and recent-memory replies after a project change', async () => {
    const search = deferred<{ success: boolean; data: [] }>();
    const recent = deferred<{ success: boolean; data: RendererMemory[] }>();
    api.searchMemories.mockReturnValue(search.promise);
    api.getRecentMemories.mockReturnValue(recent.promise);
    const pendingSearch = searchMemories('A', 'query');
    const pendingRecent = loadRecentMemories('A');
    api.getProjectContext.mockResolvedValue({ success: true, data: context('B') });
    await loadProjectContext('B');
    search.resolve({ success: true, data: [] });
    recent.resolve({ success: true, data: [memory('A-late')] });
    await Promise.all([pendingSearch, pendingRecent]);
    expect(useContextStore.getState().recentMemories[0].id).toBe('B-memory');
    expect(useContextStore.getState().searchQuery).toBe('');
    expect(useContextStore.getState().searchCompleted).toBe(false);
  });

  it('preserves a newer recent-memory load over an older context response', async () => {
    const old = deferred<{ success: boolean; data: ProjectContextData }>();
    api.getProjectContext.mockReturnValue(old.promise);
    const load = loadProjectContext('A');
    api.getRecentMemories.mockResolvedValue({ success: true, data: [memory('latest')] });
    await loadRecentMemories('A');
    old.resolve({ success: true, data: context('old') });
    await load;
    expect(useContextStore.getState().recentMemories[0].id).toBe('latest');
  });
});

describe('memory mutation feedback and scope', () => {
  beforeEach(async () => {
    api.getProjectContext.mockResolvedValue({ success: true, data: context('A') });
    await loadProjectContext('A');
  });

  it.each(['verify', 'pin', 'deprecate'] as const)('keeps data and reports %s failure', async (kind) => {
    const calls = { verify: () => verifyMemory('A-memory'), pin: () => pinMemory('A-memory', true), deprecate: () => deprecateMemory('A-memory') };
    const mocks = { verify: api.verifyMemory, pin: api.pinMemory, deprecate: api.deprecateMemory };
    mocks[kind].mockResolvedValue({ success: false, error: `${kind} denied` });
    expect(await calls[kind]()).toBe(false);
    expect(useContextStore.getState().mutationError).toBe(`${kind} denied`);
    expect(useContextStore.getState().recentMemories).toEqual([memory('A-memory')]);
  });

  it('does not apply a completed mutation to another project or clear its error', async () => {
    const mutation = deferred<{ success: boolean }>();
    api.verifyMemory.mockReturnValue(mutation.promise);
    const pending = verifyMemory('A-memory');
    api.getProjectContext.mockResolvedValue({ success: true, data: context('B') });
    await loadProjectContext('B');
    api.pinMemory.mockResolvedValue({ success: false, error: 'B denied' });
    await pinMemory('B-memory', true);
    mutation.resolve({ success: true });
    await pending;
    expect(useContextStore.getState().recentMemories).toEqual([memory('B-memory')]);
    expect(useContextStore.getState().mutationError).toBe('B denied');
  });

  it('rejects an absent memory without sending a mutation', async () => {
    expect(await verifyMemory('B-memory')).toBe(false);
    expect(api.verifyMemory).not.toHaveBeenCalled();
    expect(useContextStore.getState().mutationError).toBeTruthy();
  });

  it('prevents duplicate mutation requests for the same pending memory', async () => {
    const result = deferred<{ success: boolean }>();
    api.pinMemory.mockReturnValue(result.promise);
    const first = pinMemory('A-memory', true);
    expect(useContextStore.getState().pendingMemoryIds).toEqual(['A-memory']);
    expect(await pinMemory('A-memory', true)).toBe(false);
    expect(api.pinMemory).toHaveBeenCalledOnce();
    result.resolve({ success: true });
    expect(await first).toBe(true);
    expect(useContextStore.getState().recentMemories[0].pinned).toBe(true);
    expect(useContextStore.getState().pendingMemoryIds).toEqual([]);
  });

  it('updates verified state only after success and removes deprecated memory only after success', async () => {
    api.verifyMemory.mockResolvedValue({ success: true });
    expect(await verifyMemory('A-memory')).toBe(true);
    expect(useContextStore.getState().recentMemories[0]).toMatchObject({ userVerified: true, needsReview: false });
    api.deprecateMemory.mockResolvedValue({ success: true });
    expect(await deprecateMemory('A-memory')).toBe(true);
    expect(useContextStore.getState().recentMemories).toEqual([]);
  });

  it('reports thrown mutation errors and unlocks the controls', async () => {
    api.verifyMemory.mockRejectedValue(new Error('Verification unavailable'));
    expect(await verifyMemory('A-memory')).toBe(false);
    expect(useContextStore.getState().mutationError).toBe('Verification unavailable');
    expect(useContextStore.getState().pendingMemoryIds).toEqual([]);
  });
});
