import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cli-tool-manager', () => ({ getToolPath: vi.fn() }));

import { getLocalSourcePath, hasLocalSource } from './project-initializer';

let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'forge-local-source-'));
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function addRuntimeSource(root: string): void {
  const marker = join(root, 'src/main/ai/session/runner.ts');
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, '// fixture runtime');
}

describe('local runtime source detection', () => {
  it('recognizes the new application root', () => {
    addRuntimeSource(fixture);
    expect(hasLocalSource(fixture)).toBe(true);
    expect(getLocalSourcePath(fixture)).toBe(fixture);
  });

  it('prefers root source when a user project also contains a nested workspace', () => {
    addRuntimeSource(fixture);
    addRuntimeSource(join(fixture, 'apps/desktop'));
    expect(getLocalSourcePath(fixture)).toBe(fixture);
  });

  it('preserves detection of other user projects with a nested desktop workspace', () => {
    const nestedRoot = join(fixture, 'apps/desktop');
    addRuntimeSource(nestedRoot);
    expect(hasLocalSource(fixture)).toBe(true);
    expect(getLocalSourcePath(fixture)).toBe(nestedRoot);
  });

  it('requires the runtime entry instead of accepting an empty source directory', () => {
    mkdirSync(join(fixture, 'src/main/ai/session'), { recursive: true });
    expect(hasLocalSource(fixture)).toBe(false);
    expect(getLocalSourcePath(fixture)).toBeNull();
  });
});
