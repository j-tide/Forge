import {
  forgeError, hostProtocolVersion, systemCommandEnvelopeSchema,
  type HostHealth, type HostInfo, type SystemCommandEnvelope, type SystemCommandResult,
} from '@forge/contracts';

export interface HostRuntimeReader {
  info(): HostInfo;
  health(): HostHealth;
}

/** Set by the authenticated transport, never copied from command.payload. */
export interface CommandContext {
  transport: 'desktop' | 'cli';
  callerId: string;
}

const maxReceipts = 256;

export class SystemCommandBus {
  private readonly receipts = new Map<string, { fingerprint: string; result: SystemCommandResult }>();

  constructor(private readonly runtime: HostRuntimeReader) {}

  execute(input: unknown, context: CommandContext): SystemCommandResult {
    const started = Date.now();
    const parsed = systemCommandEnvelopeSchema.safeParse(input);
    const commandId = parsed.success ? parsed.data.commandId : this.validCommandId(input);
    if (!parsed.success) {
      return this.fail(commandId, 'VALIDATION_ERROR', 'Invalid system command envelope', started);
    }
    const command = parsed.data;
    if (!context.callerId || !['desktop', 'cli'].includes(context.transport)) {
      return this.fail(commandId, 'UNAUTHENTICATED', 'Missing trusted transport context', started);
    }
    if (command.protocolVersion !== hostProtocolVersion) {
      return this.fail(commandId, 'PROTOCOL_MISMATCH', 'Host protocol is incompatible', started);
    }

    const fingerprint = JSON.stringify([command.type, command.payload, command.protocolVersion]);
    const previous = this.receipts.get(commandId);
    if (previous) {
      return previous.fingerprint === fingerprint
        ? previous.result
        : this.fail(commandId, 'IDEMPOTENCY_CONFLICT', 'Command ID was reused with different content', started);
    }

    const result = this.dispatch(command, started);
    this.receipts.set(commandId, { fingerprint, result });
    if (this.receipts.size > maxReceipts) {
      const oldest = this.receipts.keys().next().value;
      if (oldest) this.receipts.delete(oldest);
    }
    return result;
  }

  private dispatch(command: SystemCommandEnvelope, started: number): SystemCommandResult {
    let data: HostHealth | HostInfo | { reply: 'pong'; hostId: string; timestamp: string };
    switch (command.type) {
      case 'system.health': data = this.runtime.health(); break;
      case 'system.info': data = this.runtime.info(); break;
      case 'system.ping': data = { reply: 'pong', hostId: this.runtime.info().hostId, timestamp: new Date().toISOString() }; break;
      default: return this.fail(command.commandId, 'UNKNOWN_COMMAND', 'System command is not registered', started);
    }
    return {
      commandId: command.commandId,
      ok: true,
      data,
      durationMs: Date.now() - started,
      hostTimestamp: new Date().toISOString(),
    };
  }

  private fail(
    commandId: string,
    code: 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'PROTOCOL_MISMATCH' | 'IDEMPOTENCY_CONFLICT' | 'UNKNOWN_COMMAND',
    message: string,
    started: number,
  ): SystemCommandResult {
    return {
      commandId,
      ok: false,
      error: forgeError(code, message, commandId),
      durationMs: Date.now() - started,
      hostTimestamp: new Date().toISOString(),
    };
  }

  private validCommandId(input: unknown): string {
    if (typeof input === 'object' && input !== null && 'commandId' in input) {
      const value = input.commandId;
      if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) return value;
    }
    return 'invalid-command';
  }
}
