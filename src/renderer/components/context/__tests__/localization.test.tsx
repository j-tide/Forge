// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '../../../../shared/i18n/locales/en/uiKnowledgeContext.json';
import zh from '../../../../shared/i18n/locales/zh-CN/uiKnowledgeContext.json';
import { TooltipProvider } from '../../ui/tooltip';
import { ProjectIndexTab } from '../ProjectIndexTab';
import { InsightsModelSelector } from '../../InsightsModelSelector';

const language = createInstance();
await language.use(initReactI18next).init({
  lng: 'zh-CN', fallbackLng: 'en',
  resources: { en: { uiKnowledgeContext: en }, 'zh-CN': { uiKnowledgeContext: zh } },
  interpolation: { escapeValue: false }, react: { useSuspense: false }
});

beforeEach(async () => {
  cleanup();
  await language.changeLanguage('zh-CN');
});

describe('knowledge and context localization', () => {
  it('translates the empty index and changes language without remounting', async () => {
    render(<I18nextProvider i18n={language}><TooltipProvider><ProjectIndexTab projectIndex={null} indexLoading={false} indexError={null} onRefresh={() => undefined} /></TooltipProvider></I18nextProvider>);
    expect(screen.getByRole('heading', { name: '项目结构' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '分析项目' })).toBeTruthy();
    await act(() => language.changeLanguage('en'));
    expect(screen.getByRole('heading', { name: 'Project Structure' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Analyze Project' })).toBeTruthy();
  });

  it('translates built-in profile names without changing model configuration', () => {
    render(<I18nextProvider i18n={language}><InsightsModelSelector currentConfig={{ profileId: 'balanced', model: 'sonnet', thinkingLevel: 'medium' }} onConfigChange={() => undefined} /></I18nextProvider>);
    expect(screen.getByRole('button', { name: '均衡 · Claude Sonnet 4.6' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '均衡 · Claude Sonnet 4.6' }).getAttribute('title')).toBe('模型：均衡 · Claude Sonnet 4.6');
  });

  it('has identical English and Chinese keys and preserves interpolation tokens', () => {
    const flatten = (value: Record<string, unknown>, prefix = ''): Record<string, string> => Object.fromEntries(Object.entries(value).flatMap(([key, child]) => typeof child === 'string' ? [[prefix + key, child]] : Object.entries(flatten(child as Record<string, unknown>, prefix + key + '.'))));
    const english = flatten(en);
    const chinese = flatten(zh);
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english)) {
      expect(chinese[key].match(/\{\{[^}]+\}\}/g) || []).toEqual(english[key].match(/\{\{[^}]+\}\}/g) || []);
    }
  });
});
