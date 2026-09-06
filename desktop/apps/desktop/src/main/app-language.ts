/** Native menus and dialogs follow the saved application language, not the OS locale. */
import { DEFAULT_LANGUAGE, normalizeLanguage, type SupportedLanguage } from '../shared/constants/i18n';
import { readSettingsFile } from './settings-utils';

let currentAppLanguage: SupportedLanguage = DEFAULT_LANGUAGE;
export function getAppLanguage(): SupportedLanguage { return currentAppLanguage; }
export function setAppLanguage(language: string): void { currentAppLanguage = normalizeLanguage(language); }
export function initAppLanguage(): void {
  currentAppLanguage = normalizeLanguage(readSettingsFile()?.language);
}
