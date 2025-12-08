import { forgeError, hostHealthSchema, hostInfoSchema, hostProtocolVersion,
  type HostHealth, type HostInfo, type HostStatus, type StorageHealth } from '@forge/contracts';
import { createRuntimeId, type HostConfig } from './config.js';

const transitions: Record<HostStatus, readonly HostStatus[]> = {
  starting: ['ready', 'stopping'],
  ready: ['degraded', 'stopping'],
  degraded: ['ready', 'stopping'],
  stopping: ['offline'],
  offline: [],
};

export class HostRuntime {
  readonly hostId = createRuntimeId();
  readonly pid = process.pid;
  readonly startedAt = new Date().toISOString();
  private readonly startedMs = Date.now();
  private status: HostStatus = 'starting';
  private storage: StorageHealth = { status: 'unavailable', schemaVersion: null, sqliteVersion: null,
    journalMode: 'unknown', error: forgeError('DATABASE_OPEN_FAILED', 'Forge storage has not opened', 'storage-startup') };
  private storageProbe: (() => StorageHealth) | null = null;

  constructor(private readonly config: HostConfig) {}

  transition(next: HostStatus): void {
    if (!transitions[this.status].includes(next)) {
      throw new Error(`Invalid Host status transition: ${this.status} -> ${next}`);
    }
    this.status = next;
  }

  setStorageHealth(health: StorageHealth): void {
    this.storage = health;
    if (this.status === 'ready' && health.status === 'unavailable') this.transition('degraded');
    else if (this.status === 'degraded' && health.status === 'ready') this.transition('ready');
  }

  setStorageProbe(probe: () => StorageHealth): void { this.storageProbe = probe; }

  info(): HostInfo {
    return hostInfoSchema.parse({
      status: this.status,
      hostId: this.hostId,
      pid: this.pid,
      version: this.config.hostVersion,
      productVersion: this.config.productVersion,
      startedAt: this.startedAt,
      protocolVersion: hostProtocolVersion,
      runtime: {
        version: process.version, node: process.versions.node,
        modules: process.versions.modules, electron: process.versions.electron ?? null,
        platform: process.platform, arch: process.arch,
      },
    });
  }

  health(): HostHealth {
    if (this.storageProbe) this.setStorageHealth(this.storageProbe());
    return hostHealthSchema.parse({ ...this.info(), uptimeMs: Date.now() - this.startedMs,
      timestamp: new Date().toISOString(), storage: this.storage });
  }
}
