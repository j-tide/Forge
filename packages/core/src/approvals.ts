import { createHash, randomUUID } from 'node:crypto';
import { approvalRequestSchema, type ApprovalRequest, type TaskContract,
  type TaskDraft } from '@forge/contracts';
import { approvalReadiness } from './task-revisions.js';

export class ApprovalError extends Error {
  constructor(readonly code: 'APPROVAL_NOT_READY' | 'APPROVAL_STALE' |
    'APPROVAL_EXPIRED' | 'APPROVAL_ALREADY_DECIDED') { super(code); }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function contractDigest(contract: TaskContract): string {
  return createHash('sha256').update(canonicalJson(contract)).digest('hex');
}

export function contractScopeHash(contract: TaskContract): string {
  return createHash('sha256').update(canonicalJson({ scope: contract.scope,
    outOfScope: contract.outOfScope, constraints: contract.constraints,
    acceptance: contract.acceptance, openQuestions: contract.openQuestions })).digest('hex');
}

export function prepareTaskApproval(draft: TaskDraft, now = new Date()): ApprovalRequest {
  if (!approvalReadiness(draft).ready || !draft.contract) throw new ApprovalError('APPROVAL_NOT_READY');
  return approvalRequestSchema.parse({ schemaVersion: '1.0', approvalId: randomUUID(),
    projectId: draft.projectId, taskId: draft.contract.taskId, kind: 'task',
    expectedRevision: draft.revision, scopeHash: contractScopeHash(draft.contract),
    snapshotId: null, actionDigest: contractDigest(draft.contract),
    requestedBy: 'local-user', expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    summary: `${draft.contract.title}: ${draft.contract.goal}`, risk: 'medium',
    requiredScope: 'task:create:todo' });
}
