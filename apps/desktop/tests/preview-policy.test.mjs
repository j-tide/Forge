import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPreviewRequestAllowed, parseLocalPreviewUrl } from '../dist/main/preview-policy.js';

test('preview accepts only an explicit local IPv4 loopback origin', () => {
  assert.equal(parseLocalPreviewUrl('http://127.0.0.1:43210/demo').origin, 'http://127.0.0.1:43210');
  for (const value of ['file:///etc/passwd', 'https://127.0.0.1:43210/',
    'http://localhost:43210/', 'http://127.0.0.2:43210/',
    'http://127.0.0.1/', 'http://user:pass@127.0.0.1:43210/',
    'http://127.0.0.1:43210.evil.invalid/', 'javascript:alert(1)']) {
    assert.throws(() => parseLocalPreviewUrl(value), /PREVIEW_URL_REJECTED/);
  }
});

test('subresources cannot leave the one chosen preview origin', () => {
  const origin = 'http://127.0.0.1:43210';
  assert.equal(isPreviewRequestAllowed(`${origin}/assets/app.js`, origin), true);
  for (const value of ['file:///etc/passwd', 'http://127.0.0.1:43211/secret',
    'http://127.0.0.2:43210/', 'https://example.com/', 'data:text/html,hello',
    'ws://127.0.0.1:43210/']) {
    assert.equal(isPreviewRequestAllowed(value, origin), false);
  }
});
