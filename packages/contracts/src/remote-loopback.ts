import { z } from 'zod';

/** Main owns this fixed local-only control; it is not a remote command API. */
export const remoteLoopbackActionSchema = z.enum(['inspect', 'start', 'stop']);
export type RemoteLoopbackAction = z.infer<typeof remoteLoopbackActionSchema>;

export const remoteLoopbackStateSchema = z.strictObject({
  running: z.boolean(),
  origin: z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}$/).nullable(),
  hostId: z.uuid(),
}).refine((value) => value.running === (value.origin !== null), {
  message: 'Loopback origin and running state disagree',
});
export type RemoteLoopbackState = z.infer<typeof remoteLoopbackStateSchema>;
