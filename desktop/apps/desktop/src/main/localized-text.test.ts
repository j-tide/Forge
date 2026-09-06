import { describe, expect, it, vi } from 'vitest';
import english from '../shared/i18n/locales/en/native.json';
import chinese from '../shared/i18n/locales/zh-CN/native.json';
import { nativeText } from './localized-text';

const language = vi.hoisted(() => ({ current: 'zh-CN' }));
vi.mock('./app-language', () => ({ getAppLanguage: () => language.current }));

describe('native application text', () => {
  it('has matching English and Chinese dictionaries', () => {
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort());
    expect(Object.values(chinese).every(value => value.trim().length > 0)).toBe(true);
    for (const key of Object.keys(english) as Array<keyof typeof english>) {
      expect((chinese[key].match(/\{\{\w+\}\}/g) ?? []).sort())
        .toEqual((english[key].match(/\{\{\w+\}\}/g) ?? []).sort());
    }
  });

  it('switches native edit labels immediately with the application language', () => {
    language.current = 'zh-CN';
    expect(nativeText('contextMenu.copy')).toBe('复制');
    language.current = 'en';
    expect(nativeText('contextMenu.copy')).toBe('Copy');
  });

  it('interpolates task titles literally without replacing user content', () => {
    language.current = 'zh-CN';
    expect(nativeText('notification.taskComplete.body', { taskTitle: '计划 $& {{value}}' }))
      .toBe('“计划 $& {{value}}”已执行完成，等待审查');
  });

  it('uses English fallback for existing unsupported native languages', () => {
    language.current = 'fr';
    expect(nativeText('dialog.selectProjectDirectory')).toBe('Select Project Directory');
  });
});
