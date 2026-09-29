import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AUTO_BUILD_PATHS } from '../../shared/constants';
import type { InsightsTaskSource, Task, TaskMetadata } from '../../shared/types';

/** Read the persisted source marker, including when the session badge save failed. */
export function findInsightsTask(specsDir: string, source: InsightsTaskSource): string | undefined {
  if (!existsSync(specsDir)) return undefined;
  for (const entry of readdirSync(specsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+-/.test(entry.name)) continue;
    let metadata: TaskMetadata;
    try {
      metadata = JSON.parse(readFileSync(path.join(specsDir, entry.name, 'task_metadata.json'), 'utf-8'));
    } catch {
      continue;
    }
    const saved = metadata?.insightsSource;
    if (metadata?.sourceType === 'insights' && saved?.sessionId === source.sessionId
      && saved.messageId === source.messageId && saved.suggestionIndex === source.suggestionIndex) {
      return entry.name;
    }
  }
  return undefined;
}

/** Publish the plan and source marker together, so a failed write leaves no partial task. */
export function createInsightsTask(
  projectId: string,
  specsDir: string,
  title: string,
  description: string,
  metadata: TaskMetadata
): Task {
  mkdirSync(specsDir, { recursive: true });
  const existingNumbers = readdirSync(specsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => Number.parseInt(entry.name.match(/^(\d+)/)?.[1] ?? '0', 10))
    .filter(number => number > 0);
  const specNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').substring(0, 50) || 'task';
  const specId = `${String(specNumber).padStart(3, '0')}-${slug}`;
  const specDir = path.join(specsDir, specId);
  const temporaryDir = path.join(specsDir, `.insights-task-${randomUUID()}.tmp`);
  const now = new Date();
  try {
    mkdirSync(temporaryDir);
    const plan = {
      feature: title,
      description,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      status: 'pending',
      phases: [],
    };
    writeFileSync(path.join(temporaryDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN), JSON.stringify(plan, null, 2), 'utf-8');
    writeFileSync(path.join(temporaryDir, 'task_metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');
    renameSync(temporaryDir, specDir);
  } finally {
    if (existsSync(temporaryDir)) rmSync(temporaryDir, { recursive: true, force: true });
  }
  return {
    id: specId,
    specId,
    projectId,
    title,
    description,
    status: 'backlog',
    subtasks: [],
    logs: [],
    metadata,
    createdAt: now,
    updatedAt: now,
  };
}
