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
  for (const [name, version] of Object.entries(workspace.devDependencies)) {
    if (name.startsWith('@forge/')) continue;
    const record = versions.lockedToolVersions[name];
    assert.equal(record.version, version);
    assert.ok(inventory.packages.some((entry) =>
      entry.name === name && entry.version === version && entry.license === record.license),
    `${name}@${version} license inventory mismatch`);
  }
});
