import assert from 'node:assert/strict';
import test from 'node:test';
import { reworkCycleSchema, runCommandEnvelopeSchema } from '../dist/index.js';

const id = '00000000-0000-4000-8000-000000000001';
test('rework is a fixed read-only command and a bounded typed cycle', () => {
  const envelope = {
    schemaVersion: '1.0', commandId: id, createdAt: '2026-09-24T00:00:00Z',
    protocolVersion: 'forge-host-protocol/v5', type: 'run.reworkCycles',
    payload: { projectId: id, taskId: id },
  };
  assert.equal(runCommandEnvelopeSchema.safeParse(envelope).success, true);
  assert.equal(runCommandEnvelopeSchema.safeParse({ ...envelope,
    payload: { ...envelope.payload, shell: 'rm -rf .' } }).success, false);
  const cycle = { cycleId: id, projectId: id, taskId: id, sourceRunId: id,
    sourceSnapshotId: id, triggerKind: 'verify', triggerReportId: id,
    nextRunId: null, cycleNo: 4, totalAttempts: 8, state: 'blocked',
    reasonCode: 'REWORK_LIMIT_REACHED', createdAt: '2026-09-24T00:00:00Z',
    updatedAt: '2026-09-24T00:00:00Z' };
  assert.equal(reworkCycleSchema.safeParse(cycle).success, true);
  assert.equal(reworkCycleSchema.safeParse({ ...cycle, state: 'passed' }).success, false);
  assert.equal(reworkCycleSchema.safeParse({ ...cycle, arbitraryProcess: 1 }).success, false);
});
