import type { HostStatus } from '@forge/contracts';

/** Intentionally allowlisted fields only. No environment or raw exception text. */
export function logHost(event: string, details: { hostId?: string; pid?: number; status?: HostStatus; code?: string; count?: number } = {}): void {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), component: 'forge-host', event, ...details })}\n`);
}
