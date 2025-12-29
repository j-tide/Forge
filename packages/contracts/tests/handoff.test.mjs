import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { codeSnapshotSchema, developmentStepResultSchema,
  handoffBundleSchema } from '../dist/index.js';

const reference = (name) => JSON.parse(readFileSync(join(import.meta.dirname,
  '../../../forge_spec_v1.0/contracts', name), 'utf8'));

test('production handoff and step-result fields match the read-only specification contracts', () => {
  const handoff = reference('handoff-bundle.schema.json');
  const step = reference('step-result.schema.json');
  assert.deepEqual(Object.keys(handoffBundleSchema.shape).sort(), handoff.required.sort());
  assert.deepEqual(Object.keys(developmentStepResultSchema.shape).sort(), step.required.sort());
});

test('CodeSnapshot rejects path traversal and unknown fields', () => {
  const uuid = '00000000-0000-4000-8000-000000000001';
  const hash = 'a'.repeat(64);
  const sha = 'b'.repeat(40);
  const value = { schemaVersion:'1.0',snapshotId:uuid,projectId:uuid,runId:uuid,
    attemptId:uuid,workspaceId:uuid,baseRevision:sha,baseTree:sha,filteredBaseTree:sha,
    commitSha:sha,treeSha:sha,contentHash:hash,
    files:[{path:'src/add.js',kind:'modified',blobSha:sha,byteSize:12}],
    excludedPaths:[],noChange:false,createdAt:new Date().toISOString() };
  assert.equal(codeSnapshotSchema.safeParse(value).success,true);
  assert.equal(codeSnapshotSchema.safeParse({...value,files:[{...value.files[0],path:'../secret'}]}).success,false);
  assert.equal(codeSnapshotSchema.safeParse({...value,files:[{...value.files[0],path:'a\\b'}]}).success,false);
  assert.equal(codeSnapshotSchema.safeParse({...value,secretValue:'not allowed'}).success,false);
});
