/** @vitest-environment jsdom */
import { createRef } from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../../shared/i18n/locales/en/uiTasks.json';
import zh from '../../../shared/i18n/locales/zh-CN/uiTasks.json';
import { TaskWarnings } from './TaskWarnings';
import { TaskLogs } from './TaskLogs';
import type { Task, TaskLogs as Logs } from '../../../shared/types';

async function localized(language: 'en' | 'zh-CN') {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { uiTasks: en }, 'zh-CN': { uiTasks: zh } },
    interpolation: { escapeValue: false },
  });
  return i18n;
}

const task: Task = {
  id: 'task-localization', specId: 'spec-localization', projectId: 'project-localization',
  title: 'User-authored task text', description: 'Do not translate user content',
  status: 'in_progress', subtasks: [], logs: [], createdAt: new Date(), updatedAt: new Date(),
};

afterEach(cleanup);

describe('Task language switching', () => {
  it('updates recovery copy and actions immediately without changing callbacks', async () => {
    const i18n = await localized('zh-CN');
    const recover = vi.fn();
    render(<I18nextProvider i18n={i18n}><TaskWarnings
      isStuck isIncomplete={false} isRecovering={false}
      taskProgress={{ completed: 0, total: 2 }} onRecover={recover} onResume={vi.fn()}
    /></I18nextProvider>);
    expect(screen.getByText('任务可能已中断')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复并重启任务' }));
    expect(recover).toHaveBeenCalledOnce();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText('Task appears stuck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recover and restart task' })).toBeInTheDocument();
  });

  it('localizes phase, thinking level and tool controls while preserving runtime output', async () => {
    const i18n = await localized('zh-CN');
    const logs: Logs = {
      spec_id: task.specId, created_at: '2026-09-28T00:00:00Z', updated_at: '2026-09-28T00:00:00Z',
      phases: {
        planning: { phase: 'planning', status: 'active', started_at: null, completed_at: null, entries: [
          { timestamp: '2026-09-28T00:00:00Z', type: 'tool_start', phase: 'planning', content: '', tool_name: 'Read', tool_input: 'src/user-file.ts' },
          { timestamp: '2026-09-28T00:00:01Z', type: 'text', phase: 'planning', content: 'Provider output stays unchanged' },
        ] }, coding: { phase: 'coding', status: 'pending', started_at: null, completed_at: null, entries: [] }, validation: { phase: 'validation', status: 'pending', started_at: null, completed_at: null, entries: [] },
      },
    };
    render(<I18nextProvider i18n={i18n}><TaskLogs
      task={{ ...task, metadata: { model: 'sonnet', thinkingLevel: 'high' } }}
      phaseLogs={logs} isLoadingLogs={false} expandedPhases={new Set(['planning'])}
      isStuck={false} logsEndRef={createRef()} logsContainerRef={createRef()}
      onLogsScroll={vi.fn()} onTogglePhase={vi.fn()}
    /></I18nextProvider>);
    expect(screen.getByText('规划')).toBeInTheDocument();
    expect(screen.getByText('读取文件')).toBeInTheDocument();
    expect(screen.getByText('src/user-file.ts')).toBeInTheDocument();
    expect(screen.getByText('Provider output stays unchanged')).toBeInTheDocument();
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText('Planning')).toBeInTheDocument();
    expect(screen.getByText('Reading')).toBeInTheDocument();
    expect(screen.getByText('Provider output stays unchanged')).toBeInTheDocument();
  });
});
