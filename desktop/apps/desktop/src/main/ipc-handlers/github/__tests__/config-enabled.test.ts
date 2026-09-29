import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../../../shared/types';
import { getGitHubConfig } from '../utils';

const cli = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  execFile: vi.fn(),
  getAugmentedEnv: vi.fn(),
  getToolPath: vi.fn(),
}));

vi.mock('child_process', () => ({
  execFileSync: cli.execFileSync,
  execFile: cli.execFile,
}));
vi.mock('../../../env-utils', () => ({
  getAugmentedEnv: cli.getAugmentedEnv,
}));
vi.mock('../../../cli-tool-manager', () => ({
  getToolPath: cli.getToolPath,
}));

const directories: string[] = [];

function createProject(env: string): Project {
  const directory = mkdtempSync(path.join(tmpdir(), 'forge-github-enabled-test-'));
  directories.push(directory);
  const autoBuildPath = '.auto-claude';
  const configDirectory = path.join(directory, autoBuildPath);
  mkdirSync(configDirectory);
  writeFileSync(path.join(configDirectory, '.env'), env, 'utf-8');

  return {
    id: `project-${directories.length}`,
    name: 'GitHub configuration test',
    path: directory,
    autoBuildPath,
    settings: {
      model: 'default',
      memoryBackend: 'file',
      linearSync: false,
      notifications: {
        onTaskComplete: false,
        onTaskFailed: false,
        onReviewNeeded: false,
        sound: false,
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function expectNoCliLookup(): void {
  expect(cli.execFileSync).not.toHaveBeenCalled();
  expect(cli.execFile).not.toHaveBeenCalled();
  expect(cli.getToolPath).not.toHaveBeenCalled();
  expect(cli.getAugmentedEnv).not.toHaveBeenCalled();
}

describe('getGitHubConfig project enablement', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cli.execFileSync.mockReturnValue('cli-fixture-token\n');
    cli.getToolPath.mockReturnValue('/fixture/bin/gh');
    cli.getAugmentedEnv.mockReturnValue({ PATH: '/fixture/bin' });
  });

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('disables valid saved credentials before any CLI lookup', () => {
    const project = createProject([
      'GITHUB_ENABLED=false',
      'GITHUB_TOKEN=env-fixture-token',
      'GITHUB_REPO=owner/repo',
    ].join('\n'));

    expect(getGitHubConfig(project)).toBeNull();
    expectNoCliLookup();
  });

  it('disables CLI fallback when the saved token is blank', () => {
    const project = createProject([
      'GITHUB_ENABLED=false',
      'GITHUB_TOKEN=',
      'GITHUB_REPO=owner/repo',
    ].join('\n'));

    expect(getGitHubConfig(project)).toBeNull();
    expectNoCliLookup();
  });

  it.each(['FALSE', 'FaLsE', '" FALSE "', "' false '"])(
    'disables a case-insensitive or quoted-space flag %s',
    flag => {
      const project = createProject([
        `GITHUB_ENABLED=${flag}`,
        'GITHUB_TOKEN=env-fixture-token',
        'GITHUB_REPO=owner/repo',
      ].join('\n'));

      expect(getGitHubConfig(project)).toBeNull();
      expectNoCliLookup();
    },
  );

  it('preserves valid legacy saved credentials when the flag is absent', () => {
    const project = createProject('GITHUB_TOKEN=env-fixture-token\nGITHUB_REPO=owner/repo');

    expect(getGitHubConfig(project)).toEqual({ token: 'env-fixture-token', repo: 'owner/repo' });
    expectNoCliLookup();
  });

  it('uses saved credentials when explicitly enabled', () => {
    const project = createProject([
      'GITHUB_ENABLED=true',
      'GITHUB_TOKEN=env-fixture-token',
      'GITHUB_REPO=owner/repo',
    ].join('\n'));

    expect(getGitHubConfig(project)).toEqual({ token: 'env-fixture-token', repo: 'owner/repo' });
    expectNoCliLookup();
  });

  it.each(['', ' \n'])('does not fabricate a token when enabled and CLI returns %j', token => {
    cli.execFileSync.mockReturnValue(token);
    const project = createProject('GITHUB_ENABLED=true\nGITHUB_TOKEN=\nGITHUB_REPO=owner/repo');

    expect(getGitHubConfig(project)).toBeNull();
    expect(cli.execFileSync).toHaveBeenCalledOnce();
    expect(cli.execFile).not.toHaveBeenCalled();
  });

  it('does not fabricate a token when enabled and CLI authentication fails', () => {
    cli.execFileSync.mockImplementation(() => { throw new Error('Not authenticated'); });
    const project = createProject('GITHUB_ENABLED=true\nGITHUB_TOKEN=\nGITHUB_REPO=owner/repo');

    expect(getGitHubConfig(project)).toBeNull();
    expect(cli.execFileSync).toHaveBeenCalledOnce();
  });

  it('preserves legacy CLI fallback with the configured tool path and environment', () => {
    const project = createProject('GITHUB_REPO=owner/repo');

    expect(getGitHubConfig(project)).toEqual({ token: 'cli-fixture-token', repo: 'owner/repo' });
    expect(cli.getToolPath).toHaveBeenCalledWith('gh');
    expect(cli.getAugmentedEnv).toHaveBeenCalledOnce();
    expect(cli.execFileSync).toHaveBeenCalledWith('/fixture/bin/gh', ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: { PATH: '/fixture/bin' },
    });
    expect(cli.execFile).not.toHaveBeenCalled();
  });

  it('requires a repository even when an enabled project has a saved token', () => {
    const project = createProject('GITHUB_ENABLED=true\nGITHUB_TOKEN=env-fixture-token');

    expect(getGitHubConfig(project)).toBeNull();
    expectNoCliLookup();
  });

  it('reads each project flag and credentials independently', () => {
    const disabled = createProject([
      'GITHUB_ENABLED=false',
      'GITHUB_TOKEN=disabled-fixture-token',
      'GITHUB_REPO=disabled/repo',
    ].join('\n'));
    const enabled = createProject([
      'GITHUB_ENABLED=true',
      'GITHUB_TOKEN=enabled-fixture-token',
      'GITHUB_REPO=enabled/repo',
    ].join('\n'));
    const legacy = createProject('GITHUB_TOKEN=legacy-fixture-token\nGITHUB_REPO=legacy/repo');

    expect(getGitHubConfig(enabled)).toEqual({ token: 'enabled-fixture-token', repo: 'enabled/repo' });
    expect(getGitHubConfig(disabled)).toBeNull();
    expect(getGitHubConfig(legacy)).toEqual({ token: 'legacy-fixture-token', repo: 'legacy/repo' });
    expect(getGitHubConfig(disabled)).toBeNull();
    expect(getGitHubConfig(enabled)).toEqual({ token: 'enabled-fixture-token', repo: 'enabled/repo' });
    expectNoCliLookup();
  });
});
