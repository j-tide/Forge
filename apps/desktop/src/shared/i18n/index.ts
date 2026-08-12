/// <reference types="vite/client" />
import i18n, { type Resource, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE } from '../constants/i18n';

export const defaultNS = 'common';
// Every locale namespace is bundled through the same registry. No runtime file access.
const localeModules = import.meta.glob<ResourceKey>('./locales/*/*.json', { eager: true, import: 'default' });
export const resources: Resource = {};
for (const [file, translations] of Object.entries(localeModules)) {
  const [, language, namespace] = file.match(/\/locales\/([^/]+)\/([^/]+)\.json$/) ?? [];
  if (!language || !namespace) throw new Error(`Invalid translation resource: ${file}`);
  resources[language] ??= {};
  resources[language][namespace] = translations;
}
const namespaces = Object.keys(resources.en);
i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: 'en',
  supportedLngs: ['zh-CN', 'en', 'fr'],
  load: 'currentOnly',
  defaultNS,
  ns: namespaces,
  interpolation: { escapeValue: false },
  react: { useSuspense: false }
});

export default i18n;
