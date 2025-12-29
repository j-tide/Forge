import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommandEnvelopeSchema, verifyReportSchema } from '../dist/index.js';

const id = 'e5134c6a-cf9c-4266-a4eb-4e937b24dd5d';
const base = { schemaVersion: '1.0', commandId: id, createdAt: new Date().toISOString(),
  protocolVersion: 'forge-host-protocol/v5' };

test('Verify admits only a fixed snapshot and approved preset reference', () => {
  const start = { ...base, type: 'run.verifyStart', payload: { projectId: id, taskId: id,
    developmentRunId: id, expectedSnapshotId: id, kind: 'test', presetId: id,
    idempotencyKey: id } };
  assert.equal(runCommandEnvelopeSchema.safeParse(start).success, true);
  for (const extra of [
    { executable: '/bin/sh' }, { argv: ['-c', 'rm -rf /'] },
    { cwd: '/' }, { env: { TOKEN: 'secret' } }, { reportPath: '/etc/passwd' },
  ]) assert.equal(runCommandEnvelopeSchema.safeParse({ ...start,
    payload: { ...start.payload, ...extra } }).success, false);
  assert.equal(runCommandEnvelopeSchema.safeParse({ ...start,
    payload: { ...start.payload, kind: 'shell' } }).success, false);
  assert.equal(runCommandEnvelopeSchema.safeParse({ ...base, type: 'run.verifyArtifact',
    payload: { projectId: id, artifactId: '/etc/passwd' } }).success, false);
  assert.equal(verifyReportSchema.safeParse({ status: 'passed' }).success, false);
});
