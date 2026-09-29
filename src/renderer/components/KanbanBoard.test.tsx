/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { KanbanBoard } from './KanbanBoard';
import { ViewStateProvider } from '../contexts/ViewStateContext';
import { TooltipProvider } from './ui/tooltip';
import type { Task } from '../../shared/types';

const mocks = vi.hoisted(() => ({
  loadTaskOrder: vi.fn(),
  loadPreferences: vi.fn(),
  savePreferences: vi.fn().mockReturnValue(true),
  toggleColumnCollapsed: vi.fn(),
  setColumnWidth: vi.fn(),
  columnPreferences: null as Record<string, { width: number; isCollapsed: boolean; isLocked: boolean }> | null,
  updateProjectSettings: vi.fn().mockResolvedValue(true),
  unregister: vi.fn(),
  toast: vi.fn(),
  translate: vi.fn((key: string) => key),
  archiveTasks: vi.fn(),
  persistTaskStatus: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mocks.translate, i18n: { language: 'en' } }),
}));
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('../stores/project-store', () => ({
  useProjectStore: (selector: (state: unknown) => unknown) => selector({ projects: [
    { id: 'empty-project', settings: { maxParallelTasks: 4 } },
    { id: 'next-project', settings: { maxParallelTasks: 2 } },
  ] }),
  updateProjectSettings: mocks.updateProjectSettings,
}));
vi.mock('../stores/kanban-settings-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('../stores/kanban-settings-store')>(),
  useKanbanSettingsStore: (selector: (state: unknown) => unknown) => selector({
    columnPreferences: mocks.columnPreferences,
    loadPreferences: mocks.loadPreferences,
    savePreferences: mocks.savePreferences,
    toggleColumnCollapsed: mocks.toggleColumnCollapsed,
    setColumnCollapsed: vi.fn(),
    setColumnWidth: mocks.setColumnWidth,
    toggleColumnLocked: vi.fn(),
  }),
}));
vi.mock('../stores/task-store', () => {
  const state = {
    tasks: [],
    taskOrder: null,
    registerTaskStatusChangeListener: () => mocks.unregister,
    reorderTasksInColumn: vi.fn(),
    moveTaskToColumnTop: vi.fn(),
    saveTaskOrder: vi.fn().mockReturnValue(true),
    loadTaskOrder: mocks.loadTaskOrder,
    setTaskOrder: vi.fn(),
  };
  return {
    useTaskStore: Object.assign((selector: (value: unknown) => unknown) => selector(state), { getState: () => state }),
    persistTaskStatus: mocks.persistTaskStatus,
    forceCompleteTask: vi.fn(),
    archiveTasks: mocks.archiveTasks,
    deleteTasks: vi.fn(),
    isQueueAtCapacity: vi.fn(),
    DEFAULT_MAX_PARALLEL_TASKS: 3,
  };
});
vi.mock('./ui/scroll-area', () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./SortableTaskCard', () => ({ SortableTaskCard: ({ task }: { task: Task }) => <div>{task.title}</div> }));
vi.mock('./WorktreeCleanupDialog', () => ({ WorktreeCleanupDialog: () => null }));
vi.mock('./BulkPRDialog', () => ({ BulkPRDialog: () => null }));

function board(props: { tasks?: Task[]; projectId?: string } = {}) {
  return <TooltipProvider><ViewStateProvider><KanbanBoard tasks={props.tasks ?? []} projectId={props.projectId} onTaskClick={vi.fn()} /></ViewStateProvider></TooltipProvider>;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.columnPreferences = null;
  mocks.archiveTasks.mockReset();
  mocks.persistTaskStatus.mockReset();
});

const actionTask = (id: string, status: Task['status']): Task => ({
  id, specId: id, projectId: 'empty-project', title: id, description: '', status,
  subtasks: [], logs: [], createdAt: new Date(), updatedAt: new Date(),
});

describe('KanbanBoard bulk action results', () => {
  it('shows archive failure and leaves tasks available to retry', async () => {
    mocks.archiveTasks.mockResolvedValueOnce({ success: false, error: 'Storage unavailable' }).mockResolvedValueOnce({ success: true });
    render(board({ tasks: [actionTask('done-1', 'done')], projectId: 'empty-project' }));
    const archive = screen.getByRole('button', { name: 'tooltips.archiveAllDone' });
    fireEvent.click(archive);
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: 'kanban.archiveFailed', description: 'Storage unavailable', variant: 'destructive' }));
    expect(screen.getByText('done-1')).toBeInTheDocument();
    fireEvent.click(archive);
    await waitFor(() => expect(mocks.archiveTasks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.toast).toHaveBeenLastCalledWith({ title: 'kanban.archiveSuccess' }));
  });

  it('reports partial queue failures instead of a success message', async () => {
    mocks.persistTaskStatus.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    render(board({ tasks: [actionTask('first', 'backlog'), actionTask('second', 'backlog')], projectId: 'empty-project' }));
    fireEvent.click(screen.getByRole('button', { name: 'queue.queueAll' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: 'queue.queueAllFailed', description: 'queue.queueAllResult', variant: 'destructive' }));
    expect(mocks.translate).toHaveBeenCalledWith('queue.queueAllResult', { completed: 1, failed: 1 });
    expect(mocks.persistTaskStatus).toHaveBeenNthCalledWith(1, 'first', 'queue');
    expect(mocks.persistTaskStatus).toHaveBeenNthCalledWith(2, 'second', 'queue');
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'queue.queueAllSuccess' }));
  });

  it('counts transport rejection as failure and continues remaining queue moves', async () => {
    mocks.persistTaskStatus.mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValueOnce({ success: true });
    render(board({ tasks: [actionTask('first', 'backlog'), actionTask('second', 'backlog')], projectId: 'empty-project' }));
    fireEvent.click(screen.getByRole('button', { name: 'queue.queueAll' }));
    await waitFor(() => expect(mocks.translate).toHaveBeenCalledWith('queue.queueAllResult', { completed: 1, failed: 1 }));
    expect(mocks.persistTaskStatus).toHaveBeenCalledTimes(2);
  });

  it('reports complete queue failure with zero completed tasks', async () => {
    mocks.persistTaskStatus.mockResolvedValue({ success: false });
    render(board({ tasks: [actionTask('first', 'backlog')], projectId: 'empty-project' }));
    fireEvent.click(screen.getByRole('button', { name: 'queue.queueAll' }));
    await waitFor(() => expect(mocks.translate).toHaveBeenCalledWith('queue.queueAllResult', { completed: 0, failed: 1 }));
  });
});

describe('KanbanBoard active project identity', () => {
  it('loads project column preferences and ordering even with no tasks', () => {
    render(board({ projectId: 'empty-project' }));
    expect(mocks.loadPreferences).toHaveBeenCalledWith('empty-project');
    expect(mocks.loadTaskOrder).toHaveBeenCalledWith('empty-project');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);
  });

  it('opens and saves the real queue settings form for an empty project', async () => {
    render(board({ projectId: 'empty-project' }));
    fireEvent.click(screen.getByRole('button', { name: 'kanban.queueSettings' }));
    const limit = await screen.findByRole('spinbutton');
    expect(limit).toHaveValue(4);
    fireEvent.change(limit, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'common:buttons.save' }));
    await waitFor(() => expect(mocks.updateProjectSettings).toHaveBeenCalledWith('empty-project', { maxParallelTasks: 5 }));
  });

  it('persists column toggles under the explicit project identity', async () => {
    render(board({ projectId: 'empty-project' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'kanban.collapseColumn' })[0]);
    expect(mocks.toggleColumnCollapsed).toHaveBeenCalledWith('backlog');
    await waitFor(() => expect(mocks.savePreferences).toHaveBeenCalledWith('empty-project'));
  });

  it('resizes a column with keyboard and persists its project preference', () => {
    render(board({ projectId: 'empty-project' }));
    const resize = screen.getByRole('separator', { name: 'columns.backlog: kanban.resizeColumn' });
    expect(resize).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(resize, { key: 'ArrowRight' });
    expect(mocks.setColumnWidth).toHaveBeenCalledWith('backlog', 336);
    expect(mocks.savePreferences).toHaveBeenCalledWith('empty-project');
    fireEvent.keyDown(resize, { key: 'Home' });
    expect(mocks.setColumnWidth).toHaveBeenLastCalledWith('backlog', 180);
    fireEvent.keyDown(resize, { key: 'End' });
    expect(mocks.setColumnWidth).toHaveBeenLastCalledWith('backlog', 600);
  });

  it('keeps locked column sizing non-interactive', () => {
    mocks.columnPreferences = { backlog: { width: 320, isCollapsed: false, isLocked: true } };
    render(board({ projectId: 'empty-project' }));
    const resize = screen.getByRole('separator', { name: 'columns.backlog: kanban.resizeColumn' });
    expect(resize).toHaveAttribute('tabindex', '-1');
    expect(resize).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(resize, { key: 'ArrowRight' });
    expect(mocks.setColumnWidth).not.toHaveBeenCalled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('clamps keyboard sizing to the supported column width', () => {
    mocks.columnPreferences = { backlog: { width: 180, isCollapsed: false, isLocked: false } };
    render(board({ projectId: 'empty-project' }));
    fireEvent.keyDown(screen.getByRole('separator', { name: 'columns.backlog: kanban.resizeColumn' }), { key: 'ArrowLeft' });
    expect(mocks.setColumnWidth).toHaveBeenCalledWith('backlog', 180);
  });

  it('reloads preferences on project switch without needing task data', () => {
    const view = render(board({ projectId: 'empty-project' }));
    view.rerender(board({ projectId: 'next-project' }));
    expect(mocks.loadPreferences).toHaveBeenLastCalledWith('next-project');
    expect(mocks.loadTaskOrder).toHaveBeenLastCalledWith('next-project');
  });

  it('preserves legacy callers that derive project identity from tasks', () => {
    const task: Task = {
      id: 'legacy-task', specId: 'spec-1', projectId: 'legacy-project',
      title: 'Legacy board fixture', description: '', status: 'backlog',
      subtasks: [], logs: [], createdAt: new Date(), updatedAt: new Date(),
    };
    render(board({ tasks: [task] }));
    expect(mocks.loadPreferences).toHaveBeenCalledWith('legacy-project');
    expect(mocks.loadTaskOrder).toHaveBeenCalledWith('legacy-project');
  });

  it('does not create projectless settings when there is no active project', () => {
    render(board());
    fireEvent.click(screen.getByRole('button', { name: 'kanban.queueSettings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.loadPreferences).not.toHaveBeenCalled();
    expect(mocks.updateProjectSettings).not.toHaveBeenCalled();
  });
});

/** jsdom has no layout engine. These DOM dimensions exercise the production
 * scroll boundary calculation; actual rendered overflow is checked in Electron. */
function setViewportMetrics({ width, contentWidth, position = 0 }: { width: number; contentWidth: number; position?: number }) {
  const viewport = screen.getByRole('region', { name: 'navigation:items.kanban' });
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: width },
    scrollWidth: { configurable: true, value: contentWidth },
  });
  viewport.scrollLeft = position;
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    viewport.scrollLeft = options.left ?? viewport.scrollLeft;
    fireEvent.scroll(viewport);
  });
  Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo });
  fireEvent.scroll(viewport);
  return { viewport, scrollTo };
}

describe('KanbanBoard horizontal column navigation', () => {
  it('does not show scroll controls when all columns fit', () => {
    render(board({ projectId: 'empty-project' }));
    setViewportMetrics({ width: 1200, contentWidth: 1200 });
    expect(screen.queryByRole('button', { name: 'kanban.scrollLeft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'kanban.scrollRight' })).not.toBeInTheDocument();
  });

  it('shows keyboard-focusable controls and disables each end correctly', () => {
    render(board({ projectId: 'empty-project' }));
    const { viewport, scrollTo } = setViewportMetrics({ width: 600, contentWidth: 1200 });
    const left = screen.getByRole('button', { name: 'kanban.scrollLeft' });
    const right = screen.getByRole('button', { name: 'kanban.scrollRight' });
    expect(left).toBeDisabled();
    expect(right).toBeEnabled();
    expect(right).toHaveAttribute('aria-controls', viewport.id);
    right.focus();
    expect(right).toHaveFocus();
    fireEvent.click(right);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 480, behavior: 'smooth' });
    expect(viewport.scrollLeft).toBe(480);
    expect(left).toBeEnabled();
    expect(right).toBeEnabled();
    fireEvent.click(right);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 600, behavior: 'smooth' });
    expect(viewport.scrollLeft).toBe(600);
    expect(left).toBeEnabled();
    expect(right).toBeDisabled();
    fireEvent.click(left);
    fireEvent.click(left);
    expect(viewport.scrollLeft).toBe(0);
    expect(left).toBeDisabled();
    expect(right).toBeEnabled();
    expect(mocks.setColumnWidth).not.toHaveBeenCalled();
    expect(mocks.toggleColumnCollapsed).not.toHaveBeenCalled();
    expect(mocks.savePreferences).not.toHaveBeenCalled();
  });

  it('updates edges after direct trackpad scrolling and tolerates overscroll', () => {
    render(board({ projectId: 'empty-project' }));
    const { viewport } = setViewportMetrics({ width: 600, contentWidth: 1200, position: 240 });
    const left = screen.getByRole('button', { name: 'kanban.scrollLeft' });
    const right = screen.getByRole('button', { name: 'kanban.scrollRight' });
    expect(left).toBeEnabled();
    expect(right).toBeEnabled();
    viewport.scrollLeft = -10;
    fireEvent.scroll(viewport);
    expect(left).toBeDisabled();
    viewport.scrollLeft = 620;
    fireEvent.scroll(viewport);
    expect(right).toBeDisabled();
  });

  it('removes controls when viewport resizing resolves the overflow', () => {
    render(board({ projectId: 'empty-project' }));
    const { viewport } = setViewportMetrics({ width: 600, contentWidth: 1200 });
    expect(screen.getByRole('button', { name: 'kanban.scrollRight' })).toBeInTheDocument();
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1300 });
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('button', { name: 'kanban.scrollRight' })).not.toBeInTheDocument();
  });

  it('uses immediate scrolling when the user requests reduced motion', () => {
    render(board({ projectId: 'empty-project' }));
    const { scrollTo } = setViewportMetrics({ width: 600, contentWidth: 1200 });
    document.documentElement.setAttribute('data-reduce-motion', 'true');
    try {
      fireEvent.click(screen.getByRole('button', { name: 'kanban.scrollRight' }));
      expect(scrollTo).toHaveBeenCalledWith({ left: 480, behavior: 'instant' });
    } finally {
      document.documentElement.removeAttribute('data-reduce-motion');
    }
  });

  it('respects the system reduced-motion preference even when the app flag is false', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    document.documentElement.setAttribute('data-reduce-motion', 'false');
    try {
      render(board({ projectId: 'empty-project' }));
      const { scrollTo } = setViewportMetrics({ width: 600, contentWidth: 1200 });
      fireEvent.click(screen.getByRole('button', { name: 'kanban.scrollRight' }));
      expect(scrollTo).toHaveBeenCalledWith({ left: 480, behavior: 'instant' });
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    } finally {
      window.matchMedia = originalMatchMedia;
      document.documentElement.removeAttribute('data-reduce-motion');
    }
  });
});
