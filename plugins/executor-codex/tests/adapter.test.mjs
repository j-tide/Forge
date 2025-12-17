import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codexEnvironment, mapCodexError } from '../dist/index.js';

test('provider authentication, timeout, workspace and protocol errors map to Forge codes', () => {
  assert.equal(mapCodexError(new Error('Unauthorized')).code, 'EXECUTOR_AUTH_FAILED');
  assert.equal(mapCodexError(new Error('deadline exceeded')).code, 'EXECUTOR_TIMEOUT');
  assert.equal(mapCodexError(new Error('invalid cwd')).code, 'EXECUTOR_WORKSPACE_ERROR');
  assert.equal(mapCodexError(new Error('invalid response')).code, 'EXECUTOR_PROTOCOL_ERROR');
  assert.equal(mapCodexError(new Error('private token value')).message, 'Codex runtime failed');
});

test('Codex subprocess receives only the narrow runtime environment', () => {
  assert.deepEqual(codexEnvironment({ PATH: '/usr/bin', HOME: '/tmp/home', OPENAI_API_KEY: 'secret',
    FORGE_HOST_OWNERSHIP_TOKEN: 'secret' }), { PATH: '/usr/bin', HOME: '/tmp/home' });
  assert.deepEqual(codexEnvironment({ HTTPS_PROXY: 'http://127.0.0.1:7890',
    HTTP_PROXY: 'http://user:secret@127.0.0.1:7890' }), { HTTPS_PROXY: 'http://127.0.0.1:7890' });
});
