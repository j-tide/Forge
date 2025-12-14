import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const runGit = promisify(execFile);
const runIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export const workspaceDescriptorSchema = z.strictObject({
  workspaceId: z.uuid(), rootPath: z.string().min(1), sourceRepo: z.string().min(1),
  sourceRepoIdentity: z.string().min(1), baseRevision: z.string().regex(/^[0-9a-f]{40,64}$/),
  mode: z.literal('detached-worktree'), createdAt: z.string().datetime(), ownerRunId: runIdSchema,
  runtimeId: z.uuid(), ownershipId: z.uuid(),
  status: z.enum(['creating', 'ready', 'busy', 'releasing', 'released', 'failed']),
});
export type WorkspaceDescriptor = z.infer<typeof workspaceDescriptorSchema>;
export type CreateWorkspace = { sourceRepo: string; ownerRunId: string; baseRevision?: string };
export type ReleaseOptions = { discardChanges?: boolean };

async function git(cwd: string, args: string[], hooksPath: string): Promise<string> {
  const { stdout } = await runGit('git', ['-c', `core.hooksPath=${hooksPath}`, '-C', cwd, ...args],
    { encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

function contained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Worktree metadata is kept outside the tree. This manager never prunes unrelated Git worktrees. */
export class WorkspaceManager {
  private readonly records = new Map<string, WorkspaceDescriptor>();
  private readonly releasing = new Map<string, Promise<WorkspaceDescriptor>>();
  private root = '';
  private trees = '';
  private metadata = '';
  private hooks = '';
  private accepting = true;
  constructor(private readonly managedRoot: string, readonly runtimeId: string,
    private readonly isRunActive: (runId: string) => boolean) {
    if (!isAbsolute(managedRoot)) throw new Error('Workspace manager root must be absolute');
    z.uuid().parse(runtimeId);
  }

  async open(): Promise<void> {
    await mkdir(this.managedRoot, { recursive: true, mode: 0o700 });
    if ((await lstat(this.managedRoot)).isSymbolicLink()) throw new Error('Workspace manager root cannot be a symlink');
    this.root = await realpath(this.managedRoot);
    for (const name of ['trees', 'records', 'empty-hooks']) {
      const path = join(this.root, name);
      await mkdir(path, { mode: 0o700, recursive: true });
      if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) throw new Error('Managed workspace directory is not trusted');
    }
    this.trees = join(this.root, 'trees');
    this.metadata = join(this.root, 'records');
    this.hooks = join(this.root, 'empty-hooks');
  }

  private requireOpen(): void { if (!this.root) throw new Error('WorkspaceManager is not open'); }

  private async save(descriptor: WorkspaceDescriptor): Promise<void> {
    const record = workspaceDescriptorSchema.parse(descriptor);
    const target = join(this.metadata, `${record.workspaceId}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
    await rename(temporary, target);
  }

  async create(input: CreateWorkspace): Promise<WorkspaceDescriptor> {
    this.requireOpen();
    if (!this.accepting) throw new Error('WorkspaceManager is stopping');
    runIdSchema.parse(input.ownerRunId);
    if (input.baseRevision && !/^[0-9a-f]{40,64}$/.test(input.baseRevision)) throw new Error('Base revision must be a commit hash');
    const source = await realpath(input.sourceRepo);
    const top = await realpath(await git(source, ['rev-parse', '--show-toplevel'], this.hooks));
    if (source !== top) throw new Error('Source must be a Git worktree root');
    const common = await git(source, ['rev-parse', '--git-common-dir'], this.hooks);
    const sourceRepoIdentity = await realpath(resolve(source, common));
    const baseRevision = await git(source, ['rev-parse', '--verify', `${input.baseRevision ?? 'HEAD'}^{commit}`], this.hooks);
    const workspaceId = randomUUID();
    const rootPath = join(this.trees, workspaceId);
    if (!contained(this.trees, rootPath)) throw new Error('Workspace path escapes managed root');
    try { await lstat(rootPath); throw new Error('Workspace directory already exists'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const descriptor = workspaceDescriptorSchema.parse({ workspaceId, rootPath, sourceRepo: source,
      sourceRepoIdentity, baseRevision, mode: 'detached-worktree', createdAt: new Date().toISOString(),
      ownerRunId: input.ownerRunId, runtimeId: this.runtimeId, ownershipId: randomUUID(), status: 'creating' });
    this.records.set(workspaceId, descriptor);
    await this.save(descriptor);
    try {
      await git(source, ['worktree', 'add', '--detach', rootPath, baseRevision], this.hooks);
      await this.assertOwnedTree(descriptor);
      descriptor.status = 'ready';
      await this.save(descriptor);
      return { ...descriptor };
    } catch (error) {
      descriptor.status = 'failed';
      await this.save(descriptor);
      throw new Error('Forge worktree creation failed; ownership record retained', { cause: error });
    }
  }

  private owned(workspaceId: string): WorkspaceDescriptor {
    z.uuid().parse(workspaceId);
    const record = this.records.get(workspaceId);
    if (!record || record.runtimeId !== this.runtimeId || record.rootPath !== join(this.trees, workspaceId)) {
      throw new Error('Unknown Forge workspace ownership');
    }
    return record;
  }

  private async assertOwnedTree(record: WorkspaceDescriptor): Promise<void> {
    if (!contained(this.trees, record.rootPath)) throw new Error('Workspace escapes managed root');
    const type = await lstat(record.rootPath);
    if (!type.isDirectory() || type.isSymbolicLink() || await realpath(record.rootPath) !== record.rootPath) {
      throw new Error('Workspace path is not a managed directory');
    }
    const top = await realpath(await git(record.rootPath, ['rev-parse', '--show-toplevel'], this.hooks));
    const common = await realpath(resolve(record.rootPath, await git(record.rootPath, ['rev-parse', '--git-common-dir'], this.hooks)));
    if (top !== record.rootPath || common !== record.sourceRepoIdentity) throw new Error('Git worktree identity mismatch');
    const listed = await git(record.sourceRepo, ['worktree', 'list', '--porcelain', '-z'], this.hooks);
    if (!listed.split('\0').some((entry) => entry === `worktree ${record.rootPath}`)) {
      throw new Error('Git does not register the owned worktree');
    }
  }

  inspect(workspaceId: string): WorkspaceDescriptor { this.requireOpen(); return { ...this.owned(workspaceId) }; }

  async acquire(workspaceId: string, runId: string): Promise<WorkspaceDescriptor> {
    this.requireOpen();
    runIdSchema.parse(runId);
    const record = this.owned(workspaceId);
    if (record.ownerRunId !== runId || record.status !== 'ready') throw new Error('Workspace already leased or not ready');
    await this.assertOwnedTree(record);
    record.status = 'busy';
    await this.save(record);
    return { ...record };
  }

  async quarantine(workspaceId: string): Promise<WorkspaceDescriptor> {
    this.requireOpen();
    const record = this.owned(workspaceId);
    if (record.status === 'released') throw new Error('Released workspace cannot be quarantined');
    record.status = 'failed';
    await this.save(record);
    return { ...record };
  }

  release(workspaceId: string, options: ReleaseOptions = {}): Promise<WorkspaceDescriptor> {
    this.requireOpen();
    const prior = this.releasing.get(workspaceId);
    if (prior) return prior;
    const action = this.releaseOwned(workspaceId, options);
    this.releasing.set(workspaceId, action);
    void action.finally(() => this.releasing.delete(workspaceId)).catch(() => {});
    return action;
  }

  private async releaseOwned(workspaceId: string, options: ReleaseOptions): Promise<WorkspaceDescriptor> {
    const record = this.owned(workspaceId);
    if (record.status === 'released') return { ...record };
    if (!['ready', 'busy'].includes(record.status)) throw new Error('Workspace is not releasable');
    if (this.isRunActive(record.ownerRunId)) throw new Error('Workspace has active owned processes');
    await this.assertOwnedTree(record);
    const dirty = (await git(record.rootPath, ['status', '--porcelain', '--untracked-files=all'], this.hooks)).length > 0;
    if (dirty && !options.discardChanges) throw new Error('Workspace contains changes; explicit discard is required');
    record.status = 'releasing';
    await this.save(record);
    try {
      await git(record.sourceRepo, ['worktree', 'remove', ...(dirty ? ['--force'] : []), record.rootPath], this.hooks);
      record.status = 'released';
      await this.save(record);
      return { ...record };
    } catch (error) {
      record.status = 'failed';
      await this.save(record);
      throw new Error('Workspace release failed; ownership retained for inspection', { cause: error });
    }
  }

  async inspectOrphans(): Promise<WorkspaceDescriptor[]> {
    this.requireOpen();
    const found: WorkspaceDescriptor[] = [];
    for (const name of await readdir(this.metadata)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
      try {
        const record = workspaceDescriptorSchema.parse(JSON.parse(await readFile(join(this.metadata, name), 'utf8')));
        if (record.runtimeId !== this.runtimeId && record.status !== 'released' &&
          record.rootPath === join(this.trees, record.workspaceId)) found.push(record);
      } catch { /* malformed records grant no cleanup authority */ }
    }
    return found;
  }

  async dispose(): Promise<number> {
    this.accepting = false;
    let quarantined = 0;
    for (const record of this.records.values()) {
      if (record.status === 'released' || record.status === 'failed') continue;
      record.status = 'failed';
      await this.save(record);
      quarantined += 1;
    }
    return quarantined;
  }
}
