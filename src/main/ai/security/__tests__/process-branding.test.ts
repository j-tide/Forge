import { describe, expect, it } from 'vitest';

import { validatePkillCommand, validateKillallCommand } from '../validators/process-validators';

describe('host process self protection across branding changes', () => {
  it.each(['Forge', 'forge', 'forge-glass-preview', 'Aperant', 'auto-claude', 'Electron'])(
    'rejects process-name termination of %s',
    (processName) => {
      expect(validatePkillCommand(`pkill ${processName}`)[0]).toBe(false);
      expect(validateKillallCommand(`killall ${processName}`)[0]).toBe(false);
    },
  );

  it('also protects the displayed application name when matching its full command line', () => {
    expect(validatePkillCommand('pkill -f "Forge Glass Preview"')[0]).toBe(false);
  });
});
