import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { AUTO_BUILD_PATHS } from '../../../../shared/constants';
import { dismissAllIdeas, updateIdeaStatus } from '../idea-manager';
import { transformIdeaFromSnakeCase, transformSessionFromSnakeCase } from '../transformers';
import type { RawIdea } from '../types';

const mockProject = vi.hoisted(() => ({ id: 'project', path: '' }));
vi.mock('../../../project-store', () => ({ projectStore: { getProject: (id: string) => id === mockProject.id ? mockProject : undefined } }));
vi.mock('../../../localized-text', () => ({ nativeText: (key: string) => key }));

const event = {} as IpcMainInvokeEvent;
const base: RawIdea = { id: 'idea', type: 'code_improvements', title: 'Idea', description: 'Description', rationale: 'Rationale', status: 'archived', created_at: '2026-01-01T00:00:00Z', linked_task_id: '001-linked' };
let testDirectory: string;
let ideationFile: string;
beforeEach(() => {
  testDirectory = mkdtempSync(path.join(tmpdir(), 'forge-idea-lifecycle-'));
  mockProject.path = testDirectory;
  const ideationDirectory = path.join(testDirectory, AUTO_BUILD_PATHS.IDEATION_DIR);
  mkdirSync(ideationDirectory, { recursive: true });
  ideationFile = path.join(ideationDirectory, AUTO_BUILD_PATHS.IDEATION_FILE);
});
afterEach(() => rmSync(testDirectory, { recursive: true, force: true }));

describe('persisted idea lifecycle', () => {
  it.each(['code_improvements', 'ui_ux_improvements', 'documentation_gaps', 'security_hardening', 'performance_optimizations', 'code_quality', 'unknown_type'])('keeps linked tasks when loading %s ideas', type => {
    expect(transformIdeaFromSnakeCase({ ...base, type })).toMatchObject({ status: 'archived', taskId: '001-linked' });
  });

  it('keeps supported camelCase task links without replacing the persisted snake_case link', () => {
    expect(transformIdeaFromSnakeCase({ ...base, taskId: 'other-link' }).taskId).toBe('001-linked');
    expect(transformIdeaFromSnakeCase({ ...base, linked_task_id: undefined, taskId: 'existing-link' }).taskId).toBe('existing-link');
  });

  it('bulk dismiss preserves archived and converted task links on disk and on reload', async () => {
    writeFileSync(ideationFile, JSON.stringify({ ideas: [base, { ...base, id: 'converted', status: 'converted' }, { ...base, id: 'dismissed', status: 'dismissed' }, { ...base, id: 'draft', status: 'draft', linked_task_id: undefined }, { ...base, id: 'selected', status: 'selected', linked_task_id: undefined }] }));
    const result = await dismissAllIdeas(event, 'project');
    expect(result).toEqual({ success: true, data: { dismissedCount: 2 } });
    const persisted = JSON.parse(readFileSync(ideationFile, 'utf8'));
    expect(persisted.ideas[0]).toMatchObject({ status: 'archived', linked_task_id: '001-linked' });
    expect(persisted.ideas[1]).toMatchObject({ status: 'converted', linked_task_id: '001-linked' });
    expect(transformSessionFromSnakeCase(persisted, 'project').ideas[0]).toMatchObject({ status: 'archived', taskId: '001-linked' });
  });

  it('restores linked and unlinked ideas through existing statuses without deleting links', async () => {
    writeFileSync(ideationFile, JSON.stringify({ ideas: [base, { ...base, id: 'dismissed', status: 'dismissed', linked_task_id: undefined }] }));
    expect(await updateIdeaStatus(event, 'project', 'idea', 'converted')).toEqual({ success: true });
    expect(await updateIdeaStatus(event, 'project', 'dismissed', 'draft')).toEqual({ success: true });
    const persisted = JSON.parse(readFileSync(ideationFile, 'utf8'));
    expect(persisted.ideas[0]).toMatchObject({ status: 'converted', linked_task_id: '001-linked' });
    expect(persisted.ideas[1]).toMatchObject({ status: 'draft' });
  });
});
