import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bundledPluginInspectionSchema, bundledPluginConfigSaveSchema, pluginConfigSchemaSchema } from '../dist/plugin-config.js';

test('plugin schema rejects unknown vocabulary and non-reference secret type', () => {
  const base = { type: 'object', additionalProperties: false, properties: {}, required: [] };
  assert.equal(pluginConfigSchemaSchema.safeParse(base).success, true);
  assert.equal(pluginConfigSchemaSchema.safeParse({ ...base, allOf: [] }).success, false);
  assert.equal(pluginConfigSchemaSchema.safeParse({ ...base, properties: {
    key: { type: 'number', format: 'forge-credential-ref' },
  } }).success, false);
  assert.equal(pluginConfigSchemaSchema.safeParse({ ...base, required: ['missing'] }).success, false);
  assert.equal(pluginConfigSchemaSchema.safeParse({ ...base, properties: {
    timeout: { type: 'integer', minimum: 1, maximum: 60 },
  } }).success, true);
  assert.equal(pluginConfigSchemaSchema.safeParse({ ...base, properties: {
    timeout: { type: 'integer', minimum: 1.5, maximum: 60 },
  } }).success, false);
  assert.equal(bundledPluginConfigSaveSchema.safeParse({ expectedRevision: 0,
    config: { appServerInitializationTimeoutSeconds: 20 } }).success, true);
  assert.equal(bundledPluginConfigSaveSchema.safeParse({ expectedRevision: 0,
    config: { appServerInitializationTimeoutSeconds: 20 }, channel: 'arbitrary' }).success, false);
});

test('bundled inspection cannot claim arbitrary plugin identity or leak unknown fields', () => {
  const inspect = { pluginId: 'forge.executor.codex', version: '0.0.3', forgeApiRange: '^1.0.0',
    compatible: true, active: true, enabled: true, restartRequired: false,
    configRevision: 0, configValues: {}, configApplied: true, issues: [], faults: [],
    activeRunRefs: [], draining: false,
    manifest: { source: 'bundled-trusted', contentHash: 'a'.repeat(64),
      contributes: { executors: ['executor.codex'], modelProviders: ['model.codex'],
        contextProviders: [], tools: [], verifiers: [], viewTypes: [] },
      requires: ['process.v1'], requestedPermissions: ['workspace.read'],
      grantedPermissions: ['workspace.read'], supportedPlatforms: ['darwin-arm64'] },
    configSchema: {
      type: 'object', additionalProperties: false, properties: {}, required: [],
    } };
  assert.equal(bundledPluginInspectionSchema.safeParse(inspect).success, true);
  assert.equal(bundledPluginInspectionSchema.safeParse({ ...inspect, pluginId: 'other' }).success, false);
  assert.equal(bundledPluginInspectionSchema.safeParse({ ...inspect, secretValue: 'bad' }).success, false);
  assert.equal(bundledPluginInspectionSchema.safeParse({ ...inspect,
    manifest: { ...inspect.manifest, requestedPermissions: ['shell.any'] } }).success, false);
});
