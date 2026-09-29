import { createHash } from 'crypto';
import * as path from 'path';
import { isWindows } from '../platform';

export const PTY_DAEMON_PROFILE_ENV = 'FORGE_GLASS_PREVIEW_PTY_USER_DATA_DIR';

/** Keep each preview userData profile on its own socket, including isolated QA data. */
export function getPtyDaemonSocketPath(userDataPath: string): string {
  if (!path.isAbsolute(userDataPath)) {
    throw new Error('PTY daemon profile path must be absolute');
  }

  const profileHash = createHash('sha256')
    .update(path.resolve(userDataPath))
    .digest('hex')
    .slice(0, 16);
  const userId = process.getuid?.() ?? 'default';
  const socketName = `forge-glass-preview-pty-${userId}-${profileHash}`;

  return isWindows()
    ? `\\\\.\\pipe\\${socketName}`
    : `/tmp/${socketName}.sock`;
}
