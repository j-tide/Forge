import { z } from 'zod';
import { allowedOrigin, isCsrfRejection } from './pairing';

const uuid = z.uuid();
const commandSchema = z.strictObject({
  schemaVersion: z.literal('1.0'), commandId: uuid,
  method: z.literal('conversations.send'), projectId: uuid,
  resourceId: uuid, expectedRevision: z.int().positive(),
  idempotencyKey: uuid,
  payload: z.strictObject({
    conversationId: uuid, text: z.string().trim().min(1).max(30_000),
    attachmentIds: z.tuple([]),
  }),
});
const receiptSchema = z.strictObject({
  commandId: uuid, status: z.literal('completed'), operationId: z.null(),
  resourceRevision: z.int().positive(),
  result: z.strictObject({
    message: z.strictObject({
      messageId: uuid, conversationId: uuid, sequence: z.int().positive(),
      role: z.literal('user'), content: z.string().min(1).max(30_000),
      status: z.literal('completed'), createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    }),
    replay: z.literal(false), replyStatus: z.literal('unavailable'),
  }),
  error: z.null(),
});

export type MobileMessageCommand = z.infer<typeof commandSchema>;
export type MobileMessageReceipt = z.infer<typeof receiptSchema>;

export function createMessageCommand(projectId: string, conversationId: string,
                                     expectedRevision: number, text: string): MobileMessageCommand {
  return commandSchema.parse({
    schemaVersion: '1.0', commandId: crypto.randomUUID(), method: 'conversations.send',
    projectId, resourceId: conversationId, expectedRevision,
    idempotencyKey: crypto.randomUUID(),
    payload: { conversationId, text, attachmentIds: [] },
  });
}

async function call(path: string, command?: MobileMessageCommand,
                    csrfToken?: string): Promise<MobileMessageReceipt | null> {
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
      ...(command ? { body: JSON.stringify(commandSchema.parse(command)) } : {}),
    });
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
      throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
    }
    if (response.status === 404 && !command) return null;
    if (response.status === 401) throw new Error('REMOTE_SESSION_UNAVAILABLE');
    if (response.status === 403) {
      if (await isCsrfRejection(response)) throw new Error('REMOTE_CSRF_REJECTED');
      throw new Error('REMOTE_MESSAGE_NOT_AUTHORIZED');
    }
    if (response.status === 409) throw new Error('REMOTE_CONVERSATION_STALE');
    if (response.status === 503 || response.status === 504) {
      throw new Error('REMOTE_GATEWAY_UNAVAILABLE');
    }
    if (!response.ok) throw new Error('REMOTE_MESSAGE_FAILED');
    const receipt = receiptSchema.parse(await response.json());
    if (command && (receipt.commandId !== command.commandId ||
        receipt.result.message.conversationId !== command.resourceId ||
        receipt.result.message.content !== command.payload.text ||
        receipt.resourceRevision !== command.expectedRevision + 1)) {
      throw new Error('REMOTE_MESSAGE_RECEIPT_MISMATCH');
    }
    return receipt;
  } finally { clearTimeout(timeout); }
}

export async function submitMessage(command: MobileMessageCommand,
                                    csrfToken: string): Promise<MobileMessageReceipt> {
  const receipt = await call('/v1/commands', command, csrfToken);
  if (!receipt) throw new Error('REMOTE_MESSAGE_RECEIPT_MISSING');
  return receipt;
}

export async function readMessageReceipt(commandId: string):
  Promise<MobileMessageReceipt | null> {
  if (!uuid.safeParse(commandId).success) throw new Error('REMOTE_INVALID_COMMAND');
  const receipt = await call(`/v1/commands/${commandId}`);
  if (receipt && receipt.commandId !== commandId) {
    throw new Error('REMOTE_MESSAGE_RECEIPT_MISMATCH');
  }
  return receipt;
}
