import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnosticsPreviewSchema, hostActivitySchema } from '../dist/index.js';

test('Host activity rejects fabricated or negative counts', () => {
  const activity = { activityCount: 1, timestamp: '2026-09-25T00:00:00.000Z',
    counts: { startingRuns: 0, developmentRuns: 1, scheduledRuns: 0,
      reviewJobs: 0, verifyJobs: 0, refinerJobs: 0, ownedProcesses: 0 } };
  assert.equal(hostActivitySchema.parse(activity).activityCount, 1);
  assert.equal(hostActivitySchema.safeParse({ ...activity, activityCount: -1 }).success, false);
  assert.equal(hostActivitySchema.safeParse({ ...activity, activityCount: 0 }).success, false);
  assert.equal(hostActivitySchema.safeParse({ ...activity, shell: '/bin/sh' }).success, false);
});

test('diagnostic preview rejects arbitrary paths and secret fields', () => {
  const preview = { format: 'forge-diagnostics/v1',
    previewId: '9f630699-b29a-4058-b608-51eabdb18eee', generatedAt: '2026-09-25T00:00:00.000Z',
    runtime: { python: '3.12.13', platform: 'darwin', arch: 'arm64',
      hostProtocol: 'forge-host-protocol/v5' },
    storage: { status: 'ready', schemaVersion: 30, journalMode: 'wal' },
    counts: { projects: 0, tasks: 0, runs: 0, importedArtifacts: 0 },
    usage: { status: 'unavailable', reason: 'No complete measured total' },
    retention: { artifactDays: 30, expiredImportedArtifacts: 0,
      moreCandidates: false, automaticPurge: false } };
  assert.equal(diagnosticsPreviewSchema.parse(preview).format, 'forge-diagnostics/v1');
  assert.equal(diagnosticsPreviewSchema.safeParse({ ...preview, projectPath: '/private/work' }).success, false);
  assert.equal(diagnosticsPreviewSchema.safeParse({ ...preview,
    runtime: { ...preview.runtime, apiKey: 'secret' } }).success, false);
});
