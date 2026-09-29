import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ isPackaged: false, userData: '' }));
vi.mock('electron', () => ({
  app: {
    get isPackaged() { return state.isPackaged; },
    getPath: () => state.userData,
  },
}));

import { getBundledSourcePath, getEffectiveSourcePath, getUpdateTargetPath } from './path-resolver';

let fixture: string;
let originalResourcesPath: PropertyDescriptor | undefined;
const rootPrompts = fileURLToPath(new URL('../../../prompts', import.meta.url));

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'forge-updater-paths-'));
  state.isPackaged = false;
  state.userData = join(fixture, 'userData');
  mkdirSync(state.userData);
  originalResourcesPath = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
  Object.defineProperty(process, 'resourcesPath', {
    value: join(fixture, 'Resources'), configurable: true, writable: true,
  });
});

afterEach(() => {
  if (originalResourcesPath) {
    Object.defineProperty(process, 'resourcesPath', originalResourcesPath);
  } else {
    Reflect.deleteProperty(process, 'resourcesPath');
  }
  rmSync(fixture, { recursive: true, force: true });
});

function createPrompts(directory: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'planner.md'), 'fixture planner');
}

describe('prompt source selection', () => {
  it('uses root prompts for development and its update target', () => {
    expect(getBundledSourcePath()).toBe(rootPrompts);
    expect(getEffectiveSourcePath()).toBe(rootPrompts);
    expect(getUpdateTargetPath()).toBe(rootPrompts);
  });

  it('uses packaged resources while retaining the userData update target', () => {
    state.isPackaged = true;
    expect(getBundledSourcePath()).toBe(join(fixture, 'Resources/prompts'));
    expect(getUpdateTargetPath()).toBe(join(state.userData, 'prompts-source'));
  });

  it('keeps a valid custom source ahead of a packaged update override', () => {
    state.isPackaged = true;
    const customSource = join(fixture, 'custom-prompts');
    createPrompts(customSource);
    createPrompts(join(state.userData, 'prompts-source'));
    writeFileSync(join(state.userData, 'settings.json'), JSON.stringify({ autoBuildPath: customSource }));
    expect(getEffectiveSourcePath()).toBe(customSource);
  });

  it('retains valid packaged update overrides', () => {
    state.isPackaged = true;
    const override = join(state.userData, 'prompts-source');
    createPrompts(override);
    expect(getEffectiveSourcePath()).toBe(override);
  });

  it('falls back to root prompts when a custom source lacks planner.md', () => {
    const customSource = join(fixture, 'invalid-prompts');
    mkdirSync(customSource);
    writeFileSync(join(state.userData, 'settings.json'), JSON.stringify({ autoBuildPath: customSource }));
    expect(getEffectiveSourcePath()).toBe(rootPrompts);
  });
});
