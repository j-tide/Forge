/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddProjectModal } from '../AddProjectModal';
import { useProjectStore } from '../../stores/project-store';

beforeEach(() => {
  useProjectStore.setState({ projects: [], selectedProjectId: null, error: null });
  window.electronAPI.getDefaultProjectLocation = vi.fn().mockResolvedValue('/default/projects');
  window.electronAPI.selectDirectory = vi.fn().mockResolvedValue('/chosen/project');
  window.electronAPI.addProject = vi.fn().mockResolvedValue({ success: false, error: 'Project access denied' });
  window.electronAPI.createProjectFolder = vi.fn().mockResolvedValue({ success: true, data: { path: '/chosen/new-project' } });
});
afterEach(cleanup);

describe('AddProjectModal recoverable failures', () => {
  it('shows the store error when opening an existing project returns null', async () => {
    const onOpenChange = vi.fn();
    const onProjectAdded = vi.fn();
    render(<AddProjectModal open onOpenChange={onOpenChange} onProjectAdded={onProjectAdded} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open existing project folder' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Project access denied'));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onProjectAdded).not.toHaveBeenCalled();
  });

  it('preserves the create form and shows a registration failure', async () => {
    const onOpenChange = vi.fn();
    render(<AddProjectModal open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new project' }));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'new-project' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '/chosen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Project access denied'));
    expect((screen.getByLabelText('Project Name') as HTMLInputElement).value).toBe('new-project');
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('/chosen');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('uses the default location after a closed modal is opened again', async () => {
    const view = render(<AddProjectModal open={false} onOpenChange={vi.fn()} />);
    await waitFor(() => expect(window.electronAPI.getDefaultProjectLocation).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    view.rerender(<AddProjectModal open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new project' }));
    await waitFor(() => expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('/default/projects'));
  });

  it('does not overwrite an entered location when the default lookup finishes late', async () => {
    let resolveDefault: ((value: string) => void) | undefined;
    window.electronAPI.getDefaultProjectLocation = vi.fn().mockImplementation(() => new Promise<string>((resolve) => { resolveDefault = resolve; }));
    render(<AddProjectModal open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new project' }));
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: '/my/selected/location' } });
    await act(async () => { resolveDefault?.('/late/default'); });
    await waitFor(() => expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('/my/selected/location'));
  });

  it('treats a cancelled folder picker as a normal cancellation', async () => {
    window.electronAPI.selectDirectory = vi.fn().mockResolvedValue(null);
    render(<AddProjectModal open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open existing project folder' }));
    await waitFor(() => expect(window.electronAPI.selectDirectory).toHaveBeenCalledOnce());
    expect(window.electronAPI.addProject).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
