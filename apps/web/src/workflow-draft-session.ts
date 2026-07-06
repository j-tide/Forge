import type { ForgeClient } from '@forge/client';
import type { WorkflowRecord, WorkflowTemplate } from '@forge/contracts';
import type { CanvasLayout } from './workflow-canvas-document';

export type UnsavedWorkflow = {
  hostId: string | null;
  draft: WorkflowTemplate;
  record: WorkflowRecord | null;
  layout: CanvasLayout;
  canvasJson: string;
  canvasOpen: boolean;
  selectedNodeId: string;
};

// App navigation unmounts WorkflowsView. This cache belongs only to the current
// renderer and client; it never writes a semantic draft outside the Host.
const unsavedWorkflows = new WeakMap<ForgeClient, UnsavedWorkflow>();

export function getUnsavedWorkflow(client: ForgeClient): UnsavedWorkflow | undefined {
  return unsavedWorkflows.get(client);
}

export function clearUnsavedWorkflow(client: ForgeClient): void {
  unsavedWorkflows.delete(client);
}

export function setUnsavedWorkflow(client: ForgeClient, value: UnsavedWorkflow): void {
  unsavedWorkflows.set(client, value);
}
