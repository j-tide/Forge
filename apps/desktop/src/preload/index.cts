import { contextBridge, ipcRenderer } from 'electron';
import type { ForgeDesktopBridge, HostConnectionSnapshot, SystemCommandEnvelope,
  ProjectCommandEnvelope, ConversationCommandEnvelope, DraftCommandEnvelope,
  ApprovalCommandEnvelope, BoardCommandEnvelope, RunCommandEnvelope } from '@forge/contracts';
import type { ConversationStreamEvent } from '@forge/contracts';
import type { PythonHostSnapshot } from '@forge/contracts';

const bridge: ForgeDesktopBridge = Object.freeze({
  platform: process.platform,
  hostStatus: () => ipcRenderer.invoke('forge:host-status'),
  hostHealth: () => ipcRenderer.invoke('forge:host-health'),
  pythonHostStatus: () => ipcRenderer.invoke('forge:python-host-status'),
  invokeSystem: (command: SystemCommandEnvelope) => ipcRenderer.invoke('forge:system-command', command),
  inspectBundledPlugin: () => ipcRenderer.invoke('forge:plugin-inspect-bundled'),
  chooseProjectFolder: () => ipcRenderer.invoke('forge:choose-project-folder'),
  invokeProject: (command: ProjectCommandEnvelope) => ipcRenderer.invoke('forge:project-command', command),
  invokeConversation: (command: ConversationCommandEnvelope) => ipcRenderer.invoke('forge:conversation-command', command),
  invokeDraft: (command: DraftCommandEnvelope) => ipcRenderer.invoke('forge:draft-command', command),
  invokeApproval: (command: ApprovalCommandEnvelope) => ipcRenderer.invoke('forge:approval-command', command),
  invokeBoard: (command: BoardCommandEnvelope) => ipcRenderer.invoke('forge:board-command', command),
  invokeRun: (command: RunCommandEnvelope) => ipcRenderer.invoke('forge:run-command', command),
  onConversationEvent: (listener: (event: ConversationStreamEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, raw: unknown): void => {
      listener(raw as ConversationStreamEvent);
    };
    ipcRenderer.on('forge:conversation-event', handler);
    return () => ipcRenderer.removeListener('forge:conversation-event', handler);
  },
  onHostStatus: (listener: (snapshot: HostConnectionSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: unknown): void => {
      listener(snapshot as Parameters<typeof listener>[0]);
    };
    ipcRenderer.on('forge:host-status', handler);
    return () => ipcRenderer.removeListener('forge:host-status', handler);
  },
  onPythonHostStatus: (listener: (snapshot: PythonHostSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: unknown): void => {
      listener(snapshot as PythonHostSnapshot);
    };
    ipcRenderer.on('forge:python-host-status', handler);
    return () => ipcRenderer.removeListener('forge:python-host-status', handler);
  },
});
contextBridge.exposeInMainWorld('forge', bridge);
