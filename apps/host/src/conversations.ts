import { conversationStreamEventSchema, type Conversation, type ConversationMessage,
  type ConversationSend, type ConversationStreamEvent, type ControlProposal } from '@forge/contracts';
import { proposeControl } from '@forge/core/intent-commands';
import { ConversationStorageError, ForgePersistence } from '@forge/persistence';

/** P1-04 supplies the actual model-backed responder. This boundary never fabricates content. */
export interface ConversationResponder {
  stream(input: ConversationSend, signal: AbortSignal): AsyncIterable<string>;
}

export class ConversationService {
  private readonly active = new Map<string, { idempotencyKey: string;
    controller: AbortController; done: Promise<void> }>();
  constructor(private readonly storage: ForgePersistence,
    private readonly responder: ConversationResponder | null = null,
    private readonly publish: (event: ConversationStreamEvent) => void = () => {}) {}

  create(projectId: string, title: string, expectedRevision: number): Conversation {
    return this.storage.createConversation(projectId, title, expectedRevision);
  }
  list(projectId: string): Conversation[] { return this.storage.listConversations(projectId); }
  get(projectId: string, conversationId: string): Conversation | null {
    return this.storage.getConversation(projectId, conversationId);
  }
  messages(projectId: string, conversationId: string): ConversationMessage[] {
    return this.storage.listConversationMessages(projectId, conversationId);
  }
  propose(projectId: string, conversationId: string, messageId: string): ControlProposal {
    const message = this.messages(projectId, conversationId).find((item) =>
      item.messageId === messageId && item.role === 'user');
    if (!message) throw new ConversationStorageError('MESSAGE_NOT_FOUND');
    return proposeControl({ projectId, conversationId, messageId,
      text: message.content, createdAt: message.createdAt });
  }
  send(input: ConversationSend): { message: ConversationMessage; replay: boolean;
    replyStatus: 'unavailable' | 'streaming' | 'completed' } {
    const inFlight = this.active.get(input.conversationId);
    if (inFlight && inFlight.idempotencyKey !== input.idempotencyKey) {
      throw new ConversationStorageError('CONVERSATION_BUSY');
    }
    const recorded = this.storage.recordUserMessage(input);
    const status = this.storage.conversationRequestStatus(input.projectId, input.conversationId, input.idempotencyKey);
    if (status === 'completed') return { ...recorded, replyStatus: 'completed' };
    if (!this.responder) {
      this.storage.failConversationRequest(input.projectId, input.conversationId, input.idempotencyKey);
      return { ...recorded, replyStatus: 'unavailable' };
    }
    if (!this.active.has(input.conversationId) && status !== 'streaming') {
      const assistant = this.storage.beginAssistantMessage(input.projectId, input.conversationId, input.idempotencyKey);
      const controller = new AbortController();
      const done = this.pump(input, assistant.messageId, controller.signal);
      this.active.set(input.conversationId, { idempotencyKey: input.idempotencyKey, controller, done });
      void done.finally(() => { this.active.delete(input.conversationId); });
    }
    return { ...recorded, replyStatus: this.active.has(input.conversationId) ? 'streaming' : 'unavailable' };
  }

  cancel(projectId: string, conversationId: string): boolean {
    if (!this.storage.getConversation(projectId, conversationId)) return false;
    const active = this.active.get(conversationId);
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  async dispose(): Promise<void> {
    for (const active of this.active.values()) active.controller.abort();
    await Promise.all([...this.active.values()].map((active) => active.done));
  }

  private async pump(input: ConversationSend, messageId: string, signal: AbortSignal): Promise<void> {
    let sequence = 0;
    const emit = (type: ConversationStreamEvent['type'], delta: string | null): void => {
      sequence += 1;
      const event = conversationStreamEventSchema.parse({ projectId: input.projectId,
        conversationId: input.conversationId, messageId, sequence,
        timestamp: new Date().toISOString(), type, delta });
      try { this.publish(event); } catch { /* A subscriber cannot interrupt durable output. */ }
    };
    emit('message.started', null);
    try {
      if (!this.responder) throw new Error('No responder');
      for await (const chunk of this.responder.stream(input, signal)) {
        if (signal.aborted) break;
        for (let offset = 0; offset < chunk.length; offset += 8192) {
          const delta = chunk.slice(offset, offset + 8192);
          this.storage.appendAssistantChunk(input.projectId, input.conversationId, messageId, delta);
          emit('message.delta', delta);
        }
      }
      const status = signal.aborted ? 'cancelled' : 'completed';
      this.storage.finishAssistantMessage(input.projectId, input.conversationId, messageId, status);
      emit(status === 'cancelled' ? 'message.cancelled' : 'message.completed', null);
    } catch {
      const status = signal.aborted ? 'cancelled' : 'failed';
      this.storage.finishAssistantMessage(input.projectId, input.conversationId, messageId, status);
      emit(status === 'cancelled' ? 'message.cancelled' : 'message.failed', null);
    }
  }
  archive(projectId: string, conversationId: string, expectedRevision: number): Conversation {
    return this.storage.archiveConversation(projectId, conversationId, expectedRevision);
  }
}
