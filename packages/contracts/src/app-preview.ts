import { z } from 'zod';

export const appPreviewRequestSchema = z.strictObject({ url: z.string().min(1).max(2048) });
export const appPreviewResultSchema = z.strictObject({ origin: z.url() });
export type AppPreviewRequest = z.infer<typeof appPreviewRequestSchema>;
export type AppPreviewResult = z.infer<typeof appPreviewResultSchema>;
