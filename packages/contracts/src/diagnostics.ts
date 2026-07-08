import { z } from 'zod';

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
