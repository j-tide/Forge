import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'path';

const { mockApp, mockMkdirSync } = vi.hoisted(() => ({
  mockApp: {
    isPackaged: false,
    name: '',
    getPath: vi.fn(),
    setName: vi.fn(),
    setPath: vi.fn(),
  },
  mockMkdirSync: vi.fn(),
}));

vi.mock('electron', () => ({ app: mockApp }));
vi.mock('fs', () => ({ mkdirSync: mockMkdirSync }));

describe('preview app identity', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockApp.isPackaged = false;
    mockApp.getPath.mockReturnValue('/isolated-app-data');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('FORGE_GLASS_PREVIEW_USER_DATA_DIR', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('brands the app as Forge while preserving its separate default app-data directory', async () => {
    await import('./preview-identity');

    const expected = join('/isolated-app-data', 'Forge Glass Preview');
    expect(mockApp.setName).toHaveBeenCalledWith('Forge');
    expect(mockMkdirSync).toHaveBeenCalledWith(expected, { recursive: true });
    expect(mockApp.setPath).toHaveBeenCalledWith('userData', expected);
  });

  it('accepts an absolute test-only user-data path', async () => {
    vi.stubEnv('FORGE_GLASS_PREVIEW_USER_DATA_DIR', '/tmp/forge-preview-qa');
    await import('./preview-identity');

    expect(mockApp.setPath).toHaveBeenCalledWith('userData', '/tmp/forge-preview-qa');
  });

  it('ignores the override in packaged builds', async () => {
    mockApp.isPackaged = true;
    vi.stubEnv('FORGE_GLASS_PREVIEW_USER_DATA_DIR', '/tmp/forge-preview-qa');
    await import('./preview-identity');

    expect(mockApp.setPath).toHaveBeenCalledWith('userData', join('/isolated-app-data', 'Forge Glass Preview'));
  });

  it('ignores the override outside test mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FORGE_GLASS_PREVIEW_USER_DATA_DIR', '/tmp/forge-preview-qa');
    await import('./preview-identity');

    expect(mockApp.setPath).toHaveBeenCalledWith('userData', join('/isolated-app-data', 'Forge Glass Preview'));
  });

  it('ignores relative paths', async () => {
    vi.stubEnv('FORGE_GLASS_PREVIEW_USER_DATA_DIR', './preview-qa');
    await import('./preview-identity');

    expect(mockApp.setPath).toHaveBeenCalledWith('userData', join('/isolated-app-data', 'Forge Glass Preview'));
  });
});
