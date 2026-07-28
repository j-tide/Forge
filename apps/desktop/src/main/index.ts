import { app, BrowserWindow, dialog, ipcMain, Menu, powerMonitor, session, Tray,
  type IpcMainInvokeEvent } from 'electron';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { forgeError, projectCommandEnvelopeSchema, projectProbeSchema, runCommandEnvelopeSchema,
  type ProjectCommandResult,
  type ConversationCommandResult, type DraftCommandResult, type ApprovalCommandResult,
  type BoardCommandResult } from '@forge/contracts';
import { agentProfileSaveSchema, knowledgeCommandSchema, memoryCommandSchema,
  workflowCommandSchema, appPreviewRequestSchema, devicePairingCommandSchema,
  pairingInspectionSchema, remoteLoopbackActionSchema,
  bundledPluginConfigSaveSchema } from '@forge/contracts';
import type { RunCommandResult } from '@forge/contracts';
import { PythonHostController } from './python-host-controller.js';
import { isTrustedHostIpcSender } from './ipc-auth.js';
import { createWindowOptions } from './window-options.js';
import { closeAppPreviews, openAppPreview } from './app-preview.js';
import { writeDiagnosticBundle } from './diagnostic-export.js';
import { packagedPythonInterpreter } from './python-runtime-path.js';
import { hostEnvironment } from './host-environment.js';
import { internalQaAppData } from './internal-qa-profile.js';
import { profileDataDir, readProfileSelection, requireSafeDataProfileSwitch,
  restoreResult, runRestoreTool,
  writeProfileSelection } from './database-restore-profile.js';
import { databaseRestorePreviewSchema, stagedDatabaseProfileSchema } from '@forge/contracts';

// Internal QA packages carry a bounded identity and use a separate default
// profile even when Finder cannot pass the explicit test-home override.
const internalQaHome = app.isPackaged ? internalQaAppData(
  process.resourcesPath, app.getPath('appData'), process.env.FORGE_INTERNAL_TEST_HOME,
) : null;
if (internalQaHome) {
  mkdirSync(internalQaHome, { recursive: true });
  app.setPath('appData', internalQaHome);
  const userData = join(internalQaHome, 'Forge');
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
let activeProfileId: string | null = null;
let restoreInProgress = false;
let quitting = false;
let exitDecisionPending = false;
let hostRestartPending = false;
let tray: Tray | null = null;
const selectedProjectPaths = new Set<string>();
let preparedDiagnostics: { previewId: string; json: string; expiresAt: number } | null = null;

function authorize(event: IpcMainInvokeEvent): void {
  if (restoreInProgress) throw new Error('RESTORE_IN_PROGRESS');
  if (!isTrustedHostIpcSender(event, mainWindow?.webContents ?? null, trustedUrl)) {
    console.error('Rejected Forge Host IPC source');
    throw new Error('FORBIDDEN');
  }
}

function dataProfileRoot(): string { return join(app.getPath('appData'), 'Forge'); }

function makeHostController(dataDir: string): PythonHostController {
  return new PythonHostController(pythonInterpreter, app.getVersion(), dataDir, (snapshot) => {
    if (snapshot.state !== 'connected') preparedDiagnostics = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('forge:host-status', hostController.status);
      mainWindow.webContents.send('forge:python-host-status', snapshot);
    }
  }, packagedPythonEnvironment, dirname(webEntryPath));
}

async function assertSafeDataProfileSwitch(): Promise<void> {
  requireSafeDataProfileSwitch(await hostController.activity(),
    await hostController.profileSwitchSafety());
}

async function switchDataProfile(profileId: string | null): Promise<void> {
  const originalController = hostController;
  const resume = await originalController.quiesceForDataSwitch();
  try {
    await assertSafeDataProfileSwitch();
    const previous = activeProfileId;
    await originalController.stop();
    if (!originalController.ownedProcessStopped) throw new Error('RESTORE_HOST_EXIT_UNCONFIRMED');
    try {
      await writeProfileSelection(dataProfileRoot(), profileId);
      hostController = makeHostController(profileDataDir(dataProfileRoot(), profileId));
      await hostController.start();
      if (hostController.status.state !== 'connected') throw new Error('RESTORE_HOST_START_FAILED');
      activeProfileId = profileId;
      selectedProjectPaths.clear();
      preparedDiagnostics = null;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
    } catch (error) {
      await hostController.stop();
      if (!hostController.ownedProcessStopped) throw new Error('RESTORE_ROLLBACK_UNCONFIRMED',
        {cause:error});
      await writeProfileSelection(dataProfileRoot(), previous);
      hostController = makeHostController(profileDataDir(dataProfileRoot(), previous));
      await hostController.start();
      if (hostController.status.state !== 'connected') throw new Error('RESTORE_ROLLBACK_FAILED',
        {cause:error});
      throw error;
    }
  } finally {
    resume();
  }
}

function registerHostIpc(): void {
  ipcMain.handle('forge:remote-loopback', async (event, action: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    const checked = remoteLoopbackActionSchema.parse(action);
    if (checked === 'start') {
      if (!mainWindow) throw new Error('HOST_UNAVAILABLE');
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Start Forge local browser preview',
        message: 'Open Forge mobile view on this Mac only?',
        detail: 'The Python Host will serve the built Web UI on 127.0.0.1. '
          + 'This is a local HTTP preview, not a phone or private HTTPS connection. '
          + 'Device pairing still requires your separate approval of the exact Project and permissions.',
        buttons: ['Cancel', 'Start local preview'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) throw new Error('REMOTE_LOOPBACK_CANCELLED');
    }
    return hostController.remoteLoopback(checked);
  });
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
  ipcMain.handle('forge:database-backup-export', async (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0 || !mainWindow) throw new Error('VALIDATION_ERROR');
    const selected = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Forge database backup', defaultPath: 'forge-backup.sqlite',
      filters: [{ name: 'SQLite database', extensions: ['sqlite'] }],
    });
    if (selected.canceled || !selected.filePath) return { saved: false };
    const decision = await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: 'Export Forge database backup',
      message: 'Export a copy of Forge data now?',
      detail: 'This SQLite file can contain project paths, messages and task history. '
        + 'Store it privately. It does not include project source files, worktrees, '
        + 'imported artifacts or external Codex credentials. The installed Desktop can '
        + 'restore it into a separate data set after validation and a new trust confirmation. '
        + 'Finish active work before backing up. An existing destination will not be overwritten.',
      buttons: ['Cancel', 'Export database'], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (decision.response !== 1) return { saved: false };
    return hostController.exportDatabaseBackup(selected.filePath);
  });
  ipcMain.handle('forge:database-profile-status', (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    return { profileId: activeProfileId, available: app.isPackaged };
  });
  ipcMain.handle('forge:database-restore', async (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0 || !mainWindow) throw new Error('VALIDATION_ERROR');
    if (!app.isPackaged) throw new Error('RESTORE_PACKAGED_ONLY');
    const chosen = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore Forge database into a separate data set',
      properties: ['openFile'],
      filters: [{ name:'SQLite database', extensions:['sqlite'] }],
    });
    if (chosen.canceled || chosen.filePaths.length !== 1) {
      return restoreResult(false,activeProfileId,null);
    }
    const environment = { ...hostEnvironment(process.env),
      ...(packagedPythonEnvironment ? { PYTHONHOME:packagedPythonEnvironment.pythonHome,
        PYTHONPATH:packagedPythonEnvironment.pythonPath, PYTHONDONTWRITEBYTECODE:'1' } : {}) };
    const preview = databaseRestorePreviewSchema.parse(await runRestoreTool(
      pythonInterpreter,chosen.filePaths[0]!,dataProfileRoot(),null,environment));
    const decision = await dialog.showMessageBox(mainWindow, {
      type:'warning', title:'Restore Forge data',
      message:'Switch Forge to a restored, separate data set?',
      detail:`Schema ${preview.schemaVersion} · ${preview.projectCount} projects · `
        + `${preview.taskCount} tasks · ${preview.runCount} runs.\n\n`
        + 'Your current Forge database is preserved and can be selected again. '
        + 'This SQLite backup does not contain project source files, isolated workspaces, '
        + 'imported artifact files or external Codex credentials. Historical records may '
        + 'have unavailable external evidence. Imported projects require a new local trust '
        + 'confirmation, and imported device sessions are revoked. Running work must finish first.',
      buttons:['Cancel','Use restored data'],defaultId:0,cancelId:0,noLink:true,
    });
    if (decision.response !== 1) return restoreResult(false,activeProfileId,null);
    restoreInProgress = true;
    try {
      await assertSafeDataProfileSwitch();
      const profileId = randomUUID();
      const staged = stagedDatabaseProfileSchema.parse(await runRestoreTool(
        pythonInterpreter,chosen.filePaths[0]!,dataProfileRoot(),profileId,environment));
      if (staged.profileId !== profileId) throw new Error('RESTORE_INVALID_RESPONSE');
      await switchDataProfile(profileId);
      return restoreResult(true,profileId,staged.schemaVersion);
    } finally { restoreInProgress = false; }
  });
  ipcMain.handle('forge:database-return-original', async (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0 || !mainWindow) throw new Error('VALIDATION_ERROR');
    if (!app.isPackaged) throw new Error('RESTORE_PACKAGED_ONLY');
    if (activeProfileId === null) return restoreResult(false,null,null);
    const decision = await dialog.showMessageBox(mainWindow, {
      type:'warning', title:'Return to original Forge data',
      message:'Switch Forge back to its original data set?',
      detail:'The restored data set is preserved. No project source files or workspaces '
        + 'are deleted. Finish active work before switching.',
      buttons:['Cancel','Use original data'],defaultId:0,cancelId:0,noLink:true,
    });
    if (decision.response !== 1) return restoreResult(false,activeProfileId,null);
    restoreInProgress = true;
    try { await switchDataProfile(null); return restoreResult(true,null,null); }
    finally { restoreInProgress = false; }
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
          `Operations: ${(checked.payload.scopes ?? []).join(', ') || 'Read-only'}\n` +
          'This does not grant shell, plugin or credential access. A device session is not active yet.',
        buttons: ['Cancel', 'Approve device'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) throw new Error('PAIRING_APPROVAL_CANCELLED');
    }
    if (checked.type === 'revoke') {
      if (!mainWindow) throw new Error('HOST_UNAVAILABLE');
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Revoke Forge device',
        message: 'Revoke this device and all of its active sessions?',
        detail: `Device ID: ${checked.payload.deviceId}\n` +
          'Remote reads and writes will stop. Already committed actions cannot be undone.',
        buttons: ['Cancel', 'Revoke device'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) throw new Error('DEVICE_REVOCATION_CANCELLED');
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
  ipcMain.handle('forge:plugin-save-bundled-config', (event, value: unknown, ...extra: unknown[]) => {
    authorize(event);
    if (extra.length !== 0) throw new Error('VALIDATION_ERROR');
    return hostController.saveBundledPluginConfig(bundledPluginConfigSaveSchema.parse(value));
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
    if (parsed.success && parsed.data.type === 'run.recoveryResolve') {
      if (!mainWindow) throw new Error('HOST_UNAVAILABLE');
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Resolve interrupted Run',
        message: 'Keep the interrupted workspace and allow a new Run?',
        detail: 'Forge Host will verify a different system boot session and the old workspace identity. '
          + 'The old Run stays interrupted. Its files are retained; nothing is merged, deleted or restarted.',
        buttons: ['Cancel', 'Keep workspace and allow new Run'],
        defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) return { commandId: parsed.data.commandId, ok: false,
        error: forgeError('RUN_RECOVERY_CANCELLED', 'Recovery was cancelled', parsed.data.commandId),
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
  ipcMain.handle('forge:restart-python-host', async (event, ...args: unknown[]) => {
    authorize(event);
    if (args.length !== 0) throw new Error('VALIDATION_ERROR');
    if (hostRestartPending || quitting || exitDecisionPending || !mainWindow ||
        hostController.status.state !== 'crashed' || !hostController.ownedProcessStopped) {
      throw new Error('HOST_RESTART_UNAVAILABLE');
    }
    hostRestartPending = true;
    try {
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'warning', title: 'Restart Forge Host',
        message: 'Restart the local Python Host?',
        detail: 'Unfinished runs will be marked interrupted and their isolated workspaces '
          + 'quarantined. Forge will not automatically resume an Agent or execute project commands.',
        buttons: ['Cancel', 'Restart Host'], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1) throw new Error('HOST_RESTART_CANCELLED');
      if (hostController.status.state !== 'crashed' || !hostController.ownedProcessStopped) {
        throw new Error('HOST_RESTART_UNAVAILABLE');
      }
      await hostController.start();
      return hostController.status;
    } finally { hostRestartPending = false; }
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
  if (quitting || exitDecisionPending || restoreInProgress) return;
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
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const window = new BrowserWindow({
    ...createWindowOptions(preloadPath),
    icon: fileURLToPath(new URL(`../../assets/${iconName}`, import.meta.url)),
  });
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

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    if (app.isPackaged) {
      try { activeProfileId = await readProfileSelection(dataProfileRoot()); }
      catch (error) {
        if (!(error instanceof Error) || error.message !== 'DATABASE_PROFILE_INVALID' ||
          !existsSync(join(profileDataDir(dataProfileRoot(), null), 'forge.sqlite'))) throw error;
        const choice = await dialog.showMessageBox({
          type:'warning', title:'Forge restored data unavailable',
          message:'The selected restored data set cannot be opened.',
          detail:'Your original Forge data is still present. Choose it explicitly to update '
            + 'the data-set pointer; restored directories are not deleted. If the original '
            + 'database is also damaged, Forge will report its storage error.',
          buttons:['Quit','Open original data'], defaultId:0, cancelId:0, noLink:true,
        });
        if (choice.response !== 1) throw error;
        await writeProfileSelection(dataProfileRoot(), null);
        activeProfileId = null;
      }
    }
    const dataDir = !app.isPackaged && process.env.FORGE_HOST_DATA_DIR
      ? process.env.FORGE_HOST_DATA_DIR
      : app.isPackaged ? profileDataDir(dataProfileRoot(), activeProfileId)
        : join(app.getPath('appData'), 'Forge', 'development');
    hostController = makeHostController(dataDir);
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
    if (error instanceof Error && error.message === 'DATABASE_PROFILE_INVALID') {
      dialog.showErrorBox('Forge data profile unavailable',
        'The selected restored data set is missing or invalid. Your original data was not modified. '
        + 'Contact support before editing the Forge data directory.');
    }
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
