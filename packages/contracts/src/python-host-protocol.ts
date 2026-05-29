import { z } from 'zod';
import { forgeErrorSchema, storageHealthSchema } from './host-protocol.js';

export const pythonTransportVersion = 'forge-local-jsonrpc/v1' as const;
export const pythonHostInfoSchema = z.strictObject({
  status: z.enum(['starting', 'ready', 'degraded', 'stopping', 'offline']),
  hostId: z.uuid(), pid: z.int().positive(), version: z.string().min(1),
  productVersion: z.string().min(1), startedAt: z.iso.datetime(),
  protocolVersion: z.string().min(1), transportVersion: z.literal(pythonTransportVersion),
  runtime: z.strictObject({
    version: z.string().min(1), python: z.string().min(1), implementation: z.string().min(1),
    platform: z.string().min(1), arch: z.string().min(1),
  }),
});
export const pythonHostHealthSchema = z.strictObject({
  ...pythonHostInfoSchema.shape, uptimeMs: z.number().nonnegative(), timestamp: z.iso.datetime(),
  storage: storageHealthSchema,
});
export const pythonHostSnapshotSchema = z.strictObject({
  revision: z.int().nonnegative(),
  state: z.enum(['starting', 'connected', 'degraded', 'unavailable', 'crashed', 'incompatible']),
  info: pythonHostInfoSchema.nullable(), health: pythonHostHealthSchema.nullable(),
  lastHealthCheck: z.iso.datetime().nullable(), error: forgeErrorSchema.nullable(),
});
export type PythonHostSnapshot = z.infer<typeof pythonHostSnapshotSchema>;
