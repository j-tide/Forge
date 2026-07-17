import { app, BrowserWindow, dialog, ipcMain, Menu, powerMonitor, session, Tray,
  type IpcMainInvokeEvent } from 'electron';
import { isAbsolute, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { forgeError, projectCommandEnvelopeSchema, projectProbeSchema, runCommandEnvelopeSchema,
  type ProjectCommandResult,
  type ConversationCommandResult, type DraftCommandResult, type ApprovalCommandResult,
  type BoardCommandResult } from '@forge/contracts';
import { agentProfileSaveSchema, knowledgeCommandSchema, memoryCommandSchema,
  workflowCommandSchema, appPreviewRequestSchema, devicePairingCommandSchema,
  pairingInspectionSchema } from '@forge/contracts';
import type { RunCommandResult } from '@forge/contracts';
import { PythonHostController } from './python-host-controller.js';
import { isTrustedHostIpcSender } from './ipc-auth.js';
import { createWindowOptions } from './window-options.js';
import { closeAppPreviews, openAppPreview } from './app-preview.js';
import { writeDiagnosticBundle } from './diagnostic-export.js';
import { packagedPythonInterpreter } from './python-runtime-path.js';

// Only internal test artifacts carry this marker. Public packages must not redirect app data.
if (app.isPackaged && existsSync(join(process.resourcesPath, 'FORGE_INTERNAL_TEST_BUILD')) &&
  process.env.FORGE_INTERNAL_TEST_HOME) {
  const testHome = process.env.FORGE_INTERNAL_TEST_HOME;
  if (!isAbsolute(testHome)) throw new Error('Internal test home must be absolute');
  mkdirSync(testHome, { recursive: true });
  app.setPath('appData', testHome);
  const userData = join(testHome, 'Forge');
  mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
}

const devUrl = 'http://127.0.0.1:5173/';
const preloadPath = fileURLToPath(new URL('../preload/index.cjs', import.meta.url));
const webEntryPath = app.isPackaged
  ? join(process.resourcesPath, 'web', 'dist', 'index.html')
  : fileURLToPath(new URL('../../../web/dist/index.html', import.meta.url));
const packagedPythonRoot = app.isPackaged ? join(process.resourcesPath, 'forge-python') : null;
const pythonInterpreter = packagedPythonRoot
  ? packagedPythonInterpreter(process.resourcesPath, process.platform)
  : join(fileURLToPath(new URL('../../../../python/', import.meta.url)), '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python');
const packagedPythonEnvironment = packagedPythonRoot ? {
  pythonHome: join(packagedPythonRoot, 'runtime'),
  pythonPath: join(packagedPythonRoot, 'packages'),
} : undefined;
const trustedUrl = process.env.FORGE_DEV_SERVER_URL === devUrl ? devUrl : pathToFileURL(webEntryPath).href;
let mainWindow: BrowserWindow | null = null;
let hostController: PythonHostController;
let quitting = false;
let exitDecisionPending = false;
let tray: Tray | null = null;
const selectedProjectPaths = new Set<string>();
let preparedDiagnostics: { previewId: string; json: string; expiresAt: number } | null = null;

function authorize(event: IpcMainInvokeEvent): void {
  if (!isTrustedHostIpcSender(event, mainWindow?.webContents ?? null, trustedUrl)) {
    console.error('Rejected Forge Host IPC source');
    throw new Error('FORBIDDEN');
  }
}

function registerHostIpc(): void {
  ipcMain.handle('forge:diagnostics-prepare', async (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    const preview = await hostController.prepareDiagnostics();
    preparedDiagnostics = { previewId: preview.previewId, json: JSON.stringify(preview, null, 2),
      expiresAt: Date.now() + 600_000 };
    return preview;
  });
  ipcMain.handle('forge:diagnostics-export', async (event, previewId: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0 || typeof previewId !== 'string' || !mainWindow ||
      !preparedDiagnostics || preparedDiagnostics.previewId !== previewId ||
      Date.now() > preparedDiagnostics.expiresAt) throw new Error('DIAGNOSTICS_PREVIEW_STALE');
    const selected = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Forge diagnostics', defaultPath: 'forge-diagnostics.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (selected.canceled || !selected.filePath) return { saved: false };
    await writeDiagnosticBundle(selected.filePath, preparedDiagnostics.json);
    return { saved: true };
  });
  ipcMain.handle('forge:diagnostics-cleanup', async (event, previewId: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0 || typeof previewId !== 'string' || !mainWindow ||
      !preparedDiagnostics || preparedDiagnostics.previewId !== previewId ||
      Date.now() > preparedDiagnostics.expiresAt) throw new Error('DIAGNOSTICS_PREVIEW_STALE');
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: 'Clean expired Forge artifacts',
      message: 'Clear expired imported artifact content?',
      detail: 'Only Forge-owned imported content older than 30 days in the preview will be cleared. '
        + 'Metadata tombstones remain. Your project files and Git worktrees are not deleted.',
      buttons: ['Cancel', 'Clear expired content'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice.response !== 1) return { purgedImportedArtifacts: 0, cancelled: true };
    const result = await hostController.cleanupExpiredArtifacts(previewId);
    preparedDiagnostics = null;
    return { ...result, cancelled: false };
  });
  ipcMain.handle('forge:open-app-preview', (event, request: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0 || !mainWindow) throw new Error('VALIDATION_ERROR');
    return openAppPreview(mainWindow, appPreviewRequestSchema.parse(request).url);
  });
  ipcMain.handle('forge:memory-command', (event, command: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.invokeMemory(memoryCommandSchema.parse(command));
  });
  ipcMain.handle('forge:device-pairing', async (event, command: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    const checked = devicePairingCommandSchema.parse(command);
    if (checked.type === 'decide' && checked.payload.approve) {
      if (!mainWindow) throw new Error('HOST_UNAVAILABLE');
      const raw: unknown = await hostController.invokeDevicePairing({
        type: 'inspect', payload: { pairingId: checked.payload.pairingId },
      });
      const pending = pairingInspectionSchema.parse(raw);
      if (pending.status !== 'claimed' || !pending.deviceName) throw new Error('PAIRING_NOT_CLAIMED');
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Approve a new Forge device',
        message: `Allow “${pending.deviceName}” to access this Forge project?`,
        detail: `Network: ${pending.addressSummary ?? 'unknown'}\n` +
          `Device-reported fingerprint: ${pending.fingerprintSummary ?? 'unknown'}\n` +
          `Project IDs: ${checked.payload.projectIds.join(', ')}\n` +
          'This does not grant shell, plugin or credential access. A device session is not active yet.',
        buttons: ['Cancel', 'Approve device'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) throw new Error('PAIRING_APPROVAL_CANCELLED');
    }
    return hostController.invokeDevicePairing(checked);
  });
  ipcMain.handle('forge:knowledge-command', (event, command: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.invokeKnowledge(knowledgeCommandSchema.parse(command));
  });
  ipcMain.handle('forge:workflow-command', (event, command: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.invokeWorkflow(workflowCommandSchema.parse(command));
  });
  ipcMain.handle('forge:agent-profile-catalog', (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.agentProfileCatalog();
  });
  ipcMain.handle('forge:agent-profile-save', (event, value: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.saveAgentProfile(agentProfileSaveSchema.parse(value));
  });
  ipcMain.handle('forge:plugin-inspect-bundled', (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.inspectBundledPlugin();
  });
  ipcMain.handle('forge:plugin-set-bundled-enabled', async (event, enabled: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0 || typeof enabled !== 'boolean') throw new Error('VALIDATION_ERROR');
    if (!enabled) {
      if (!mainWindow) throw new Error('HOST_UNAVAILABLE');
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Disable Codex executor',
        message: 'Disable the bundled Codex plugin?',
        detail: 'New Codex Runs and model refinement will be unavailable. Existing Runs are not stopped. Re-enabling requires a Forge restart.',
        buttons: ['Cancel', 'Disable plugin'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) throw new Error('PLUGIN_DISABLE_CANCELLED');
    }
    return hostController.setBundledPluginEnabled(enabled);
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

function openWorkspaceWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  } else createWindow();
}

function ensureTray(): void {
  if (tray) return;
  const filename = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  tray = new Tray(fileURLToPath(new URL(`../../assets/${filename}`, import.meta.url)));
  tray.setToolTip('Forge is running in the background');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Forge', click: () => openWorkspaceWindow() },
    { type: 'separator' },
    { label: 'Quit Forge safely', click: () => { void decideQuit(); } },
  ]));
  tray.on('double-click', () => openWorkspaceWindow());
}

async function finishQuit(): Promise<void> {
  if (quitting) return;
  quitting = true;
  try { await hostController.stop(); } finally {
    tray?.destroy(); tray = null;
    app.quit();
  }
}

async function decideQuit(): Promise<void> {
  if (quitting || exitDecisionPending) return;
  exitDecisionPending = true;
  try {
    let active: number | null = null;
    try { active = (await hostController.activity()).activityCount; } catch { /* Unknown is not idle. */ }
    if (active === 0) { await finishQuit(); return; }
    const options: Electron.MessageBoxOptions = {
      type: 'warning', title: active === null ? 'Forge Host status unavailable' : 'Forge has active work',
      message: active === null ? 'Forge cannot confirm whether work is still running.' :
        'Forge has active local work. What should happen?',
      detail: 'Keeping Forge in the tray requires this computer and user session to remain awake. '
        + 'Safe quit asks the Python Host to cancel owned work and waits for process cleanup. '
        + 'Unconfirmed process exits remain interrupted/quarantined.',
      buttons: active === null ? ['Cancel', 'Quit Forge'] :
        ['Cancel', 'Keep running in tray', 'Stop safely and quit'],
      defaultId: 0, cancelId: 0, noLink: true,
    };
    const choice = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
    if (active === null && choice.response === 1) await finishQuit();
    else if (active !== null && choice.response === 1) {
      ensureTray();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    } else if (active !== null && choice.response === 2) await finishQuit();
  } finally { exitDecisionPending = false; }
}

function createWindow(): void {
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  mainWindow = window;

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    void decideQuit();
  });
  window.on('closed', () => { closeAppPreviews(); mainWindow = null; });

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
    openWorkspaceWindow();
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    const dataDir = !app.isPackaged && process.env.FORGE_HOST_DATA_DIR
      ? process.env.FORGE_HOST_DATA_DIR
      : join(app.getPath('appData'), 'Forge', app.isPackaged ? 'production' : 'development');
    hostController = new PythonHostController(pythonInterpreter, app.getVersion(), dataDir, (snapshot) => {
      if (snapshot.state !== 'connected') preparedDiagnostics = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('forge:host-status', hostController.status);
        mainWindow.webContents.send('forge:python-host-status', snapshot);
      }
    }, packagedPythonEnvironment);
    void hostController.start();
    powerMonitor.on('suspend', () => {
      if (tray) tray.setToolTip('Forge is suspended; local work may be interrupted');
    });
    powerMonitor.on('resume', () => {
      if (tray) tray.setToolTip('Forge resumed; check local work status');
    });
    registerHostIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWorkspaceWindow();
    });
  }).catch((error: unknown) => {
    console.error('Forge Desktop failed to initialize:', error);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (!tray && !quitting) void decideQuit();
});

app.on('before-quit', (event) => {
  if (quitting || !hostController) return;
  event.preventDefault();
  void decideQuit();
});
