import { z } from 'zod';

export const agentProfileSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  revision: z.number().int().min(1),
  name: z.string().min(1).max(160),
  role: z.enum(['refiner', 'planner', 'developer', 'reviewer']),
  executorId: z.string().min(1).max(128),
  modelId: z.string().min(1).max(128).nullable(),
  promptTemplate: z.string().min(1).max(4096),
  contextProviders: z.array(z.string().min(1).max(128)).max(32),
  policyProfile: z.enum(['workspace-write', 'read-only', 'read-only-no-network', 'approval-required']),
  limits: z.strictObject({ maxTurns: z.number().int().min(1).max(1000),
    maxSeconds: z.number().int().min(1).max(3600),
    maxOutputTokens: z.number().int().min(1).max(100_000) }),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;

export const agentProfileSaveSchema = z.strictObject({
  profile: agentProfileSchema,
  expectedRevision: z.number().int().min(0),
});
export type AgentProfileSave = z.infer<typeof agentProfileSaveSchema>;

export const agentProfileCatalogSchema = z.strictObject({
  profiles: z.array(agentProfileSchema),
  availability: z.array(z.strictObject({
    profileId: z.string(), revision: z.number().int(), executorId: z.string(),
    modelId: z.string().nullable(), runnable: z.boolean(), reason: z.string().nullable(),
  })),
  executors: z.array(z.strictObject({
    executorId: z.string(), available: z.boolean(), modelIds: z.array(z.string()),
    readOnlyEnforced: z.boolean(), networkPolicyEnforced: z.boolean(),
    approval: z.boolean(), reason: z.string().nullable(),
  })),
  modelProviders: z.array(z.strictObject({
    providerId: z.string(), available: z.boolean(), modelIds: z.array(z.string()),
    structuredOutput: z.boolean(), textStreaming: z.boolean(), usageReporting: z.boolean(),
    tokenLimitEnforced: z.boolean(),
    authentication: z.string(), reason: z.string().nullable(),
  })),
});
export type AgentProfileCatalog = z.infer<typeof agentProfileCatalogSchema>;
