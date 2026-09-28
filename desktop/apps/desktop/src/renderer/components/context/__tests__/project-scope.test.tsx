// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Context } from '../Context';
import { useContextStore } from '../../../stores/context-store';
import type { ProjectContextData, ProjectIndex } from '../../../../shared/types';

vi.mock('../ProjectIndexTab', () => ({
  ProjectIndexTab: ({ projectIndex, indexLoading }: { projectIndex: ProjectIndex | null; indexLoading: boolean }) => (
    <div>{indexLoading ? 'Loading current project' : projectIndex?.project_root || 'No index'}</div>
  )
}));
const data = (project: string): ProjectContextData => ({
  projectIndex: { project_root: project, project_type: 'single', services: {}, infrastructure: {}, conventions: {} },
  memoryStatus: null, memoryState: null, recentMemories: [], isLoading: false
});
const getContext = vi.fn();
let previousAPI: typeof window.electronAPI;

beforeEach(() => {
  previousAPI = window.electronAPI;
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { getProjectContext: getContext } });
  getContext.mockReset();
  useContextStore.getState().clearAll();
});
afterEach(() => {
  cleanup();
  useContextStore.getState().clearAll();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: previousAPI });
});

describe('Context project switching', () => {
  it('hides the previous project while the new project is loading or fails', async () => {
    getContext.mockResolvedValueOnce({ success: true, data: data('Project A private data') });
    const { rerender } = render(<Context projectId="A" />);
    expect(await screen.findByText('Project A private data')).toBeTruthy();
    let resolve!: (result: { success: boolean; error: string }) => void;
    getContext.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    rerender(<Context projectId="B" />);
    expect(screen.queryByText('Project A private data')).toBeNull();
    expect(screen.getByText('Loading current project')).toBeTruthy();
    await act(async () => { resolve({ success: false, error: 'B failed' }); });
    expect(screen.queryByText('Project A private data')).toBeNull();
    expect(useContextStore.getState().projectId).toBe('B');
    expect(useContextStore.getState().indexError).toBe('B failed');
  });

  it('invalidates a pending response when the Context page is left', async () => {
    let resolve!: (result: { success: boolean; data: ProjectContextData }) => void;
    getContext.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { unmount } = render(<Context projectId="A" />);
    unmount();
    await act(async () => { resolve({ success: true, data: data('Late A') }); });
    expect(useContextStore.getState().projectId).toBeNull();
    expect(useContextStore.getState().projectIndex).toBeNull();
  });
});
