import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const scriptsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/build');

test('Windows postinstall builds locally without requesting an upstream prebuild', async () => {
  const calls = [];
  const scriptPath = resolve(scriptsDir, 'postinstall.cjs');
  const source = readFileSync(scriptPath, 'utf8');

  const localRequire = (name) => {
    if (name === 'os') return { platform: () => 'win32', arch: () => 'x64' };
    if (name === 'fs') return { existsSync: () => false, readFileSync };
    if (name === 'child_process') {
      return {
        spawn(command, args, options) {
          calls.push({ command, args, options });
          const child = new EventEmitter();
          queueMicrotask(() => child.emit('close', 0));
          return child;
        }
      };
    }
    if (name === './download-prebuilds.cjs' || name === 'https') {
      throw new Error(`Unexpected upstream download dependency: ${name}`);
    }
    return require(name);
  };

  vm.runInNewContext(source, {
    require: localRequire,
    __dirname: dirname(scriptPath),
    console: { log: () => undefined, error: () => undefined },
    process: { exit() { throw new Error('postinstall failed'); } }
  }, { filename: scriptPath });

  await setImmediate();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'npx.cmd');
  assert.equal(calls[0].args[0], 'electron-rebuild');
  assert.equal(calls[0].options.cwd, resolve(scriptsDir, '../..'));
});

test('legacy prebuild command fails closed without a release feed', async () => {
  const { downloadPrebuilds } = require(resolve(scriptsDir, 'download-prebuilds.cjs'));
  assert.deepEqual(await downloadPrebuilds(), {
    success: false,
    reason: 'no-preview-prebuild-feed'
  });
});
