import { z } from 'zod';

const pluginFieldSchema = z.strictObject({
  type: z.enum(['string', 'integer', 'number', 'boolean']),
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(500).optional(),
  format: z.literal('forge-credential-ref').optional(),
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

export const bundledPluginInspectionSchema = z.strictObject({
  pluginId: z.literal('forge.executor.codex'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(),
  forgeApiRange: z.string().nullable(),
  compatible: z.boolean(),
  active: z.boolean(),
  enabled: z.boolean(),
  restartRequired: z.boolean(),
  issues: z.array(z.strictObject({ code: z.string().min(1), path: z.string(), message: z.string() })),
  configSchema: pluginConfigSchemaSchema.nullable(),
  faults: z.array(z.strictObject({
    pluginId: z.string().min(1), phase: z.enum(['activation', 'runtime', 'disposal', 'probe']),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/), runId: z.string().nullable(),
    recordedAt: z.iso.datetime({ offset: true }),
  })),
});
export type BundledPluginInspection = z.infer<typeof bundledPluginInspectionSchema>;
