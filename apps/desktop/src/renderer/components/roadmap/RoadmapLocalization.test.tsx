import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoadmapEmptyState } from './RoadmapEmptyState';
import { FeatureCard } from './FeatureCard';
import type { RoadmapFeature } from '../../../shared/types';
import en from '../../../shared/i18n/locales/en/uiKnowledge.json';
import zh from '../../../shared/i18n/locales/zh-CN/uiKnowledge.json';

const feature: RoadmapFeature = {
  id: 'test-feature',
  title: 'User-written English title',
  description: 'User-written description',
  rationale: 'User-written rationale',
  priority: 'must',
  complexity: 'high',
  impact: 'medium',
  phaseId: 'phase-1',
  dependencies: [],
  status: 'planned',
  acceptanceCriteria: [],
  userStories: [],
};

async function render(locale: 'en' | 'zh-CN', element: React.ReactNode) {
  const translations = createInstance();
  await translations.init({
    lng: locale,
    fallbackLng: 'en',
    resources: { en: { uiKnowledge: en }, 'zh-CN': { uiKnowledge: zh } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(<I18nextProvider i18n={translations}>{element}</I18nextProvider>);
}

describe('Roadmap language rendering', () => {
  it('renders its empty-state action in Chinese and English', async () => {
    const element = <RoadmapEmptyState onGenerate={() => undefined} />;
    expect(await render('zh-CN', element)).toContain('生成路线图');
    expect(await render('en', element)).toContain('Generate Roadmap');
  });

  it('localizes classification without rewriting user content', async () => {
    const element = <FeatureCard feature={feature} onClick={() => undefined} onConvertToSpec={() => undefined} onGoToTask={() => undefined} />;
    const chinese = await render('zh-CN', element);
    expect(chinese).toContain('必须实现');
    expect(chinese).toContain('中影响');
    expect(chinese).toContain('User-written English title');
    const english = await render('en', element);
    expect(english).toContain('Must Have');
    expect(english).toContain('Medium impact');
  });

  it('keeps every UI translation key and interpolation parameter available in both languages', () => {
    function flatten(value: Record<string, unknown>, prefix = ''): Record<string, string> {
      return Object.assign({}, ...Object.entries(value).map(([key, item]) =>
        typeof item === 'string' ? { [prefix + key]: item } : flatten(item as Record<string, unknown>, `${prefix}${key}.`)
      ));
    }
    const english = flatten(en);
    const chinese = flatten(zh);
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    for (const [key, value] of Object.entries(english)) {
      expect(chinese[key].match(/\{\{\w+\}\}/g)?.sort()).toEqual(value.match(/\{\{\w+\}\}/g)?.sort());
    }
  });
});
