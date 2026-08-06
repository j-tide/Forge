/**
 * Config Path Validator
 *
 * Security utility to validate Claude profile config directory paths.
 * Prevents path traversal attacks where malicious code could specify
 * arbitrary paths like /etc or C:\Windows\System32\config.
 */

import path from 'path';
import os from 'os';
import { lstatSync } from 'fs';
import { PREVIEW_HOME_DIRECTORY_NAME } from '../../shared/constants/preview-paths';

/** Only direct children of the preview's profile root may be created by the app. */
export function isManagedPreviewConfigDir(configDir: string): boolean {
  if (!configDir || configDir.includes('\0')) return false;

  const expandedPath = configDir.startsWith('~')
    ? path.join(os.homedir(), configDir.slice(1))
    : configDir;
  const profileDir = path.resolve(expandedPath);
  const previewRoot = path.join(os.homedir(), PREVIEW_HOME_DIRECTORY_NAME);
  const profilesRoot = path.join(previewRoot, 'claude-profiles');

  if (path.dirname(profileDir) !== profilesRoot || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path.basename(profileDir))) {
    return false;
  }

  // An existing symlink or junction could redirect a new profile into Aperant data.
  for (const candidate of [previewRoot, profilesRoot, profileDir]) {
    try {
      if (lstatSync(candidate).isSymbolicLink()) return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    }
  }

  return true;
}

/**
 * Validate that a config directory path is safe and within expected boundaries.
 * This prevents path traversal attacks where a malicious renderer could
 * specify arbitrary paths like /etc or C:\Windows\System32\config.
 *
 * @param configDir - The config directory path to validate (may contain ~)
 * @returns true if the path is safe, false otherwise
 */
export function isValidConfigDir(configDir: string): boolean {
  // Expand ~ to home directory for validation
  const expandedPath = configDir.startsWith('~')
    ? path.join(os.homedir(), configDir.slice(1))
    : configDir;

  // Normalize to resolve any .. or . components
  const normalizedPath = path.resolve(expandedPath);
  const homeDir = os.homedir();

  // Broad validation is retained for read-only provider checks. App-created
  // profile directories use isManagedPreviewConfigDir() instead.
  const allowedPrefixes = [homeDir];

  // Check if normalized path starts with any allowed prefix
  // IMPORTANT: Use path separator boundary to prevent attacks like
  // /home/alice-malicious passing validation for /home/alice
  for (const prefix of allowedPrefixes) {
    const resolvedPrefix = path.resolve(prefix);
    // Check for exact match OR starts with prefix + separator
    if (normalizedPath === resolvedPrefix || normalizedPath.startsWith(resolvedPrefix + path.sep)) {
      return true;
    }
  }

  console.warn('[Config Path Validator] Rejected unsafe configDir path:', configDir, '(normalized:', normalizedPath, ')');
  return false;
}
