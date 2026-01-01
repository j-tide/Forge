import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, win32 } from 'node:path';
import { promisify } from 'node:util';
import { forgeProjectSchema, projectProbeSchema, projectTrustVersion,
  type ForgeProject, type ProjectProbe, type ProjectEnvironment, type CommandPreset } from '@forge/contracts';
import { ForgePersistence } from '@forge/persistence';

const execFileAsync = promisify(execFile);
const manifestLimit = 1024 * 1024;
const scriptNames = ['dev', 'build', 'test', 'lint', 'typecheck'] as const;

export class ProjectError extends Error {
  constructor(readonly code: 'PROJECT_INVALID_PATH' | 'PROJECT_PROBE_FAILED' | 'PROJECT_NOT_FOUND' |
    'PROJECT_PROBE_STALE' | 'PROJECT_TRUST_REQUIRED' | 'COMMAND_PRESET_NOT_FOUND' | 'VALIDATION_ERROR', message: string) { super(message); }
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-c', 'core.fsmonitor=false', ...args], {
      cwd, timeout: 3000, maxBuffer: 128 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
    });
    return stdout.trim();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      throw new ProjectError('PROJECT_PROBE_FAILED', 'Git is unavailable');
    }
    return null;
  }
}

async function manifest(root: string, name: string): Promise<string | null> {
  try {
    const file = join(root, name);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > manifestLimit) return null;
    return await readFile(file, 'utf8');
  } catch { return null; }
}

function detectManager(files: string[]): Pick<ProjectProbe, 'packageManager' | 'packageManagerEvidence'> {
  const evidence = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].filter((name) => files.includes(name));
  return { packageManagerEvidence: evidence, packageManager: evidence.length > 1 ? 'conflict'
    : evidence[0] === 'pnpm-lock.yaml' ? 'pnpm' : evidence[0] === 'package-lock.json' ? 'npm'
      : evidence[0] === 'yarn.lock' ? 'yarn' : 'unknown' };
}

function detectType(files: string[], pkg: Record<string, unknown> | null): ProjectProbe['projectType'] {
  const deps = { ...(pkg?.dependencies as Record<string, unknown> | undefined),
    ...(pkg?.devDependencies as Record<string, unknown> | undefined) };
  if ('electron' in deps) return 'electron';
  if ('vue' in deps) return 'vue';
  if ('react' in deps) return 'react';
  if (files.includes('pyproject.toml') || files.includes('requirements.txt')) return 'python';
  if (files.includes('Cargo.toml')) return 'rust';
  if (files.includes('pom.xml') || files.includes('build.gradle') || files.includes('build.gradle.kts')) return 'java';
  if (pkg) return 'node';
  return 'unknown';
}

function sha(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export async function probeProject(path: string): Promise<ProjectProbe> {
  if (!isAbsolute(path)) throw new ProjectError('PROJECT_INVALID_PATH', 'Choose an absolute project directory');
  let selected: string;
  try {
    selected = await realpath(path);
    if (!(await lstat(selected)).isDirectory()) throw new Error('not-directory');
  } catch { throw new ProjectError('PROJECT_INVALID_PATH', 'Project directory is missing or unreadable'); }
  const gitRootRaw = await git(selected, ['rev-parse', '--show-toplevel']);
  const gitRoot = gitRootRaw ? await realpath(gitRootRaw).catch(() => null) : null;
  const rootPath = gitRoot ?? selected;
  let files: string[];
  try { files = await readdir(rootPath); }
  catch { throw new ProjectError('PROJECT_INVALID_PATH', 'Project directory is unreadable'); }
  const currentBranch = gitRoot ? await git(rootPath, ['branch', '--show-current']) : null;
  const remoteHead = gitRoot ? await git(rootPath, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']) : null;
  let defaultBranch = remoteHead?.replace(/^origin\//, '') ?? null;
  if (gitRoot && !defaultBranch) {
    for (const branch of ['main', 'master']) {
      if (await git(rootPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]) !== null) {
        defaultBranch = branch; break;
      }
    }
  }
  const status = gitRoot ? await git(rootPath, ['status', '--porcelain=v1', '--untracked-files=normal']) : null;
  const remotes = gitRoot ? await git(rootPath, ['remote']) : null;
  const packageText = files.includes('package.json') ? await manifest(rootPath, 'package.json') : null;
  let pkg: Record<string, unknown> | null = null;
  if (packageText) {
    try { const parsed: unknown = JSON.parse(packageText); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) pkg = parsed as Record<string, unknown>; }
    catch { /* An invalid manifest is detected only as a file, never executed. */ }
  }
  const declared = pkg?.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)
    ? pkg.scripts as Record<string, unknown> : {};
  const scripts = Object.fromEntries(scriptNames.map((name) => [name,
    typeof declared[name] === 'string' ? declared[name].slice(0, 400) : null])) as ProjectProbe['scripts'];
  const detectedRuntime = [pkg ? 'Node.js (manifest)' : null,
    files.includes('pyproject.toml') ? 'Python (manifest)' : null,
    files.includes('Cargo.toml') ? 'Rust (manifest)' : null,
    files.includes('pom.xml') || files.includes('build.gradle') ? 'Java (manifest)' : null]
    .filter((value): value is string => value !== null);
  const body = {
    rootPath, name: basename(rootPath), repositoryType: gitRoot ? 'git' : 'none', gitRoot,
    currentBranch: currentBranch || null, defaultBranch, workingTree: gitRoot ? status === null ? 'unknown' : status ? 'dirty' : 'clean' : 'unknown',
    remoteConfigured: Boolean(remotes), ...detectManager(files), projectType: detectType(files, pkg),
    detectedRuntime, scripts, scriptsHash: sha(scripts),
    capabilities: { gitWorktree: Boolean(gitRoot), declaredScripts: Object.values(scripts).some(Boolean) },
  };
  return projectProbeSchema.parse({ ...body, fingerprint: sha(body), probedAt: new Date().toISOString() });
}

export class ProjectService {
  constructor(private readonly storage: ForgePersistence) {}

  async probe(path: string): Promise<ProjectProbe> {
    const found = await probeProject(path);
    const previous = this.storage.getProjectByPath(found.rootPath);
    return projectProbeSchema.parse({ ...found, existingProject: previous ? {
      projectId: previous.projectId, revision: previous.revision, archived: previous.archivedAt !== null,
    } : null });
  }
  list(): ForgeProject[] { return this.storage.listProjects(); }
  get(projectId: string): ForgeProject | null { return this.storage.getProject(projectId); }
  active(): ForgeProject | null { return this.storage.activeProject(); }

  async create(path: string, fingerprint: string, trustVersion: string, approved: boolean,
    expectedRevision: number): Promise<ForgeProject> {
    if (!approved || trustVersion !== projectTrustVersion) {
      throw new ProjectError('PROJECT_TRUST_REQUIRED', 'Explicit project trust is required');
    }
    const fresh = await probeProject(path);
    if (fresh.fingerprint !== fingerprint) throw new ProjectError('PROJECT_PROBE_STALE', 'Project changed; review its environment again');
    const previous = this.storage.getProjectByPath(fresh.rootPath);
    if (previous) {
      if (previous.revision !== expectedRevision) throw new ProjectError('PROJECT_PROBE_STALE', 'Project version changed; inspect it again');
      return previous.archivedAt ? this.storage.restoreProject(previous.projectId, expectedRevision, fresh, new Date().toISOString()) : previous;
    }
    if (expectedRevision !== 0) throw new ProjectError('PROJECT_PROBE_STALE', 'Project selection changed; inspect it again');
    const now = new Date().toISOString();
    const project = forgeProjectSchema.parse({
      projectId: randomUUID(), environmentId: randomUUID(), name: fresh.name, rootPath: fresh.rootPath,
      repositoryType: fresh.repositoryType, gitRoot: fresh.gitRoot, defaultBranch: fresh.defaultBranch,
      trusted: true, trustVersion: projectTrustVersion, trustApprovedAt: now,
      environmentSummaryHash: fresh.fingerprint, createdAt: now, updatedAt: now,
      lastOpenedAt: now, revision: 1, archivedAt: null, probe: fresh,
    });
    this.storage.createProject(project);
    return project;
  }

  setActive(projectId: string, expectedRevision: number): ForgeProject {
    const project = this.storage.setActiveProject(projectId, expectedRevision);
    if (!project) throw new ProjectError('PROJECT_NOT_FOUND', 'Project is not saved in Forge');
    return project;
  }

  update(projectId: string, expectedRevision: number, values: { name?: string | undefined; defaultBranch?: string | null | undefined }): ForgeProject {
    if (values.name === undefined && values.defaultBranch === undefined) {
      throw new ProjectError('VALIDATION_ERROR', 'No project fields were supplied for update');
    }
    const project = this.storage.updateProject(projectId, expectedRevision, values);
    if (!project) throw new ProjectError('PROJECT_NOT_FOUND', 'Project is not saved in Forge');
    return project;
  }

  remove(projectId: string, expectedRevision: number): { removedId: string } {
    if (!this.storage.removeProject(projectId, expectedRevision)) throw new ProjectError('PROJECT_NOT_FOUND', 'Project is not saved in Forge');
    return { removedId: projectId };
  }

  listEnvironments(projectId: string): ProjectEnvironment[] { return this.storage.listEnvironments(projectId); }
  getEnvironment(projectId: string, environmentId: string): ProjectEnvironment | null {
    return this.storage.getEnvironment(projectId, environmentId);
  }
  saveEnvironment(input: Parameters<ForgePersistence['saveEnvironment']>[0]): ProjectEnvironment {
    return this.storage.saveEnvironment(input);
  }
  archiveEnvironment(projectId: string, environmentId: string, expectedRevision: number): ProjectEnvironment {
    return this.storage.archiveEnvironment(projectId, environmentId, expectedRevision);
  }
  listCommandPresets(projectId: string, environmentId: string): CommandPreset[] {
    return this.storage.listCommandPresets(projectId, environmentId);
  }
  getCommandPreset(projectId: string, presetId: string): CommandPreset | null {
    return this.storage.getCommandPreset(projectId, presetId);
  }

  async saveCommandPreset(input: Parameters<ForgePersistence['saveCommandPreset']>[0]): Promise<CommandPreset> {
    const project = this.storage.getProject(input.projectId);
    if (!project) throw new ProjectError('PROJECT_NOT_FOUND', 'Project is not available');
    const fresh = await probeProject(project.rootPath);
    if (fresh.scriptsHash !== input.scriptsHash) throw new ProjectError('PROJECT_PROBE_STALE', 'Project scripts changed; inspect them again');
    await this.validateCommandCwd(project.rootPath, input.cwdRelative);
    return this.storage.saveCommandPreset(input);
  }

  async approveCommandPreset(projectId: string, presetId: string, expectedRevision: number,
    scriptsHash: string): Promise<CommandPreset> {
    const project = this.storage.getProject(projectId);
    if (!project) throw new ProjectError('PROJECT_NOT_FOUND', 'Project is not available');
    const preset = this.storage.getCommandPreset(projectId, presetId);
    if (!preset) throw new ProjectError('COMMAND_PRESET_NOT_FOUND', 'Command preset is not available');
    const fresh = await probeProject(project.rootPath);
    if (fresh.scriptsHash !== scriptsHash || preset.scriptsHash !== scriptsHash) {
      throw new ProjectError('PROJECT_PROBE_STALE', 'Project scripts changed; inspect them again');
    }
    await this.validateCommandCwd(project.rootPath, preset.cwdRelative);
    const approvalHash = sha({ projectId, presetId, revision: expectedRevision,
      executable: preset.executable, argv: preset.argv, cwdRelative: preset.cwdRelative,
      envRefs: preset.envRefs, timeoutSeconds: preset.timeoutSeconds, scriptsHash });
    return this.storage.approveCommandPreset(projectId, presetId, expectedRevision, scriptsHash, approvalHash);
  }

  archiveCommandPreset(projectId: string, presetId: string, expectedRevision: number): CommandPreset {
    return this.storage.archiveCommandPreset(projectId, presetId, expectedRevision);
  }

  private async validateCommandCwd(rootPath: string, cwdRelative: string): Promise<void> {
    if (cwdRelative.includes('\0') || isAbsolute(cwdRelative) || win32.isAbsolute(cwdRelative)
      || cwdRelative.split(/[\\/]/).includes('..')) {
      throw new ProjectError('PROJECT_INVALID_PATH', 'Command working directory must stay within the project');
    }
    let canonical: string;
    try {
      canonical = await realpath(resolve(rootPath, cwdRelative));
      if (!(await lstat(canonical)).isDirectory()) throw new Error('not-directory');
    } catch { throw new ProjectError('PROJECT_INVALID_PATH', 'Command working directory is not available'); }
    const underRoot = relative(rootPath, canonical);
    if (underRoot === '..' || underRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(underRoot)) {
      throw new ProjectError('PROJECT_INVALID_PATH', 'Command working directory must stay within the project');
    }
  }
}
