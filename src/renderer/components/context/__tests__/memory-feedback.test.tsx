// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoriesTab } from '../MemoriesTab';
import { MemoryCard } from '../MemoryCard';
import type { RendererMemory } from '../../../../shared/types';

afterEach(cleanup);
const baseProps = {
  memoryStatus: { enabled: true, available: true }, memoryState: null,
  recentMemories: [], memoriesLoading: false, searchResults: [], searchLoading: false,
  onSearch: vi.fn()
};

describe('memory feedback', () => {
  it('renders distinct successful empty and failed search feedback', () => {
    const { rerender } = render(<MemoriesTab {...baseProps} searchCompleted />);
    expect(screen.getByRole('status').textContent).toBe('No matching memories found.');
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<MemoriesTab {...baseProps} searchError="Storage unavailable" />);
    expect(screen.getByRole('alert').textContent).toBe('Storage unavailable');
    expect(screen.queryByText('No matching memories found.')).toBeNull();
  });

  it('shows recent-load failure and retry rather than no-memories success', () => {
    const retry = vi.fn();
    render(<MemoriesTab {...baseProps} memoryError="Memory load failed" onReload={retry} />);
    expect(screen.getByRole('alert').textContent).toContain('Memory load failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByText('No memories yet')).toBeNull();
  });

  it('shows a failed mutation without replacing the memory list', () => {
    render(<MemoriesTab {...baseProps} mutationError="Verification denied" />);
    expect(screen.getByRole('alert').textContent).toBe('Verification denied');
  });

  it('clears stale results when the user clears the search input', () => {
    const onSearch = vi.fn();
    render(<MemoriesTab {...baseProps} onSearch={onSearch} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSearch).toHaveBeenLastCalledWith('hello');
    fireEvent.change(input, { target: { value: '' } });
    expect(onSearch).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('button', { name: 'Search memories' }).hasAttribute('disabled')).toBe(true);
  });

  it('prevents duplicate memory actions while the saved mutation is pending', () => {
    const item: RendererMemory = {
      id: 'one', type: 'pattern', content: 'One', confidence: 0.5, tags: [], relatedFiles: [],
      relatedModules: [], createdAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString(),
      accessCount: 0, scope: 'global', source: 'user_taught'
    };
    const verify = vi.fn();
    render(<MemoryCard memory={item} pending onVerify={verify} onPin={vi.fn()} onDeprecate={vi.fn()} />);
    const actions = screen.getAllByRole('button');
    expect(actions).toHaveLength(3);
    for (const action of actions) expect(action.hasAttribute('disabled')).toBe(true);
    fireEvent.click(actions[0]);
    expect(verify).not.toHaveBeenCalled();
  });

  it('does not invent a database name or private path when metadata is missing', () => {
    render(<MemoriesTab {...baseProps} />);
    expect(screen.getByText('Not reported')).toBeTruthy();
    expect(screen.queryByText('auto_claude_memory')).toBeNull();
    expect(screen.queryByText('~/.forge-glass-preview/memories')).toBeNull();
  });
});
