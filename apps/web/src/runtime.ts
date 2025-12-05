export type ForgeRuntime =
  | { kind: 'web'; label: 'Web' }
  | { kind: 'desktop'; label: string; platform: string };

export function detectRuntime(): ForgeRuntime {
  const bridge = typeof window === 'undefined' ? undefined : window.forge;
  if (!bridge || typeof bridge.platform !== 'string') {
    return { kind: 'web', label: 'Web' };
  }

  const platformName = bridge.platform === 'darwin'
    ? 'macOS'
    : bridge.platform === 'win32' ? 'Windows' : bridge.platform;
  return { kind: 'desktop', label: `Desktop · ${platformName}`, platform: bridge.platform };
}
