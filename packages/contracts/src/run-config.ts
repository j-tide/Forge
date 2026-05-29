import { z } from 'zod';
import { taskContractSchema } from './task-draft.js';
import { projectEnvironmentSchema } from './project.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const versionLock = z.strictObject({
  id: z.string().min(1).max(128), version: z.string().min(1).max(80), contentHash: hash,
});
export const runVersionLockSchema = versionLock;
export const runProfileLockSchema = versionLock.extend({ executorPluginId: z.string().min(1).max(128) }).strict();
export const runBudgetSchema = z.strictObject({
  maxDurationMs: z.int().min(1_000).max(86_400_000),
  maxTurns: z.int().min(1).max(1_000),
  maxTokens: z.int().min(1).max(100_000_000),
  maxToolCalls: z.int().min(1).max(100_000),
});
export const runConfigSelectionSchema = z.strictObject({
  runId: z.uuid(), projectId: z.uuid(), taskId: z.uuid(),
  expectedTaskRevision: z.int().positive(),
  workflow: runVersionLockSchema, profile: runProfileLockSchema,
  plugins: z.array(runVersionLockSchema).max(32), budget: runBudgetSchema,
  environmentId: z.uuid(), expectedEnvironmentRevision: z.int().positive(),
});
export const runConfigSnapshotSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), runId: z.uuid(), projectId: z.uuid(), taskId: z.uuid(),
  taskRevision: z.int().positive(), taskContractHash: hash, taskContract: taskContractSchema,
  workflow: runVersionLockSchema, profile: runProfileLockSchema,
  plugins: z.array(runVersionLockSchema).max(32), budget: runBudgetSchema,
  environment: projectEnvironmentSchema, createdAt: z.iso.datetime(), snapshotHash: hash,
});

export type RunConfigSelection = z.infer<typeof runConfigSelectionSchema>;
export type RunConfigSnapshot = z.infer<typeof runConfigSnapshotSchema>;
