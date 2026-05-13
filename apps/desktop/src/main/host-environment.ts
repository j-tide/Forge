/** Only runtime and credential-location hints needed by the owned Host. Never forward arbitrary secrets. */
import { lstatSync } from 'node:fs';
import { delimiter, join } from 'node:path';

function existingDirectory(path: string): boolean {
  try {
    const entry = lstatSync(path);
    return entry.isDirectory() && !entry.isSymbolicLink();
  } catch { return false; }
}

export function hostEnvironment(source: NodeJS.ProcessEnv,
  platform: string = process.platform): NodeJS.ProcessEnv {
  const keys = ['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'CODEX_HOME',
    'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'SystemRoot', 'ComSpec',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'];
  const selected = Object.fromEntries(keys.flatMap((key) => typeof source[key] === 'string' ?
    [[key, source[key]]] : [])) as NodeJS.ProcessEnv;
  if (platform === 'darwin' && typeof source.PATH === 'string') {
    // Finder often omits user CLI locations. Keep the inherited system order and
    // append only conventional, existing directories for this owned Host.
    const search = source.PATH.split(delimiter).filter(Boolean);
    const candidates = [
      ...(source.HOME ? [join(source.HOME, '.local', 'bin')] : []),
      '/opt/homebrew/bin', '/usr/local/bin',
    ];
    for (const path of candidates) {
      if (!search.includes(path) && existingDirectory(path)) search.push(path);
    }
    selected.PATH = search.join(delimiter);
  }
  for (const key of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) {
    const value = source[key];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) selected[key] = value;
    } catch { /* malformed or credential-bearing proxy is not forwarded */ }
  }
  for (const key of ['NO_PROXY', 'no_proxy']) if (source[key]) selected[key] = source[key];
  if (source.FORGE_MODEL_PROVIDER === 'disabled') selected.FORGE_MODEL_PROVIDER = 'disabled';
  // An isolated historical QA profile may opt into the Host's SQLite read-only mode.
  // Forward only the exact flag; never forward arbitrary FORGE_* environment values.
  if (source.FORGE_PYTHON_DB_READ_ONLY === '1' && source.FORGE_INTERNAL_TEST_HOME) {
    selected.FORGE_PYTHON_DB_READ_ONLY = '1';
  }
  return selected;
}
