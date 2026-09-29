import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, lstatSync, readdirSync } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { getToolPath } from './cli-tool-manager';
import { PROJECT_DATA_DIR } from '../shared/constants';

/**
 * Debug logging - only logs when DEBUG=true or in development mode
 */
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debug(message: string, data?: Record<string, unknown>): void {
  if (DEBUG) {
    if (data) {
      console.warn(`[ProjectInitializer] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.warn(`[ProjectInitializer] ${message}`);
    }
  }
}

/**
 * Git status information for a project
 */
export interface GitStatus {
  isGitRepo: boolean;
  hasCommits: boolean;
  currentBranch: string | null;
  error?: string;
}

/**
 * Check if a directory is a git repository and has at least one commit
 */
export function checkGitStatus(projectPath: string): GitStatus {
  const git = getToolPath('git');

  try {
    // Check if it's a git repository
    execFileSync(git, ['rev-parse', '--git-dir'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch {
    return {
      isGitRepo: false,
      hasCommits: false,
      currentBranch: null,
      error: 'Not a git repository. Please run "git init" to initialize git.'
    };
  }

  // Check if there are any commits
  let hasCommits = false;
  try {
    execFileSync(git, ['rev-parse', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    hasCommits = true;
  } catch {
    // No commits yet
    hasCommits = false;
  }

  // Get current branch
  let currentBranch: string | null = null;
  try {
    currentBranch = execFileSync(git, ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    // Branch detection failed
  }

  if (!hasCommits) {
    return {
      isGitRepo: true,
      hasCommits: false,
      currentBranch,
      error: 'Git repository has no commits. Please make an initial commit first.'
    };
  }

  return {
    isGitRepo: true,
    hasCommits: true,
    currentBranch
  };
}

/**
 * Initialize git in a project directory and create an initial commit.
 * This is a user-friendly way to set up git for non-technical users.
 */
export function initializeGit(projectPath: string): InitializationResult {
  debug('initializeGit called', { projectPath });

  // Check current git status
  const status = checkGitStatus(projectPath);
  const git = getToolPath('git');

  try {
    // Step 1: Initialize git if needed
    if (!status.isGitRepo) {
      debug('Initializing git repository');
      execFileSync(git, ['init'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }

    // Step 2: Check if there are files to commit
    const statusOutput = execFileSync(git, ['status', '--porcelain'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    // Step 3: If there are untracked/modified files, add and commit them
    if (statusOutput || !status.hasCommits) {
      debug('Adding files and creating initial commit');

      // Add all files
      // Never stage either application's private task records in a new repository.
      execFileSync(git, ['add', '-A', '--', '.', ':(exclude).auto-claude', `:(exclude)${PROJECT_DATA_DIR}`], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Create initial commit
      execFileSync(git, ['commit', '-m', 'Initial commit', '--allow-empty'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }

    debug('Git initialization complete');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during git initialization';
    debug('Git initialization failed', { error: errorMessage });
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Entries to add to .gitignore when initializing a project
 */
const GITIGNORE_ENTRIES = [`${PROJECT_DATA_DIR}/`];

/**
 * Ensure entries exist in the project's .gitignore file.
 * Creates .gitignore if it doesn't exist.
 */
function ensureGitignoreEntries(projectPath: string, entries: string[]): void {
  const gitignorePath = path.join(projectPath, '.gitignore');

  // Read existing content atomically (no TOCTOU)
  let content = '';
  let fileExists = false;
  try {
    content = readFileSync(gitignorePath, 'utf-8');
    fileExists = true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // File doesn't exist - content stays empty
  }

  const existingLines = content ? content.split('\n').map(line => line.trim()) : [];

  // Find entries that need to be added
  const entriesToAdd: string[] = [];
  for (const entry of entries) {
    const entryNormalized = entry.replace(/\/$/, ''); // Remove trailing slash for comparison
    const alreadyExists = existingLines.some(line => {
      const lineNormalized = line.replace(/\/$/, '');
      return lineNormalized === entry || lineNormalized === entryNormalized;
    });

    if (!alreadyExists) {
      entriesToAdd.push(entry);
    }
  }

  if (entriesToAdd.length === 0) {
    debug('All gitignore entries already exist');
    return;
  }

  if (fileExists) {
    // Build the content to append
    let appendContent = '';

    // Ensure file ends with newline before adding our entries
    if (content && !content.endsWith('\n')) {
      appendContent += '\n';
    }

    appendContent += '\n# Forge data directory\n';
    for (const entry of entriesToAdd) {
      appendContent += entry + '\n';
    }

    appendFileSync(gitignorePath, appendContent);
  } else {
    writeFileSync(gitignorePath, '# Forge data directory\n' + entriesToAdd.join('\n') + '\n', 'utf-8');
  }

  debug('Added entries to .gitignore', { entries: entriesToAdd });
}

/**
 * Data directories created in .forge-glass-preview for each project
 */
const DATA_DIRECTORIES = [
  'specs',
  'ideation',
  'insights',
  'roadmap'
];

/**
 * Result of initialization operation
 */
export interface InitializationResult {
  success: boolean;
  error?: string;
}

/**
 * Check if the project has a local TypeScript AI runtime source directory
 * This indicates it's the development project itself
 */
export function hasLocalSource(projectPath: string): boolean {
  return getLocalSourcePath(projectPath) !== null;
}

/**
 * Get the local source path for a project (if it exists)
 */
export function getLocalSourcePath(projectPath: string): string | null {
  // Prefer this application's root layout. The nested candidate remains a
  // compatibility check for other workspace projects selected by the user.
  const candidates = [projectPath, path.join(projectPath, 'apps', 'desktop')];
  for (const sourcePath of candidates) {
    const markerFile = path.join(sourcePath, 'src', 'main', 'ai', 'session', 'runner.ts');
    if (existsSync(markerFile)) return sourcePath;
  }
  return null;
}

/**
 * Check if project is initialized (has .forge-glass-preview directory)
 */
export function isInitialized(projectPath: string): boolean {
  const dataPath = path.join(projectPath, PROJECT_DATA_DIR);
  try {
    const stats = lstatSync(dataPath);
    // A link at the data root (or one of its top-level children) could point to
    // an external data directory. Treat it as uninitialized instead.
    return stats.isDirectory() && !stats.isSymbolicLink() &&
      !readdirSync(dataPath, { withFileTypes: true }).some(entry => entry.isSymbolicLink());
  } catch {
    return false;
  }
}

/**
 * Initialize Forge data directory in a project.
 *
 * Creates .forge-glass-preview/ with data directories (specs, ideation, insights, roadmap).
 * The framework code runs from the source repo - only data is stored here.
 *
 * Requires:
 * - Project directory must exist
 * - Project must be a git repository with at least one commit
 */
export function initializeProject(projectPath: string): InitializationResult {
  debug('initializeProject called', { projectPath });

  // Validate project path exists
  if (!existsSync(projectPath)) {
    debug('Project path does not exist', { projectPath });
    return {
      success: false,
      error: `Project directory not found: ${projectPath}`
    };
  }

  // Check git status - Forge requires git for worktree-based builds
  const gitStatus = checkGitStatus(projectPath);
  if (!gitStatus.isGitRepo || !gitStatus.hasCommits) {
    debug('Git check failed', { gitStatus });
    return {
      success: false,
      error: gitStatus.error || 'Git repository required. Forge uses git worktrees for isolated builds.'
    };
  }

  // Check if already initialized
  const dotAutoBuildPath = path.join(projectPath, PROJECT_DATA_DIR);

  if (existsSync(dotAutoBuildPath)) {
    debug('Already initialized - .forge-glass-preview exists');
    return {
      success: false,
      error: `Project data directory already exists (${PROJECT_DATA_DIR}). No existing data was changed.`
    };
  }

  try {
    debug('Creating .forge-glass-preview data directory', { dotAutoBuildPath });

    // Create the .forge-glass-preview directory
    mkdirSync(dotAutoBuildPath, { recursive: true });

    // Create data directories
    for (const dataDir of DATA_DIRECTORIES) {
      const dirPath = path.join(dotAutoBuildPath, dataDir);
      debug('Creating data directory', { dataDir, dirPath });
      mkdirSync(dirPath, { recursive: true });
      writeFileSync(path.join(dirPath, '.gitkeep'), '', 'utf-8');
    }

    // Update .gitignore to exclude .forge-glass-preview/
    ensureGitignoreEntries(projectPath, GITIGNORE_ENTRIES);

    debug('Initialization complete');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during initialization';
    debug('Initialization failed', { error: errorMessage });
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Ensure all data directories exist in .forge-glass-preview.
 * Useful if new directories are added in future versions.
 */
export function ensureDataDirectories(projectPath: string): InitializationResult {
  const dotAutoBuildPath = path.join(projectPath, PROJECT_DATA_DIR);

  if (!isInitialized(projectPath)) {
    return {
      success: false,
      error: 'Preview project data is missing or unsafe. No data was changed.'
    };
  }

  try {
    for (const dataDir of DATA_DIRECTORIES) {
      const dirPath = path.join(dotAutoBuildPath, dataDir);
      if (!existsSync(dirPath)) {
        debug('Creating missing data directory', { dataDir, dirPath });
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(path.join(dirPath, '.gitkeep'), '', 'utf-8');
      }
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get the managed project data folder.
 *
 * Only .forge-glass-preview/ is a valid data installation. Source-code
 * folders are never treated as installed project data.
 */
export function getAutoBuildPath(projectPath: string): string | null {
  const dotAutoBuildPath = path.join(projectPath, PROJECT_DATA_DIR);

  debug('getAutoBuildPath called', { projectPath, dotAutoBuildPath });

  if (isInitialized(projectPath)) {
    debug('Returning .forge-glass-preview (installed version)');
    return PROJECT_DATA_DIR;
  }

  debug('No .forge-glass-preview folder found - project not initialized');
  return null;
}
