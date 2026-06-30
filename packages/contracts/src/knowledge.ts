import { z } from 'zod';

const projectId = z.uuid();
const sourceId = z.uuid();
export const knowledgeSourceSchema = z.strictObject({
  sourceId, projectId, relativePath: z.string().min(1).max(1024),
  version: z.number().int().min(1), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['active', 'revoked']), byteSize: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(), createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const knowledgeChunkSchema = z.strictObject({
  sourceId, projectId, version: z.number().int().min(1),
  ordinal: z.number().int().nonnegative(), startLine: z.number().int().min(1),
  endLine: z.number().int().min(1), heading: z.string().nullable(),
  text: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceRef: z.string().min(1), status: z.enum(['active', 'superseded', 'revoked']),
});
export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

export const knowledgeSearchResultSchema = z.strictObject({
  indexVersion: z.literal('forge-knowledge-search/v1-fts5-trigram-cjk-short'),
  results: knowledgeChunkSchema.array(),
});
export type KnowledgeSearchResult = z.infer<typeof knowledgeSearchResultSchema>;

export const knowledgeCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('list'), payload: z.strictObject({ projectId }) }),
  z.strictObject({ type: z.literal('import'), payload: z.strictObject({
    projectId, relativePath: z.string().min(1).max(1024),
  }) }),
  z.strictObject({ type: z.literal('chunk'), payload: z.strictObject({
    projectId, sourceId, version: z.number().int().min(1),
    ordinal: z.number().int().nonnegative(),
  }) }),
  z.strictObject({ type: z.literal('revoke'), payload: z.strictObject({
    projectId, sourceId,
  }) }),
  z.strictObject({ type: z.literal('search'), payload: z.strictObject({
    projectId, environmentId: z.uuid(), query: z.string().min(1).max(160),
    sourceId: sourceId.optional(), version: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }) }),
]);
export type KnowledgeCommand = z.infer<typeof knowledgeCommandSchema>;
