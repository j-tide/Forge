import { z } from 'zod';

const uuid = z.uuid();
export const devicePairingCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('issue'), payload: z.strictObject({}) }),
  z.strictObject({ type: z.literal('inspect'), payload: z.strictObject({ pairingId: uuid }) }),
  z.strictObject({ type: z.literal('decide'), payload: z.strictObject({
    pairingId: uuid, approve: z.boolean(), projectIds: z.array(uuid).max(32),
  }) }),
]);
export type DevicePairingCommand = z.infer<typeof devicePairingCommandSchema>;

export const pairingIssuedSchema = z.strictObject({
  pairingId: uuid, nonce: z.string().min(40).max(128), expiresAt: z.iso.datetime(),
});
export const pairingInspectionSchema = z.strictObject({
  pairingId: uuid,
  status: z.enum(['pending', 'claimed', 'approved', 'rejected', 'expired']),
  deviceName: z.string().nullable(), addressSummary: z.string().nullable(),
  fingerprintSummary: z.string().nullable(), createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(), claimedAt: z.iso.datetime().nullable(),
  decidedAt: z.iso.datetime().nullable(), projectIds: z.array(uuid),
});
export const pairingDecisionResultSchema = z.strictObject({
  pairingId: uuid, status: z.enum(['approved', 'rejected']),
  deviceId: uuid.nullable(), projectIds: z.array(uuid),
});
export type PairingIssued = z.infer<typeof pairingIssuedSchema>;
export type PairingInspection = z.infer<typeof pairingInspectionSchema>;
export type PairingDecisionResult = z.infer<typeof pairingDecisionResultSchema>;
