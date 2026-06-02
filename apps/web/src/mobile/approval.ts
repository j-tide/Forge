import { z } from 'zod';
import type { RemoteApprovalDetail } from '@forge/contracts';
import { allowedOrigin, isCsrfRejection } from './pairing';

const uuid = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const commandSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), commandId: uuid,
  method: z.literal('tasks.approve'), projectId: uuid,
  resourceId: uuid, expectedRevision: z.int().positive(),
  idempotencyKey: uuid,
  payload: z.strictObject({ approvalId: uuid, scopeHash: hash }),
});
const receiptSchema = z.strictObject({
  commandId: uuid, status: z.literal('completed'), operationId: z.null(),
  resourceRevision: z.int().positive(),
  result: z.strictObject({ approvalId: uuid, taskId: uuid,
    state: z.literal('todo'), revision: z.int().positive() }),
  error: z.null(),
});

export type MobileApprovalCommand = z.infer<typeof commandSchema>;
export type MobileApprovalReceipt = z.infer<typeof receiptSchema>;

export function approvalFingerprint(value: RemoteApprovalDetail): string {
  return [value.approvalId, value.projectId, value.taskId,
    value.expectedRevision, value.scopeHash, value.actionDigest,
    value.snapshotId ?? 'none', value.requiredScope, value.expiresAt,
  ].join(':');
}

export function createApprovalCommand(value: RemoteApprovalDetail): MobileApprovalCommand {
  return commandSchema.parse({
    schemaVersion: '1.0', commandId: crypto.randomUUID(),
    method: 'tasks.approve', projectId: value.projectId,
    resourceId: value.approvalId, expectedRevision: value.expectedRevision,
    idempotencyKey: crypto.randomUUID(),
    payload: { approvalId: value.approvalId, scopeHash: value.scopeHash },
  });
}

async function call(path: string, command?: MobileApprovalCommand,
                    csrfToken?: string): Promise<MobileApprovalReceipt | null> {
  if (!allowedOrigin()) throw new Error('REMOTE_SECURE_ORIGIN_REQUIRED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, {
      method: command ? 'POST' : 'GET',
      credentials: 'same-origin', mode: 'same-origin',
      redirect: 'error', cache: 'no-store',
      headers: { 'X-Forge-Session': '1',
        ...(command ? { 'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken ?? '' } : {}),
      },
      ...(command ? { body: JSON.stringify(commandSchema.parse(command)) } : {}),
      signal: controller.signal,
    });
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
      throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
    }
    if (response.status === 404 && !command) return null;
    if (response.status === 403) {
      if (await isCsrfRejection(response)) {
        throw new Error('REMOTE_CSRF_REJECTED');
      }
      throw new Error('REMOTE_SESSION_UNAVAILABLE');
    }
    if (response.status === 401) {
      throw new Error('REMOTE_SESSION_UNAVAILABLE');
    }
    if (response.status === 409) throw new Error('REMOTE_APPROVAL_STALE');
    if (response.status === 503 || response.status === 504) {
      throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
    }
    if (!response.ok) throw new Error('REMOTE_APPROVAL_FAILED');
    const receipt = receiptSchema.parse(await response.json());
    if (command && (receipt.commandId !== command.commandId ||
        receipt.result.approvalId !== command.payload.approvalId ||
        receipt.resourceRevision !== command.expectedRevision ||
        receipt.result.revision !== command.expectedRevision)) {
      throw new Error('REMOTE_APPROVAL_RECEIPT_MISMATCH');
    }
    return receipt;
  } finally { clearTimeout(timeout); }
}

export async function submitApproval(command: MobileApprovalCommand,
                                     csrfToken: string): Promise<MobileApprovalReceipt> {
  const receipt = await call('/v1/commands', command, csrfToken);
  if (!receipt) throw new Error('REMOTE_APPROVAL_RECEIPT_MISSING');
  return receipt;
}

export async function readApprovalReceipt(commandId: string):
  Promise<MobileApprovalReceipt | null> {
  if (!uuid.safeParse(commandId).success) throw new Error('REMOTE_INVALID_COMMAND');
  const receipt = await call(`/v1/commands/${commandId}`);
  if (receipt && receipt.commandId !== commandId) {
    throw new Error('REMOTE_APPROVAL_RECEIPT_MISMATCH');
  }
  return receipt;
}
