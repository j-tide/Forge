import { z } from 'zod';

export const hostProtocolVersion = 'forge-host-protocol/v2' as const;
export const hostStatusSchema = z.enum(['starting', 'ready', 'degraded', 'stopping', 'offline']);
export const connectionStateSchema = z.enum(['starting', 'connected', 'degraded', 'unavailable', 'crashed', 'incompatible']);

const identifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const versionSchema = z.string().min(1).max(64);
const timestampSchema = z.iso.datetime();

export const forgeErrorCodeSchema = z.enum([
  'VALIDATION_ERROR', 'UNKNOWN_COMMAND', 'IDEMPOTENCY_CONFLICT',
  'PROTOCOL_MISMATCH', 'VERSION_MISMATCH', 'UNAUTHENTICATED', 'FORBIDDEN',
  'HOST_STARTUP_FAILED', 'HOST_EXITED', 'HOST_UNAVAILABLE',
  'TRANSPORT_TIMEOUT', 'INVALID_RESPONSE', 'INTERNAL_ERROR',
  'DATABASE_OPEN_FAILED', 'DATABASE_MIGRATION_FAILED', 'DATABASE_VERSION_UNSUPPORTED',
  'DATABASE_BUSY', 'DATABASE_CORRUPT', 'DATABASE_IO_ERROR',
]);

export const forgeErrorSchema = z.strictObject({
  code: forgeErrorCodeSchema,
  message: z.string().min(1).max(240),
  retryable: z.boolean(),
  correlationId: identifierSchema,
});

export const hostInfoSchema = z.strictObject({
  status: hostStatusSchema,
  hostId: z.uuid(),
  pid: z.int().positive(),
  version: versionSchema,
  productVersion: versionSchema,
  startedAt: timestampSchema,
  protocolVersion: z.string().min(1).max(80),
  runtime: z.strictObject({
    version: versionSchema,
    node: versionSchema,
    modules: versionSchema,
    electron: versionSchema.nullable(),
    platform: z.string().min(1),
    arch: z.string().min(1),
  }),
});

export const storageHealthSchema = z.strictObject({
  status: z.enum(['ready', 'unavailable']),
  schemaVersion: z.int().nonnegative().nullable(),
  sqliteVersion: versionSchema.nullable(),
  journalMode: z.enum(['wal', 'unknown']),
  error: forgeErrorSchema.nullable(),
});

export const hostHealthSchema = z.strictObject({
  ...hostInfoSchema.shape,
  uptimeMs: z.number().nonnegative(),
  timestamp: timestampSchema,
  storage: storageHealthSchema,
});

export const hostPingSchema = z.strictObject({
  reply: z.literal('pong'),
  hostId: z.uuid(),
  timestamp: timestampSchema,
});

/** System-only envelope. The reference business command-envelope schema remains unchanged. */
export const systemCommandEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  commandId: identifierSchema,
  type: z.string().min(1).max(128),
  createdAt: timestampSchema,
  protocolVersion: z.string().min(1).max(80),
  payload: z.strictObject({}),
});

export const systemCommandResultSchema = z.union([
  z.strictObject({
    commandId: identifierSchema,
    ok: z.literal(true),
    data: z.union([hostInfoSchema, hostHealthSchema, hostPingSchema]),
    durationMs: z.number().nonnegative(),
    hostTimestamp: timestampSchema,
  }),
  z.strictObject({
    commandId: identifierSchema,
    ok: z.literal(false),
    error: forgeErrorSchema,
    durationMs: z.number().nonnegative(),
    hostTimestamp: timestampSchema,
  }),
]);

export const hostConnectionSnapshotSchema = z.strictObject({
  revision: z.int().nonnegative(),
  state: connectionStateSchema,
  info: hostInfoSchema.nullable(),
  health: hostHealthSchema.nullable(),
  lastHealthCheck: timestampSchema.nullable(),
  error: forgeErrorSchema.nullable(),
});

const wireHelloRequestSchema = z.strictObject({
  kind: z.literal('hello'),
  requestId: identifierSchema,
  protocolVersion: z.string().min(1).max(80),
  productVersion: versionSchema,
  hostVersion: versionSchema,
  ownershipToken: z.uuid(),
});

const wireCommandRequestSchema = z.strictObject({
  kind: z.literal('command'),
  requestId: identifierSchema,
  command: systemCommandEnvelopeSchema,
});

const wireShutdownRequestSchema = z.strictObject({
  kind: z.literal('shutdown'),
  requestId: identifierSchema,
  hostId: z.uuid(),
  ownershipToken: z.uuid(),
});

export const hostWireRequestSchema = z.discriminatedUnion('kind', [
  wireHelloRequestSchema, wireCommandRequestSchema, wireShutdownRequestSchema,
]);

const wireHelloResultSchema = z.union([
  z.strictObject({ kind: z.literal('hello-result'), requestId: identifierSchema, ok: z.literal(true), info: hostInfoSchema }),
  z.strictObject({ kind: z.literal('hello-result'), requestId: identifierSchema, ok: z.literal(false), error: forgeErrorSchema }),
]);

const wireShutdownResultSchema = z.union([
  z.strictObject({ kind: z.literal('shutdown-result'), requestId: identifierSchema, ok: z.literal(true), hostId: z.uuid() }),
  z.strictObject({ kind: z.literal('shutdown-result'), requestId: identifierSchema, ok: z.literal(false), error: forgeErrorSchema }),
]);

export const hostWireResponseSchema = z.union([
  z.strictObject({ kind: z.literal('ready'), info: hostInfoSchema }),
  wireHelloResultSchema,
  z.strictObject({ kind: z.literal('command-result'), requestId: identifierSchema, result: systemCommandResultSchema }),
  wireShutdownResultSchema,
  z.strictObject({ kind: z.literal('protocol-error'), requestId: identifierSchema, error: forgeErrorSchema }),
]);

export function forgeError(
  code: z.infer<typeof forgeErrorCodeSchema>,
  message: string,
  correlationId: string,
  retryable = false,
): z.infer<typeof forgeErrorSchema> {
  return forgeErrorSchema.parse({ code, message, correlationId, retryable });
}

export type ForgeError = z.infer<typeof forgeErrorSchema>;
export type HostInfo = z.infer<typeof hostInfoSchema>;
export type HostHealth = z.infer<typeof hostHealthSchema>;
export type StorageHealth = z.infer<typeof storageHealthSchema>;
export type HostStatus = z.infer<typeof hostStatusSchema>;
export type HostConnectionSnapshot = z.infer<typeof hostConnectionSnapshotSchema>;
export type SystemCommandEnvelope = z.infer<typeof systemCommandEnvelopeSchema>;
export type SystemCommandResult = z.infer<typeof systemCommandResultSchema>;
export type HostWireRequest = z.infer<typeof hostWireRequestSchema>;
export type HostWireResponse = z.infer<typeof hostWireResponseSchema>;
