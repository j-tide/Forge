import { randomUUID } from 'node:crypto';
import { BrowserWindow, session } from 'electron';
import { isPreviewRequestAllowed, parseLocalPreviewUrl } from './preview-policy.js';

const previewWindows = new Set<BrowserWindow>();

export async function openAppPreview(parent: BrowserWindow, rawUrl: string): Promise<{ origin: string }> {
  const target = parseLocalPreviewUrl(rawUrl);
  // A partition without persist: is in-memory and never shares Forge's trusted UI session.
  const isolatedSession = session.fromPartition(`forge-preview-${randomUUID()}`);
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.setPermissionCheckHandler(() => false);
  isolatedSession.setDevicePermissionHandler(() => false);
  isolatedSession.on('will-download', (event) => event.preventDefault());
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isPreviewRequestAllowed(details.url, target.origin) });
  });
  const window = new BrowserWindow({
    parent, title: `Forge Preview · ${target.origin}`, width: 1100, height: 760,
    minWidth: 800, minHeight: 600, show: false, autoHideMenuBar: true,
    webPreferences: {
      session: isolatedSession, contextIsolation: true, nodeIntegration: false,
      sandbox: true, webSecurity: true, webviewTag: false, disableDialogs: true,
      navigateOnDragDrop: false,
    },
  });
  previewWindows.add(window);
  window.on('closed', () => previewWindows.delete(window));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, nextUrl) => {
    if (!isPreviewRequestAllowed(nextUrl, target.origin)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  try {
    await window.loadURL(target.href);
    window.show();
    return { origin: target.origin };
  } catch {
    if (!window.isDestroyed()) window.close();
    throw new Error('PREVIEW_LOAD_FAILED');
  }
}

export function closeAppPreviews(): void {
  for (const window of previewWindows) if (!window.isDestroyed()) window.close();
}
