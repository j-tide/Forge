import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { conversationCommandEnvelopeSchema, conversationStreamEventSchema,
  hostProtocolVersion, hostWireRequestSchema } from '../dist/index.js';

test('conversation send rejects unknown fields, empty input and invalid attachments', () => {
  const base = { schemaVersion: '1.0', commandId: randomUUID(), type: 'conversation.send',
    createdAt: new Date().toISOString(), protocolVersion: hostProtocolVersion,
    payload: { projectId: randomUUID(), conversationId: randomUUID(),
      idempotencyKey: randomUUID(), text: 'Clarify this feature', attachmentIds: [] } };
  assert.equal(conversationCommandEnvelopeSchema.safeParse(base).success, true);
  assert.equal(hostWireRequestSchema.safeParse({ kind: 'conversation-command',
    requestId: randomUUID(), command: base }).success, true);
  assert.equal(conversationCommandEnvelopeSchema.safeParse({ ...base,
    payload: { ...base.payload, text: ' ' } }).success, false);
  assert.equal(conversationCommandEnvelopeSchema.safeParse({ ...base,
    payload: { ...base.payload, attachmentIds: ['/private/file'] } }).success, false);
  assert.equal(conversationCommandEnvelopeSchema.safeParse({ ...base,
    payload: { ...base.payload, shell: 'rm -rf .' } }).success, false);
});

test('stream event requires a positive sequence and rejects arbitrary provider payload', () => {
  const event = { projectId: randomUUID(), conversationId: randomUUID(),
    messageId: randomUUID(), sequence: 1, timestamp: new Date().toISOString(),
    type: 'message.delta', delta: 'safe text' };
  assert.equal(conversationStreamEventSchema.safeParse(event).success, true);
  assert.equal(conversationStreamEventSchema.safeParse({ ...event, sequence: 0 }).success, false);
  assert.equal(conversationStreamEventSchema.safeParse({ ...event, rawProviderEvent: { token: 'secret' } }).success, false);
});
