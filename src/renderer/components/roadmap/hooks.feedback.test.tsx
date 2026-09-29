/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeatureActions, useFeatureDelete, useRoadmapSave } from './hooks';
import { resetActors, useRoadmapStore } from '../../stores/roadmap-store';
import { useTaskStore } from '../../stores/task-store';
import type { Roadmap, RoadmapFeature, Task } from '../../../shared/types';
import { RoadmapKanbanView } from '../RoadmapKanbanView';
import { TooltipProvider } from '../ui/tooltip';

const feature: RoadmapFeature = {
  id: 'feature-1', title: 'A feature', description: 'User requirement', rationale: 'Useful',
  priority: 'must', complexity: 'low', impact: 'medium', phaseId: 'phase-1',
  dependencies: [], status: 'planned', acceptanceCriteria: [], userStories: [],
};
const roadmap: Roadmap = {
  id: 'roadmap-a', projectId: 'project-a', projectName: 'Project A',
  version: '1.0.0',
  vision: 'A vision', targetAudience: { primary: 'Developers', secondary: [] },
  phases: [], features: [feature], status: 'active',
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
};
const task = { id: 'task-1', specId: '001-feature', projectId: 'project-a', title: 'A feature', status: 'backlog' } as Task;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetActors();
  useRoadmapStore.getState().setCurrentProjectId('project-a');
  useRoadmapStore.getState().setRoadmap(roadmap);
  useTaskStore.setState({ tasks: [] });
  window.electronAPI.saveRoadmap = vi.fn().mockResolvedValue({ success: true });
  window.electronAPI.convertFeatureToSpec = vi.fn().mockResolvedValue({ success: true, data: task });
});
afterEach(() => { cleanup(); resetActors(); });

describe('Roadmap persistence feedback', () => {
  it('does not display a status change before persistence succeeds', async () => {
    const pending = deferred<{ success: boolean }>();
    vi.mocked(window.electronAPI.saveRoadmap).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useRoadmapSave('project-a'));
    const candidate = { ...roadmap, features: [{ ...feature, status: 'in_progress' as const }] };
    let saved!: Promise<boolean>;
    act(() => { saved = result.current.saveRoadmap(candidate); });
    expect(useRoadmapStore.getState().roadmap).toBe(roadmap);
    expect(result.current.isSaving).toBe(true);
    await act(async () => { pending.resolve({ success: true }); expect(await saved).toBe(true); });
    expect(useRoadmapStore.getState().roadmap?.features[0].status).toBe('in_progress');
  });

  it('keeps the persisted feature on save failure and exposes the backend error', async () => {
    vi.mocked(window.electronAPI.saveRoadmap).mockResolvedValue({ success: false, error: 'Disk is read-only' });
    const { result } = renderHook(() => useRoadmapSave('project-a'));
    const candidate = { ...roadmap, features: [{ ...feature, status: 'in_progress' as const }] };
    await act(async () => { expect(await result.current.saveRoadmap(candidate)).toBe(false); });
    expect(useRoadmapStore.getState().roadmap).toBe(roadmap);
    expect(result.current.error).toBe('Disk is read-only');
  });

  it('does not hide a deleted feature until the deletion is saved', async () => {
    const pending = deferred<{ success: boolean; error?: string }>();
    vi.mocked(window.electronAPI.saveRoadmap).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useFeatureDelete('project-a'));
    let saved!: Promise<boolean>;
    act(() => { saved = result.current.deleteFeature(feature.id); });
    expect(useRoadmapStore.getState().roadmap?.features).toEqual([feature]);
    await act(async () => { pending.resolve({ success: false, error: 'Cannot save' }); expect(await saved).toBe(false); });
    expect(useRoadmapStore.getState().roadmap?.features).toEqual([feature]);
    expect(result.current.error).toBe('Cannot save');
  });

  it('commits successful deletion and removes references to the deleted feature', async () => {
    useRoadmapStore.getState().setRoadmap({ ...roadmap, features: [feature, { ...feature, id: 'dependent', dependencies: [feature.id] }] });
    const { result } = renderHook(() => useFeatureDelete('project-a'));
    await act(async () => { expect(await result.current.deleteFeature(feature.id)).toBe(true); });
    expect(useRoadmapStore.getState().roadmap?.features.map((item) => item.id)).toEqual(['dependent']);
    expect(useRoadmapStore.getState().roadmap?.features[0].dependencies).toEqual([]);
  });

  it('maps a rejected save into visible feedback and allows retry', async () => {
    vi.mocked(window.electronAPI.saveRoadmap).mockRejectedValueOnce(new Error('IO failed'));
    const { result } = renderHook(() => useRoadmapSave('project-a'));
    await act(async () => { expect(await result.current.saveRoadmap(roadmap)).toBe(false); });
    expect(result.current.error).toBe('IO failed');
    await act(async () => { expect(await result.current.saveRoadmap(roadmap)).toBe(true); });
    expect(result.current.error).toBeNull();
  });

  it('does not replace another project with a late successful save', async () => {
    const pending = deferred<{ success: boolean }>();
    vi.mocked(window.electronAPI.saveRoadmap).mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ projectId }) => useRoadmapSave(projectId), { initialProps: { projectId: 'project-a' } });
    let saved!: Promise<boolean>;
    act(() => { saved = result.current.saveRoadmap({ ...roadmap, features: [] }); });
    const otherRoadmap = { ...roadmap, id: 'roadmap-b', projectId: 'project-b' };
    act(() => { useRoadmapStore.getState().setCurrentProjectId('project-b'); useRoadmapStore.getState().setRoadmap(otherRoadmap); });
    rerender({ projectId: 'project-b' });
    await act(async () => { pending.resolve({ success: true }); expect(await saved).toBe(false); });
    expect(useRoadmapStore.getState().roadmap).toBe(otherRoadmap);
    expect(result.current.error).toBeNull();
  });

  it('refuses to persist a roadmap belonging to another project', async () => {
    const { result } = renderHook(() => useRoadmapSave('project-a'));
    await act(async () => { expect(await result.current.saveRoadmap({ ...roadmap, projectId: 'project-b' })).toBe(false); });
    expect(window.electronAPI.saveRoadmap).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });
});

describe('Feature to task feedback', () => {
  it('renders a converted feature in Planned while the new task waits in backlog', async () => {
    useRoadmapStore.getState().setRoadmap({ ...roadmap, features: [{ ...feature, status: 'under_review' }] });
    function Board() {
      const current = useRoadmapStore((state) => state.roadmap);
      const { convertFeatureToSpec } = useFeatureActions();
      if (!current) return null;
      return <TooltipProvider><RoadmapKanbanView roadmap={current} onFeatureClick={vi.fn()} onConvertToSpec={(item) => void convertFeatureToSpec('project-a', item, null, vi.fn())} /></TooltipProvider>;
    }
    render(<Board />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Task' })).toBeInTheDocument());
    const planned = screen.getByRole('heading', { name: 'Planned' }).closest('.min-w-80');
    const running = screen.getByRole('heading', { name: 'In Progress' }).closest('.min-w-80');
    expect(planned).not.toBeNull();
    expect(running).not.toBeNull();
    expect(within(planned as HTMLElement).getByText('A feature')).toBeInTheDocument();
    expect(within(running as HTMLElement).queryByText('A feature')).not.toBeInTheDocument();
    expect(useTaskStore.getState().tasks[0].status).toBe('backlog');
  });
  it('reports conversion failure without fabricating a linked task', async () => {
    vi.mocked(window.electronAPI.convertFeatureToSpec).mockResolvedValue({ success: false, error: 'Task creation rejected' });
    const selected = vi.fn();
    const { result } = renderHook(() => useFeatureActions());
    await act(async () => { expect(await result.current.convertFeatureToSpec('project-a', feature, feature, selected)).toBe(false); });
    expect(result.current.error).toBe('Task creation rejected');
    expect(selected).not.toHaveBeenCalled();
    expect(useTaskStore.getState().tasks).toEqual([]);
    expect(useRoadmapStore.getState().roadmap?.features[0].linkedSpecId).toBeUndefined();
  });

  it('links and displays the actual task only after conversion succeeds', async () => {
    const selected = vi.fn();
    const { result } = renderHook(() => useFeatureActions());
    await act(async () => { expect(await result.current.convertFeatureToSpec('project-a', feature, feature, selected)).toBe(true); });
    expect(useTaskStore.getState().tasks).toEqual([task]);
    expect(useRoadmapStore.getState().roadmap?.features[0].linkedSpecId).toBe(task.specId);
    expect(useRoadmapStore.getState().roadmap?.features[0].status).toBe('planned');
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ linkedSpecId: task.specId, status: 'planned' }));
    expect(useTaskStore.getState().tasks[0].status).toBe('backlog');
  });

  it('keeps a late conversion from adding project A tasks into project B', async () => {
    const pending = deferred<{ success: boolean; data: Task }>();
    vi.mocked(window.electronAPI.convertFeatureToSpec).mockReturnValue(pending.promise);
    const selected = vi.fn();
    const { result } = renderHook(() => useFeatureActions());
    let converted!: Promise<boolean>;
    act(() => { converted = result.current.convertFeatureToSpec('project-a', feature, feature, selected); });
    const otherRoadmap = { ...roadmap, id: 'roadmap-b', projectId: 'project-b' };
    act(() => { useRoadmapStore.getState().setCurrentProjectId('project-b'); useRoadmapStore.getState().setRoadmap(otherRoadmap); });
    await act(async () => { pending.resolve({ success: true, data: task }); expect(await converted).toBe(false); });
    expect(selected).not.toHaveBeenCalled();
    expect(useTaskStore.getState().tasks).toEqual([]);
    expect(useRoadmapStore.getState().roadmap).toBe(otherRoadmap);
  });
});
