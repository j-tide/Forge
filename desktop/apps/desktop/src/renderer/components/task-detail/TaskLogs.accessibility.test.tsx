/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { createRef } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '../../../shared/i18n/locales/en/uiTasks.json';
import zh from '../../../shared/i18n/locales/zh-CN/uiTasks.json';
import type { Task, TaskLogs as PhaseLogs } from '../../../shared/types';
import { TaskLogs } from './TaskLogs';

vi.mock('../../stores/settings-store', () => ({
  useSettingsStore: (selector: (state: { settings: { logOrder: string } }) => unknown) =>
    selector({ settings: { logOrder: 'chronological' } }),
}));

const errorSummary = 'Provider request failed';
const errorDetail = 'Runtime diagnostic: the provider connection closed before a response.';
const task: Task = {
  id: 'task-log-error', specId: 'spec-log-error', projectId: 'project',
  title: 'Inspect error details', description: 'Fixture', status: 'error',
  subtasks: [], logs: [], createdAt: new Date('2026-09-28T00:00:00Z'),
  updatedAt: new Date('2026-09-28T00:00:00Z'),
};
const phaseLogs: PhaseLogs = {
  spec_id: task.specId,
  created_at: '2026-09-28T00:00:00Z',
  updated_at: '2026-09-28T00:00:00Z',
  phases: {
    planning: {
      phase: 'planning', status: 'failed', started_at: null, completed_at: null,
      entries: [{
        timestamp: '2026-09-28T00:00:00Z', type: 'error', phase: 'planning',
        content: errorSummary, detail: errorDetail,
      }],
    },
    coding: { phase: 'coding', status: 'pending', started_at: null, completed_at: null, entries: [] },
    validation: { phase: 'validation', status: 'pending', started_at: null, completed_at: null, entries: [] },
  },
};

async function mount(language: string) {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { uiTasks: en }, 'zh-CN': { uiTasks: zh } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  const onTogglePhase = vi.fn();
  render(<I18nextProvider i18n={i18n}><TaskLogs
    task={task} phaseLogs={phaseLogs} isLoadingLogs={false}
    expandedPhases={new Set(['planning'])} isStuck={false}
    logsEndRef={createRef()} logsContainerRef={createRef()}
    onLogsScroll={vi.fn()} onTogglePhase={onTogglePhase}
  /></I18nextProvider>);
  return { onTogglePhase };
}

afterEach(cleanup);

describe('Error log detail accessibility', () => {
  it.each([
    { language: 'en', showLabel: 'Show output', hideLabel: 'Hide output' },
    { language: 'zh-CN', showLabel: '展开输出', hideLabel: '收起输出' },
  ])('keeps the $language toggle name and expanded state aligned with visible error details', async ({ language, showLabel, hideLabel }) => {
    const { onTogglePhase } = await mount(language);
    const show = screen.getByRole('button', { name: showLabel });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(errorSummary)).toBeInTheDocument();
    expect(screen.queryByText(errorDetail)).not.toBeInTheDocument();

    fireEvent.click(show);
    const hide = screen.getByRole('button', { name: hideLabel });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: showLabel })).not.toBeInTheDocument();
    expect(screen.getByText(errorDetail)).toBeVisible();

    fireEvent.click(hide);
    expect(screen.getByRole('button', { name: showLabel })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: hideLabel })).not.toBeInTheDocument();
    expect(screen.queryByText(errorDetail)).not.toBeInTheDocument();
    expect(screen.getByText(errorSummary)).toBeInTheDocument();
    expect(onTogglePhase).not.toHaveBeenCalled();
  });
});
