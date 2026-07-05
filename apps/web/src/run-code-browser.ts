/** Select a patch from the Host's already bounded, redacted read-only Run diff. */
export function filePatch(diff: string, path: string): string | null {
  const lines = diff.split('\n');
  const headers = lines.flatMap((line, index) => line.startsWith('diff --git ') ? [index] : []);
  for (let section = 0; section < headers.length; section++) {
    const start = headers[section]!;
    const end = headers[section + 1] ?? lines.length;
    if (lines[start] === `diff --git a/${path} b/${path}`) return lines.slice(start, end).join('\n');
  }
  // The Host uses a short, explicit marker for newly created untracked text files.
  const marker = `+++ ${path}`;
  const next = lines.findIndex((line) => line === marker);
  if (next > 0 && lines[next - 1] === '--- /dev/null') {
    const end = lines.findIndex((line, index) => index > next && line.startsWith('diff --git '));
    return lines.slice(next - 1, end === -1 ? lines.length : end).join('\n');
  }
  return null;
}
