import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const mockHome = vi.hoisted(() => ({ value: '' }));
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    default: { ...actual, homedir: () => mockHome.value },
    homedir: () => mockHome.value
  };
});

import { isManagedPreviewConfigDir } from './config-path-validator';

beforeEach(() => {
  mockHome.value = mkdtempSync(join(tmpdir(), 'forge-preview-validator-'));
});

afterEach(() => {
  rmSync(mockHome.value, { recursive: true, force: true });
});

describe('managed preview Claude directories', () => {
  it('accepts a direct preview profile and rejects shared or traversed paths', () => {
    expect(isManagedPreviewConfigDir('~/.forge-glass-preview/claude-profiles/work')).toBe(true);
    expect(isManagedPreviewConfigDir(join(mockHome.value, '.forge-glass-preview', 'claude-profiles', 'work'))).toBe(true);
    expect(isManagedPreviewConfigDir('~/.claude-profiles/work')).toBe(false);
    expect(isManagedPreviewConfigDir('~/.claude')).toBe(false);
    expect(isManagedPreviewConfigDir('~/.forge-glass-preview/claude-profiles/../work')).toBe(false);
    expect(isManagedPreviewConfigDir('~/.forge-glass-preview/claude-profiles/work/child')).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('rejects a profile root symlink into another directory', () => {
    const previewRoot = join(mockHome.value, '.forge-glass-preview');
    const upstreamRoot = join(mockHome.value, '.claude-profiles');
    mkdirSync(previewRoot);
    mkdirSync(upstreamRoot);
    symlinkSync(upstreamRoot, join(previewRoot, 'claude-profiles'));

    expect(isManagedPreviewConfigDir('~/.forge-glass-preview/claude-profiles/work')).toBe(false);
  });
});
