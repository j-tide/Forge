import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const original = readFileSync(join(root, 'docs/forge-codex-execution-playbook.md'), 'utf8');
const validator = join(root, 'scripts/validate-playbook-task-map.mjs');
const originalDeferred = JSON.parse(readFileSync(join(root, 'docs/deferred-verification.json'), 'utf8'));

test('canonical Playbook task map validates', () => {
  const result = spawnSync(process.execPath, [validator], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /92 tasks/);
  assert.match(result.stdout, new RegExp(`${originalDeferred.entries.length} deferred verifications`));
});

for (const [name, change, expected] of [
  ['unowned deferred case', (entry) => ({ ...entry, ownerTaskId: 'P9-99' }), 'missing owner task'],
  ['false passed status', (entry) => ({ ...entry, status: 'PASSED' }), 'invalid status'],
  ['early owner', (entry) => ({ ...entry, ownerTaskId: 'P1-09' }), 'not a later task'],
]) {
  test(`task map rejects ${name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-deferred-map-'));
    try {
      const changed = { ...originalDeferred, entries: [change(originalDeferred.entries[0]), ...originalDeferred.entries.slice(1)] };
      const file = join(dir, 'deferred.json');
      writeFileSync(file, JSON.stringify(changed));
      const result = spawnSync(process.execPath, [validator, join(root, 'docs/forge-codex-execution-playbook.md'), file], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(expected));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

for (const [name, before, after, expected] of [
  ['renamed task', '## P1-02 项目及环境数据服务', '## P1-02 模型 Provider 与 Secret Storage', 'P1-02 title'],
  ['broken dependency', '**Depends on:** P1-01\n**Module:** M02', '**Depends on:** P0-08\n**Module:** M02', 'P1-02 dependencies'],
  ['changed phase gate', '**Phase Gate:** 从想法生成草稿，经人类审批进入TODO，尚不自动写代码。', '**Phase Gate:** 自动开工。', 'P1 gate'],
  ['missing acceptance reference', '**Acceptance cases:** T006, T007, T008, T009, T010', '**Acceptance cases:** T006, T007, T999', 'P1-01 acceptance references'],
  ['unauthorized paused task', '## P1-02 项目及环境数据服务\n\n**Status:** DONE',
    '## P1-02 项目及环境数据服务\n\n**Status:** PAUSED_FOR_PYTHON_CORE_MIGRATION', 'P1-02 invalid status'],
]) {
  test(`task map rejects ${name}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-task-map-'));
    try {
      const changed = original.replace(before, after);
      assert.notEqual(changed, original);
      const file = join(dir, 'playbook.md');
      writeFileSync(file, changed);
      const result = spawnSync(process.execPath, [validator, file], { encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(expected));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
