/** The current specification's JSON Schema file names. Schema validation belongs to P0-08. */
export const contractSchemaNames = [
  'agent-profile',
  'approval-decision',
  'approval-request',
  'command-envelope',
  'config',
  'event-envelope',
  'executor-capabilities',
  'handoff-bundle',
  'plan-result',
  'plugin-manifest',
  'step-result',
  'task-contract',
  'workflow',
] as const;

export type ContractSchemaName = (typeof contractSchemaNames)[number];

import type { HostConnectionSnapshot, SystemCommandEnvelope, SystemCommandResult } from './host-protocol.js';

/** Fixed, narrow Desktop capability exposed by the isolated preload. */
export interface ForgeDesktopBridge {
  readonly platform: string;
  hostStatus(): Promise<HostConnectionSnapshot>;
  hostHealth(): Promise<SystemCommandResult>;
  invokeSystem(command: SystemCommandEnvelope): Promise<SystemCommandResult>;
  onHostStatus(listener: (snapshot: HostConnectionSnapshot) => void): () => void;
}

export * from './host-protocol.js';
