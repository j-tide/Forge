import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forgeProjectSchema, hostProtocolVersion, projectCommandEnvelopeSchema,
  projectProbeSchema, projectTrustVersion } from '../dist/index.js';

test('project command contract requires explicit trust and rejects arbitrary payload fields', () => {
  const base = { schemaVersion: '1.0', commandId: crypto.randomUUID(),
    createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion };
  assert.equal(projectCommandEnvelopeSchema.safeParse({ ...base, type: 'project.create', payload: {
    rootPath: '/tmp/repo', fingerprint: 'a'.repeat(64), trustVersion: projectTrustVersion, approved: true, expectedRevision: 0,
  } }).success, true);
  for (const payload of [
    { rootPath: '/tmp/repo', fingerprint: 'a'.repeat(64), trustVersion: projectTrustVersion, approved: false, expectedRevision: 0 },
    { rootPath: '/tmp/repo', fingerprint: 'a'.repeat(64), trustVersion: projectTrustVersion, approved: true, expectedRevision: 0, shell: 'rm -rf /' },
  ]) assert.equal(projectCommandEnvelopeSchema.safeParse({ ...base, type: 'project.create', payload }).success, false);
  assert.equal(projectCommandEnvelopeSchema.safeParse({ ...base, type: 'project.exec', payload: {} }).success, false);
});

test('probe schema requires a stable fingerprint and rejects unknown fields', () => {
  const probe = { rootPath: '/tmp/repo', name: 'repo', repositoryType: 'none', gitRoot: null,
    currentBranch: null, defaultBranch: null, workingTree: 'unknown', remoteConfigured: false,
    packageManager: 'unknown', packageManagerEvidence: [], projectType: 'unknown', detectedRuntime: [],
    scripts: { dev: null, build: null, test: null, lint: null, typecheck: null },
    capabilities: { gitWorktree: false, declaredScripts: false }, fingerprint: 'f'.repeat(64),
    probedAt: new Date().toISOString() };
  assert.equal(projectProbeSchema.safeParse(probe).success, true);
  assert.equal(projectProbeSchema.safeParse({ ...probe, token: 'secret' }).success, false);
});

test('restored project can be viewed but cannot claim an old local trust decision', () => {
  const now = new Date().toISOString();
  const project = { projectId: crypto.randomUUID(), environmentId: crypto.randomUUID(),
    name: 'Restored', rootPath: '/tmp/repo', repositoryType: 'none', gitRoot: null,
    defaultBranch: null, trusted: false, trustVersion: 'project-trust/restored-pending',
    trustApprovedAt: now, environmentSummaryHash: 'a'.repeat(64), createdAt: now,
    updatedAt: now, lastOpenedAt: now, revision: 2, archivedAt: null,
    probe: { rootPath: '/tmp/repo', name: 'Restored', repositoryType: 'none', gitRoot: null,
      currentBranch: null, defaultBranch: null, workingTree: 'unknown', remoteConfigured: false,
      packageManager: 'unknown', packageManagerEvidence: [], projectType: 'unknown',
      detectedRuntime: [], scripts: { dev: null, build: null, test: null, lint: null,
        typecheck: null }, capabilities: { gitWorktree: false, declaredScripts: false },
      fingerprint: 'a'.repeat(64), probedAt: now },
  };
  assert.equal(forgeProjectSchema.safeParse(project).success, true);
  assert.equal(forgeProjectSchema.safeParse({ ...project, trusted: true }).success, false);
  assert.equal(forgeProjectSchema.safeParse({ ...project, trusted: false,
    trustVersion: projectTrustVersion }).success, false);
});
