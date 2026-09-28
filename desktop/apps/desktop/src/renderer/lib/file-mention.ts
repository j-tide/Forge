/** A file mention starts at a word boundary, never inside an email address. */
export function detectFileMention(text: string, cursorPosition: number): { query: string; startPos: number } | null {
  const cursor = Math.max(0, Math.min(text.length, cursorPosition));
  const match = text.slice(0, cursor).match(/(?:^|[\s(])@([^\s@]*)$/u);
  return match ? { query: match[1], startPos: cursor - match[1].length - 1 } : null;
}

/** Lexical validation only; the owning service must validate filesystem access. */
export function isProjectRelativeReferencePath(relative: string): boolean {
  const normalized = relative.replaceAll('\\', '/');
  return Boolean(normalized) && !normalized.includes('\0') && !normalized.startsWith('/') &&
    !/^[a-z]:/i.test(normalized) && !normalized.split('/').some((part) => !part || part === '..' || part === '.');
}

/** Convert a project-contained candidate without exposing an absolute path in metadata. */
export function projectRelativeReferencePath(projectRoot: string, fullPath: string): string | null {
  const root = projectRoot.replaceAll('\\', '/').replace(/\/+$/, '');
  const normalizedPath = fullPath.replaceAll('\\', '/');
  if (!root || !normalizedPath.startsWith(`${root}/`)) return null;
  const relative = normalizedPath.slice(root.length + 1);
  return isProjectRelativeReferencePath(relative) ? relative : null;
}

/** A stale popup must never replace another occurrence of the same query. */
export function replaceFileMention(text: string, start: number, end: number,
  expected: { query: string; startPos: number }, filename: string): { text: string; cursor: number } | null {
  const mention = detectFileMention(text, start);
  if (start !== end || !mention || mention.query !== expected.query || mention.startPos !== expected.startPos) return null;
  return {
    text: `${text.slice(0, mention.startPos)}@${filename}${text.slice(start)}`,
    cursor: mention.startPos + filename.length + 1,
  };
}

export function removeFileMention(text: string, filename: string): string {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`@${escaped}(?=$|[\\s),;])`, 'gu'), filename);
}
