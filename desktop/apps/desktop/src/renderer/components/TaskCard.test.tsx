/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import type { Task } from '../../shared/types';

const taskActions = vi.hoisted(() => ({
  startTaskOrQueue: vi.fn(),
  stopTask: vi.fn(),
  checkTaskRunning: vi.fn(),
  recoverStuckTask: vi.fn(),
  archiveTasks: vi.fn(),
  isIncompleteHumanReview: vi.fn(),
  hasRecentActivity: vi.fn(),
}));

vi.mock('../stores/task-store', () => taskActions);
vi.mock('../hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// Component fixture only: this task is never persisted or presented as a real run.
const task: Task = {
  id: 'task-card-accessibility',
  specId: 'task-card-accessibility',
  projectId: 'component-test-project',
  title: 'Keyboard-accessible task details',
  description: 'Open the task details without starting its execution.',
  status: 'backlog',
  subtasks: [],
  logs: [],
  createdAt: new Date('2026-09-28T00:00:00Z'),
  updatedAt: new Date('2026-09-28T00:00:00Z'),
};

const ancestors: HTMLDivElement[] = [];

function renderWithAncestorListeners(openDetails: () => void) {
  const ancestor = document.createElement('div');
  const container = document.createElement('div');
  ancestor.append(container);
  document.body.append(ancestor);
  ancestors.push(ancestor);
  const ancestorKeyDown = vi.fn();
  const ancestorClick = vi.fn();
  ancestor.addEventListener('keydown', ancestorKeyDown);
  ancestor.addEventListener('click', ancestorClick);
  render(<TaskCard task={task} onClick={openDetails} />, { container });
  return { ancestorKeyDown, ancestorClick };
}

beforeEach(() => {
  taskActions.startTaskOrQueue.mockResolvedValue({ success: true, action: 'started' });
  taskActions.isIncompleteHumanReview.mockReturnValue(false);
  taskActions.hasRecentActivity.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  for (const ancestor of ancestors) ancestor.remove();
  ancestors.length = 0;
});

describe('TaskCard detail entry and independent actions', () => {
  it('provides a focusable native title button inside its heading', () => {
    render(<TaskCard task={task} onClick={vi.fn()} />);

    const title = screen.getByRole('button', { name: task.title });
    const heading = screen.getByRole('heading', { level: 3, name: task.title });
    expect(heading.contains(title)).toBe(true);
    expect(title.tagName).toBe('BUTTON');
    expect(title.getAttribute('type')).toBe('button');
    expect(title.tabIndex).toBe(0);
    title.focus();
    expect(document.activeElement).toBe(title);
  });

  it.each([
    { key: 'Enter', code: 'Enter' },
    { key: ' ', code: 'Space' },
  ])('keeps $code activation native and outside the drag sensor', ({ key, code }) => {
    const openDetails = vi.fn();
    const { ancestorKeyDown, ancestorClick } = renderWithAncestorListeners(openDetails);

    const title = screen.getByRole('button', { name: task.title });
    title.focus();
    const event = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true });
    expect(fireEvent(title, event)).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(ancestorKeyDown).not.toHaveBeenCalled();
    expect(openDetails).not.toHaveBeenCalled();

    // jsdom does not synthesize the native button click from key events. Check
    // the resulting keyboard activation click separately; Electron QA covers
    // the real browser key-to-click behavior without this simulation.
    fireEvent.click(title, { detail: 0 });
    expect(openDetails).toHaveBeenCalledTimes(1);
    expect(ancestorClick).not.toHaveBeenCalled();
    expect(taskActions.startTaskOrQueue).not.toHaveBeenCalled();
  });

  it('leaves other keyboard events available to the surrounding board', () => {
    const openDetails = vi.fn();
    const { ancestorKeyDown } = renderWithAncestorListeners(openDetails);

    fireEvent.keyDown(screen.getByRole('button', { name: task.title }), { key: 'Tab', code: 'Tab' });
    expect(ancestorKeyDown).toHaveBeenCalledTimes(1);
    expect(openDetails).not.toHaveBeenCalled();
  });

  it('opens details once when its title is clicked', () => {
    const openDetails = vi.fn();
    const { ancestorClick } = renderWithAncestorListeners(openDetails);

    fireEvent.click(screen.getByRole('button', { name: task.title }));
    expect(openDetails).toHaveBeenCalledTimes(1);
    expect(ancestorClick).not.toHaveBeenCalled();
  });

  it('uses the new detail callback after rerendering with the same task object', () => {
    const previousOpenDetails = vi.fn();
    const nextOpenDetails = vi.fn();
    const { rerender } = render(<TaskCard task={task} onClick={previousOpenDetails} />);

    rerender(<TaskCard task={task} onClick={nextOpenDetails} />);
    fireEvent.click(screen.getByRole('button', { name: task.title }));

    expect(nextOpenDetails).toHaveBeenCalledTimes(1);
    expect(previousOpenDetails).not.toHaveBeenCalled();
  });

  it('keeps clicking the non-interactive card content as a detail shortcut', () => {
    const openDetails = vi.fn();
    render(<TaskCard task={task} onClick={openDetails} />);

    fireEvent.click(screen.getByText(task.description));
    expect(openDetails).toHaveBeenCalledTimes(1);
    expect(taskActions.startTaskOrQueue).not.toHaveBeenCalled();
  });

  it('starts the task without also opening details', () => {
    const openDetails = vi.fn();
    render(<TaskCard task={task} onClick={openDetails} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(taskActions.startTaskOrQueue).toHaveBeenCalledExactlyOnceWith(task.id);
    expect(openDetails).not.toHaveBeenCalled();
  });

  it('toggles selection without opening details or starting the task', () => {
    const openDetails = vi.fn();
    const toggleSelection = vi.fn();
    render(
      <TaskCard task={task} onClick={openDetails} isSelectable isSelected={false} onToggleSelect={toggleSelection} />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    expect(toggleSelection).toHaveBeenCalledTimes(1);
    expect(openDetails).not.toHaveBeenCalled();
    expect(taskActions.startTaskOrQueue).not.toHaveBeenCalled();
  });

  it('opens the action trigger without opening task details', () => {
    const openDetails = vi.fn();
    render(<TaskCard task={task} onClick={openDetails} onStatusChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Task actions' }));
    expect(openDetails).not.toHaveBeenCalled();
    expect(taskActions.startTaskOrQueue).not.toHaveBeenCalled();
  });
});
