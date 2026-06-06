import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import type { WorkspaceDescriptor } from './index.js';

const exec = promisify(execFile);
const sha = /^[0-9a-f]{40,64}$/;
const maxFiles = 10_000;
const maxFileBytes = 4 * 1024 * 1024;
const maxTotalBytes = 128 * 1024 * 1024;
const secretContent = [
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/,
  /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_/+.-]{16,}/i,
];

export type SnapshotFile = { path: string; kind: 'added' | 'modified' | 'deleted';
  blobSha: string | null; byteSize: number };
export type SnapshotMaterial = { snapshotId: string; workspaceId: string; runId: string;
  baseRevision: string; baseTree: string; filteredBaseTree: string;
  commitSha: string; treeSha: string; contentHash: string;
  files: SnapshotFile[]; excludedPaths: string[]; noChange: boolean; createdAt: string };

export class SnapshotError extends Error {
  constructor(readonly code: 'SNAPSHOT_SECRET_BLOCKED' | 'SNAPSHOT_PATH_UNSAFE' |
    'SNAPSHOT_TOO_LARGE' | 'SNAPSHOT_GIT_FAILED' |
    'SNAPSHOT_NO_CHANGE_EXPLANATION_REQUIRED', message: string) { super(message); }
}

function safeRelative(path: string): void {
  if (!path || path.includes('\0') || path.includes('\\') || isAbsolute(path) ||
    /^[A-Za-z]:/.test(path) || path.split('/').some((segment) =>
      !segment || segment === '.' || segment === '..' || segment.toLowerCase() === '.git')) {
    throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Snapshot path is not a safe repository-relative path');
  }
}

function excluded(path: string): 'generated' | 'sensitive' | null {
  const parts = path.split('/');
  if (parts.some((part) => ['node_modules', '.git'].includes(part.toLowerCase()))) return 'generated';
  const name = parts.at(-1)?.toLowerCase() ?? '';
  if (name === '.env' || name.startsWith('.env.') || /\.(?:pem|p12|pfx|key)$/.test(name) ||
    /^(?:id_rsa|id_ed25519|credentials(?:\.json)?|secrets?(?:\.json|\.ya?ml)?)$/.test(name)) {
    return 'sensitive';
  }
  return null;
}

async function readContained(root: string, path: string): Promise<{ bytes: Buffer; mode: string }> {
  safeRelative(path);
  const target = join(root, path);
  const rel = relative(root, target);
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
    throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Snapshot file escapes the worktree');
  }
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    const detail = await lstat(current);
    if (detail.isSymbolicLink()) {
      throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Snapshot cannot follow a symbolic link');
    }
  }
  if (await realpath(target) !== target) {
    throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Snapshot path is not canonical');
  }
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const detail = await file.stat();
    if (!detail.isFile()) throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Snapshot supports regular files only');
    if (detail.size > maxFileBytes) throw new SnapshotError('SNAPSHOT_TOO_LARGE', 'Snapshot file exceeds the scan limit');
    const bytes = await file.readFile();
    if (bytes.length !== detail.size || bytes.includes(0)) {
      throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Snapshot binary or changing file is not accepted');
    }
    return { bytes, mode: detail.mode & 0o111 ? '100755' : '100644' };
  } finally { await file.close(); }
}

/** Called only after WorkspaceManager has checked ownership and frozen acquisition. */
export async function materializeSnapshot(workspace: WorkspaceDescriptor, indexPath: string,
  hooksPath: string, noChangeExplanation?: string): Promise<SnapshotMaterial> {
  const snapshotId = randomUUID();
  const environment = { ...process.env, GIT_INDEX_FILE: indexPath,
    GIT_AUTHOR_NAME: 'Forge', GIT_AUTHOR_EMAIL: 'forge@local.invalid',
    GIT_COMMITTER_NAME: 'Forge', GIT_COMMITTER_EMAIL: 'forge@local.invalid' };
  const git = async (args: string[], useIndex = true): Promise<string> => {
    try {
      const { stdout } = await exec('git', ['-c', `core.hooksPath=${hooksPath}`,
        '-c', 'core.fsmonitor=false', '-C',
        workspace.rootPath, ...args], { encoding: 'utf8', env: useIndex ? environment : process.env,
        timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
      if (stdout.includes('\ufffd')) throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Invalid UTF-8 Git path');
      return stdout;
    } catch (error) {
      if (error instanceof SnapshotError) throw error;
      throw new SnapshotError('SNAPSHOT_GIT_FAILED', 'Git snapshot command failed');
    }
  };
  const hashBytes = (bytes: Buffer): Promise<string> => new Promise((resolve, reject) => {
    const child = execFile('git', ['-c', `core.hooksPath=${hooksPath}`,
      '-c', 'core.fsmonitor=false', '-C',
      workspace.rootPath, 'hash-object', '-w', '--stdin'],
    { encoding: 'utf8', env: environment, timeout: 20_000, maxBuffer: 1024 },
    (error, stdout) => {
      if (error || !sha.test(stdout.trim())) reject(new SnapshotError('SNAPSHOT_GIT_FAILED',
        'Git could not store the scanned file bytes'));
      else resolve(stdout.trim());
    });
    child.stdin?.end(bytes);
  });
  try {
    // Explicit status probe; Git returns NUL-delimited paths and executes no hooks.
    await git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], false);
    await git(['read-tree', workspace.baseTree ?? `${workspace.baseRevision}^{tree}`]);
    const tracked = (await git(['ls-files', '--cached', '-z'])).split('\0').filter(Boolean);
    const observed = (await git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']))
      .split('\0').filter(Boolean);
    if (observed.length > maxFiles) throw new SnapshotError('SNAPSHOT_TOO_LARGE', 'Too many snapshot files');
    const excludedPaths: string[] = [];
    for (const path of tracked) {
      safeRelative(path);
      if (excluded(path)) {
        excludedPaths.push(path);
        await git(['update-index', '--force-remove', '--', path]);
      }
    }
    const filteredBaseTree = (await git(['write-tree'])).trim();
    const baseEntries = new Map<string, string>();
    for (const line of (await git(['ls-tree', '-r', '-z', filteredBaseTree])).split('\0').filter(Boolean)) {
      const match = /^(\d+) blob ([0-9a-f]{40,64})\t(.+)$/s.exec(line);
      if (!match) throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Unsupported Git tree entry');
      baseEntries.set(match[3]!, match[2]!);
    }
    const seen = new Set<string>();
    const files: SnapshotFile[] = [];
    let scanned = 0;
    for (const path of observed) {
      safeRelative(path);
      if (seen.has(path)) continue;
      seen.add(path);
      const classification = excluded(path);
      if (classification === 'generated') {
        excludedPaths.push(path);
        continue;
      }
      let exists = true;
      try { await lstat(join(workspace.rootPath, path)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false;
        else throw error; }
      if (!exists) {
        if (baseEntries.has(path)) {
          await git(['update-index', '--force-remove', '--', path]);
          files.push({ path, kind: 'deleted', blobSha: null, byteSize: 0 });
        }
        continue;
      }
      if (classification === 'sensitive') {
        throw new SnapshotError('SNAPSHOT_SECRET_BLOCKED', 'Sensitive path cannot enter CodeSnapshot');
      }
      const { bytes, mode } = await readContained(workspace.rootPath, path);
      scanned += bytes.length;
      if (scanned > maxTotalBytes) throw new SnapshotError('SNAPSHOT_TOO_LARGE', 'Snapshot scan budget exceeded');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new SnapshotError('SNAPSHOT_PATH_UNSAFE', 'Unscannable file cannot enter CodeSnapshot'); }
      if (secretContent.some((pattern) => pattern.test(text))) {
        throw new SnapshotError('SNAPSHOT_SECRET_BLOCKED', 'Potential credential blocks CodeSnapshot');
      }
      const blobSha = await hashBytes(bytes);
      await git(['update-index', '--add', '--cacheinfo', mode, blobSha, path]);
      if (baseEntries.get(path) !== blobSha) files.push({ path,
        kind: baseEntries.has(path) ? 'modified' : 'added', blobSha, byteSize: bytes.length });
    }
    const treeSha = (await git(['write-tree'])).trim();
    if (!sha.test(treeSha) || !sha.test(filteredBaseTree)) {
      throw new SnapshotError('SNAPSHOT_GIT_FAILED', 'Git tree hash is invalid');
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    const uniqueExcludedPaths = [...new Set(excludedPaths)].sort();
    const noChange = treeSha === filteredBaseTree;
    if (noChange && !noChangeExplanation?.trim()) {
      throw new SnapshotError('SNAPSHOT_NO_CHANGE_EXPLANATION_REQUIRED',
        'A no-change CodeSnapshot requires an explanation');
    }
    const commitSha = (await git(['commit-tree', treeSha, '-p', workspace.baseRevision,
      '-m', `Forge CodeSnapshot ${snapshotId}`])).trim();
    if (!sha.test(commitSha)) throw new SnapshotError('SNAPSHOT_GIT_FAILED', 'Git commit hash is invalid');
    await git(['update-ref', `refs/forge/snapshots/${snapshotId}`, commitSha,
      '0'.repeat(commitSha.length)]);
    const contentHash = createHash('sha256').update(JSON.stringify({ workspaceId: workspace.workspaceId,
      baseRevision: workspace.baseRevision, treeSha, files,
      excludedPaths: uniqueExcludedPaths })).digest('hex');
    return { snapshotId, workspaceId: workspace.workspaceId, runId: workspace.ownerRunId,
      baseRevision: workspace.baseRevision, baseTree: workspace.baseTree ?? filteredBaseTree,
      filteredBaseTree, commitSha, treeSha, contentHash, files,
      excludedPaths: uniqueExcludedPaths,
      noChange, createdAt: new Date().toISOString() };
  } finally {
    await rm(indexPath, { force: true }).catch(() => {});
    await rm(`${indexPath}.lock`, { force: true }).catch(() => {});
  }
}
