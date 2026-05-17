import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export type ForgeEnvironment = 'development' | 'test' | 'production';

export function resolveForgeDataDir(options: {
  environment: ForgeEnvironment;
  platform?: NodeJS.Platform;
  home?: string;
  appData?: string;
  override?: string;
}): string {
  if (options.override !== undefined) {
    if (!isAbsolute(options.override)) throw new Error('Forge data directory override must be absolute');
    return resolve(options.override);
  }
  const home = options.home ?? homedir();
  const platform = options.platform ?? process.platform;
  const base = options.appData ?? (platform === 'darwin' ? join(home, 'Library', 'Application Support')
    : platform === 'win32' ? join(home, 'AppData', 'Roaming')
      : join(home, '.local', 'share'));
  return join(base, 'Forge', options.environment);
}
