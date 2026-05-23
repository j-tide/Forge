import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { URL } from 'node:url';
import { contractSchemaNames } from '@forge/contracts';

const root = new URL('../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));

test('public contract registry matches the read-only specification baseline', async () => {
  const actual = (await readdir(new URL('forge_spec_v1.0/contracts/', root)))
    .filter((name) => name.endsWith('.schema.json'))
    .map((name) => name.slice(0, -'.schema.json'.length))
    .sort();
  assert.deepEqual([...contractSchemaNames].sort(), actual);
});

test('workspace uses exact direct versions and a public package entry', async () => {
  const workspace = await readJson('package.json');
  const contracts = await readJson('packages/contracts/package.json');
  assert.equal(workspace.packageManager, 'pnpm@12.3.4');
  assert.equal(workspace.devDependencies['@forge/contracts'], 'workspace:*');
  assert.equal(contracts.exports['.'].default, './dist/index.js');
  assert.equal(contracts.exports['.'].types, './dist/index.d.ts');
  for (const [name, version] of Object.entries(workspace.devDependencies)) {
    if (name.startsWith('@forge/')) continue;
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly`);
  }
});

test('recorded direct dependency licenses match the installed inventory', async () => {
  const workspace = await readJson('package.json');
  const versions = await readJson('versions.lock.json');
  const inventory = await readJson('docs/dependency-licenses.json');
  assert.equal(workspace.version, versions.releaseVersion);
  for (const [path, record] of [
    ['package.json', versions.lockedToolVersions],
    ['apps/web/package.json', versions.applicationDependencies['apps/web']],
    ['apps/desktop/package.json', versions.applicationDependencies['apps/desktop']],
    ['apps/host/package.json', versions.applicationDependencies['apps/host']],
    ['packages/contracts/package.json', versions.applicationDependencies['packages/contracts']],
    ['packages/core/package.json', {}],
    ['packages/client/package.json', {}],
    ['packages/persistence/package.json', versions.applicationDependencies['packages/persistence']],
    ['packages/process/package.json', versions.applicationDependencies['packages/process']],
    ['packages/workspace/package.json', versions.applicationDependencies['packages/workspace']],
    ['packages/plugin-api/package.json', versions.applicationDependencies['packages/plugin-api']],
    ['packages/contract-validator/package.json', versions.applicationDependencies['packages/contract-validator']],
    ['plugins/executor-codex/package.json', versions.applicationDependencies['plugins/executor-codex']],
  ]) {
    const manifest = await readJson(path);
    for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
      if (name.startsWith('@forge/')) {
        assert.equal(version, 'workspace:*', `${path}: ${name} must use workspace protocol`);
        continue;
      }
      assert.match(version, /^\d+\.\d+\.\d+$/, `${path}: ${name} must be pinned exactly`);
      assert.equal(record[name]?.version, version, `${path}: ${name} version record mismatch`);
      assert.ok(inventory.packages.some((entry) =>
        entry.name === name && entry.version === version && entry.license === record[name].license),
      `${name}@${version} license inventory mismatch`);
    }
  }
});
