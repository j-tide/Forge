import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateContracts } from '../dist/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'forge-contracts-'));
  for (const name of ['contracts', 'planning', 'presets', 'tests']) {
    cpSync(join(root, 'forge_spec_v1.0', name), join(dir, 'forge_spec_v1.0', name), { recursive: true });
  }
  cpSync(join(root, 'forge_spec_v1.0', 'prompts'), join(dir, 'forge_spec_v1.0', 'prompts'), { recursive: true });
  mkdirSync(join(dir, 'packages/ui/src/tokens'), { recursive: true });
  cpSync(join(root, 'packages/ui/src/tokens/values.json'), join(dir, 'packages/ui/src/tokens/values.json'));
  cpSync(join(root, 'packages/ui/src/tokens.css'), join(dir, 'packages/ui/src/tokens.css'));
  cpSync(join(root, 'packages/ui/package.json'), join(dir, 'packages/ui/package.json'));
  cpSync(join(root, 'package.json'), join(dir, 'package.json'));
  cpSync(join(root, 'versions.lock.json'), join(dir, 'versions.lock.json'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  cpSync(join(root, 'docs/dependency-licenses.json'), join(dir, 'docs/dependency-licenses.json'));
  return dir;
}
function changeJson(dir, name, change) {
  const path = join(dir, name);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  change(value);
  writeFileSync(path, JSON.stringify(value));
}
function checkMutation(name, mutate, code) {
  test(name, () => {
    const dir = fixture();
    try {
      mutate(dir);
      const report = validateContracts(dir);
      assert.equal(report.valid, false);
      assert.ok(report.errors.some((issue) => issue.code === code), JSON.stringify(report.errors.slice(0, 6)));
      const result = spawnSync(process.execPath, [cli, '--reporter=json', '--repo-root', dir], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.equal(JSON.parse(result.stdout).valid, false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('current reference contracts and production tokens validate', () => {
  const report = validateContracts(root);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.ok(report.checkedFiles.some((file) => file.endsWith('openapi.yaml')));
  assert.ok(report.checkedFiles.some((file) => file.endsWith('schema.sql')));
  assert.ok(report.warnings.some((issue) => issue.code === 'FGV-PROFILE-006'));
});
checkMutation('duplicate task ID fails', (dir) => changeJson(dir, 'forge_spec_v1.0/planning/tasks.json', (tasks) => { tasks[1].id = tasks[0].id; }), 'FGV-ID-002');
checkMutation('missing workflow profile fails', (dir) => {
  const path = join(dir, 'forge_spec_v1.0/presets/standard.workflow.yaml');
  writeFileSync(path, readFileSync(path, 'utf8').replace('binding: profile.reviewer', 'binding: reviewer-v9'));
}, 'FGV-WORKFLOW-004');
checkMutation('cyclic task dependency fails', (dir) => changeJson(dir, 'forge_spec_v1.0/planning/tasks.json', (tasks) => { tasks[0].dependsOn = ['P0-02']; }), 'FGV-PLAN-010');
checkMutation('invalid JSON Schema fails', (dir) => changeJson(dir, 'forge_spec_v1.0/contracts/task-contract.schema.json', (schema) => { schema.type = 'invalid'; }), 'FGV-SCHEMA-007');
checkMutation('workflow dead end fails', (dir) => {
  const path = join(dir, 'forge_spec_v1.0/presets/standard.workflow.yaml');
  writeFileSync(path, readFileSync(path, 'utf8').replace('- from: verify\n  \'on\': passed\n  to: accept\n', ''));
}, 'FGV-WORKFLOW-010');
checkMutation('unknown plugin permission fails', (dir) => changeJson(dir, 'forge_spec_v1.0/contracts/plugin-manifest.example.json', (manifest) => { manifest.requestedPermissions.push('environment.root'); }), 'FGV-PLUGIN-005');
checkMutation('bad acceptance reference fails', (dir) => changeJson(dir, 'forge_spec_v1.0/planning/tasks.json', (tasks) => { tasks[0].testIds.push('T999'); }), 'FGV-PLAN-021');
checkMutation('acceptance case missing task fails', (dir) => changeJson(dir, 'forge_spec_v1.0/tests/acceptance-cases.json', (cases) => { cases[0].relatedTaskIds = ['P9-99']; }), 'FGV-TEST-006');
checkMutation('invalid example fails', (dir) => changeJson(dir, 'forge_spec_v1.0/contracts/task-contract.example.json', (example) => { example.acceptance = []; }), 'FGV-DATA-001');
checkMutation('unresolved OpenAPI ref fails', (dir) => {
  const path = join(dir, 'forge_spec_v1.0/contracts/openapi.yaml');
  writeFileSync(path, readFileSync(path, 'utf8').replace('#/components/schemas/CommandResponse', '#/components/schemas/DoesNotExist'));
}, 'FGV-API-013');
checkMutation('invalid SQL fails', (dir) => {
  const path = join(dir, 'forge_spec_v1.0/contracts/schema.sql');
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nCREATE TABLE broken(`);
}, 'FGV-SQL-005');
checkMutation('dependency version drift fails', (dir) => changeJson(dir, 'packages/ui/package.json', (manifest) => { manifest.dependencies.vue = '3.5.42'; }), 'FGV-VERSION-005');
