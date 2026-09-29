import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { getPtyDaemonSocketPath } from '../pty-daemon-socket';

describe('PTY daemon socket isolation', () => {
  const dailyUserData = path.join(os.tmpdir(), 'Forge Glass Preview');
  const qaUserData = path.join(os.tmpdir(), 'forge-glass-preview-qa');

  it('uses a preview-specific address that is stable for the same userData path', () => {
    const socketPath = getPtyDaemonSocketPath(dailyUserData);

    expect(socketPath).toBe(getPtyDaemonSocketPath(`${dailyUserData}${path.sep}`));
    expect(socketPath).toContain('forge-glass-preview-pty-');
    expect(socketPath).not.toContain('auto-claude-pty-');
    if (process.platform !== 'win32') {
      expect(Buffer.byteLength(socketPath)).toBeLessThan(104);
    }
  });

  it('separates isolated QA data from the daily preview daemon', () => {
    expect(getPtyDaemonSocketPath(qaUserData)).not.toBe(getPtyDaemonSocketPath(dailyUserData));
  });

  it('requires an absolute profile path', () => {
    expect(() => getPtyDaemonSocketPath('relative-profile')).toThrow('must be absolute');
  });
});
