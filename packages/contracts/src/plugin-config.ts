import { z } from 'zod';

const pluginFieldSchema = z.strictObject({
  type: z.enum(['string', 'integer', 'number', 'boolean']),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(500).optional(),
  format: z.literal('forge-credential-ref').optional(),
  minimum: z.number().finite().optional(),
  maximum: z.number().finite().optional(),
}).superRefine((field, context) => {
  if ((field.minimum !== undefined || field.maximum !== undefined) &&
      field.type !== 'integer' && field.type !== 'number') {
    context.addIssue({ code: 'custom', message: 'Numeric bounds need a numeric field' });
  }
  if (field.type === 'integer' &&
      [field.minimum, field.maximum].some((bound) => bound !== undefined && !Number.isInteger(bound))) {
    context.addIssue({ code: 'custom', message: 'Integer field bounds must be integers' });
  }
  if (field.minimum !== undefined && field.maximum !== undefined && field.minimum > field.maximum) {
    context.addIssue({ code: 'custom', message: 'Minimum exceeds maximum' });
  }
});

export const pluginConfigSchemaSchema = z.strictObject({
  $schema: z.literal('https://json-schema.org/draft/2020-12/schema').optional(),
  type: z.literal('object'),
  additionalProperties: z.literal(false),
  properties: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), pluginFieldSchema),
  required: z.array(z.string()).default([]),
}).superRefine((schema, context) => {
  for (const name of schema.required) {
    if (!(name in schema.properties)) context.addIssue({ code: 'custom', path: ['required'], message: `Unknown required field ${name}` });
  }
  for (const [name, field] of Object.entries(schema.properties)) {
    if (field.format === 'forge-credential-ref' && field.type !== 'string') {
      context.addIssue({ code: 'custom', path: ['properties', name], message: 'Credential reference must be a string' });
    }
  }
});
export type PluginConfigSchema = z.infer<typeof pluginConfigSchemaSchema>;

const pluginConfigValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
export const bundledPluginConfigSaveSchema = z.strictObject({
  expectedRevision: z.number().int().min(0),
  config: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/), pluginConfigValueSchema),
}).superRefine((input, context) => {
  if (Object.keys(input.config).length > 32 || JSON.stringify(input).length > 4096) {
    context.addIssue({ code: 'custom', message: 'Plugin configuration is too large' });
  }
});
export type BundledPluginConfigSave = z.infer<typeof bundledPluginConfigSaveSchema>;

const contributionIds = z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/));
const pluginPermission = z.enum(['workspace.read', 'workspace.write', 'process.spawn']);
const bundledManifestSummarySchema = z.strictObject({
  source: z.literal('bundled-trusted'),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  contributes: z.strictObject({
    executors: contributionIds,
    modelProviders: contributionIds,
    contextProviders: contributionIds,
    tools: contributionIds,
    verifiers: contributionIds,
    viewTypes: contributionIds,
  }),
  requires: contributionIds,
  requestedPermissions: z.array(pluginPermission),
  grantedPermissions: z.array(pluginPermission),
  supportedPlatforms: z.array(z.enum(['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'])),
});

export const bundledPluginInspectionSchema = z.strictObject({
  pluginId: z.literal('forge.executor.codex'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(),
  forgeApiRange: z.string().nullable(),
  compatible: z.boolean(),
  active: z.boolean(),
  enabled: z.boolean(),
  restartRequired: z.boolean(),
  configRevision: z.number().int().min(0),
  configValues: z.record(z.string(), pluginConfigValueSchema),
  configApplied: z.boolean(),
  issues: z.array(z.strictObject({ code: z.string().min(1), path: z.string(), message: z.string() })),
  configSchema: pluginConfigSchemaSchema.nullable(),
  manifest: bundledManifestSummarySchema.nullable(),
  activeRunRefs: contributionIds,
  draining: z.boolean(),
  faults: z.array(z.strictObject({
    pluginId: z.string().min(1), phase: z.enum(['activation', 'runtime', 'disposal', 'probe']),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/), runId: z.string().nullable(),
    recordedAt: z.iso.datetime({ offset: true }),
  })),
});
export type BundledPluginInspection = z.infer<typeof bundledPluginInspectionSchema>;
