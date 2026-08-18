/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '../../../../shared/i18n/locales/en/uiChangelogExtra.json';
import zh from '../../../../shared/i18n/locales/zh-CN/uiChangelogExtra.json';
import { ChangelogHeader } from '../ChangelogHeader';
import { ChangelogList } from '../ChangelogList';

const locale = createInstance();
beforeEach(async () => {
  await locale.use(initReactI18next).init({
    lng: 'zh-CN', fallbackLng: 'en',
    resources: { en: { uiChangelogExtra: en }, 'zh-CN': { uiChangelogExtra: zh } },
    interpolation: { escapeValue: false }, react: { useSuspense: false },
  });
});
afterEach(cleanup);

function keys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === 'object' && child ? keys(child as Record<string, unknown>, path) : [path];
  }).sort();
}

describe('Changelog bilingual UI', () => {
  it('renders wizard steps in Chinese and switches the mounted content to English', async () => {
    const refresh = vi.fn();
    render(<I18nextProvider i18n={locale}><ChangelogHeader step={2} onRefresh={refresh} /></I18nextProvider>);
    expect(screen.getByRole('heading', { name: '更新日志生成器' })).toBeDefined();
    expect(screen.getByText('第 2 步：配置并生成更新日志')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(refresh).toHaveBeenCalledOnce();
    await act(() => locale.changeLanguage('en'));
    expect(screen.getByRole('heading', { name: 'Changelog Generator' })).toBeDefined();
    expect(screen.getByText('Step 2: Configure and generate changelog')).toBeDefined();
  });

  it('localizes the empty completed-task list without translating user task content', () => {
    render(<I18nextProvider i18n={locale}><ChangelogList
      sourceMode="tasks" doneTasks={[]} selectedTaskIds={[]} onToggleTask={vi.fn()}
      onSelectAll={vi.fn()} onDeselectAll={vi.fn()} previewCommits={[]}
      isLoadingCommits={false} onContinue={vi.fn()} canContinue={false}
    /></I18nextProvider>);
    expect(screen.getByText('已选择 0 / 0 项任务')).toBeDefined();
    expect(screen.getByRole('heading', { name: '尚无已完成任务' })).toBeDefined();
    expect((screen.getByRole('button', { name: '继续' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps Chinese and English keys and interpolation fields complete', () => {
    expect(keys(zh)).toEqual(keys(en));
    const check = (english: Record<string, unknown>, chinese: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(english)) {
        if (typeof value === 'string') {
          expect(typeof chinese[key]).toBe('string');
          expect((chinese[key] as string).match(/{{\w+}}/g)?.sort() ?? []).toEqual(value.match(/{{\w+}}/g)?.sort() ?? []);
        } else check(value as Record<string, unknown>, chinese[key] as Record<string, unknown>);
      }
    };
    check(en, zh);
  });
});
