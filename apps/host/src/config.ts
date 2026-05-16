import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveForgeDataDir, type ForgeEnvironment } from '@forge/persistence';

export interface HostConfig {
  hostVersion: string;
  productVersion: string;
  transport: 'desktop' | 'cli';
  ownershipToken: string | null;
  dataDir: string;
}

function readVersion(url: URL): string {
  const value: unknown = JSON.parse(readFileSync(url, 'utf8'));
  if (typeof value !== 'object' || value === null || !('version' in value) || typeof value.version !== 'string') {
    throw new Error('Invalid package version metadata');
  }
  return value.version;
}

export function parseHostConfig(args: string[], env: NodeJS.ProcessEnv): HostConfig {
  if (args.length !== 0) throw new Error('Unknown Host arguments');
  const transport = env.FORGE_HOST_TRANSPORT ?? 'cli';
  if (transport !== 'desktop' && transport !== 'cli') throw new Error('Invalid Host transport');
  const token = env.FORGE_HOST_OWNERSHIP_TOKEN ?? null;
  if (token !== null && !/^[0-9a-f-]{36}$/i.test(token)) throw new Error('Invalid Host ownership token');
  const environment = env.FORGE_ENVIRONMENT ?? 'development';
  if (!['development', 'test', 'production'].includes(environment)) throw new Error('Invalid Forge environment');
  return {
    hostVersion: readVersion(new URL('../package.json', import.meta.url)),
    productVersion: readVersion(new URL('../../../package.json', import.meta.url)),
    transport,
    ownershipToken: token,
    dataDir: resolveForgeDataDir({ environment: environment as ForgeEnvironment,
      ...(env.FORGE_HOST_DATA_DIR ? { override: env.FORGE_HOST_DATA_DIR } : {}) }),
  };
}

export function createRuntimeId(): string {
  return randomUUID();
}
