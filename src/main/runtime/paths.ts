import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));

export interface RuntimePathOptions {
  moduleDirectory?: string;
  resourcesPath?: string;
  isPackaged?: boolean;
}

/** Find the application root from source, a built entry, or a shared chunk. */
export function resolveApplicationRoot(moduleDirectory = runtimeDirectory): string | null {
  let directory = resolve(moduleDirectory);
  let nearestPackageRoot: string | null = null;

  while (true) {
    if (existsSync(join(directory, 'package.json'))) {
      nearestPackageRoot ??= directory;
      if (existsSync(join(directory, 'prompts', 'planner.md'))) {
        return directory;
      }
    }

    const parent = dirname(directory);
    if (parent === directory) return nearestPackageRoot;
    directory = parent;
  }
}

/** Workers do not expose Electron's app object; their entry still locates the archive. */
function resolveArchiveResources(moduleDirectory: string): string | null {
  let directory = resolve(moduleDirectory);
  while (true) {
    if (basename(directory) === 'app.asar' || basename(directory) === 'app.asar.unpacked') {
      return dirname(directory);
    }

    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

/** Resolve the same prompt resources for Electron Main and Agent Workers. */
export function resolvePromptsDirectory(options: RuntimePathOptions = {}): string {
  const moduleDirectory = options.moduleDirectory ?? runtimeDirectory;
  const archiveResources = resolveArchiveResources(moduleDirectory);
  const resourcesPath = options.resourcesPath ?? process.resourcesPath ?? archiveResources;
  const isPackaged = options.isPackaged ?? archiveResources !== null;

  if (resourcesPath) {
    const promptsDirectory = join(resourcesPath, 'prompts');
    // A missing packaged resource must surface at its expected location instead
    // of silently loading prompts from another development checkout.
    if (isPackaged || existsSync(join(promptsDirectory, 'planner.md'))) {
      return promptsDirectory;
    }
  }

  const applicationRoot = resolveApplicationRoot(moduleDirectory);
  return join(applicationRoot ?? moduleDirectory, 'prompts');
}
