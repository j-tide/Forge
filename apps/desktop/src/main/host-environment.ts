/** Only runtime and credential-location hints needed by the owned Host. Never forward arbitrary secrets. */
export function hostEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const keys = ['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'CODEX_HOME',
    'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'TEMP', 'TMP', 'SystemRoot', 'ComSpec',
    'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME'];
  const selected = Object.fromEntries(keys.flatMap((key) => typeof source[key] === 'string' ?
    [[key, source[key]]] : [])) as NodeJS.ProcessEnv;
  for (const key of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) {
    const value = source[key];
    if (!value) continue;
    try {
      const url = new URL(value);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) selected[key] = value;
    } catch { /* malformed or credential-bearing proxy is not forwarded */ }
  }
  for (const key of ['NO_PROXY', 'no_proxy']) if (source[key]) selected[key] = source[key];
  return selected;
}
