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
import type { PythonHostSnapshot } from './python-host-protocol.js';
import type { ProjectCommandEnvelope, ProjectCommandResult } from './project.js';
import type { ConversationCommandEnvelope, ConversationCommandResult,
  ConversationStreamEvent } from './conversation.js';
import type { DraftCommandEnvelope, DraftCommandResult } from './task-draft.js';
import type { ApprovalCommandEnvelope, ApprovalCommandResult } from './task-approval.js';
import type { BoardCommandEnvelope, BoardCommandResult } from './board.js';
import type { RunCommandEnvelope, RunCommandResult } from './run-inspection.js';

/** Fixed, narrow Desktop capability exposed by the isolated preload. */
export interface ForgeDesktopBridge {
  readonly platform: string;
  hostStatus(): Promise<HostConnectionSnapshot>;
  hostHealth(): Promise<SystemCommandResult>;
  pythonHostStatus?(): Promise<PythonHostSnapshot>;
  onPythonHostStatus?(listener: (snapshot: PythonHostSnapshot) => void): () => void;
  invokeSystem(command: SystemCommandEnvelope): Promise<SystemCommandResult>;
  inspectBundledPlugin(): Promise<import('./plugin-config.js').BundledPluginInspection>;
  setBundledPluginEnabled(enabled: boolean): Promise<import('./plugin-config.js').BundledPluginInspection>;
  agentProfileCatalog(): Promise<import('./agent-profile.js').AgentProfileCatalog>;
  saveAgentProfile(value: import('./agent-profile.js').AgentProfileSave): Promise<import('./agent-profile.js').AgentProfile>;
  invokeWorkflow(command: import('./workflow.js').WorkflowCommand): Promise<unknown>;
  invokeKnowledge(command: import('./knowledge.js').KnowledgeCommand): Promise<unknown>;
  invokeMemory(command: import('./project-memory.js').MemoryCommand): Promise<unknown>;
  invokeDevicePairing?(command: import('./device-pairing.js').DevicePairingCommand): Promise<unknown>;
  chooseProjectFolder(): Promise<string | null>;
  openAppPreview?(request: import('./app-preview.js').AppPreviewRequest): Promise<import('./app-preview.js').AppPreviewResult>;
  prepareDiagnostics?(): Promise<import('./diagnostics.js').DiagnosticsPreview>;
  exportDiagnostics?(previewId: string): Promise<import('./diagnostics.js').DiagnosticsExportResult>;
  cleanupExpiredArtifacts?(previewId: string): Promise<import('./diagnostics.js').DiagnosticsCleanupResult>;
  invokeProject(command: ProjectCommandEnvelope): Promise<ProjectCommandResult>;
  invokeConversation(command: ConversationCommandEnvelope): Promise<ConversationCommandResult>;
  invokeDraft(command: DraftCommandEnvelope): Promise<DraftCommandResult>;
  invokeApproval(command: ApprovalCommandEnvelope): Promise<ApprovalCommandResult>;
  invokeBoard(command: BoardCommandEnvelope): Promise<BoardCommandResult>;
  invokeRun(command: RunCommandEnvelope): Promise<RunCommandResult>;
  onConversationEvent(listener: (event: ConversationStreamEvent) => void): () => void;
  onHostStatus(listener: (snapshot: HostConnectionSnapshot) => void): () => void;
}

export * from './app-preview.js';
export * from './diagnostics.js';
export * from './host-activity.js';

export * from './host-protocol.js';
export * from './python-host-protocol.js';
export * from './project.js';
export * from './conversation.js';
export * from './task-draft.js';
export * from './task-approval.js';
export * from './board.js';
export * from './run-config.js';
export * from './run.js';
export * from './context.js';
export * from './run-inspection.js';
export * from './handoff.js';
export * from './review.js';
export * from './verify.js';
export * from './acceptance-matrix.js';
export * from './final-acceptance.js';
export * from './delivery.js';
export * from './task-change.js';
export * from './plugin-config.js';
export * from './agent-profile.js';
export * from './workflow.js';
export * from './knowledge.js';
export * from './project-memory.js';
export * from './device-pairing.js';
export * from './context-builder.js';
export * from './rework.js';
