import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../../../shared/i18n/locales/en/uiIdeaDetails.json';
import zhCN from '../../../../../shared/i18n/locales/zh-CN/uiIdeaDetails.json';
import type { Idea } from '../../../../../shared/types';
import { CodeImprovementDetails } from '../CodeImprovementDetails';
import { CodeQualityDetails } from '../CodeQualityDetails';
import { DocumentationGapDetails } from '../DocumentationGapDetails';
import { PerformanceOptimizationDetails } from '../PerformanceOptimizationDetails';
import { SecurityHardeningDetails } from '../SecurityHardeningDetails';
import { UIUXDetails } from '../UIUXDetails';

const base = {
  id: 'translation-test',
  title: 'User supplied title',
  description: 'User supplied description',
  rationale: 'User supplied rationale',
  status: 'draft' as const,
  createdAt: new Date('2026-01-01T00:00:00Z')
};

function details(idea: Idea) {
  switch (idea.type) {
    case 'code_improvements': return <CodeImprovementDetails idea={idea} />;
    case 'code_quality': return <CodeQualityDetails idea={idea} />;
    case 'documentation_gaps': return <DocumentationGapDetails idea={idea} />;
    case 'performance_optimizations': return <PerformanceOptimizationDetails idea={idea} />;
    case 'security_hardening': return <SecurityHardeningDetails idea={idea} />;
    case 'ui_ux_improvements': return <UIUXDetails idea={idea} />;
  }
}

const cases: Array<{ idea: Idea; chinese: string[]; english: string[] }> = [
  {
    idea: { ...base, type: 'code_improvements', estimatedEffort: 'complex', affectedFiles: ['src/user.ts'], buildsUpon: ['User supplied pattern'], existingPatterns: ['User supplied convention'], implementationApproach: 'User supplied approach' },
    chinese: ['复杂', '工作量', '涉及文件', '实施方案'], english: ['Complex', 'Effort', 'Affected Files', 'Implementation Approach']
  },
  {
    idea: { ...base, type: 'code_quality', severity: 'major', estimatedEffort: 'medium', category: 'git_hygiene', affectedFiles: [], currentState: 'User supplied state', proposedChange: 'User supplied change', breakingChange: true },
    chinese: ['较大', 'Git 规范', '不兼容变更'], english: ['Major', 'Git Hygiene', 'Breaking Change']
  },
  {
    idea: { ...base, type: 'documentation_gaps', category: 'api_docs', targetAudience: 'maintainers', estimatedEffort: 'small', priority: 'high', affectedAreas: [], proposedContent: 'User supplied content' },
    chinese: ['API 文档', '维护者', '优先级'], english: ['API Documentation', 'Maintainers', 'Priority']
  },
  {
    idea: { ...base, type: 'performance_optimizations', category: 'caching', impact: 'high', estimatedEffort: 'small', affectedAreas: [], expectedImprovement: 'User supplied improvement', implementation: 'User supplied implementation' },
    chinese: ['缓存', '影响程度', '预期改善'], english: ['Caching', 'Impact', 'Expected Improvement']
  },
  {
    idea: { ...base, type: 'security_hardening', severity: 'critical', category: 'secrets_management', affectedFiles: [], currentRisk: 'User supplied risk', remediation: 'User supplied remediation' },
    chinese: ['严重', '凭据管理', '当前风险'], english: ['Critical', 'Secrets Management', 'Current Risk']
  },
  {
    idea: { ...base, type: 'ui_ux_improvements', category: 'accessibility', affectedComponents: [], currentState: 'User supplied state', proposedChange: 'User supplied change', userBenefit: 'User supplied benefit' },
    chinese: ['可访问性', '建议变更', '用户收益'], english: ['Accessibility', 'Proposed Change', 'User Benefit']
  }
];

describe('idea details localization', () => {
  for (const { idea, chinese, english } of cases) {
    it(`switches ${idea.type} labels and leaves supplied content unchanged`, async () => {
      const i18n = createInstance();
      await i18n.init({ lng: 'zh-CN', fallbackLng: 'en', resources: { en: { uiIdeaDetails: en }, 'zh-CN': { uiIdeaDetails: zhCN } }, interpolation: { escapeValue: false } });
      const render = () => renderToStaticMarkup(<I18nextProvider i18n={i18n}>{details(idea)}</I18nextProvider>);
      const chineseMarkup = render();
      for (const label of chinese) expect(chineseMarkup).toContain(label);
      expect(chineseMarkup).toContain('User supplied');
      await i18n.changeLanguage('en');
      const englishMarkup = render();
      for (const label of english) expect(englishMarkup).toContain(label);
      expect(englishMarkup).toContain('User supplied');
    });
  }
});
