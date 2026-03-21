import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseBackupExportResultSchema, desktopDependenciesSchema,
  diagnosticsPreviewSchema, hostActivitySchema,
  hostProfileSwitchSafetySchema } from '../dist/index.js';

test('backup export result never includes an internal database path', () => {
  const result = { saved:true, schemaVersion:35, createdAt:'2026-09-26T00:00:00.000Z',
    sizeBytes:8192, sha256:'a'.repeat(64) };
  assert.equal(databaseBackupExportResultSchema.parse(result).saved, true);
  assert.equal(databaseBackupExportResultSchema.safeParse({ ...result,
    internalPath:'/private/forge.sqlite' }).success, false);
});

test('desktop dependency report is strict and contains no paths or credentials', () => {
  const snapshot = { format: 'forge-desktop-dependencies/v1',
    checkedAt: '2026-09-26T00:00:00.000Z',
    python: { status: 'ready', version: '3.12.13' },
    git: { status: 'available', version: 'git version 2.39.5 (Apple Git-154)' },
    codex: { status: 'authenticated', version: 'codex-cli 0.155.1' },
    proxy: { status: 'not_configured' } };
  assert.equal(desktopDependenciesSchema.parse(snapshot).codex.status, 'authenticated');
  assert.equal(desktopDependenciesSchema.safeParse({ ...snapshot,
    executablePath: '/private/secret' }).success, false);
  assert.equal(desktopDependenciesSchema.safeParse({ ...snapshot,
    proxy: { status: 'configured', url: 'http://secret.example' } }).success, false);
});

test('Host activity rejects fabricated or negative counts', () => {
  const activity = { activityCount: 1, timestamp: '2026-09-25T00:00:00.000Z',
    counts: { startingRuns: 0, developmentRuns: 1, scheduledRuns: 0,
      reviewJobs: 0, verifyJobs: 0, refinerJobs: 0, ownedProcesses: 0 } };
  assert.equal(hostActivitySchema.parse(activity).activityCount, 1);
  assert.equal(hostActivitySchema.safeParse({ ...activity, activityCount: -1 }).success, false);
  assert.equal(hostActivitySchema.safeParse({ ...activity, activityCount: 0 }).success, false);
  assert.equal(hostActivitySchema.safeParse({ ...activity, shell: '/bin/sh' }).success, false);
});

test('profile switch safety is count-consistent and discloses no process identity', () => {
  const safety = { safe:false, timestamp:'2026-09-27T00:00:00.000Z',
    fences:{ unresolvedRuns:0, quarantinedLeases:1, interruptedReviewJobs:0,
      interruptedVerifyJobs:0, orphanProcessRecords:1, uncertainProcessJournalEntries:0 } };
  assert.equal(hostProfileSwitchSafetySchema.parse(safety).safe,false);
  assert.equal(hostProfileSwitchSafetySchema.safeParse({ ...safety, safe:true }).success,false);
  assert.equal(hostProfileSwitchSafetySchema.safeParse({ ...safety, pid:123 }).success,false);
  assert.equal(hostProfileSwitchSafetySchema.safeParse({ ...safety,
    fences:{...safety.fences,uncertainProcessJournalEntries:-1} }).success,false);
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
