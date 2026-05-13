import { contextBridge, ipcRenderer } from 'electron';
import type { ForgeDesktopBridge, HostConnectionSnapshot, SystemCommandEnvelope } from '@forge/contracts';

const bridge: ForgeDesktopBridge = Object.freeze({
  platform: process.platform,
  hostStatus: () => ipcRenderer.invoke('forge:host-status'),
  hostHealth: () => ipcRenderer.invoke('forge:host-health'),
  invokeSystem: (command: SystemCommandEnvelope) => ipcRenderer.invoke('forge:system-command', command),
  onHostStatus: (listener: (snapshot: HostConnectionSnapshot) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: unknown): void => {
      listener(snapshot as Parameters<typeof listener>[0]);
    };
    ipcRenderer.on('forge:host-status', handler);
    return () => ipcRenderer.removeListener('forge:host-status', handler);
  },
});
contextBridge.exposeInMainWorld('forge', bridge);
