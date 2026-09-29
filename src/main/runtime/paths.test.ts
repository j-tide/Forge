import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveApplicationRoot, resolvePromptsDirectory } from './paths';

let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'forge-runtime-paths-'));
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function createApplication(root: string, withPrompts = true): void {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"forge-desktop"}');
  if (withPrompts) {
    mkdirSync(join(root, 'prompts'));
    writeFileSync(join(root, 'prompts', 'planner.md'), 'fixture planner');
  }
}

describe('runtime resource paths', () => {
  it.each([
    'src/main/runtime',
    'src/main/ai/prompts',
    'src/main/ai/agent',
    'out/main',
    'out/main/chunks',
    'out/main/ai/agent',
  ])('finds root prompts from %s without relying on the working directory', (relativeDirectory) => {
    const root = join(fixture, 'application');
    createApplication(root);
    const moduleDirectory = join(root, relativeDirectory);
    mkdirSync(moduleDirectory, { recursive: true });

    expect(resolveApplicationRoot(moduleDirectory)).toBe(root);
    expect(resolvePromptsDirectory({ moduleDirectory, resourcesPath: '' })).toBe(join(root, 'prompts'));
  });

  it('does not mistake a prompts directory without an application manifest for the root', () => {
    const root = join(fixture, 'application');
    createApplication(root);
    const moduleDirectory = join(root, 'out/main/chunks');
    mkdirSync(join(moduleDirectory, 'prompts'), { recursive: true });
    writeFileSync(join(moduleDirectory, 'prompts', 'planner.md'), 'unrelated planner');

    expect(resolvePromptsDirectory({ moduleDirectory, resourcesPath: '' })).toBe(join(root, 'prompts'));
  });

  it('uses valid resources supplied by Electron', () => {
    const root = join(fixture, 'application');
    const resourcesPath = join(fixture, 'Resources');
    createApplication(root);
    mkdirSync(join(resourcesPath, 'prompts'), { recursive: true });
    writeFileSync(join(resourcesPath, 'prompts', 'planner.md'), 'packaged planner');

    expect(resolvePromptsDirectory({ moduleDirectory: root, resourcesPath })).toBe(join(resourcesPath, 'prompts'));
  });

  it('ignores the development Electron runtime resources when they contain no prompts', () => {
    const root = join(fixture, 'application');
    createApplication(root);

    expect(resolvePromptsDirectory({
      moduleDirectory: join(root, 'out/main/chunks'),
      resourcesPath: join(fixture, 'Electron.app/Contents/Resources'),
      isPackaged: false,
    })).toBe(join(root, 'prompts'));
  });

  it.each(['app.asar', 'app.asar.unpacked'])('locates packaged Worker resources from %s without Electron APIs', (archive) => {
    const resourcesPath = join(fixture, 'Forge.app/Contents/Resources');
    const moduleDirectory = join(resourcesPath, archive, 'out/main/ai/agent');

    expect(resolvePromptsDirectory({ moduleDirectory })).toBe(join(resourcesPath, 'prompts'));
  });

  it('keeps the packaged location when resources are missing instead of falling back to a checkout', () => {
    const root = join(fixture, 'application');
    createApplication(root);
    const resourcesPath = join(fixture, 'Resources');

    expect(resolvePromptsDirectory({ moduleDirectory: root, resourcesPath, isPackaged: true }))
      .toBe(join(resourcesPath, 'prompts'));
  });

  it('returns the application prompts path when planner.md is missing', () => {
    const root = join(fixture, 'application');
    createApplication(root, false);

    expect(resolvePromptsDirectory({ moduleDirectory: join(root, 'out/main/chunks'), resourcesPath: '' }))
      .toBe(join(root, 'prompts'));
  });

  it('has a deterministic local fallback when neither an application nor resources exists', () => {
    const moduleDirectory = join(fixture, 'orphan');

    expect(resolveApplicationRoot(moduleDirectory)).toBeNull();
    expect(resolvePromptsDirectory({ moduleDirectory, resourcesPath: '' })).toBe(join(moduleDirectory, 'prompts'));
  });
});
