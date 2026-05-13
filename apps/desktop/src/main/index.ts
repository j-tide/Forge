import { app, BrowserWindow, ipcMain, session, type IpcMainInvokeEvent } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HostController } from './host-controller.js';
import { isTrustedHostIpcSender } from './ipc-auth.js';
import { createWindowOptions } from './window-options.js';

const devUrl = 'http://127.0.0.1:5173/';
const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
const webEntryPath = fileURLToPath(new URL('../../../web/dist/index.html', import.meta.url));
const hostEntryPath = fileURLToPath(new URL('../../../host/dist/index.js', import.meta.url));
const hostManifestPath = fileURLToPath(new URL('../../../host/package.json', import.meta.url));
const trustedUrl = process.env.FORGE_DEV_SERVER_URL === devUrl ? devUrl : pathToFileURL(webEntryPath).href;
let mainWindow: BrowserWindow | null = null;
let hostController: HostController;
let hostStartRequested = false;
let quitting = false;

function hostVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(hostManifestPath, 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('version' in manifest) || typeof manifest.version !== 'string') {
    throw new Error('Invalid Forge Host version metadata');
  }
  return manifest.version;
}

function authorize(event: IpcMainInvokeEvent): void {
  if (!isTrustedHostIpcSender(event, mainWindow?.webContents ?? null, trustedUrl)) {
    console.error('Rejected Forge Host IPC source');
    throw new Error('FORBIDDEN');
  }
}

function registerHostIpc(): void {
  ipcMain.handle('forge:host-status', (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.status;
  });
  ipcMain.handle('forge:host-health', (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.health();
  });
  ipcMain.handle('forge:system-command', (event, command: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.invokeSystem(command);
  });
}

function createWindow(): void {
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.once('did-finish-load', () => {
    if (!hostStartRequested) {
      hostStartRequested = true;
      void hostController.start();
    }
  });
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { mainWindow = null; });

  const load = trustedUrl === devUrl
    ? window.loadURL(devUrl)
    : window.loadFile(webEntryPath);

  void load.catch((error: unknown) => {
    console.error('Forge UI failed to load:', error);
    app.quit();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    const dataDir = !app.isPackaged && process.env.FORGE_HOST_DATA_DIR
      ? process.env.FORGE_HOST_DATA_DIR
      : join(app.getPath('appData'), 'Forge', app.isPackaged ? 'production' : 'development');
    hostController = new HostController(hostEntryPath, app.getVersion(), hostVersion(), dataDir, (snapshot) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('forge:host-status', snapshot);
    });
    registerHostIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch((error: unknown) => {
    console.error('Forge Desktop failed to initialize:', error);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (quitting || !hostController) return;
  event.preventDefault();
  quitting = true;
  void hostController.stop().finally(() => app.quit());
});
