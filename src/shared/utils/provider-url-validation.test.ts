import { describe, expect, it } from 'vitest';
import { validateProviderBaseUrl } from './provider-url-validation';

describe('Provider Base URL validation shared by UI and persistence', () => {
  it.each([
    'invalid url', '', 'file:///tmp/models', 'ftp://example.com',
    'https://user:private-password@example.com/v1', 'https://private-user@example.com/v1',
    'https://example.com/v1?api_key=private-key', 'https://example.com/v1#private-key',
  ])('rejects malformed, non-HTTP or credential-bearing addresses without echoing them', (url) => {
    expect(validateProviderBaseUrl(url, { apiKey: 'private-key' })).toEqual({ valid: false, code: 'invalid-url' });
  });

  it.each(['http://example.com/v1', 'http://192.168.1.2:11434', 'http://localhost.example.com/v1'])('blocks plaintext remote keys', (url) => {
    expect(validateProviderBaseUrl(url, { apiKey: 'private-key' })).toEqual({ valid: false, code: 'insecure-url' });
  });

  it.each(['https://example.com/v1', 'http://localhost:11434/v1', 'http://127.0.0.1:11434/v1', 'http://[::1]:11434/v1'])('allows HTTPS and loopback development servers with a key', (url) => {
    expect(validateProviderBaseUrl(url, { apiKey: 'private-key' }).valid).toBe(true);
  });

  it('preserves keyless remote Ollama configuration and trims valid input', () => {
    const checked = validateProviderBaseUrl('  http://192.168.1.2:11434  ');
    expect(checked.valid).toBe(true);
    if (checked.valid) expect(checked.url.toString()).toBe('http://192.168.1.2:11434/');
  });
});
