/**
 * App updates are unavailable in the Forge Glass Preview build.
 *
 * The inherited updater targets upstream Aperant releases. Keep its public
 * entry points inert until this derivative has its own signed release feed.
 * This also prevents an old renderer or saved beta preference from reaching
 * upstream through the manual update IPC handlers.
 */

import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import type { AppUpdateInfo } from '../shared/types';

type UpdateChannel = 'latest' | 'beta';

export const APP_UPDATES_DISABLED_MESSAGE = 'App updates are unavailable in Forge Glass Preview.';

export function setUpdateChannel(_channel: UpdateChannel): void {
  // No update feed is configured for this derivative build.
}

export function initializeAppUpdater(_window: BrowserWindow, _betaUpdates = false): void {
  // Intentionally do not register updater events, schedule checks, or download releases.
}

export async function checkForUpdates(): Promise<AppUpdateInfo | null> {
  throw new Error(APP_UPDATES_DISABLED_MESSAGE);
}

export async function downloadUpdate(): Promise<void> {
  throw new Error(APP_UPDATES_DISABLED_MESSAGE);
}

export function quitAndInstall(): boolean {
  return false;
}

export function getCurrentVersion(): string {
  return app.getVersion();
}

export function getDownloadedUpdateInfo(): AppUpdateInfo | null {
  return null;
}

export function isPrerelease(version: string): boolean {
  return /-(alpha|beta|rc|dev|canary)\.\d+$/i.test(version) || version.includes('-');
}

export async function checkForStableDowngrade(): Promise<AppUpdateInfo | null> {
  return null;
}

export async function setUpdateChannelWithDowngradeCheck(
  _channel: UpdateChannel,
  _triggerDowngradeCheck = false
): Promise<AppUpdateInfo | null> {
  return null;
}

export async function downloadStableVersion(): Promise<void> {
  throw new Error(APP_UPDATES_DISABLED_MESSAGE);
}

export function stopPeriodicUpdates(): void {
  // No periodic checks are scheduled.
}
