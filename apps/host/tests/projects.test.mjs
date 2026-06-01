import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { projectProbeSchema, projectTrustVersion } from '@forge/contracts';
import { ForgePersistence } from '@forge/persistence';
import { ProjectService, probeProject } from '../dist/projects.js';

async function fixture(t, name = 'Forge 测试项目 01') {
  const root = await mkdtemp(join(tmpdir(), 'forge-project-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repo = join(root, name);
  await import('node:fs/promises').then(({ mkdir }) => mkdir(repo));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Forge Test');
  git('config', 'user.email', 'forge@example.invalid');
  await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'fixture', scripts: {
    build: 'node -e "require(\'fs\').writeFileSync(\'executed.txt\',\'bad\')"', test: 'node --test',
  }, dependencies: { vue: '3.5.0' } }));
  await writeFile(join(repo, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
  git('add', '.'); git('commit', '-qm', 'fixture');
  const dataDir = join(root, 'data');
  const storage = new ForgePersistence(dataDir);
  await storage.open(); storage.migrate();
  t.after(() => storage.close());
  return { root, repo, git, storage, service: new ProjectService(storage) };
}

test('read-only Git probe detects branch, dirty tree, lockfiles and declared scripts without executing them', async (t) => {
  const { repo, git } = await fixture(t);
  const before = git('status', '--porcelain');
  const clean = await probeProject(repo);
  assert.equal(clean.rootPath, await realpath(repo));
  assert.equal(clean.repositoryType, 'git');
  assert.equal(clean.workingTree, 'clean');
  assert.equal(clean.packageManager, 'pnpm');
  assert.deepEqual(clean.packageManagerEvidence, ['pnpm-lock.yaml']);
  assert.equal(clean.projectType, 'vue');
  assert.match(clean.scripts.build, /executed.txt/);
  assert.equal(projectProbeSchema.safeParse(clean).success, true);
  assert.equal(git('status', '--porcelain'), before);
  assert.equal((await readdir(repo)).includes('executed.txt'), false);
  await writeFile(join(repo, 'dirty.txt'), 'user change');
  const dirty = await probeProject(repo);
  assert.equal(dirty.workingTree, 'dirty');
  assert.notEqual(dirty.fingerprint, clean.fingerprint);
  assert.equal(await readFile(join(repo, 'dirty.txt'), 'utf8'), 'user change');
});

test('trust must match fresh probe; duplicate symlink resolves to same durable project; remove keeps source', async (t) => {
  const { root, repo, service, storage, git } = await fixture(t);
  const probe = await service.probe(repo);
  await assert.rejects(service.create(repo, probe.fingerprint, projectTrustVersion, false, 0), { code: 'PROJECT_TRUST_REQUIRED' });
  assert.deepEqual(service.list(), []);
  await writeFile(join(repo, 'dirty.txt'), 'new change');
  await assert.rejects(service.create(repo, probe.fingerprint, projectTrustVersion, true, 0), { code: 'PROJECT_PROBE_STALE' });
  const fresh = await service.probe(repo);
  const created = await service.create(repo, fresh.fingerprint, projectTrustVersion, true, 0);
  assert.equal(created.trusted, true);
  assert.equal(created.probe.workingTree, 'dirty');
  assert.equal(created.trustVersion, projectTrustVersion);
  assert.equal(service.active()?.projectId, created.projectId);
  const alias = join(root, 'repo alias');
  await symlink(repo, alias);
  const same = await service.probe(alias);
  assert.equal(same.rootPath, created.rootPath);
  assert.equal((await service.create(alias, same.fingerprint, projectTrustVersion, true, created.revision)).projectId, created.projectId);
  assert.equal(service.list().length, 1);
  assert.equal(service.update(created.projectId, created.revision, { name: 'Renamed fixture' }).name, 'Renamed fixture');
  assert.equal(service.get(created.projectId)?.rootPath, await realpath(repo));
  const beforeRemove = git('status', '--porcelain');
  storage.close();
  const reopened = new ForgePersistence(join(root, 'data'));
  await reopened.open(); reopened.migrate();
  t.after(() => reopened.close());
  const afterRestart = new ProjectService(reopened);
  assert.equal(afterRestart.active()?.projectId, created.projectId);
  assert.deepEqual(afterRestart.remove(created.projectId, created.revision + 1), { removedId: created.projectId });
  assert.equal(afterRestart.active(), null);
  assert.equal((await stat(repo)).isDirectory(), true);
  assert.equal(git('status', '--porcelain'), beforeRemove);
  assert.equal(await readFile(join(repo, 'dirty.txt'), 'utf8'), 'new change');
});

test('non-Git, unknown, lockfile conflict, invalid path and file path are handled without initialization', async (t) => {
  const { root, repo, service } = await fixture(t);
  const plain = join(root, 'ordinary space 中文');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(plain));
  const unknown = await service.probe(plain);
  assert.equal(unknown.repositoryType, 'none');
  assert.equal(unknown.projectType, 'unknown');
  assert.equal(unknown.capabilities.gitWorktree, false);
  assert.equal((await readdir(plain)).includes('.git'), false);
  await writeFile(join(repo, 'package-lock.json'), '{}');
  assert.equal((await service.probe(repo)).packageManager, 'conflict');
  await assert.rejects(service.probe('relative/path'), { code: 'PROJECT_INVALID_PATH' });
  await assert.rejects(service.probe(join(root, 'missing')), { code: 'PROJECT_INVALID_PATH' });
  await assert.rejects(service.probe(join(repo, 'package.json')), { code: 'PROJECT_INVALID_PATH' });
});

test('a symlinked manifest outside the selected root is not read or exposed', async (t) => {
  const { root, service } = await fixture(t);
  const privateFile = join(root, 'private-package.json');
  await writeFile(privateFile, JSON.stringify({ scripts: { build: 'private-secret-value' } }));
  const { mkdir } = await import('node:fs/promises');
  const plain = join(root, 'untrusted');
  await mkdir(plain);
  await symlink(privateFile, join(plain, 'package.json'));
  const probe = await service.probe(plain);
  assert.equal(probe.projectType, 'unknown');
  assert.equal(probe.scripts.build, null);
  assert.doesNotMatch(JSON.stringify(probe), /private-secret-value/);
});

test('environments and approved command presets are scoped, versioned and durable', async (t) => {
  const { root, repo, service, storage } = await fixture(t);
  const firstProbe = await service.probe(repo);
  const first = await service.create(repo, firstProbe.fingerprint, projectTrustVersion, true, 0);
  const otherPath = join(root, 'second project');
  await mkdir(otherPath);
  const secondProbe = await service.probe(otherPath);
  const second = await service.create(otherPath, secondProbe.fingerprint, projectTrustVersion, true, 0);
  const initial = service.getEnvironment(first.projectId, first.environmentId);
  assert.equal(initial.name, 'Default');
  assert.equal(initial.revision, 1);
  assert.equal(service.getEnvironment(second.projectId, first.environmentId), null);
  assert.deepEqual(service.listEnvironments(second.projectId).map((value) => value.environmentId), [second.environmentId]);
  assert.throws(() => service.archiveEnvironment(first.projectId, first.environmentId, 1), { code: 'ENVIRONMENT_IN_USE' });
  const environment = service.saveEnvironment({ projectId: first.projectId, expectedRevision: 0,
    name: 'Local tools', config: { commandPresetIds: [], envRefs: [], networkMode: 'trusted-local' } });
  assert.equal(environment.revision, 1);
  assert.throws(() => service.saveEnvironment({ projectId: first.projectId, environmentId: environment.environmentId,
    expectedRevision: 0, name: 'Stale', config: environment.config }), { code: 'REVISION_CONFLICT' });
  const presetInput = { projectId: first.projectId, environmentId: environment.environmentId,
    expectedRevision: 0, name: 'Declared test', executable: 'pnpm', argv: ['test'],
    cwdRelative: '.', envRefs: [], timeoutSeconds: 300, scriptsHash: firstProbe.scriptsHash };
  const preset = await service.saveCommandPreset(presetInput);
  assert.equal(preset.approvalHash, null);
  assert.equal(service.getCommandPreset(second.projectId, preset.presetId), null);
  await assert.rejects(service.saveCommandPreset({ ...presetInput, projectId: second.projectId,
    environmentId: environment.environmentId, scriptsHash: secondProbe.scriptsHash }),
  { code: 'ENVIRONMENT_NOT_FOUND' });
  await assert.rejects(service.saveCommandPreset({ ...presetInput, cwdRelative: '..' }), { code: 'PROJECT_INVALID_PATH' });
  const linked = service.saveEnvironment({ projectId: first.projectId, environmentId: environment.environmentId,
    expectedRevision: environment.revision, name: environment.name,
    config: { ...environment.config, commandPresetIds: [preset.presetId] } });
  assert.equal(linked.revision, 2);
  assert.throws(() => service.archiveCommandPreset(first.projectId, preset.presetId, preset.revision),
    { code: 'COMMAND_PRESET_REFERENCED' });
  const approved = await service.approveCommandPreset(first.projectId, preset.presetId,
    preset.revision, firstProbe.scriptsHash);
  assert.match(approved.approvalHash, /^[a-f0-9]{64}$/);
  await assert.rejects(service.approveCommandPreset(first.projectId, preset.presetId,
    preset.revision, firstProbe.scriptsHash), { code: 'REVISION_CONFLICT' });
  storage.close();
  const reopened = new ForgePersistence(join(root, 'data'));
  await reopened.open(); reopened.migrate();
  t.after(() => reopened.close());
  const restored = new ProjectService(reopened);
  assert.equal(restored.getCommandPreset(first.projectId, preset.presetId).approvalHash, approved.approvalHash);
  assert.deepEqual(restored.getEnvironment(first.projectId, environment.environmentId).config.commandPresetIds,
    [preset.presetId]);
  await writeFile(join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'node --test --changed' } }));
  await assert.rejects(restored.approveCommandPreset(first.projectId, preset.presetId,
    approved.revision, firstProbe.scriptsHash), { code: 'PROJECT_PROBE_STALE' });
  const unlinked = restored.saveEnvironment({ projectId: first.projectId, environmentId: environment.environmentId,
    expectedRevision: linked.revision, name: environment.name,
    config: { ...environment.config, commandPresetIds: [] } });
  assert.equal(unlinked.revision, 3);
  assert.equal(restored.archiveCommandPreset(first.projectId, preset.presetId, approved.revision).archivedAt !== null, true);
  assert.equal(restored.archiveEnvironment(first.projectId, environment.environmentId, unlinked.revision).archivedAt !== null, true);
  assert.deepEqual(restored.listCommandPresets(first.projectId, first.environmentId), []);
  assert.equal((await readFile(join(repo, 'package.json'), 'utf8')).includes('changed'), true);
});

test('project archive retains environment history and restores the same identity after renewed trust', async (t) => {
  const { root, repo, service, storage } = await fixture(t);
  const probe = await service.probe(repo);
  const created = await service.create(repo, probe.fingerprint, projectTrustVersion, true, 0);
  const before = service.getEnvironment(created.projectId, created.environmentId);
  assert.deepEqual(service.remove(created.projectId, created.revision), { removedId: created.projectId });
  assert.equal(service.get(created.projectId), null);
  assert.equal(storage.getProject(created.projectId, true).archivedAt !== null, true);
  assert.throws(() => storage.getEnvironment(created.projectId, created.environmentId), { code: 'PROJECT_ARCHIVED' });
  const reprobe = await service.probe(repo);
  assert.deepEqual(reprobe.existingProject, { projectId: created.projectId, revision: 2, archived: true });
  const restored = await service.create(repo, reprobe.fingerprint, projectTrustVersion, true, 2);
  assert.equal(restored.projectId, created.projectId);
  assert.equal(restored.revision, 3);
  assert.equal(service.getEnvironment(created.projectId, created.environmentId).createdAt, before.createdAt);
  assert.equal((await stat(repo)).isDirectory(), true);
  assert.equal((await readdir(root)).includes('data'), true);
});
