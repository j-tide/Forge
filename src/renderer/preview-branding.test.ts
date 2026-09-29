import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import enWelcome from '../shared/i18n/locales/en/welcome.json';
import frWelcome from '../shared/i18n/locales/fr/welcome.json';
import enOnboarding from '../shared/i18n/locales/en/onboarding.json';
import frOnboarding from '../shared/i18n/locales/fr/onboarding.json';
import enSettings from '../shared/i18n/locales/en/settings.json';
import frSettings from '../shared/i18n/locales/fr/settings.json';
import zhWelcome from '../shared/i18n/locales/zh-CN/welcome.json';
import zhOnboarding from '../shared/i18n/locales/zh-CN/onboarding.json';
import zhSettings from '../shared/i18n/locales/zh-CN/settings.json';

describe('Forge entry surfaces', () => {
  it('uses the product window title without loading remote fonts on startup', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

    expect(html).toContain('<title>Forge</title>');
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  });

  for (const { language, welcome, onboarding, settings } of [
    { language: 'en', welcome: enWelcome, onboarding: enOnboarding, settings: enSettings },
    { language: 'fr', welcome: frWelcome, onboarding: frOnboarding, settings: frSettings },
    { language: 'zh-CN', welcome: zhWelcome, onboarding: zhOnboarding, settings: zhSettings },
  ]) {
    it(`${language} identifies Forge and retains the required legal source notice`, () => {
      expect(welcome.hero.title.trim().length).toBeGreaterThan(0);
      expect(welcome.actions.openProject.trim().length).toBeGreaterThan(0);
      expect(onboarding.welcome.title).toContain('Forge');
      expect(onboarding.wizard.description).toContain('Forge');
      expect(onboarding.claudeCode.info.description).toContain('Anthropic');
      expect(settings.updates.previewOrigin).toContain('Aperant v2.8.0-beta.6');
      expect(settings.updates.previewOrigin).toContain('AGPL-3.0');
    });
  }

  it('keeps upstream branding confined to legal notices in every supported locale', () => {
    const legalPaths = new Set(['uiShell.about.provenance', 'settings.updates.previewOrigin']);
    const localeRoot = new URL('../shared/i18n/locales/', import.meta.url);

    const checkValues = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(value, path).not.toContain('Forge Glass Preview');
        if (!legalPaths.has(path)) {
          expect(value, path).not.toMatch(/Aperant|Auto[- ]Claude|AndyMik90/i);
        }
        return;
      }
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) checkValues(child, `${path}.${key}`);
      }
    };

    for (const language of ['en', 'zh-CN', 'fr']) {
      const languageRoot = new URL(`${language}/`, localeRoot);
      for (const file of readdirSync(languageRoot).filter((name) => name.endsWith('.json'))) {
        checkValues(JSON.parse(readFileSync(new URL(file, languageRoot), 'utf8')), file.slice(0, -5));
      }
    }
  });
});
