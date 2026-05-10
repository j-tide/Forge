import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { open, lstat, mkdir, readFile, realpath, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { databaseRestorePreviewSchema, stagedDatabaseProfileSchema,
  type DatabaseRestoreResult, type HostActivity, type HostProfileSwitchSafety } from '@forge/contracts';

const run = promisify(execFile);
const selectionFormat = 'forge-database-profile/v1';
const profileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function requireSafeDataProfileSwitch(activity: HostActivity,
  safety: HostProfileSwitchSafety): void {
  if (activity.activityCount !== 0) throw new Error('RUN_CONFLICT');
  if (!safety.safe) throw new Error('RUN_RECOVERY_REQUIRED');
}

export function profileDataDir(root: string, profileId: string | null): string {
  if (profileId !== null && !profileIdPattern.test(profileId)) throw new Error('DATABASE_PROFILE_INVALID');
  return profileId === null ? join(root, 'production') : join(root, 'restored', profileId);
}

async function validateRestoredProfile(root: string, id: string): Promise<void> {
  const folder = profileDataDir(root, id);
  const restored = join(root, 'restored');
  if ((await lstat(restored)).isSymbolicLink() ||
    (await lstat(folder)).isSymbolicLink() ||
    !(await lstat(join(folder, 'forge.sqlite'))).isFile() ||
    await realpath(folder) !== folder) throw new Error('DATABASE_PROFILE_INVALID');
}

export async function readProfileSelection(root: string): Promise<string | null> {
  let raw: string;
  const pointer = join(root, 'active-profile.json');
  try { raw = await readFile(pointer, 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error('DATABASE_PROFILE_INVALID', {cause:error});
  }
  try {
    if ((await lstat(pointer)).isSymbolicLink() || raw.length > 256) throw new Error();
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'format,profileId' ||
      (value as {format?: unknown}).format !== selectionFormat) throw new Error();
    const id = (value as {profileId?: unknown}).profileId;
    if (id === null) return null;
    if (typeof id !== 'string' || !profileIdPattern.test(id)) throw new Error();
    await validateRestoredProfile(root, id);
    return id;
  } catch { throw new Error('DATABASE_PROFILE_INVALID'); }
}

export async function writeProfileSelection(root: string, profileId: string | null): Promise<void> {
  profileDataDir(root, profileId);
  await mkdir(root, {recursive:true,mode:0o700});
  if ((await lstat(root)).isSymbolicLink() || await realpath(root) !== root) {
    throw new Error('DATABASE_PROFILE_INVALID');
  }
  if (profileId !== null) {
    try { await validateRestoredProfile(root, profileId); }
    catch { throw new Error('DATABASE_PROFILE_INVALID'); }
  }
  const target = join(root, 'active-profile.json');
  const temporary = join(root, `.active-profile-${randomUUID()}.tmp`);
  const stream = await open(temporary, 'wx', 0o600);
  try {
    await stream.writeFile(JSON.stringify({format:selectionFormat,profileId}));
    await stream.sync();
  } finally { await stream.close(); }
  try { await rename(temporary, target); }
  catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  if (process.platform !== 'win32') {
    const folder = await open(root, 'r');
    try { await folder.sync(); }
    finally { await folder.close(); }
  }
}

export async function runRestoreTool(interpreter: string, source: string, root: string,
  profileId: string | null, environment: NodeJS.ProcessEnv): Promise<unknown> {
  const args = profileId === null ? ['-m','forge.restore_profile','inspect',source] :
    ['-m','forge.restore_profile','stage',source,join(root,'restored'),profileId];
  try {
    const result = await run(interpreter,args,{shell:false,env:environment,
      timeout:180_000,maxBuffer:16_384,windowsHide:true});
    const raw: unknown = JSON.parse(result.stdout);
    return profileId === null ? databaseRestorePreviewSchema.parse(raw) :
      stagedDatabaseProfileSchema.parse(raw);
  } catch (error) {
    const stderr = (error as {stderr?: string}).stderr?.trim();
    const allowed = /^RESTORE_[A-Z_]{1,48}$/;
    throw new Error(stderr && allowed.test(stderr) ? stderr : 'RESTORE_VALIDATION_FAILED',
      {cause:error});
  }
}

export function restoreResult(switched: boolean, profileId: string | null,
  schemaVersion: number | null): DatabaseRestoreResult {
  return {switched,profileId,schemaVersion};
}
