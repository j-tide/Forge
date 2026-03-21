import { z } from 'zod';

/** Read-only Host process environment, with no executable paths or credential values. */
export const desktopDependenciesSchema = z.strictObject({
  format: z.literal('forge-desktop-dependencies/v1'),
  checkedAt: z.iso.datetime({ offset: true }),
  python: z.strictObject({ status: z.literal('ready'), version: z.string().min(1).max(40) }),
  git: z.strictObject({ status: z.enum(['available', 'missing', 'unavailable']),
    version: z.string().max(80).nullable() }),
  codex: z.strictObject({ status: z.enum([
    'authenticated', 'missing', 'unavailable', 'version_mismatch', 'not_authenticated',
  ]), version: z.string().max(80).nullable() }),
  proxy: z.strictObject({ status: z.enum(['configured', 'not_configured']) }),
});
export type DesktopDependencies = z.infer<typeof desktopDependenciesSchema>;

/** Private Host-to-Main payload; internalPath must never cross the Preload boundary. */
export const databaseBackupSourceSchema = z.strictObject({
  internalPath: z.string().min(1).max(4096),
  schemaVersion: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  sizeBytes: z.number().int().positive(),
});
export type DatabaseBackupSource = z.infer<typeof databaseBackupSourceSchema>;
export const databaseBackupExportResultSchema = z.discriminatedUnion('saved', [
  z.strictObject({ saved: z.literal(false) }),
  z.strictObject({ saved: z.literal(true), schemaVersion: z.number().int().nonnegative(),
    createdAt: z.iso.datetime({ offset: true }), sizeBytes: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
export type DatabaseBackupExportResult = z.infer<typeof databaseBackupExportResultSchema>;

/** Main-owned, reversible data-profile switch. No source or database path crosses Preload. */
export const databaseProfileStatusSchema = z.strictObject({
  profileId: z.uuid().nullable(), available: z.boolean(),
});
export const databaseRestoreResultSchema = z.strictObject({
  switched: z.boolean(), profileId: z.uuid().nullable(),
  schemaVersion: z.number().int().positive().nullable(),
});
export const databaseRestorePreviewSchema = z.strictObject({
  schemaVersion: z.number().int().positive(), projectCount: z.number().int().nonnegative(),
  taskCount: z.number().int().nonnegative(), runCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().positive(),
});
export const stagedDatabaseProfileSchema = z.strictObject({
  profileId: z.uuid(), schemaVersion: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
});
export type DatabaseProfileStatus = z.infer<typeof databaseProfileStatusSchema>;
export type DatabaseRestoreResult = z.infer<typeof databaseRestoreResultSchema>;

export const diagnosticsPreviewSchema = z.strictObject({
  format: z.literal('forge-diagnostics/v1'),
  previewId: z.uuid(), generatedAt: z.iso.datetime({ offset: true }),
  runtime: z.strictObject({ python: z.string().max(40), platform: z.string().max(40),
    arch: z.string().max(40), hostProtocol: z.string().max(80) }),
  storage: z.strictObject({ status: z.literal('ready'), schemaVersion: z.number().int().nonnegative(),
    journalMode: z.string().max(40) }),
  counts: z.strictObject({ projects: z.number().int().nonnegative(), tasks: z.number().int().nonnegative(),
    runs: z.number().int().nonnegative(), importedArtifacts: z.number().int().nonnegative() }),
  usage: z.strictObject({ status: z.literal('unavailable'), reason: z.literal('No complete measured total') }),
  retention: z.strictObject({ artifactDays: z.literal(30), expiredImportedArtifacts: z.number().int().nonnegative(),
    moreCandidates: z.boolean(), automaticPurge: z.literal(false) }),
});
export const diagnosticsExportResultSchema = z.strictObject({ saved: z.boolean() });
export const diagnosticsCleanupResultSchema = z.strictObject({ purgedImportedArtifacts: z.number().int().nonnegative(), cancelled: z.boolean() });
export type DiagnosticsPreview = z.infer<typeof diagnosticsPreviewSchema>;
export type DiagnosticsExportResult = z.infer<typeof diagnosticsExportResultSchema>;
export type DiagnosticsCleanupResult = z.infer<typeof diagnosticsCleanupResultSchema>;
