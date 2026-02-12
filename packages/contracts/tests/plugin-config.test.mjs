import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundledPluginInspectionSchema, pluginConfigSchemaSchema } from '../dist/plugin-config.js';

test('plugin schema rejects unknown vocabulary and non-reference secret type', () => {
  const base = { type: 'object', additionalProperties: false, properties: {}, required: [] };
  assert.equal(pluginConfigSchemaSchema.safeParse(base).success, true);
  assert.equal(pluginConfigSchemaSchema.safeParse({ ...base, allOf: [] }).success, false);
  assert.equal(pluginConfigSchemaSchema.safeParse({ ...base, properties: {
    key: { type: 'number', format: 'forge-credential-ref' },
  } }).success, false);
  assert.equal(pluginConfigSchemaSchema.safeParse({ ...base, required: ['missing'] }).success, false);
});

test('bundled inspection cannot claim arbitrary plugin identity or leak unknown fields', () => {
  const inspect = { pluginId: 'forge.executor.codex', version: '0.0.2', forgeApiRange: '^1.0.0',
    compatible: true, active: true, enabled: true, restartRequired: false, issues: [], faults: [], configSchema: {
      type: 'object', additionalProperties: false, properties: {}, required: [],
    } };
  assert.equal(bundledPluginInspectionSchema.safeParse(inspect).success, true);
  assert.equal(bundledPluginInspectionSchema.safeParse({ ...inspect, pluginId: 'other' }).success, false);
  assert.equal(bundledPluginInspectionSchema.safeParse({ ...inspect, secretValue: 'bad' }).success, false);
});
