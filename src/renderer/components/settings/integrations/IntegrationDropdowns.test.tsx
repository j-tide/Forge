/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RepositoryDropdown } from './GitHubIntegration';
import { BranchSelector, ProjectDropdown } from './GitLabIntegration';

afterEach(cleanup);

const commonProps = {
  isLoading: false,
  error: null,
  onRefresh: vi.fn(),
  onManualEntry: vi.fn(),
};

describe('Integration dropdown overlay boundaries', () => {
  it.each(['github', 'gitlab', 'branch'] as const)('%s escapes the settings scroll container and restores focus on Escape', async (type) => {
    render(
      <div data-testid="settings-scroll" style={{ overflow: 'hidden', height: 48 }}>
        {type === 'github' ? (
          <RepositoryDropdown {...commonProps} repos={[{ fullName: 'forge/example', description: 'Example', isPrivate: true }]} selectedRepo="" onSelect={vi.fn()} />
        ) : type === 'gitlab' ? (
          <ProjectDropdown {...commonProps} projects={[{ pathWithNamespace: 'forge/example', description: 'Example', visibility: 'private' }]} selectedProject="" onSelect={vi.fn()} />
        ) : (
          <BranchSelector {...commonProps} branches={['main', 'feature/search']} selectedBranch="main" onSelect={vi.fn()} />
        )}
      </div>
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    const trigger = screen.getByRole('button', { name: type === 'github' ? 'Select a repository...' : type === 'gitlab' ? 'Select a project...' : 'main' });
    trigger.focus();
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText(type === 'github' ? 'Search repositories...' : type === 'gitlab' ? 'Search projects...' : 'Search branches...');
    expect(document.body.contains(search)).toBe(true);
    expect(screen.getByTestId('settings-scroll').contains(search)).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it.each(['github', 'gitlab'] as const)('%s retains search, keyboard selection, closing and a reset filter', async (type) => {
    const onSelect = vi.fn();
    render(type === 'github' ? (
      <RepositoryDropdown {...commonProps} repos={[
        { fullName: 'forge/alpha', description: 'First', isPrivate: true },
        { fullName: 'forge/beta', description: 'Search target', isPrivate: false },
      ]} selectedRepo="" onSelect={onSelect} />
    ) : (
      <ProjectDropdown {...commonProps} projects={[
        { pathWithNamespace: 'forge/alpha', description: 'First', visibility: 'private' },
        { pathWithNamespace: 'forge/beta', description: 'Search target', visibility: 'public' },
      ]} selectedProject="" onSelect={onSelect} />
    ));
    const trigger = screen.getByRole('button', { name: type === 'github' ? 'Select a repository...' : 'Select a project...' });
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText(type === 'github' ? 'Search repositories...' : 'Search projects...');
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'target' } });
    expect(screen.queryByRole('button', { name: /forge\/alpha/ })).toBeNull();
    const target = screen.getByRole('button', { name: /forge\/beta/ });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(target);
    fireEvent.click(target);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('forge/beta');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    fireEvent.click(trigger);
    expect((await screen.findByRole('textbox')).getAttribute('value')).toBe('');
    expect(screen.getByRole('button', { name: /forge\/alpha/ })).toBeTruthy();
  });

  it('keeps GitLab auto-detection reachable while filtering and allows arrow navigation', async () => {
    const onSelect = vi.fn();
    render(<BranchSelector {...commonProps} branches={['main', 'feature/search']} selectedBranch="main" onSelect={onSelect} />);
    const trigger = screen.getByRole('button', { name: 'main' });
    fireEvent.click(trigger);
    const search = await screen.findByPlaceholderText('Search branches...');
    fireEvent.change(search, { target: { value: 'feature' } });
    const automatic = screen.getByRole('button', { name: 'Auto-detect (main/master)' });
    const feature = screen.getByRole('button', { name: 'feature/search' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(automatic);
    fireEvent.keyDown(automatic, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(feature);
    fireEvent.keyDown(feature, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(automatic);
    fireEvent.keyDown(automatic, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(feature);
    fireEvent.click(automatic);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('does not open a loading selector and retains its error feedback', () => {
    render(<RepositoryDropdown {...commonProps} repos={[]} selectedRepo="" isLoading error="Connection unavailable" onSelect={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Loading repositories...' });
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Connection unavailable')).toBeTruthy();
  });
});
