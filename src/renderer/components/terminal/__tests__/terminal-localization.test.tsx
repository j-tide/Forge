/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { TaskSelector } from '../TaskSelector';
import { TerminalTitle } from '../TerminalTitle';
import type { Task } from '../../../../shared/types';
import en from '../../../../shared/i18n/locales/en/uiTerminal.json';
import zh from '../../../../shared/i18n/locales/zh-CN/uiTerminal.json';

async function createTranslations() {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: 'zh-CN',
    fallbackLng: 'en',
    defaultNS: 'uiTerminal',
    resources: { en: { uiTerminal: en }, 'zh-CN': { uiTerminal: zh } },
    interpolation: { escapeValue: false },
  });
  return i18n;
}

afterEach(cleanup);

describe('terminal localization', () => {
  it('updates the task selector when the user switches language', async () => {
    const i18n = await createTranslations();
    render(
      <I18nextProvider i18n={i18n}>
        <TaskSelector terminalId="terminal-1" backlogTasks={[]} onTaskSelect={vi.fn()} onClearTask={vi.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByRole('button', { name: '选择任务…' })).toBeTruthy();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByRole('button', { name: 'Select task…' })).toBeTruthy();
  });

  it('localizes execution status without changing the real task title', async () => {
    const i18n = await createTranslations();
    const task = { id: 'task-1', title: 'User-authored title', executionProgress: { phase: 'planning' } } as Task;
    render(
      <I18nextProvider i18n={i18n}>
        <TaskSelector terminalId="terminal-1" backlogTasks={[]} associatedTask={task} onTaskSelect={vi.fn()} onClearTask={vi.fn()} />
      </I18nextProvider>
    );
    expect(screen.getByRole('button', { name: '规划中' })).toBeTruthy();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByRole('button', { name: 'Planning' })).toBeTruthy();
    expect(task.title).toBe('User-authored title');
  });

  it('keeps custom terminal names while localizing the rename input', async () => {
    const i18n = await createTranslations();
    const save = vi.fn();
    render(<I18nextProvider i18n={i18n}><TerminalTitle title="My Dev Server" onTitleChange={save} /></I18nextProvider>);
    fireEvent.doubleClick(screen.getByText('My Dev Server'));
    const input = screen.getByRole('textbox', { name: '终端名称' });
    expect((input as HTMLInputElement).value).toBe('My Dev Server');
    fireEvent.change(input, { target: { value: '我的终端' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(save).toHaveBeenCalledWith('我的终端');
  });
});
