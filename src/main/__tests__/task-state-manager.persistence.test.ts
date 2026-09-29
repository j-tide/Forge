import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS, PROJECT_DATA_DIR } from '../../shared/constants';
import type { Project, Task } from '../../shared/types';
import { getPlanPath, persistPlanStatusAndReasonSync } from '../ipc-handlers/task/plan-file-utils';
import { safeSendToRenderer } from '../ipc-handlers/utils';
import { projectStore } from '../project-store';
import { TaskStateManager, TaskStatusPersistenceError } from '../task-state-manager';
import { findTaskWorktree } from '../worktree-paths';

// Keep plan parsing, atomic writes, and filesystem errors real. Only the entropy
// is fixed so a directory can deterministically collide with the atomic temp file.
vi.mock('crypto', async (importOriginal) => ({
  ...await importOriginal<typeof import('crypto')>(),
  randomBytes: () => Buffer.alloc(8, 0x42),
}));
vi.mock('../project-store', () => ({
  projectStore: { invalidateTasksCache: vi.fn() },
}));
vi.mock('../worktree-paths', () => ({ findTaskWorktree: vi.fn(() => null) }));
vi.mock('../ipc-handlers/utils', () => ({ safeSendToRenderer: vi.fn() }));

describe('TaskStateManager real plan persistence', () => {
  let rootPath: string;
  let planPath: string;
  let manager: TaskStateManager;
  let project: Project;
  let task: Task;

  const originalPlan = {
    feature: 'Preserve this task plan',
    status: 'human_review',
    planStatus: 'review',
    reviewReason: 'completed',
    xstateState: 'human_review',
    executionPhase: 'complete',
    created_at: '2026-09-28T00:00:00.000Z',
    updated_at: '2026-09-28T00:00:00.000Z',
    phases: [{ phase: 1, name: 'Implementation', subtasks: [{ id: 'step-1', status: 'completed' }] }],
    customMetadata: { mustRemain: true },
  };

  const writeOriginalPlan = (): string => {
    const bytes = `${JSON.stringify(originalPlan, null, 2)}\n`;
    mkdirSync(path.dirname(planPath), { recursive: true });
    writeFileSync(planPath, bytes);
    return bytes;
  };

  const doneEvents = () => vi.mocked(safeSendToRenderer).mock.calls.filter(
    ([, channel, taskId, status]) => channel === IPC_CHANNELS.TASK_STATUS_CHANGE
      && taskId === task.id && status === 'done',
  );

  const expectMarkDonePersistenceFailure = () => {
    let failure: unknown;
    try {
      manager.handleManualStatusChange(task.id, 'done', task, project);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TaskStatusPersistenceError);
    expect(failure).toMatchObject({ code: 'STATUS_PERSISTENCE_FAILED' });
  };

  const expectDonePersisted = () => {
    expect(manager.getCurrentState(task.id)).toBe('done');
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    expect(plan).toMatchObject({
      feature: originalPlan.feature,
      status: 'done',
      planStatus: 'completed',
      xstateState: 'done',
      executionPhase: 'complete',
      phases: originalPlan.phases,
      customMetadata: originalPlan.customMetadata,
      created_at: originalPlan.created_at,
    });
    expect(plan.reviewReason).toBeUndefined();
    expect(doneEvents()).toHaveLength(1);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(safeSendToRenderer).mockReset();
    vi.mocked(findTaskWorktree).mockReturnValue(null);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    rootPath = mkdtempSync(path.join(tmpdir(), 'forge-task-status-persistence-'));
    const now = new Date('2026-09-28T00:00:00.000Z');
    project = {
      id: 'persistence-project',
      name: 'Persistence fixture',
      path: rootPath,
      autoBuildPath: PROJECT_DATA_DIR,
      settings: {
        model: 'fixture-model', memoryBackend: 'file', linearSync: false,
        notifications: { onTaskComplete: false, onTaskFailed: false, onReviewNeeded: false, sound: false },
      },
      createdAt: now,
      updatedAt: now,
    };
    task = {
      id: 'persistence-task',
      specId: '001-persistence',
      projectId: project.id,
      title: 'Persist before marking done',
      description: 'A real filesystem regression fixture',
      status: 'human_review',
      reviewReason: 'completed',
      subtasks: [],
      logs: [],
      createdAt: now,
      updatedAt: now,
    };
    planPath = getPlanPath(project, task);
    manager = new TaskStateManager();
    manager.configure(() => null);
  });

  afterEach(() => {
    manager.clearAllTasks();
    rmSync(rootPath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns a real false acknowledgment when the plan filename is a directory', () => {
    mkdirSync(planPath, { recursive: true });
    const markerPath = path.join(planPath, 'preserve.txt');
    writeFileSync(markerPath, 'Do not replace a colliding directory');

    expect(persistPlanStatusAndReasonSync(planPath, 'done', undefined, project.id, 'done', 'complete')).toBe(false);

    expect(statSync(planPath).isDirectory()).toBe(true);
    expect(readFileSync(markerPath, 'utf-8')).toBe('Do not replace a colliding directory');
    expect(projectStore.invalidateTasksCache).not.toHaveBeenCalled();
  });

  it('keeps the actor in human review on a directory collision and succeeds after repairing the path', () => {
    mkdirSync(planPath, { recursive: true });

    expectMarkDonePersistenceFailure();

    expect(manager.getCurrentState(task.id)).toBe('human_review');
    expect(doneEvents()).toHaveLength(0);
    expect(statSync(planPath).isDirectory()).toBe(true);
    expect(projectStore.invalidateTasksCache).not.toHaveBeenCalled();

    rmSync(planPath, { recursive: true });
    writeOriginalPlan();

    expect(manager.handleManualStatusChange(task.id, 'done', task, project)).toBe(true);
    expectDonePersisted();
  });

  it('preserves the original bytes on an actual atomic write error and permits a successful retry', () => {
    const bytes = writeOriginalPlan();
    const tempCollision = path.join(path.dirname(planPath), '.implementation_plan.json.tmp.4242424242424242');
    mkdirSync(tempCollision);

    expectMarkDonePersistenceFailure();

    expect(manager.getCurrentState(task.id)).toBe('human_review');
    expect(readFileSync(planPath, 'utf-8')).toBe(bytes);
    expect(statSync(tempCollision).isDirectory()).toBe(true);
    expect(readdirSync(path.dirname(planPath)).sort()).toEqual([
      '.implementation_plan.json.tmp.4242424242424242', 'implementation_plan.json',
    ]);
    expect(doneEvents()).toHaveLength(0);
    expect(projectStore.invalidateTasksCache).not.toHaveBeenCalled();

    rmSync(tempCollision, { recursive: true });
    const savedAtDoneEmission = vi.fn();
    vi.mocked(safeSendToRenderer).mockImplementation((_, channel, taskId, status) => {
      if (channel === IPC_CHANNELS.TASK_STATUS_CHANGE && taskId === task.id && status === 'done') {
        // Inspect disk inside the notification callback: checking only after the
        // operation returns would miss an event published before its write ACK.
        const saved = JSON.parse(readFileSync(planPath, 'utf-8'));
        savedAtDoneEmission(saved.status, saved.xstateState);
        expect(saved).toMatchObject({ status: 'done', xstateState: 'done' });
      }
      return true;
    });

    expect(manager.handleManualStatusChange(task.id, 'done', task, project)).toBe(true);
    expect(savedAtDoneEmission).toHaveBeenCalledExactlyOnceWith('done', 'done');
    expectDonePersisted();
    expect(readdirSync(path.dirname(planPath))).toEqual(['implementation_plan.json']);
  });

  it('does not mark done or replace an unrepairable existing plan', () => {
    mkdirSync(path.dirname(planPath), { recursive: true });
    const invalidBytes = '{ "feature": "Keep the broken plan for repair", "phases": [';
    writeFileSync(planPath, invalidBytes);

    expectMarkDonePersistenceFailure();

    expect(manager.getCurrentState(task.id)).toBe('human_review');
    expect(readFileSync(planPath, 'utf-8')).toBe(invalidBytes);
    expect(doneEvents()).toHaveLength(0);
    expect(projectStore.invalidateTasksCache).not.toHaveBeenCalled();
  });

  it('returns a false UI event acknowledgment instead of advancing state on a filesystem failure', () => {
    mkdirSync(planPath, { recursive: true });

    expect(manager.handleUiEvent(task.id, { type: 'MARK_DONE' }, task, project)).toBe(false);

    expect(manager.getCurrentState(task.id)).toBe('human_review');
    expect(doneEvents()).toHaveLength(0);

    rmSync(planPath, { recursive: true });
    writeOriginalPlan();

    expect(manager.handleUiEvent(task.id, { type: 'MARK_DONE' }, task, project)).toBe(true);
    expectDonePersisted();
  });

  it('retains the primary acknowledgment when an existing best-effort worktree mirror cannot be written', () => {
    writeOriginalPlan();
    const worktreePath = path.join(rootPath, 'task-worktree');
    const mirrorPath = getPlanPath({ ...project, path: worktreePath }, task);
    mkdirSync(mirrorPath, { recursive: true });
    const markerPath = path.join(mirrorPath, 'preserve.txt');
    writeFileSync(markerPath, 'Keep the mirror collision available for repair');
    vi.mocked(findTaskWorktree).mockReturnValue(worktreePath);

    expect(manager.handleManualStatusChange(task.id, 'done', task, project)).toBe(true);

    expectDonePersisted();
    expect(statSync(mirrorPath).isDirectory()).toBe(true);
    expect(readFileSync(markerPath, 'utf-8')).toBe('Keep the mirror collision available for repair');
    expect(projectStore.invalidateTasksCache).toHaveBeenCalledWith(project.id);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(
      'Main task status saved, but the worktree mirror could not be updated',
    ));
  });
});
