import { z } from 'zod';
import { taskContractSchema, type TaskContract } from '@forge/contracts';
import { allowedOrigin, isCsrfRejection } from './pairing';

const uuid = z.uuid();
const createCommandSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), commandId: uuid,
  method: z.literal('tasks.createDraft'), projectId: uuid, resourceId: uuid,
  expectedRevision: z.literal(0), idempotencyKey: uuid,
  payload: z.strictObject({ contract: taskContractSchema }),
});
const reviseCommandSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), commandId: uuid,
  method: z.literal('tasks.revise'), projectId: uuid, resourceId: uuid,
  expectedRevision: z.int().positive(), idempotencyKey: uuid,
  payload: z.strictObject({ contract: taskContractSchema,
    reason: z.string().trim().min(1).max(1000) }),
});
const receiptSchema = z.strictObject({
  commandId: uuid, status: z.literal('completed'), operationId: z.null(),
  resourceRevision: z.int().positive(),
  result: z.strictObject({
    draftId: uuid, status: z.enum(['proposed', 'needs_clarification']),
    revision: z.int().positive(),
  }), error: z.null(),
});
export type MobileDraftCommand = z.infer<typeof createCommandSchema> |
  z.infer<typeof reviseCommandSchema>;
export type MobileDraftReceipt = z.infer<typeof receiptSchema>;

export function createDraftCommand(contract: TaskContract):
  z.infer<typeof createCommandSchema> {
  const commandId = crypto.randomUUID();
  const decisionRef = `decision:${commandId}`;
  const sourcedContract = {
    ...contract,
    sourceRefs: [...contract.sourceRefs, decisionRef],
    acceptance: contract.acceptance.map((item) => ({
      ...item, sourceRefs: [...item.sourceRefs, decisionRef],
    })),
  };
  return createCommandSchema.parse({
    schemaVersion: '1.0', commandId,
    method: 'tasks.createDraft', projectId: contract.projectId,
    resourceId: contract.taskId, expectedRevision: 0,
    idempotencyKey: crypto.randomUUID(), payload: { contract: sourcedContract },
  });
}

export function reviseDraftCommand(previous: TaskContract, candidate: TaskContract,
                                   reason: string): z.infer<typeof reviseCommandSchema> {
  const commandId = crypto.randomUUID();
  const decisionRef = `decision:${commandId}`;
  if (candidate.taskId !== previous.taskId || candidate.projectId !== previous.projectId ||
      candidate.revision !== previous.revision + 1) {
    throw new Error('REMOTE_DRAFT_STALE');
  }
  const contract = {
    ...candidate, sourceRefs: [...previous.sourceRefs, decisionRef],
    acceptance: candidate.acceptance.map((item) => {
      const prior = previous.acceptance.find((old) => old.id === item.id);
      const changed = !prior || item.statement !== prior.statement ||
        item.method !== prior.method || item.required !== prior.required;
      return { ...item, sourceRefs: changed
        ? [...(prior?.sourceRefs ?? []), decisionRef]
        : prior.sourceRefs };
    }),
  };
  return reviseCommandSchema.parse({
    schemaVersion: '1.0', commandId, method: 'tasks.revise',
    projectId: previous.projectId, resourceId: previous.taskId,
    expectedRevision: previous.revision, idempotencyKey: crypto.randomUUID(),
    payload: { contract, reason: reason.trim() },
  });
}

async function call(path: string, command?: MobileDraftCommand,
                    csrfToken?: string): Promise<MobileDraftReceipt | null> {
  if (!allowedOrigin()) throw new Error('REMOTE_SECURE_ORIGIN_REQUIRED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, {
      method: command ? 'POST' : 'GET', credentials: 'same-origin', mode: 'same-origin',
      cache: 'no-store', redirect: 'error', signal: controller.signal,
      headers: { 'X-Forge-Session': '1', ...(command ? {
        'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken ?? '',
      } : {}) },
      ...(command ? { body: JSON.stringify(command.method === 'tasks.createDraft'
        ? createCommandSchema.parse(command) : reviseCommandSchema.parse(command)) } : {}),
    });
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
      throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
    }
    if (response.status === 404 && !command) return null;
    if (response.status === 401) throw new Error('REMOTE_SESSION_UNAVAILABLE');
    if (response.status === 403) {
      if (await isCsrfRejection(response)) throw new Error('REMOTE_CSRF_REJECTED');
      throw new Error('REMOTE_DRAFT_NOT_AUTHORIZED');
    }
    if (response.status === 404 || response.status === 409) {
      throw new Error('REMOTE_DRAFT_STALE');
    }
    if (response.status === 400 || response.status === 422) {
      throw new Error('REMOTE_DRAFT_INVALID');
    }
    if (response.status === 503 || response.status === 504) {
      throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
    }
    if (!response.ok) throw new Error('REMOTE_DRAFT_FAILED');
    const receipt = receiptSchema.parse(await response.json());
    if (command && (receipt.commandId !== command.commandId ||
        receipt.result.draftId !== command.resourceId ||
        receipt.resourceRevision !== command.expectedRevision + 1 ||
        receipt.result.revision !== receipt.resourceRevision)) {
      throw new Error('REMOTE_DRAFT_RECEIPT_MISMATCH');
    }
    return receipt;
  } finally { clearTimeout(timeout); }
}

export async function submitDraft(command: MobileDraftCommand,
                                  csrfToken: string): Promise<MobileDraftReceipt> {
  const receipt = await call('/v1/commands', command, csrfToken);
  if (!receipt) throw new Error('REMOTE_DRAFT_RECEIPT_MISSING');
  return receipt;
}

export async function readDraftReceipt(commandId: string):
  Promise<MobileDraftReceipt | null> {
  if (!uuid.safeParse(commandId).success) throw new Error('REMOTE_INVALID_COMMAND');
  const receipt = await call(`/v1/commands/${commandId}`);
  if (receipt && receipt.commandId !== commandId) {
    throw new Error('REMOTE_DRAFT_RECEIPT_MISMATCH');
  }
  return receipt;
}
