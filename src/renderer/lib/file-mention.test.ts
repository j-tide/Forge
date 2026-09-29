import { describe, expect, it } from 'vitest';
import { detectFileMention, projectRelativeReferencePath, replaceFileMention, removeFileMention, isProjectRelativeReferencePath } from './file-mention';

describe('file mention boundaries', () => {
  it.each([
    ['@', { query: '', startPos: 0 }],
    ['Read @src/main.ts', { query: 'src/main.ts', startPos: 5 }],
    ['Read (@main.ts', { query: 'main.ts', startPos: 6 }],
    ['查看 @中文路径/页面.ts', { query: '中文路径/页面.ts', startPos: 3 }],
    ['Check @src\\main.ts', { query: 'src\\main.ts', startPos: 6 }],
    ['hello@example.com', null],
    ['Read @file.ts next', null],
    ['double@@file.ts', null],
  ])('detects only the active file mention in %s', (text, result) => {
    expect(detectFileMention(text, text.length)).toEqual(result);
  });

  it('uses the actual cursor position rather than the end of the description', () => {
    expect(detectFileMention('Read @alpha.ts next', 8)).toEqual({ query: 'al', startPos: 5 });
    expect(detectFileMention('Read @alpha.ts next', 0)).toBeNull();
  });
});

describe('selected file reference identity', () => {
  it.each(['../secret.ts', '/secret.ts', 'C:\\secret.ts', 'src/../../secret.ts', 'src\\..\\secret.ts'])('rejects unsafe relative metadata %s', (value) => {
    expect(isProjectRelativeReferencePath(value)).toBe(false);
  });
  it.each([
    ['/project', '/project/src/页面.ts', 'src/页面.ts'],
    ['C:\\Project', 'C:\\Project\\src\\same.ts', 'src/same.ts'],
    ['/project', '/project copy/src/file.ts', null],
    ['/project', '/other/secret.ts', null],
    ['/project', '/project/../secret.ts', null],
    ['/project', '/project/src/../../secret.ts', null],
    ['/project', '/project//secret.ts', null],
    ['/project', '/project/C:/secret.ts', null],
  ])('only accepts contained paths: %s / %s', (root, fullPath, relative) => {
    expect(projectRelativeReferencePath(root, fullPath)).toBe(relative);
  });

  it('inserts only at the mention represented by the current popup', () => {
    expect(replaceFileMention('Read @al next', 8, 8, { query: 'al', startPos: 5 }, 'alpha.ts'))
      .toEqual({ text: 'Read @alpha.ts next', cursor: 14 });
    const text = '@alpha and @alpha';
    expect(replaceFileMention(text, text.length, text.length, { query: 'alpha', startPos: 0 }, 'alpha.ts')).toBeNull();
    expect(replaceFileMention(text, 0, 6, { query: 'alpha', startPos: 0 }, 'alpha.ts')).toBeNull();
  });

  it('removes the reference marker without changing a longer file name or deleting the request text', () => {
    expect(removeFileMention('Read @alpha.ts and @alpha.tsx, then check (@alpha.ts).', 'alpha.ts'))
      .toBe('Read alpha.ts and @alpha.tsx, then check (alpha.ts).');
    expect(removeFileMention('查看 @中文 文件.ts', '中文 文件.ts')).toBe('查看 中文 文件.ts');
  });
});
