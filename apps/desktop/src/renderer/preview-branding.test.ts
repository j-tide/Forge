import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import enWelcome from '../shared/i18n/locales/en/welcome.json';
import frWelcome from '../shared/i18n/locales/fr/welcome.json';
import enOnboarding from '../shared/i18n/locales/en/onboarding.json';
import frOnboarding from '../shared/i18n/locales/fr/onboarding.json';
import enSettings from '../shared/i18n/locales/en/settings.json';
import frSettings from '../shared/i18n/locales/fr/settings.json';

describe('Forge Glass Preview entry surfaces', () => {
  it('uses the preview window title without loading remote fonts on startup', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

    expect(html).toContain('<title>Forge Glass Preview</title>');
    expect(html).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/);
  });

  for (const { language, welcome, onboarding, settings } of [
    { language: 'en', welcome: enWelcome, onboarding: enOnboarding, settings: enSettings },
    { language: 'fr', welcome: frWelcome, onboarding: frOnboarding, settings: frSettings },
  ]) {
    it(`${language} identifies the preview and credits the upstream project`, () => {
      expect(welcome.hero.title).toContain('Forge Glass Preview');
      expect(onboarding.welcome.title).toContain('Forge Glass Preview');
      expect(onboarding.wizard.description).toContain('Forge Glass Preview');
      expect(onboarding.claudeCode.info.description).toContain('Anthropic');
      expect(settings.updates.previewOrigin).toContain('Aperant v2.8.0-beta.6');
      expect(settings.updates.previewOrigin).toContain('AGPL-3.0');
    });
  }
});
