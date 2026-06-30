import { z } from 'zod';

const uuid = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const memoryEvidenceSchema = z.strictObject({
  sourceRef: z.string().min(1).max(256), sourceHash: hash,
});
export const projectMemorySchema = z.strictObject({
  memoryId: uuid, projectId: uuid, environmentId: uuid.nullable(),
  scope: z.enum(['project', 'environment']),
  kind: z.enum(['environment_fact', 'project_convention', 'confirmed_decision', 'workflow_hint']),
  subjectKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/),
  text: z.string(), status: z.enum(['candidate', 'validated', 'stale', 'revoked']),
  revision: z.int().min(1), sources: memoryEvidenceSchema.array().max(8),
  contentHash: hash, expiresAt: z.iso.datetime().nullable(),
  lastVerifiedAt: z.iso.datetime().nullable(), createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProjectMemory = z.infer<typeof projectMemorySchema>;

export const memorySearchResultSchema = z.strictObject({
  indexVersion: z.literal('forge-project-memory/v1-fts5-trigram'),
  items: projectMemorySchema.array(),
  conflicts: z.strictObject({
    validatedMemoryId: uuid, candidateMemoryId: uuid,
    subjectKey: z.string(), question: z.string(),
  }).array(),
});
export type MemorySearchResult = z.infer<typeof memorySearchResultSchema>;

const projectId = uuid;
export const memoryCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('list'), payload: z.strictObject({ projectId }) }),
  z.strictObject({ type: z.literal('get'), payload: z.strictObject({ projectId,
    memoryId: uuid }) }),
  z.strictObject({ type: z.literal('retrieve'), payload: z.strictObject({
    projectId, environmentId: uuid, query: z.string().min(1).max(160),
    limit: z.int().min(1).max(50).optional(),
  }) }),
  z.strictObject({ type: z.literal('propose'), payload: z.strictObject({
    projectId, environmentId: uuid.nullable(), scope: z.enum(['project', 'environment']),
    kind: z.enum(['environment_fact', 'project_convention', 'confirmed_decision', 'workflow_hint']),
    subjectKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,127}$/),
    text: z.string().min(1).max(2000), sources: memoryEvidenceSchema.array().min(1).max(8),
    expiresAt: z.iso.datetime().nullable().optional(), idempotencyKey: uuid,
  }) }),
  z.strictObject({ type: z.literal('edit'), payload: z.strictObject({
    projectId, memoryId: uuid, expectedRevision: z.int().min(1),
    text: z.string().min(1).max(2000), expiresAt: z.iso.datetime().nullable().optional(),
  }) }),
  z.strictObject({ type: z.literal('decide'), payload: z.strictObject({
    projectId, memoryId: uuid, expectedRevision: z.int().min(1),
    decision: z.enum(['validate', 'deprecate', 'revoke']),
    reason: z.string().min(12).max(2000), confirmed: z.literal(true),
    decisionId: uuid, replaceMemoryId: uuid.nullable().optional(),
  }) }),
]);
export type MemoryCommand = z.infer<typeof memoryCommandSchema>;
