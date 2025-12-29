import { z } from 'zod';

export const projectTrustVersion = 'project-trust/v1' as const;
const timestamp = z.iso.datetime();
const scriptNames = ['dev', 'build', 'test', 'lint', 'typecheck'] as const;
export const projectScriptsSchema = z.strictObject(Object.fromEntries(scriptNames.map((name) => [name, z.string().max(400).nullable()])) as Record<typeof scriptNames[number], z.ZodNullable<z.ZodString>>);

export const projectProbeSchema = z.strictObject({
  rootPath: z.string().min(1).max(4096),
  name: z.string().min(1).max(240),
  repositoryType: z.enum(['git', 'none']),
  gitRoot: z.string().max(4096).nullable(),
  currentBranch: z.string().max(240).nullable(),
  defaultBranch: z.string().max(240).nullable(),
  workingTree: z.enum(['clean', 'dirty', 'unknown']),
  remoteConfigured: z.boolean(),
  packageManager: z.enum(['pnpm', 'npm', 'yarn', 'conflict', 'unknown']),
  packageManagerEvidence: z.array(z.string().max(80)).max(3),
  projectType: z.enum(['vue', 'react', 'electron', 'node', 'python', 'java', 'rust', 'unknown']),
  detectedRuntime: z.array(z.string().max(80)).max(8),
  scripts: projectScriptsSchema,
  scriptsHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  capabilities: z.strictObject({ gitWorktree: z.boolean(), declaredScripts: z.boolean() }),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  probedAt: timestamp,
  existingProject: z.strictObject({ projectId: z.uuid(), revision: z.int().positive(), archived: z.boolean() }).nullable().optional(),
});

export const forgeProjectSchema = z.strictObject({
  projectId: z.uuid(),
  environmentId: z.uuid(),
  name: z.string().min(1).max(240),
  rootPath: z.string().min(1).max(4096),
  repositoryType: z.enum(['git', 'none']),
  gitRoot: z.string().max(4096).nullable(),
  defaultBranch: z.string().max(240).nullable(),
  trusted: z.literal(true),
  trustVersion: z.literal(projectTrustVersion),
  trustApprovedAt: timestamp,
  environmentSummaryHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: timestamp,
  updatedAt: timestamp,
  lastOpenedAt: timestamp,
  revision: z.int().positive(),
  archivedAt: timestamp.nullable(),
  probe: projectProbeSchema,
});

export const environmentConfigSchema = z.strictObject({
  commandPresetIds: z.array(z.uuid()).max(64),
  envRefs: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/)).max(64),
  networkMode: z.literal('trusted-local'),
});

export const projectEnvironmentSchema = z.strictObject({
  environmentId: z.uuid(), projectId: z.uuid(), name: z.string().trim().min(1).max(120),
  config: environmentConfigSchema, revision: z.int().positive(),
  createdAt: timestamp, updatedAt: timestamp, archivedAt: timestamp.nullable(),
});

export const commandPresetSchema = z.strictObject({
  presetId: z.uuid(), projectId: z.uuid(), environmentId: z.uuid(),
  name: z.string().trim().min(1).max(120), executable: z.string().min(1).max(512),
  argv: z.array(z.string().max(1024)).max(64), cwdRelative: z.string().min(1).max(1024),
  envRefs: environmentConfigSchema.shape.envRefs,
  timeoutSeconds: z.int().min(1).max(7200),
  scriptsHash: z.string().regex(/^[a-f0-9]{64}$/),
  approvalHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  revision: z.int().positive(), createdAt: timestamp, updatedAt: timestamp,
  archivedAt: timestamp.nullable(),
});

const base = { schemaVersion: z.literal('1.0'), commandId: z.uuid(), createdAt: timestamp,
  protocolVersion: z.string().min(1).max(80) };
const expectedRevision = z.int().nonnegative();
export const projectCommandEnvelopeSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('project.probe'), payload: z.strictObject({ rootPath: z.string().min(1).max(4096) }) }),
  z.strictObject({ ...base, type: z.literal('project.create'), payload: z.strictObject({ rootPath: z.string().min(1).max(4096), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), trustVersion: z.literal(projectTrustVersion), approved: z.literal(true), expectedRevision }) }),
  z.strictObject({ ...base, type: z.literal('project.list'), payload: z.strictObject({}) }),
  z.strictObject({ ...base, type: z.literal('project.get'), payload: z.strictObject({ projectId: z.uuid() }) }),
  z.strictObject({ ...base, type: z.literal('project.active'), payload: z.strictObject({}) }),
  z.strictObject({ ...base, type: z.literal('project.setActive'), payload: z.strictObject({ projectId: z.uuid(), expectedRevision }) }),
  z.strictObject({ ...base, type: z.literal('project.update'), payload: z.strictObject({ projectId: z.uuid(), expectedRevision, name: z.string().trim().min(1).max(240).optional(), defaultBranch: z.string().min(1).max(240).nullable().optional() }) }),
  z.strictObject({ ...base, type: z.literal('project.remove'), payload: z.strictObject({ projectId: z.uuid(), expectedRevision }) }),
  z.strictObject({ ...base, type: z.literal('environment.save'), payload: z.strictObject({
    projectId: z.uuid(), environmentId: z.uuid().optional(), expectedRevision,
    name: z.string().trim().min(1).max(120), config: environmentConfigSchema,
  }) }),
  z.strictObject({ ...base, type: z.literal('environment.list'), payload: z.strictObject({ projectId: z.uuid() }) }),
  z.strictObject({ ...base, type: z.literal('environment.get'), payload: z.strictObject({ projectId: z.uuid(), environmentId: z.uuid() }) }),
  z.strictObject({ ...base, type: z.literal('environment.archive'), payload: z.strictObject({ projectId: z.uuid(), environmentId: z.uuid(), expectedRevision }) }),
  z.strictObject({ ...base, type: z.literal('commandPreset.save'), payload: z.strictObject({
    projectId: z.uuid(), presetId: z.uuid().optional(), expectedRevision,
    environmentId: z.uuid(), name: z.string().trim().min(1).max(120),
    executable: z.string().min(1).max(512), argv: z.array(z.string().max(1024)).max(64),
    cwdRelative: z.string().min(1).max(1024), envRefs: environmentConfigSchema.shape.envRefs,
    timeoutSeconds: z.int().min(1).max(7200), scriptsHash: z.string().regex(/^[a-f0-9]{64}$/),
  }) }),
  z.strictObject({ ...base, type: z.literal('commandPreset.list'), payload: z.strictObject({ projectId: z.uuid(), environmentId: z.uuid() }) }),
  z.strictObject({ ...base, type: z.literal('commandPreset.get'), payload: z.strictObject({ projectId: z.uuid(), presetId: z.uuid() }) }),
  z.strictObject({ ...base, type: z.literal('commandPreset.approve'), payload: z.strictObject({ projectId: z.uuid(), presetId: z.uuid(), expectedRevision, scriptsHash: z.string().regex(/^[a-f0-9]{64}$/) }) }),
  z.strictObject({ ...base, type: z.literal('commandPreset.archive'), payload: z.strictObject({ projectId: z.uuid(), presetId: z.uuid(), expectedRevision }) }),
]);

export const projectCommandResultSchema = z.union([
  z.strictObject({ commandId: z.uuid(), ok: z.literal(true), data: z.union([
    projectProbeSchema, forgeProjectSchema, z.array(forgeProjectSchema), forgeProjectSchema.nullable(),
    projectEnvironmentSchema, z.array(projectEnvironmentSchema), projectEnvironmentSchema.nullable(),
    commandPresetSchema, z.array(commandPresetSchema), commandPresetSchema.nullable(),
    z.strictObject({ removedId: z.uuid() }),
  ]), durationMs: z.number().nonnegative(), hostTimestamp: timestamp }),
  z.strictObject({ commandId: z.uuid(), ok: z.literal(false), error: z.strictObject({
    code: z.string().regex(/^[A-Z_]+$/), message: z.string().min(1).max(240),
    retryable: z.boolean(), correlationId: z.string().min(1).max(128),
  }),
    durationMs: z.number().nonnegative(), hostTimestamp: timestamp }),
]);

export type ProjectProbe = z.infer<typeof projectProbeSchema>;
export type ForgeProject = z.infer<typeof forgeProjectSchema>;
export type ProjectEnvironment = z.infer<typeof projectEnvironmentSchema>;
export type CommandPreset = z.infer<typeof commandPresetSchema>;
export type ProjectCommandEnvelope = z.infer<typeof projectCommandEnvelopeSchema>;
export type ProjectCommandResult = z.infer<typeof projectCommandResultSchema>;
