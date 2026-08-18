import i18n from '../../../shared/i18n';

export function formatDate(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleString(i18n.resolvedLanguage || i18n.language);
  } catch {
    return timestamp;
  }
}
