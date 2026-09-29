/**
 * Path resolution utilities for Forge updater
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { app } from 'electron';
import { resolvePromptsDirectory } from '../runtime/paths';

/**
 * Get the path to the bundled prompts directory
 */
export function getBundledSourcePath(): string {
  const promptsPath = resolvePromptsDirectory({ isPackaged: app.isPackaged });
  if (!app.isPackaged && !existsSync(path.join(promptsPath, 'planner.md'))) {
    console.warn(
      `[path-resolver] No valid prompts directory found in application resources, fallback "${promptsPath}" may be invalid`
    );
  }
  return promptsPath;
}

/**
 * Get the path for storing downloaded updates
 */
export function getUpdateCachePath(): string {
  return path.join(app.getPath('userData'), 'forge-updates');
}

/**
 * Get the effective source path (considers override from updates and settings)
 */
export function getEffectiveSourcePath(): string {
  // First, check user settings for configured autoBuildPath
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      if (settings.autoBuildPath && existsSync(settings.autoBuildPath)) {
        // Validate it's a proper prompts source (must have planner.md)
        const markerPath = path.join(settings.autoBuildPath, 'planner.md');
        if (existsSync(markerPath)) {
          return settings.autoBuildPath;
        }
        // Invalid path - log warning and fall through to auto-detection
        console.warn(
          `[path-resolver] Configured autoBuildPath "${settings.autoBuildPath}" is missing planner.md, falling back to bundled source`
        );
      }
    }
  } catch {
    // Ignore settings read errors
  }

  if (app.isPackaged) {
    // Check for user-updated source first
    const overridePath = path.join(app.getPath('userData'), 'prompts-source');
    const overrideMarker = path.join(overridePath, 'planner.md');
    if (existsSync(overridePath) && existsSync(overrideMarker)) {
      return overridePath;
    }
  }

  return getBundledSourcePath();
}

/**
 * Get the path where updates should be installed
 */
export function getUpdateTargetPath(): string {
  if (app.isPackaged) {
    // For packaged apps, store in userData as a source override
    return path.join(app.getPath('userData'), 'prompts-source');
  } else {
    // In development, update the actual source
    return getBundledSourcePath();
  }
}
