/** Languages offered by this preview. French remains valid for existing saved settings. */
export type SupportedLanguage = 'zh-CN' | 'en' | 'fr';

export const AVAILABLE_LANGUAGES = [
  { value: 'zh-CN' as const, label: '简体中文', nativeLabel: '中文' },
  { value: 'en' as const, label: 'English', nativeLabel: 'English' }
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'zh-CN';
export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === 'zh-CN' || value === 'en' || value === 'fr';
}
export function normalizeLanguage(value: unknown): SupportedLanguage {
  if (isSupportedLanguage(value)) return value;
  if (typeof value === 'string' && /^zh(?:-|_|$)/i.test(value)) return 'zh-CN';
  if (typeof value === 'string' && /^en(?:-|_|$)/i.test(value)) return 'en';
  if (typeof value === 'string' && /^fr(?:-|_|$)/i.test(value)) return 'fr';
  return DEFAULT_LANGUAGE;
}
