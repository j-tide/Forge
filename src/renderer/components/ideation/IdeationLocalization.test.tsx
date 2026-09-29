/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { IdeationEmptyState } from './IdeationEmptyState';
import { IdeationFilters } from './IdeationFilters';
import en from '../../../shared/i18n/locales/en/uiKnowledgeIdeas.json';
import zh from '../../../shared/i18n/locales/zh-CN/uiKnowledgeIdeas.json';

async function renderInLanguage(language: string, child: React.ReactNode) {
  const i18n = createInstance();
  await i18n.init({ lng: language, fallbackLng: 'en', ns: ['uiKnowledgeIdeas'], defaultNS: 'uiKnowledgeIdeas',
    resources: { en: { uiKnowledgeIdeas: en }, 'zh-CN': { uiKnowledgeIdeas: zh } }, interpolation: { escapeValue: false } });
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{child}</I18nextProvider>);
}

describe('ideation localization', () => {
  it('renders Chinese empty state, categories and provider warning without untranslated keys', async () => {
    const view = <IdeationEmptyState config={{ enabledTypes: ['code_improvements'], includeRoadmapContext: true, includeKanbanContext: true, maxIdeasPerType: 5 }} hasToken={false} isCheckingToken={false} onGenerate={vi.fn()} onOpenConfig={vi.fn()} onToggleIdeationType={vi.fn()} />;
    const chinese = await renderInLanguage('zh-CN', view);
    const english = await renderInLanguage('en', view);
    expect(chinese).toContain('还没有建议');
    expect(chinese).toContain('代码改进');
    expect(chinese).toContain('尚未配置 AI 服务');
    expect(chinese).not.toContain('No Ideas Yet');
    expect(english).toContain('No Ideas Yet');
    expect(english).toContain('Code Improvements');
  });

  it('translates filters while retaining stable tab values', async () => {
    const view = <IdeationFilters activeTab="code_improvements" onTabChange={vi.fn()}>content</IdeationFilters>;
    const chinese = await renderInLanguage('zh-CN', view);
    expect(chinese).toContain('代码');
    expect(chinese).toContain('文档');
    expect(chinese).toContain('安全');
    expect(chinese).toContain('性能');
    expect(await renderInLanguage('en', view)).toContain('Performance');
  });
});
