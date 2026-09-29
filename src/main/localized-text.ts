import english from '../shared/i18n/locales/en/native.json';
import chinese from '../shared/i18n/locales/zh-CN/native.json';
import { getAppLanguage } from './app-language';

export type NativeTextKey = keyof typeof english;

const dictionaries: Record<'en' | 'zh-CN', Record<NativeTextKey, string>> = {
  en: english,
  'zh-CN': chinese
};

/** Native UI follows the saved application language, independently of the OS locale. */
export function nativeText(
  key: NativeTextKey,
  values: Record<string, string | number> = {}
): string {
  const language = getAppLanguage();
  const dictionary = language === 'zh-CN' ? dictionaries['zh-CN'] : dictionaries.en;
  return dictionary[key].replace(/\{\{(\w+)\}\}/g, (placeholder, name: string) => {
    return Object.hasOwn(values, name) ? String(values[name]) : placeholder;
  });
}
