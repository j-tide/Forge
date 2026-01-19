import { app, BrowserWindow, dialog, ipcMain, session, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { forgeError, projectCommandEnvelopeSchema, projectProbeSchema, runCommandEnvelopeSchema,
  type ProjectCommandResult,
  type ConversationCommandResult, type DraftCommandResult, type ApprovalCommandResult,
  type BoardCommandResult } from '@forge/contracts';
import type { RunCommandResult } from '@forge/contracts';
import { PythonHostController } from './python-host-controller.js';
import { isTrustedHostIpcSender } from './ipc-auth.js';
import { createWindowOptions } from './window-options.js';

const devUrl = 'http://127.0.0.1:5173/';
const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
const webEntryPath = fileURLToPath(new URL('../../../web/dist/index.html', import.meta.url));
const pythonRoot = fileURLToPath(new URL('../../../../python/', import.meta.url));
const pythonInterpreter = join(pythonRoot, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python');
const trustedUrl = process.env.FORGE_DEV_SERVER_URL === devUrl ? devUrl : pathToFileURL(webEntryPath).href;
let mainWindow: BrowserWindow | null = null;
let hostController: PythonHostController;
let quitting = false;
const selectedProjectPaths = new Set<string>();

function authorize(event: IpcMainInvokeEvent): void {
  if (!isTrustedHostIpcSender(event, mainWindow?.webContents ?? null, trustedUrl)) {
    console.error('Rejected Forge Host IPC source');
    throw new Error('FORBIDDEN');
  }
}

function registerHostIpc(): void {
  ipcMain.handle('forge:plugin-inspect-bundled', (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.inspectBundledPlugin();
  });
  ipcMain.handle('forge:python-host-status', (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.pythonStatus;
  });
  ipcMain.handle('forge:run-command', async (event, command: unknown, ...extra: unknown[]): Promise<RunCommandResult> => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    const parsed = runCommandEnvelopeSchema.safeParse(command);
    if (parsed.success && parsed.data.type === 'deliveries.merge') {
      if (!mainWindow) throw new Error('HOST_UNAVAILABLE');
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Merge accepted delivery locally',
        message: `Merge into local branch “${parsed.data.payload.targetBranch}”?`,
        detail: `Expected target HEAD ${parsed.data.payload.expectedTargetHead.slice(0,12)}. ` +
          'Forge will update this local branch and working tree. This does not push or deploy.',
        buttons: ['Cancel', 'Merge locally'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) return { commandId: parsed.data.commandId, ok: false,
        error: forgeError('MERGE_CANCELLED', 'Local merge was cancelled', parsed.data.commandId),
        durationMs: 0, hostTimestamp: new Date().toISOString() };
    }
    return hostController.invokeRun(command);
  });
  ipcMain.handle('forge:board-command', (event, command: unknown, ...extra: unknown[]): Promise<BoardCommandResult> => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.invokeBoard(command);
  });
  ipcMain.handle('forge:approval-command', (event, command: unknown, ...extra: unknown[]): Promise<ApprovalCommandResult> => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.invokeApproval(command);
  });
  ipcMain.handle('forge:draft-command', (event, command: unknown, ...extra: unknown[]): Promise<DraftCommandResult> => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.invokeDraft(command);
  });
  ipcMain.handle('forge:conversation-command', (event, command: unknown, ...extra: unknown[]): Promise<ConversationCommandResult> => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.invokeConversation(command);
  });
  ipcMain.handle('forge:choose-project-folder', async (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0 || !mainWindow) throw new Error('VALIDATION_ERROR');
    selectedProjectPaths.clear();
    const selected = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a Forge project', properties: ['openDirectory'],
    });
    const path = selected.canceled ? null : selected.filePaths[0] ?? null;
    if (path) selectedProjectPaths.add(path);
    return path;
  });
  ipcMain.handle('forge:project-command', async (event, command: unknown, ...extra: unknown[]): Promise<ProjectCommandResult> => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    const parsed = projectCommandEnvelopeSchema.safeParse(command);
    if (!parsed.success) return hostController.invokeProject(command);
    if ((parsed.data.type === 'project.probe' || parsed.data.type === 'project.create')
      && !selectedProjectPaths.has(parsed.data.payload.rootPath)) {
      return { commandId: parsed.data.commandId, ok: false,
        error: forgeError('FORBIDDEN', 'Choose this folder in Forge Desktop first', parsed.data.commandId),
        durationMs: 0, hostTimestamp: new Date().toISOString() };
    }
    const result = await hostController.invokeProject(parsed.data);
    if (parsed.data.type === 'project.probe' && result.ok) {
      const checked = projectProbeSchema.safeParse(result.data);
      if (checked.success) selectedProjectPaths.add(checked.data.rootPath);
    }
    return result;
  });
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
    hostController = new PythonHostController(pythonInterpreter, app.getVersion(), dataDir, (snapshot) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('forge:host-status', hostController.status);
        mainWindow.webContents.send('forge:python-host-status', snapshot);
      }
    });
    void hostController.start();
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
