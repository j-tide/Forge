import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';

/** New files use Forge's name within the application's already isolated userData. */
export function getProfilesFilePath(): string {
  return path.join(app.getPath('userData'), 'forge', 'profiles.json');
}

/** Compatibility only: this never accesses another application's userData. */
export function getLegacyProfilesFilePath(): string {
  return path.join(app.getPath('userData'), 'auto-claude', 'profiles.json');
}

/** Prefer current data; only a missing new file permits reading its legacy name. */
export async function readProfilesFile(): Promise<string> {
  try {
    return await fs.readFile(getProfilesFilePath(), 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return await fs.readFile(getLegacyProfilesFilePath(), 'utf-8');
  }
}
