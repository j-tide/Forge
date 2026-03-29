import { z } from 'zod';

const uuid = z.uuid();
export const remoteOperationScopeSchema = z.enum([
  'task:draft', 'task:approve', 'run:start', 'run:pause', 'run:cancel',
  'acceptance:decide',
]);
export type RemoteOperationScope = z.infer<typeof remoteOperationScopeSchema>;
export const devicePairingCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('issue'), payload: z.strictObject({}) }),
  z.strictObject({ type: z.literal('inspect'), payload: z.strictObject({ pairingId: uuid }) }),
  z.strictObject({ type: z.literal('list'), payload: z.strictObject({}) }),
  z.strictObject({ type: z.literal('audit'), payload: z.strictObject({ deviceId: uuid }) }),
  z.strictObject({ type: z.literal('decide'), payload: z.strictObject({
    pairingId: uuid, approve: z.boolean(), projectIds: z.array(uuid).max(32),
    scopes: z.array(remoteOperationScopeSchema).max(6).optional(),
  }) }),
  z.strictObject({ type: z.literal('narrow'), payload: z.strictObject({
    deviceId: uuid, expectedRevision: z.number().int().positive(),
    projectIds: z.array(uuid).max(32),
    scopes: z.array(remoteOperationScopeSchema).max(6),
  }) }),
  z.strictObject({ type: z.literal('revoke'), payload: z.strictObject({
    deviceId: uuid, expectedRevision: z.number().int().positive(),
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
  scopes: z.array(remoteOperationScopeSchema),
});
export const pairingDecisionResultSchema = z.strictObject({
  pairingId: uuid, status: z.enum(['approved', 'rejected']),
  deviceId: uuid.nullable(), projectIds: z.array(uuid),
  scopes: z.array(remoteOperationScopeSchema),
});
export const devicePolicyResultSchema = z.strictObject({
  deviceId: uuid, revision: z.number().int().positive(),
  projectIds: z.array(uuid), scopes: z.array(remoteOperationScopeSchema),
  status: z.enum(['approved', 'revoked']),
});
export const pairedDeviceSchema = z.strictObject({
  deviceId: uuid, name: z.string().min(1),
  addressSummary: z.string(), fingerprintSummary: z.string(),
  projectIds: z.array(uuid), scopes: z.array(remoteOperationScopeSchema),
  revision: z.number().int().positive(),
  status: z.enum(['approved', 'revoked']),
  approvedAt: z.iso.datetime(), revokedAt: z.iso.datetime().nullable(),
  validSessionCount: z.number().int().nonnegative(),
});
export type PairedDevice = z.infer<typeof pairedDeviceSchema>;
export const devicePolicyAuditSchema = z.strictObject({
  eventId: uuid, kind: z.enum(['narrow', 'revoke']),
  oldRevision: z.number().int().positive(), newRevision: z.number().int().positive(),
  oldProjectIds: z.array(uuid), newProjectIds: z.array(uuid),
  oldScopes: z.array(remoteOperationScopeSchema),
  newScopes: z.array(remoteOperationScopeSchema),
  decidedAt: z.iso.datetime(),
});
export type DevicePolicyAudit = z.infer<typeof devicePolicyAuditSchema>;
export type PairingIssued = z.infer<typeof pairingIssuedSchema>;
export type PairingInspection = z.infer<typeof pairingInspectionSchema>;
export type PairingDecisionResult = z.infer<typeof pairingDecisionResultSchema>;
