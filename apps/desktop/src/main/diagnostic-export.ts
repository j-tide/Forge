import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

/** Write the exact approved preview, never Renderer-supplied bytes or a symlink target. */
export async function writeDiagnosticBundle(filePath: string, contents: string): Promise<void> {
  if (Buffer.byteLength(contents, 'utf8') > 16_384) throw new Error('DIAGNOSTICS_TOO_LARGE');
  try {
    const existing = await lstat(filePath);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('DIAGNOSTICS_PATH_INVALID');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC |
    (constants.O_NOFOLLOW ?? 0);
  const file = await open(filePath, flags, 0o600);
  try { await file.writeFile(contents, 'utf8'); } finally { await file.close(); }
}
