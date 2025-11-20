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
