import { expect, it } from 'vitest';
import { filePatch } from './run-code-browser';

it('selects only the exact recorded file section and does not invent unavailable code', () => {
  const diff = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n+one\n' +
    'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n+two';
  expect(filePatch(diff, 'src/a.ts')).toContain('+one');
  expect(filePatch(diff, 'src/a.ts')).not.toContain('+two');
  expect(filePatch(diff, 'src/missing.ts')).toBeNull();
  expect(filePatch(diff, 'src/a.ts\nb/src/b.ts')).toBeNull();
  expect(filePatch('--- /dev/null\n+++ 中文 path.ts\n+new text', '中文 path.ts')).toContain('+new text');
});
